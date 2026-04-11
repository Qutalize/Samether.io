package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ==========================================
// 1. Models (データ構造)
// ==========================================

type BaseMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type TouchInputPayload struct {
	Angle     float64 `json:"angle"`
	IsDashing bool    `json:"is_dashing"`
}

type WelcomePayload struct {
	PlayerID string `json:"player_id"`
}

type SharkState struct {
	ID        string  `json:"id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Angle     float64 `json:"angle"`
	Radius    float64 `json:"radius"`
	Score     int     `json:"score"`
	CP        float64 `json:"cp"`
	IsDashing bool    `json:"is_dashing"`
	IsBot     bool    `json:"-"`
}

type FoodState struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

type StatePayload struct {
	Sharks []SharkState `json:"sharks"`
	Foods  []FoodState  `json:"foods"`
}

// ★変更：マップを800x800の正方形に縮小
const (
	MaxCP          = 100.0
	BaseSpeed      = 3.0
	DashMultiplier = 2.5
	FoodCount      = 40
	MapWidth       = 800.0
	MapHeight      = 800.0
)

// ==========================================
// 2. Client (WebSocketラッパー)
// ==========================================

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	id   string
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("[Error] Read fail from %s: %v\n", c.id, err)
			break
		}

		var base BaseMessage
		if err := json.Unmarshal(message, &base); err != nil {
			continue
		}

		switch base.Type {
		case "join":
			log.Printf("[Message] Received 'join' from %s\n", c.id)

		case "touch_input":
			var input TouchInputPayload
			if err := json.Unmarshal(base.Payload, &input); err == nil {
				log.Printf("[Input] Client: %s | Angle: %6.2f | Dash: %v\n", c.id, input.Angle, input.IsDashing)
				c.hub.input <- ClientInput{clientID: c.id, input: input}
			}
		}
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for message := range c.send {
		w, err := c.conn.NextWriter(websocket.TextMessage)
		if err != nil {
			return
		}
		w.Write(message)
		w.Close()
	}
}

// ==========================================
// 3. Hub (ゲームループと状態管理)
// ==========================================

type ClientInput struct {
	clientID string
	input    TouchInputPayload
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	input      chan ClientInput
	sharks     map[string]*SharkState
	foods      map[string]*FoodState
}

func newHub() *Hub {
	h := &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
		input:      make(chan ClientInput),
		sharks:     make(map[string]*SharkState),
		foods:      make(map[string]*FoodState),
	}

	for i := 0; i < FoodCount; i++ {
		h.spawnFood()
	}
	
	for i := 0; i < 4; i++ {
		h.spawnBot()
	}
	return h
}

func (h *Hub) spawnFood() {
	id := uuid.New().String()
	h.foods[id] = &FoodState{
		ID: id,
		X:  rand.Float64() * MapWidth,
		Y:  rand.Float64() * MapHeight,
	}
}

func (h *Hub) spawnFoodAt(x, y float64, amount int) {
	for i := 0; i < amount; i++ {
		id := uuid.New().String()
		offsetX := (rand.Float64() - 0.5) * 80.0
		offsetY := (rand.Float64() - 0.5) * 80.0
		
		newX := math.Max(0, math.Min(MapWidth, x+offsetX))
		newY := math.Max(0, math.Min(MapHeight, y+offsetY))
		
		h.foods[id] = &FoodState{
			ID: id,
			X:  newX,
			Y:  newY,
		}
	}
}

func (h *Hub) spawnBot() {
	id := "bot-" + uuid.New().String()
	h.sharks[id] = &SharkState{
		ID:     id,
		X:      rand.Float64() * MapWidth,
		Y:      rand.Float64() * MapHeight,
		Angle:  rand.Float64() * 2 * math.Pi,
		Radius: 15.0,
		CP:     MaxCP,
		IsBot:  true,
	}
}

func (h *Hub) run() {
	ticker := time.NewTicker(time.Second / 20)
	defer ticker.Stop()

	tickCount := 0

	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			h.sharks[client.id] = &SharkState{
				ID:     client.id,
				X:      MapWidth / 2,
				Y:      MapHeight / 2,
				Radius: 15.0,
				CP:     MaxCP,
				IsBot:  false,
			}
			log.Printf("[Connect] New player joined! ID: %s\n", client.id)

			welcomeMsg, _ := json.Marshal(BaseMessage{
				Type: "welcome",
				Payload: toRawJSON(WelcomePayload{PlayerID: client.id}),
			})
			client.send <- welcomeMsg

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				delete(h.sharks, client.id)
				close(client.send)
				log.Printf("[Disconnect] Player left. ID: %s\n", client.id)
			}

		case msg := <-h.input:
			if shark, ok := h.sharks[msg.clientID]; ok {
				shark.Angle = msg.input.Angle
				shark.IsDashing = msg.input.IsDashing
			}

		case <-ticker.C:
			h.updateGame()
			h.broadcastState()

			tickCount++
			if tickCount%20 == 0 {
				log.Printf("--- [System] Tick running... Active players: %d ---\n", len(h.clients))
			}
		}
	}
}

func (h *Hub) updateGame() {
	// 1. 各サメの移動と通常エサの捕食
	for _, shark := range h.sharks {
		if shark.IsBot {
			shark.Angle += (rand.Float64() - 0.5) * 0.3
			if !shark.IsDashing && shark.CP > 80 && rand.Float64() < 0.05 {
				shark.IsDashing = true
			} else if shark.IsDashing && shark.CP < 20 {
				shark.IsDashing = false
			}
		}

		speed := BaseSpeed
		if shark.IsDashing && shark.CP > 0 {
			speed *= DashMultiplier
			shark.CP -= 1.5
			if shark.CP < 0 {
				shark.CP = 0
			}
		} else {
			if shark.CP < MaxCP {
				shark.CP += 0.2
			}
		}

		shark.X += math.Cos(shark.Angle) * speed
		shark.Y += math.Sin(shark.Angle) * speed

		shark.X = math.Max(shark.Radius, math.Min(MapWidth-shark.Radius, shark.X))
		shark.Y = math.Max(shark.Radius, math.Min(MapHeight-shark.Radius, shark.Y))

		for id, food := range h.foods {
			dx := shark.X - food.X
			dy := shark.Y - food.Y
			dist := math.Sqrt(dx*dx + dy*dy)

			if dist < shark.Radius {
				shark.Score++
				if shark.Radius < 150 {
					shark.Radius += 1.5
				}
				delete(h.foods, id)
				h.spawnFood()
			}
		}
	}

	// 2. サメ同士の衝突（頭が相手の体に当たったら死亡）
	sharksList := make([]*SharkState, 0, len(h.sharks))
	for _, s := range h.sharks {
		sharksList = append(sharksList, s)
	}

	deadSharks := make(map[string]bool)

	for i := 0; i < len(sharksList); i++ {
		for j := i + 1; j < len(sharksList); j++ {
			s1 := sharksList[i]
			s2 := sharksList[j]

			if deadSharks[s1.ID] || deadSharks[s2.ID] {
				continue
			}

			s1NoseX := s1.X + math.Cos(s1.Angle)*s1.Radius
			s1NoseY := s1.Y + math.Sin(s1.Angle)*s1.Radius

			s2NoseX := s2.X + math.Cos(s2.Angle)*s2.Radius
			s2NoseY := s2.Y + math.Sin(s2.Angle)*s2.Radius

			dist1To2 := math.Hypot(s1NoseX-s2.X, s1NoseY-s2.Y)
			s1HitsS2 := dist1To2 < s2.Radius

			dist2To1 := math.Hypot(s2NoseX-s1.X, s2NoseY-s1.Y)
			s2HitsS1 := dist2To1 < s1.Radius

			if s1HitsS2 && s2HitsS1 {
				deadSharks[s1.ID] = true
				deadSharks[s2.ID] = true
				h.spawnFoodAt(s1.X, s1.Y, int(s1.Radius/2))
				h.spawnFoodAt(s2.X, s2.Y, int(s2.Radius/2))
				log.Printf("[Game] Head-on collision! %s and %s died.", s1.ID, s2.ID)

			} else if s1HitsS2 {
				deadSharks[s1.ID] = true
				s2.Score += 5
				if s2.Radius < 150 {
					s2.Radius += 5.0
				}
				h.spawnFoodAt(s1.X, s1.Y, int(s1.Radius/2))
				log.Printf("[Game] %s hit %s and died.", s1.ID, s2.ID)

			} else if s2HitsS1 {
				deadSharks[s2.ID] = true
				s1.Score += 5
				if s1.Radius < 150 {
					s1.Radius += 5.0
				}
				h.spawnFoodAt(s2.X, s2.Y, int(s2.Radius/2))
				log.Printf("[Game] %s hit %s and died.", s2.ID, s1.ID)
			}
		}
	}

	// 3. 死亡処理
	for id := range deadSharks {
		shark := h.sharks[id]
		if !shark.IsBot {
			for client := range h.clients {
				if client.id == id {
					deathMsg, _ := json.Marshal(BaseMessage{
						Type: "death",
						Payload: toRawJSON(map[string]interface{}{
							"final_score": shark.Score,
						}),
					})
					client.send <- deathMsg
					break
				}
			}
		} else {
			h.spawnBot()
		}
		delete(h.sharks, id)
	}
}

func (h *Hub) broadcastState() {
	var state StatePayload
	for _, s := range h.sharks {
		state.Sharks = append(state.Sharks, *s)
	}
	for _, f := range h.foods {
		state.Foods = append(state.Foods, *f)
	}

	msg, _ := json.Marshal(BaseMessage{
		Type:    "state",
		Payload: toRawJSON(state),
	})

	for client := range h.clients {
		select {
		case client.send <- msg:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

func toRawJSON(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{id: uuid.New().String(), hub: hub, conn: conn, send: make(chan []byte, 256)}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func main() {
	hub := newHub()
	go hub.run()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})

	log.Println("Server started on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}