package agent

import (
	"context"
	"fmt"
	"time"

	"github.com/life-loop/desktop-agent/internal/config"
	"github.com/life-loop/desktop-agent/internal/controlplane"
	"github.com/life-loop/desktop-agent/internal/credentials"
	"github.com/life-loop/desktop-agent/internal/health"
	"github.com/life-loop/desktop-agent/internal/logging"
)

type Service struct {
	config config.Config
	logger logging.Logger
	client *controlplane.Client
}

func New(cfg config.Config, logger logging.Logger) Service {
	return Service{
		config: cfg,
		logger: logger,
		client: controlplane.New(cfg.ControlPlaneURL),
	}
}

func (s Service) Run(ctx context.Context) error {
	storedCredential, err := s.resolveCredential(ctx)
	if err != nil {
		return err
	}

	s.logger.Info("agent.started", map[string]any{
		"deviceId":        storedCredential.DeviceID,
		"deviceName":      firstNonEmpty(storedCredential.DeviceName, s.config.DeviceName),
		"controlPlaneUrl": s.config.ControlPlaneURL,
	})

	healthServer := health.NewServer(s.config.HealthPort)

	go func() {
		if err := healthServer.Run(ctx); err != nil {
			s.logger.Error("agent.health_server_failed", map[string]any{"error": err.Error()})
		}
	}()

	if err := s.sendHeartbeat(ctx, storedCredential.Credential); err != nil {
		return err
	}

	ticker := time.NewTicker(s.config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("agent.stopped", map[string]any{})
			return nil
		case <-ticker.C:
			if err := s.sendHeartbeat(ctx, storedCredential.Credential); err != nil {
				s.logger.Error("agent.heartbeat_failed", map[string]any{
					"error": err.Error(),
				})
			}
		}
	}
}

func (s Service) resolveCredential(ctx context.Context) (credentials.StoredCredential, error) {
	if s.config.DeviceCredential != "" {
		return credentials.StoredCredential{
			Credential: s.config.DeviceCredential,
			DeviceName: s.config.DeviceName,
		}, nil
	}

	storedCredential, err := credentials.Load(s.config.DeviceCredentialPath)
	if err != nil {
		return credentials.StoredCredential{}, err
	}

	if storedCredential != nil {
		return *storedCredential, nil
	}

	if s.config.EnrollmentToken == "" {
		return credentials.StoredCredential{}, fmt.Errorf("no device credential available and LIFE_LOOP_ENROLLMENT_TOKEN is empty")
	}

	response, err := s.client.RedeemEnrollmentToken(ctx, s.config.EnrollmentToken)
	if err != nil {
		return credentials.StoredCredential{}, fmt.Errorf("redeem enrollment token: %w", err)
	}

	nextCredential := credentials.StoredCredential{
		DeviceID:   response.Device.ID,
		LibraryID:  response.Device.LibraryID,
		DeviceName: response.Device.Name,
		Credential: response.Credential.Token,
		IssuedAt:   response.Credential.IssuedAt,
	}

	if err := credentials.Save(s.config.DeviceCredentialPath, nextCredential); err != nil {
		return credentials.StoredCredential{}, err
	}

	s.logger.Info("agent.credential_saved", map[string]any{
		"credentialPath": s.config.DeviceCredentialPath,
		"deviceId":       response.Device.ID,
	})

	return nextCredential, nil
}

func (s Service) sendHeartbeat(ctx context.Context, credential string) error {
	response, err := s.client.SendHeartbeat(ctx, credential, controlplane.HeartbeatRequest{
		ObservedAt:   time.Now().UTC().Format(time.RFC3339),
		Hostname:     s.config.Hostname,
		AgentVersion: s.config.AgentVersion,
	})
	if err != nil {
		return fmt.Errorf("send heartbeat: %w", err)
	}

	s.logger.Info("agent.heartbeat", map[string]any{
		"acceptedAt": response.AcceptedAt,
		"deviceId":   response.Device.ID,
		"status":     response.Device.Status,
	})

	return nil
}

func firstNonEmpty(primary string, fallback string) string {
	if primary != "" {
		return primary
	}

	return fallback
}
