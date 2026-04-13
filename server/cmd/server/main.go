package main

import (
	"context"
	"log"
	"net/http"

	"github.com/Qutalize/Samether.io/server/internal/game"
	"github.com/Qutalize/Samether.io/server/internal/ws"
)

func main() {
	ctx := context.Background()

	engine := game.New()
	go engine.Run(ctx)

	hub := ws.NewHub(engine)
	go hub.Run(ctx)

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWs(hub, w, r)
	})

	log.Println("Server started on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
