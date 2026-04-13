package main

import (
	"flag"
	"log"
	"net/http"

	sws "github.com/samezario/server/internal/ws"
	sstatic "github.com/samezario/server/internal/static"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	flag.Parse()

	hub := sws.NewHub()
	go hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws", hub.ServeWS)
	mux.Handle("/", http.FileServer(http.FS(sstatic.FS())))

	log.Printf("samezario-server listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
