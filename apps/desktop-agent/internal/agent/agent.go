package agent

import (
	"context"
	"time"

	"github.com/life-loop/desktop-agent/internal/config"
	"github.com/life-loop/desktop-agent/internal/health"
	"github.com/life-loop/desktop-agent/internal/logging"
)

type Service struct {
	config config.Config
	logger logging.Logger
}

func New(cfg config.Config, logger logging.Logger) Service {
	return Service{
		config: cfg,
		logger: logger,
	}
}

func (s Service) Run(ctx context.Context) error {
	s.logger.Info("agent.started", map[string]any{
		"agentId":         s.config.AgentID,
		"libraryId":       s.config.LibraryID,
		"controlPlaneUrl": s.config.ControlPlaneURL,
	})

	healthServer := health.NewServer(s.config.HealthPort)

	go func() {
		if err := healthServer.Run(ctx); err != nil {
			s.logger.Error("agent.health_server_failed", map[string]any{"error": err.Error()})
		}
	}()

	ticker := time.NewTicker(s.config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("agent.stopped", map[string]any{})
			return nil
		case <-ticker.C:
			s.logger.Info("agent.heartbeat", map[string]any{
				"status": "placeholder",
			})
		}
	}
}
