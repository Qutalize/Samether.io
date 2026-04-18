package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/samezario/server/config"
	sstatic "github.com/samezario/server/internal/static"
	sws "github.com/samezario/server/internal/ws"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	flag.Parse()

	cfg := config.Load()

	hub := sws.NewHub(sws.Config{
		RoomID:        cfg.RoomID,
		RoomCapacity:  cfg.RoomCapacity,
		InstanceID:    cfg.InstanceID,
		RedisAddr:     cfg.RedisAddr,
		RedisPassword: cfg.RedisPassword,
		RedisDB:       cfg.RedisDB,
		RedisPrefix:   cfg.RedisPrefix,
	})
	go hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","roomId":"` + cfg.RoomID + `","instanceId":"` + cfg.InstanceID + `"}`))
	})
	mux.HandleFunc("/room", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(sws.MustMarshal("room", hub.RoomSnapshot()))
	})
	mux.HandleFunc("/ws", hub.ServeWS)
	mux.Handle("/", http.FileServer(http.FS(sstatic.FS())))

	log.Printf("samezario-server listening on %s room_id=%s capacity=%d instance_id=%s", *addr, cfg.RoomID, cfg.RoomCapacity, cfg.InstanceID)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
