package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/samezario/server/config"
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

	var handler http.Handler = mux
	if cfg.AllowedOrigin != "" {
		handler = corsMiddleware(cfg.AllowedOrigin, mux)
	}

	log.Printf("samezario-server listening on %s room_id=%s capacity=%d instance_id=%s", *addr, cfg.RoomID, cfg.RoomCapacity, cfg.InstanceID)
	if err := http.ListenAndServe(*addr, handler); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
