package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"

	sstatic "github.com/samezario/server/internal/static"
	sws "github.com/samezario/server/internal/ws"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	flag.Parse()

	roomCapacity := 50
	if raw := os.Getenv("ROOM_CAPACITY"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			roomCapacity = parsed
		}
	}

	defaultRoomID := defaultRoomID()
	roomID := getenvDefault("ROOM_ID", defaultRoomID)
	instanceID := getenvDefault("INSTANCE_ID", roomID)

	redisDB := 0
	if raw := os.Getenv("REDIS_DB"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			redisDB = parsed
		}
	}

	hub := sws.NewHub(sws.Config{
		RoomID:        roomID,
		RoomCapacity:  roomCapacity,
		InstanceID:    instanceID,
		RedisAddr:     os.Getenv("REDIS_ADDR"),
		RedisPassword: os.Getenv("REDIS_PASSWORD"),
		RedisDB:       redisDB,
		RedisPrefix:   os.Getenv("REDIS_PREFIX"),
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
		_, _ = w.Write([]byte(`{"status":"ok","roomId":"` + roomID + `","instanceId":"` + instanceID + `"}`))
	})
	mux.HandleFunc("/room", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(sws.MustMarshal("room", hub.RoomSnapshot()))
	})
	mux.HandleFunc("/ws", hub.ServeWS)
	mux.Handle("/", http.FileServer(http.FS(sstatic.FS())))

	log.Printf("samezario-server listening on %s room_id=%s capacity=%d instance_id=%s", *addr, roomID, roomCapacity, instanceID)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}

func getenvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func defaultRoomID() string {
	hostname, err := os.Hostname()
	if err == nil && hostname != "" {
		return hostname
	}
	return "room-1"
}
