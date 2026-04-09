package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/life-loop/desktop-agent/internal/agent"
	"github.com/life-loop/desktop-agent/internal/config"
	"github.com/life-loop/desktop-agent/internal/logging"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	logger := logging.New(cfg.AgentID)
	service := agent.New(cfg, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := service.Run(ctx); err != nil {
		logger.Error("agent.run_failed", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
}
