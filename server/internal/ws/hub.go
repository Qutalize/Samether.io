package ws

import (
	"log"
	"math/rand"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"github.com/samezario/server/internal/game"
)

type inboundMsg struct {
	client *Client
	raw    []byte
	typ    string
}

type Hub struct {
	world       *game.World
	leaderboard *game.Leaderboard
	clients     map[*Client]bool

	register   chan *Client
	unregister chan *Client
	inbound    chan inboundMsg

	nextPlayerID uint64
	nextBotID    uint64
}

func NewHub() *Hub {
	w := game.NewWorld()
	w.SpawnFoodsTo(game.FoodCount)

	return &Hub{
		world:       w,
		leaderboard: game.NewLeaderboard(),
		clients:     make(map[*Client]bool),
		register:    make(chan *Client),
		unregister:  make(chan *Client, 16),
		inbound:     make(chan inboundMsg, 256),
	}
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}

	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 64),
		lastSharks: make(map[string]StateSharkView),
		lastFoods: make(map[string]StateFoodView),
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (h *Hub) allocPlayerID() string {
	n := atomic.AddUint64(&h.nextPlayerID, 1)
	return fmtPlayerID(n)
}

func (h *Hub) allocBotID() string {
	n := atomic.AddUint64(&h.nextBotID, 1)
	return "b" + itoa(n)
}

func fmtPlayerID(n uint64) string {
	return "p" + itoa(n)
}

func itoa(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func randomSpawn() game.Vec {
	const margin = 150.0
	return game.Vec{
		X: margin + rand.Float64()*(game.WorldWidth-2*margin),
		Y: margin + rand.Float64()*(game.WorldHeight-2*margin),
	}
}

// 新送信関数（Payload対応）
func (h *Hub) send(c *Client, typ string, payload any) {
	b := MustMarshal(typ, payload)

	select {
	case c.send <- b:
	default:
		log.Printf("dropping message to slow client")
	}
}

func (h *Hub) Run() {
	tick := time.NewTicker(time.Second / time.Duration(game.TickHz))
	defer tick.Stop()

	dt := 1.0 / float64(game.TickHz)

	for {
		select {
		case c := <-h.register:
			h.clients[c] = true

		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				if c.playerID != "" {
					delete(h.world.Sharks, c.playerID)
				}
				delete(h.clients, c)
				close(c.send)
			}

		case m := <-h.inbound:
			h.handleInbound(m)

		case <-tick.C:
			h.step(dt)
		}
	}
}

func (h *Hub) handleInbound(m inboundMsg) {
	typ, payload, err := DecodeMessage(m.raw)
	if err != nil {
		return
	}

	switch typ {

	case "join":
		p := payload.(JoinPayload)

		id := h.allocPlayerID()
		m.client.playerID = id

		s := game.NewShark(id, p.Name, randomSpawn())
		h.world.Sharks[id] = s

		h.send(m.client, "welcome", WelcomePayload{
			PlayerID: id,
			WorldW:   game.WorldWidth,
			WorldH:   game.WorldHeight,
		})

		name, score, ok := h.leaderboard.Top()
		if ok {
			h.send(m.client, "leaderboard", LeaderboardPayload{
				TopName:  name,
				TopScore: score,
			})
		}

	case "input":
		p := payload.(InputPayload)

		s, ok := h.world.Sharks[m.client.playerID]
		if !ok || !s.Alive {
			return
		}

		s.TargetAngle = p.Angle
		if p.Dash {
			s.DashUntilTick = h.world.Tick + int64(float64(game.TickHz)*game.DashDurationSec)
		}
	}
}

func (h *Hub) step(dt float64) {
	h.world.Tick++

	h.world.UpdateBots()

	for len(h.world.Sharks) < game.MinPopulation {
		id := h.allocBotID()
		name := "Bot" + id

		s := game.NewShark(id, name, randomSpawn())
		s.IsBot = true
		h.world.Sharks[id] = s
	}

	for _, s := range h.world.Sharks {
		if !s.Alive {
			continue
		}
		dash := h.world.Tick <= s.DashUntilTick
		s.Move(dt, dash)
	}

	wallDead := h.world.CheckWallDeaths()
	sharkDead := h.world.CheckSharkCollisions()
	_ = h.world.ConsumeFoods()

	for _, s := range h.world.Sharks {
		if s.Alive {
			s.UpdateStage()
		}
	}

	allDead := append(wallDead, sharkDead...)
	for _, id := range allDead {
		s := h.world.Sharks[id]
		if s == nil {
			continue
		}
		_ = h.world.ScatterDeadShark(s)
		h.notifyDeath(id, s)
		delete(h.world.Sharks, id)
	}

	h.world.SpawnFoodsTo(game.FoodCount)

	h.leaderboard.BeginTick()
	for id, s := range h.world.Sharks {
		if s.Alive {
			h.leaderboard.Record(id, s.Name, s.XP)
		}
	}
	if h.leaderboard.EndTick() {
		h.broadcastLeaderboard()
	}

	for c := range h.clients {
		h.sendStateTo(c)
	}
}

func (h *Hub) notifyDeath(playerID string, s *game.Shark) {
	for c := range h.clients {
		if c.playerID == playerID {
			h.send(c, "death", DeathPayload{
				Score: s.XP,
				Stage: s.Stage + 1,
			})
			c.playerID = ""
			return
		}
	}
}

func (h *Hub) broadcastLeaderboard() {
	name, score, ok := h.leaderboard.Top()
	if !ok {
		return
	}

	for c := range h.clients {
		h.send(c, "leaderboard", LeaderboardPayload{
			TopName:  name,
			TopScore: score,
		})
	}
}

func sharkViewEqual(a, b StateSharkView) bool {
	return a.ID == b.ID && a.Name == b.Name && a.X == b.X && a.Y == b.Y && a.Angle == b.Angle && a.Stage == b.Stage
}

func foodViewEqual(a, b StateFoodView) bool {
	return a.ID == b.ID && a.X == b.X && a.Y == b.Y && a.IsRed == b.IsRed
}

func (h *Hub) sendStateTo(c *Client) {
	self := h.world.Sharks[c.playerID]

	if self == nil {
		payload := StatePayload{
			Tick: h.world.Tick,
			Full: true,
			You:  StateYou{},
			Sharks: []StateSharkView{},
			Foods:  []StateFoodView{},
		}
		h.send(c, "state", payload)
		c.lastStateTick = h.world.Tick
		c.lastSharks = map[string]StateSharkView{}
		c.lastFoods = map[string]StateFoodView{}
		return
	}

	radius := game.VisibilityRadius
	if self.Stage == 4 {
		radius = game.VisibilityStage5
	}

	currentSharkMap := make(map[string]StateSharkView, 8)
	currentSharks := make([]StateSharkView, 0, 8)
	for _, s := range h.world.Sharks {
		if !s.Alive || s.Head.Dist(self.Head) > radius {
			continue
		}
		view := StateSharkView{
			ID:    s.ID,
			Name:  s.Name,
			X:     s.Head.X,
			Y:     s.Head.Y,
			Angle: s.Angle,
			Stage: s.Stage,
		}
		currentSharks = append(currentSharks, view)
		currentSharkMap[view.ID] = view
	}

	currentFoodMap := make(map[string]StateFoodView, 64)
	currentFoods := make([]StateFoodView, 0, 64)
	for _, f := range h.world.Foods {
		if f.Pos.Dist(self.Head) > radius {
			continue
		}
		view := StateFoodView{
			ID:    f.ID,
			X:     f.Pos.X,
			Y:     f.Pos.Y,
			IsRed: f.IsRed,
		}
		currentFoods = append(currentFoods, view)
		currentFoodMap[view.ID] = view
	}

	payload := StatePayload{
		Tick: h.world.Tick,
		You: StateYou{
			ID:    self.ID,
			X:     self.Head.X,
			Y:     self.Head.Y,
			XP:    self.XP,
			Stage: self.Stage,
		},
	}

	if c.lastStateTick == 0 {
		payload.Full = true
		payload.Sharks = currentSharks
		payload.Foods = currentFoods
	} else {
		for id, current := range currentSharkMap {
			if prev, ok := c.lastSharks[id]; !ok {
				payload.AddedSharks = append(payload.AddedSharks, current)
			} else if !sharkViewEqual(prev, current) {
				payload.UpdatedSharks = append(payload.UpdatedSharks, current)
			}
		}
		for id := range c.lastSharks {
			if _, ok := currentSharkMap[id]; !ok {
				payload.RemovedSharks = append(payload.RemovedSharks, id)
			}
		}

		for id, current := range currentFoodMap {
			if prev, ok := c.lastFoods[id]; !ok {
				payload.AddedFoods = append(payload.AddedFoods, current)
			} else if !foodViewEqual(prev, current) {
				payload.UpdatedFoods = append(payload.UpdatedFoods, current)
			}
		}
		for id := range c.lastFoods {
			if _, ok := currentFoodMap[id]; !ok {
				payload.RemovedFoods = append(payload.RemovedFoods, id)
			}
		}
	}

	h.send(c, "state", payload)
	c.lastStateTick = h.world.Tick
	c.lastSharks = currentSharkMap
	c.lastFoods = currentFoodMap
}