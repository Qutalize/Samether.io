package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/Qutalize/Samether.io/server/internal/game"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

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
			log.Printf("[Error] Read fail from %s: %v", c.id, err)
			break
		}

		var base BaseMessage
		if err := json.Unmarshal(message, &base); err != nil {
			continue
		}

		switch base.Type {
		case "join":
			log.Printf("[Message] Received 'join' from %s", c.id)
		case "touch_input":
			var input TouchInputPayload
			if err := json.Unmarshal(base.Payload, &input); err == nil {
				c.hub.engine.Input(game.PlayerInput{
					PlayerID:  c.id,
					Angle:     input.Angle,
					IsDashing: input.IsDashing,
				})
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

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{
		id:   uuid.New().String(),
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}
	hub.register <- client

	go client.writePump()
	go client.readPump()
}
