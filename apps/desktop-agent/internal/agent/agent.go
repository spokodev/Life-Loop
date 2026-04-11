package agent

import (
	"context"
	"fmt"
	"time"

	"github.com/life-loop/desktop-agent/internal/bindings"
	"github.com/life-loop/desktop-agent/internal/config"
	"github.com/life-loop/desktop-agent/internal/controlplane"
	"github.com/life-loop/desktop-agent/internal/credentials"
	"github.com/life-loop/desktop-agent/internal/executor"
	"github.com/life-loop/desktop-agent/internal/health"
	"github.com/life-loop/desktop-agent/internal/logging"
	"github.com/life-loop/desktop-agent/internal/storage"
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

	if err := s.checkStorageBindings(ctx, storedCredential); err != nil {
		return err
	}

	healthServer := health.NewServer(s.config.HealthPort)

	go func() {
		if err := healthServer.Run(ctx); err != nil {
			s.logger.Error("agent.health_server_failed", map[string]any{"error": err.Error()})
		}
	}()

	if err := s.sendHeartbeat(ctx, storedCredential.Credential); err != nil {
		return err
	}
	s.pollAndExecuteOneJob(ctx, storedCredential)

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
			s.pollAndExecuteOneJob(ctx, storedCredential)
		}
	}
}

func (s Service) checkStorageBindings(ctx context.Context, storedCredential credentials.StoredCredential) error {
	bindingsFile, err := bindings.Load(s.config.StorageBindingsPath)
	if err != nil {
		return fmt.Errorf("load storage bindings: %w", err)
	}

	if storedCredential.Credential == "" {
		s.logger.Info("agent.storage_binding_coverage_skipped", map[string]any{
			"message": "Device credential is unavailable; local binding coverage cannot be compared to control-plane storage targets.",
		})
	} else if targets, err := s.client.ListStorageTargets(ctx, storedCredential.Credential, storedCredential.LibraryID); err != nil {
		s.logger.Error("agent.storage_binding_coverage_unavailable", map[string]any{
			"libraryId": storedCredential.LibraryID,
			"error":     err.Error(),
		})
	} else {
		s.reportStorageBindingCoverage(bindings.Coverage(bindingsFile, toTargetReferences(targets)))
	}

	if len(bindingsFile.Bindings) == 0 {
		s.logger.Info("agent.storage_bindings_missing", map[string]any{
			"bindingsPath": s.config.StorageBindingsPath,
			"message":      "No local storage target bindings configured yet; archive execution will remain blocked until bindings exist.",
		})
		return nil
	}

	localDiskProvider := storage.LocalDiskProvider{}
	for _, binding := range bindingsFile.Bindings {
		if !isLocalPathProvider(binding.Provider) {
			s.logger.Info("agent.storage_binding_provider_unsupported", map[string]any{
				"storageTargetId": binding.StorageTargetID,
				"provider":        binding.Provider,
				"message":         "Provider health is not checked by the local disk provider.",
			})
			continue
		}

		if err := localDiskProvider.Health(ctx, storage.HealthRequest{RootPath: binding.RootPath}); err != nil {
			s.logger.Error("agent.storage_binding_unhealthy", map[string]any{
				"storageTargetId": binding.StorageTargetID,
				"provider":        binding.Provider,
				"reason":          "Local root path is not reachable or is not a directory.",
			})
			continue
		}

		s.logger.Info("agent.storage_binding_healthy", map[string]any{
			"storageTargetId": binding.StorageTargetID,
			"provider":        binding.Provider,
		})
	}

	return nil
}

func (s Service) reportStorageBindingCoverage(report bindings.CoverageReport) {
	for _, target := range report.Missing {
		s.logger.Info("agent.storage_binding_missing_for_target", map[string]any{
			"storageTargetId": target.StorageTargetID,
			"provider":        target.Provider,
			"role":            target.Role,
			"message":         "Control-plane storage target has no local binding on this agent; archive execution for this target remains blocked.",
		})
	}

	for _, mismatch := range report.ProviderMismatches {
		s.logger.Info("agent.storage_binding_provider_mismatch", map[string]any{
			"storageTargetId": mismatch.Target.StorageTargetID,
			"targetProvider":  mismatch.Target.Provider,
			"bindingProvider": mismatch.Binding.Provider,
			"role":            mismatch.Target.Role,
			"message":         "Local binding provider does not match the control-plane storage target provider.",
		})
	}

	for _, binding := range report.Extra {
		s.logger.Info("agent.storage_binding_extra", map[string]any{
			"storageTargetId": binding.StorageTargetID,
			"provider":        binding.Provider,
			"message":         "Local binding is not present in the control-plane storage target registry for this library.",
		})
	}

	s.logger.Info("agent.storage_binding_coverage", map[string]any{
		"boundCount":            len(report.Bound),
		"missingCount":          len(report.Missing),
		"extraCount":            len(report.Extra),
		"providerMismatchCount": len(report.ProviderMismatches),
	})
}

func toTargetReferences(targets []controlplane.StorageTarget) []bindings.TargetReference {
	references := make([]bindings.TargetReference, 0, len(targets))
	for _, target := range targets {
		references = append(references, bindings.TargetReference{
			StorageTargetID: target.ID,
			Provider:        target.Provider,
			Role:            target.Role,
		})
	}

	return references
}

func isLocalPathProvider(provider string) bool {
	switch provider {
	case "local-disk", "external-drive", "LocalDiskProvider", "ExternalDriveProvider":
		return true
	default:
		return false
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

func (s Service) pollAndExecuteOneJob(ctx context.Context, storedCredential credentials.StoredCredential) {
	if storedCredential.Credential == "" {
		s.logger.Info("agent.job_poll_skipped", map[string]any{
			"reason": "Device credential is unavailable.",
		})
		return
	}

	claimResponse, err := s.client.ClaimJob(ctx, storedCredential.Credential, controlplane.ClaimJobRequest{
		Kinds:        []string{"archive-placement", "placement-verification"},
		LeaseSeconds: 300,
	})
	if err != nil {
		s.logger.Error("agent.job_claim_failed", map[string]any{
			"error": safeControlPlaneError(err),
		})
		return
	}

	if claimResponse.Claim == nil {
		s.logger.Info("agent.job_poll_idle", map[string]any{
			"recoveredExpiredCount": claimResponse.RecoveredExpiredCount,
		})
		return
	}

	claim := *claimResponse.Claim
	s.logger.Info("agent.job_claimed", map[string]any{
		"jobId":          claim.Job.ID,
		"kind":           claim.Job.Kind,
		"leaseExpiresAt": claim.Lease.LeaseExpiresAt,
	})

	bindingsFile, err := bindings.Load(s.config.StorageBindingsPath)
	if err != nil {
		s.completeJobAsBlocked(ctx, storedCredential.Credential, claim, executor.SafeErrorMissingBinding, "Storage bindings could not be loaded.")
		return
	}

	runner := executor.Runner{
		Bindings:          bindingsFile,
		HostedStaging:     controlplane.HostedStagingFetcher{Client: s.client, Credential: storedCredential.Credential},
		LocalDiskProvider: storage.LocalDiskProvider{},
	}
	result := runner.Execute(ctx, claim)

	if _, err := s.client.HeartbeatJobClaim(ctx, storedCredential.Credential, claim.Job.ID, controlplane.HeartbeatJobClaimRequest{
		LeaseToken:   claim.Lease.LeaseToken,
		LeaseSeconds: 300,
	}); err != nil {
		s.logger.Error("agent.job_lease_heartbeat_failed", map[string]any{
			"jobId": claim.Job.ID,
			"error": safeControlPlaneError(err),
		})
		return
	}

	if _, err := s.client.CompleteJobClaim(ctx, storedCredential.Credential, claim.Job.ID, controlplane.CompleteJobClaimRequest{
		LeaseToken:     claim.Lease.LeaseToken,
		Status:         result.Status,
		Reason:         result.Reason,
		SafeErrorClass: result.SafeErrorClass,
	}); err != nil {
		s.logger.Error("agent.job_complete_failed", map[string]any{
			"jobId":          claim.Job.ID,
			"status":         result.Status,
			"safeErrorClass": result.SafeErrorClass,
			"error":          safeControlPlaneError(err),
		})
		return
	}

	s.logger.Info("agent.job_completed", map[string]any{
		"jobId":          claim.Job.ID,
		"status":         result.Status,
		"safeErrorClass": result.SafeErrorClass,
	})
}

func (s Service) completeJobAsBlocked(ctx context.Context, credential string, claim controlplane.ClaimedJob, safeErrorClass string, reason string) {
	if _, err := s.client.CompleteJobClaim(ctx, credential, claim.Job.ID, controlplane.CompleteJobClaimRequest{
		LeaseToken:     claim.Lease.LeaseToken,
		Status:         executor.StatusBlocked,
		Reason:         reason,
		SafeErrorClass: safeErrorClass,
	}); err != nil {
		s.logger.Error("agent.job_block_failed", map[string]any{
			"jobId":          claim.Job.ID,
			"safeErrorClass": safeErrorClass,
			"error":          safeControlPlaneError(err),
		})
	}
}

func safeControlPlaneError(err error) string {
	if err == nil {
		return ""
	}

	return err.Error()
}

func firstNonEmpty(primary string, fallback string) string {
	if primary != "" {
		return primary
	}

	return fallback
}
