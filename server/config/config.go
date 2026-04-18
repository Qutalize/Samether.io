package config

import (
	"os"
	"strconv"
)

type Config struct {
	RoomID        string
	RoomCapacity  int
	InstanceID    string
	RedisAddr     string
	RedisPassword string
	RedisDB       int
	RedisPrefix   string
	AllowedOrigin string
}

func Load() Config {
	cfg := Config{
		RoomCapacity: 50,
		RedisDB:      0,
	}

	if raw := os.Getenv("ROOM_CAPACITY"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			cfg.RoomCapacity = parsed
		}
	}

	cfg.RoomID = getenvDefault("ROOM_ID", defaultRoomID())
	cfg.InstanceID = getenvDefault("INSTANCE_ID", cfg.RoomID)
	cfg.AllowedOrigin = os.Getenv("ALLOWED_ORIGIN")
	cfg.RedisAddr = os.Getenv("REDIS_ADDR")
	cfg.RedisPassword = os.Getenv("REDIS_PASSWORD")
	cfg.RedisPrefix = os.Getenv("REDIS_PREFIX")

	if raw := os.Getenv("REDIS_DB"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			cfg.RedisDB = parsed
		}
	}

	return cfg
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
