package ws

import (
	"context"
	"encoding/json"
	"log"

	"github.com/Qutalize/Samether.io/server/internal/game"
)

type Hub struct {
	clients    map[string]*Client
	register   chan *Client
	unregister chan *Client
	engine     *game.Engine
}

func NewHub(engine *game.Engine) *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		engine:     engine,
	}
}

func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case client := <-h.register:
			h.clients[client.id] = client
			h.engine.Join(client.id)
			welcome, _ := json.Marshal(BaseMessage{
				Type:    "welcome",
				Payload: toRawJSON(WelcomePayload{PlayerID: client.id}),
			})
			client.send <- welcome
		case client := <-h.unregister:
			if _, ok := h.clients[client.id]; ok {
				delete(h.clients, client.id)
				close(client.send)
				h.engine.Leave(client.id)
			}
		case snap := <-h.engine.Snapshots():
			msg, _ := json.Marshal(BaseMessage{
				Type:    "state",
				Payload: toRawJSON(snap),
			})
			h.broadcast(msg)
		case death := <-h.engine.Deaths():
			client, ok := h.clients[death.PlayerID]
			if !ok {
				continue
			}
			msg, _ := json.Marshal(BaseMessage{
				Type:    "death",
				Payload: toRawJSON(DeathPayload{FinalScore: death.FinalScore}),
			})
			select {
			case client.send <- msg:
			default:
				log.Printf("[Warn] death send failed for %s", death.PlayerID)
			}
		}
	}
}

func (h *Hub) broadcast(msg []byte) {
	for id, client := range h.clients {
		select {
		case client.send <- msg:
		default:
			close(client.send)
			delete(h.clients, id)
		}
	}
}
