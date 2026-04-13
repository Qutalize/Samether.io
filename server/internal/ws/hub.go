package ws

import (
	"encoding/json"
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

// ServeWS upgrades an HTTP request to WebSocket and starts the pumps.
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

var botNames = []string{
	"Sharky", "Finley", "Bruce", "Jawsome", "Nibbles",
	"Chomper", "Tidal", "Riptide", "Splash", "DeepBlue",
}

func fmtPlayerID(n uint64) string {
	// simple "pN" id is fine for PoC
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

// randomSpawn returns a safe starting position.
func randomSpawn() game.Vec {
	const margin = 150.0
	return game.Vec{
		X: margin + rand.Float64()*(game.WorldWidth-2*margin),
		Y: margin + rand.Float64()*(game.WorldHeight-2*margin),
	}
}

// sendJSON serializes v and pushes it to client's send channel.
// Drops message if the channel is full (slow client).
func (h *Hub) sendJSON(c *Client, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("marshal: %v", err)
		return
	}
	select {
	case c.send <- b:
	default:
		log.Printf("dropping message to slow client")
	}
}

// Run owns all game state and is the only goroutine that touches h.world,
// h.clients, and h.leaderboard.
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
	switch m.typ {
	case "join":
		var msg JoinMsg
		if err := json.Unmarshal(m.raw, &msg); err != nil {
			return
		}
		id := h.allocPlayerID()
		m.client.playerID = id
		s := game.NewShark(id, msg.Name, randomSpawn())
		h.world.Sharks[id] = s
		h.sendJSON(m.client, WelcomeMsg{
			Type:     "welcome",
			PlayerID: id,
			WorldW:   game.WorldWidth,
			WorldH:   game.WorldHeight,
		})
		
		// Immediately send the current leaderboard to the new client
		name, score, ok := h.leaderboard.Top()
		if ok {
			h.sendJSON(m.client, LeaderboardMsg{
				Type:     "leaderboard",
				TopName:  name,
				TopScore: score,
			})
		}
	case "input":
		var msg InputMsg
		if err := json.Unmarshal(m.raw, &msg); err != nil {
			return
		}
		s, ok := h.world.Sharks[m.client.playerID]
		if !ok || !s.Alive {
			return
		}
		s.TargetAngle = msg.Angle
		if msg.Dash {
			s.DashUntilTick = h.world.Tick + int64(float64(game.TickHz)*game.DashDurationSec)
		}
	}
}

func (h *Hub) step(dt float64) {
	h.world.Tick++

	// 0. Update bots and spawn new ones if needed.
	h.world.UpdateBots()
	for len(h.world.Sharks) < game.MinPopulation {
		id := h.allocBotID()

		// Try to find an unused bot name
		usedNames := make(map[string]bool)
		for _, s := range h.world.Sharks {
			usedNames[s.Name] = true
		}

		name := ""
		// Try up to 10 times to pick a random unused name
		for i := 0; i < 10; i++ {
			cand := botNames[rand.Intn(len(botNames))]
			if !usedNames[cand] {
				name = cand
				break
			}
		}
		// Fallback if all names are used or random selection failed
		if name == "" {
			name = "Bot" + id
		}

		s := game.NewShark(id, name, randomSpawn())
		s.IsBot = true
		h.world.Sharks[id] = s
	}

	// 1. Move sharks.
	for _, s := range h.world.Sharks {
		if !s.Alive {
			continue
		}
		dash := h.world.Tick <= s.DashUntilTick
		s.Move(dt, dash)
	}

	// 2. Wall deaths.
	wallDead := h.world.CheckWallDeaths()
	// 3. Shark collisions.
	sharkDead := h.world.CheckSharkCollisions()
	// 4. Eat foods.
	_ = h.world.ConsumeFoods()
	// 5. Stage growth.
	for _, s := range h.world.Sharks {
		if s.Alive {
			s.UpdateStage()
		}
	}
	// 6. Scatter dead sharks and notify owners, then remove them.
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

	// 7. Replenish food.
	h.world.SpawnFoodsTo(game.FoodCount)

	// 8. Update leaderboard.
	h.leaderboard.BeginTick()
	for id, s := range h.world.Sharks {
		if !s.Alive {
			continue
		}
		h.leaderboard.Record(id, s.Name, s.XP)
	}
	if h.leaderboard.EndTick() {
		h.broadcastLeaderboard()
	}

	// 9. Broadcast state to every connected client.
	for c := range h.clients {
		h.sendStateTo(c)
	}
}

func (h *Hub) notifyDeath(playerID string, s *game.Shark) {
	for c := range h.clients {
		if c.playerID == playerID {
			h.sendJSON(c, DeathMsg{
				Type:  "death",
				Score: s.XP,
				Stage: s.Stage + 1, // UI shows 1-based stage
			})
			c.playerID = "" // can rejoin
			return
		}
	}
}

func (h *Hub) broadcastLeaderboard() {
	name, score, ok := h.leaderboard.Top()
	if !ok {
		return
	}
	msg := LeaderboardMsg{
		Type:     "leaderboard",
		TopName:  name,
		TopScore: score,
	}
	for c := range h.clients {
		h.sendJSON(c, msg)
	}
}

func (h *Hub) sendStateTo(c *Client) {
	self := h.world.Sharks[c.playerID]
	if self == nil {
		// Not playing — send an empty state so the client stays fresh.
		h.sendJSON(c, StateMsg{
			Type:   "state",
			Tick:   h.world.Tick,
			Sharks: []StateSharkView{},
			Foods:  []StateFoodView{},
		})
		return
	}

	radius := game.VisibilityRadius
	if self.Stage == 4 {
		radius = game.VisibilityStage5
	}

	sharks := make([]StateSharkView, 0, 8)
	for _, s := range h.world.Sharks {
		if !s.Alive {
			continue
		}
		if s.Head.Dist(self.Head) > radius {
			continue
		}
		sharks = append(sharks, StateSharkView{
			ID:    s.ID,
			Name:  s.Name,
			X:     s.Head.X,
			Y:     s.Head.Y,
			Angle: s.Angle,
			Stage: s.Stage,
		})
	}

	foods := make([]StateFoodView, 0, 64)
	for _, f := range h.world.Foods {
		if f.Pos.Dist(self.Head) > radius {
			continue
		}
		foods = append(foods, StateFoodView{ID: f.ID, X: f.Pos.X, Y: f.Pos.Y, IsRed: f.IsRed})
	}

	h.sendJSON(c, StateMsg{
		Type: "state",
		Tick: h.world.Tick,
		You: StateYou{
			ID:    self.ID,
			X:     self.Head.X,
			Y:     self.Head.Y,
			XP:    self.XP,
			Stage: self.Stage,
		},
		Sharks: sharks,
		Foods:  foods,
	})
}
