package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	AgentID            string
	LibraryID          string
	ControlPlaneURL    string
	HeartbeatInterval  time.Duration
	HealthPort         int
}

func Load() (Config, error) {
	interval, err := time.ParseDuration(getEnv("LIFE_LOOP_HEARTBEAT_INTERVAL", "30s"))
	if err != nil {
		return Config{}, fmt.Errorf("parse heartbeat interval: %w", err)
	}

	healthPort, err := strconv.Atoi(getEnv("LIFE_LOOP_HEALTH_PORT", "8081"))
	if err != nil {
		return Config{}, fmt.Errorf("parse health port: %w", err)
	}

	return Config{
		AgentID:           getEnv("LIFE_LOOP_AGENT_ID", "dev-agent"),
		LibraryID:         getEnv("LIFE_LOOP_LIBRARY_ID", "dev-library"),
		ControlPlaneURL:   getEnv("LIFE_LOOP_CONTROL_PLANE_URL", "http://localhost:4000"),
		HeartbeatInterval: interval,
		HealthPort:        healthPort,
	}, nil
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
