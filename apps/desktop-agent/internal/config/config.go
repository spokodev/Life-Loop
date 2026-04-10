package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

type Config struct {
	DeviceName           string
	Hostname             string
	ControlPlaneURL      string
	HeartbeatInterval    time.Duration
	HealthPort           int
	EnrollmentToken      string
	DeviceCredential     string
	DeviceCredentialPath string
	StorageBindingsPath  string
	AgentVersion         string
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

	hostname := getHostname()
	deviceName := getEnv("LIFE_LOOP_DEVICE_NAME", hostname)

	return Config{
		DeviceName:           deviceName,
		Hostname:             getEnv("LIFE_LOOP_HOSTNAME", hostname),
		ControlPlaneURL:      getEnv("LIFE_LOOP_CONTROL_PLANE_URL", "http://localhost:4000"),
		HeartbeatInterval:    interval,
		HealthPort:           healthPort,
		EnrollmentToken:      os.Getenv("LIFE_LOOP_ENROLLMENT_TOKEN"),
		DeviceCredential:     os.Getenv("LIFE_LOOP_DEVICE_CREDENTIAL"),
		DeviceCredentialPath: getEnv("LIFE_LOOP_DEVICE_CREDENTIAL_PATH", defaultCredentialPath()),
		StorageBindingsPath:  getEnv("LIFE_LOOP_STORAGE_BINDINGS_PATH", defaultStorageBindingsPath()),
		AgentVersion:         getEnv("LIFE_LOOP_AGENT_VERSION", "0.0.1-dev"),
	}, nil
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return "life-loop-device"
	}

	return hostname
}

func defaultCredentialPath() string {
	if configDir, err := os.UserConfigDir(); err == nil && configDir != "" {
		return filepath.Join(configDir, "life-loop", "device-credential.json")
	}

	if homeDir, err := os.UserHomeDir(); err == nil && homeDir != "" {
		return filepath.Join(homeDir, ".life-loop", "device-credential.json")
	}

	return filepath.Join(".life-loop", "device-credential.json")
}

func defaultStorageBindingsPath() string {
	if configDir, err := os.UserConfigDir(); err == nil && configDir != "" {
		return filepath.Join(configDir, "life-loop", "storage-bindings.json")
	}

	if homeDir, err := os.UserHomeDir(); err == nil && homeDir != "" {
		return filepath.Join(homeDir, ".life-loop", "storage-bindings.json")
	}

	return filepath.Join(".life-loop", "storage-bindings.json")
}
