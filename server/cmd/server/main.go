package main

import (
"flag"
"log"
"net/http"
"time"

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

// Health check endpoints
mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodGet {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}
w.WriteHeader(http.StatusOK)
_, _ = w.Write([]byte("ok"))
})

mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodGet {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusOK)
_, _ = w.Write([]byte(`{"status":"ok","roomId":"` + cfg.RoomID + `","instanceId":"` + cfg.InstanceID + `"}`))
})

// Room info endpoint
mux.HandleFunc("/room", func(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodGet {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusOK)
_, _ = w.Write(sws.MustMarshal("room", hub.RoomSnapshot()))
})

// WebSocket endpoint
mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
if !isAllowedOrigin(r, cfg.AllowedOrigin) {
http.Error(w, "Forbidden", http.StatusForbidden)
return
}
hub.ServeWS(w, r)
})

var handler http.Handler = mux
if cfg.AllowedOrigin != "" {
handler = corsMiddleware(cfg.AllowedOrigin, mux)
}

// Wrap with security middleware
handler = securityMiddleware(handler)

server := &http.Server{
Addr:              *addr,
Handler:           handler,
ReadHeaderTimeout: 10 * time.Second,
ReadTimeout:       30 * time.Second,
WriteTimeout:      30 * time.Second,
IdleTimeout:       120 * time.Second,
MaxHeaderBytes:    1 << 20, // 1 MB
}

log.Printf("samezario-server listening on %s room_id=%s capacity=%d instance_id=%s", *addr, cfg.RoomID, cfg.RoomCapacity, cfg.InstanceID)
if err := server.ListenAndServe(); err != nil {
log.Fatal(err)
}
}

// securityMiddleware adds security headers and basic protection
func securityMiddleware(next http.Handler) http.Handler {
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
w.Header().Set("X-Content-Type-Options", "nosniff")
w.Header().Set("X-Frame-Options", "DENY")
w.Header().Set("X-XSS-Protection", "1; mode=block")
w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
next.ServeHTTP(w, r)
})
}

func isAllowedOrigin(r *http.Request, allowedOrigin string) bool {
if allowedOrigin == "" {
return true
}
origin := r.Header.Get("Origin")
if origin == "" {
return true
}
return origin == allowedOrigin
}

func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
w.Header().Add("Vary", "Origin")
if origin := r.Header.Get("Origin"); origin != "" && origin == allowedOrigin {
w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}
if r.Method == http.MethodOptions {
if !isAllowedOrigin(r, allowedOrigin) {
http.Error(w, "Forbidden", http.StatusForbidden)
return
}
w.WriteHeader(http.StatusNoContent)
return
}
next.ServeHTTP(w, r)
})
}
