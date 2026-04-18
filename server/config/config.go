package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	RoomID         string
	RoomCapacity   int
	InstanceID     string
	RedisAddr      string
	RedisPassword  string
	RedisDB        int
	RedisPrefix    string
	AllowedOrigins []string
}

func Load() Config {
	cfg := Config{
		RoomCapacity: 50,
		RedisDB:      0,
	}

	// Room configuration
	if raw := os.Getenv("ROOM_CAPACITY"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			cfg.RoomCapacity = parsed
		} else {
			log.Printf("Warning: Invalid ROOM_CAPACITY value: %s, using default: %d", raw, cfg.RoomCapacity)
		}
	}

	cfg.RoomID = getenvDefault("ROOM_ID", defaultRoomID())
	cfg.InstanceID = getenvDefault("INSTANCE_ID", cfg.RoomID)

	// Redis configuration with validation
	cfg.RedisAddr = os.Getenv("REDIS_ADDR")
	if cfg.RedisAddr != "" {
		log.Printf("Redis enabled at: %s", cfg.RedisAddr)
	} else {
		log.Printf("Redis not configured, using in-memory leaderboard")
	}

	cfg.RedisPassword = os.Getenv("REDIS_PASSWORD")
	cfg.RedisPrefix = getenvDefault("REDIS_PREFIX", "samezario:leaderboard")

	if raw := os.Getenv("REDIS_DB"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			cfg.RedisDB = parsed
		} else {
			log.Printf("Warning: Invalid REDIS_DB value: %s, using default: %d", raw, cfg.RedisDB)
		}
	}

	// CORS configuration
	if originsStr := os.Getenv("ALLOWED_ORIGINS"); originsStr != "" {
		for _, origin := range strings.Split(originsStr, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				cfg.AllowedOrigins = append(cfg.AllowedOrigins, origin)
			}
		}
		log.Printf("CORS allowed origins: %v", cfg.AllowedOrigins)
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
