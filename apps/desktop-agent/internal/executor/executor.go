package executor

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/life-loop/desktop-agent/internal/bindings"
	"github.com/life-loop/desktop-agent/internal/controlplane"
	"github.com/life-loop/desktop-agent/internal/storage"
)

const (
	StatusSucceeded             = "succeeded"
	StatusCompletedWithWarnings = "completed_with_warnings"
	StatusBlocked               = "blocked"
	StatusFailed                = "failed"

	SafeErrorMissingManifest          = "missing_execution_manifest"
	SafeErrorInvalidManifest          = "invalid_execution_manifest"
	SafeErrorMissingBinding           = "missing_binding"
	SafeErrorProviderMismatch         = "provider_mismatch"
	SafeErrorUnsupportedJob           = "unsupported_job_kind"
	SafeErrorUnsupportedSource        = "unsupported_source"
	SafeErrorUnsupportedProvider      = "unsupported_provider"
	SafeErrorDiskUnavailable          = "disk_unavailable"
	SafeErrorChecksumMismatch         = "checksum_mismatch"
	SafeErrorHostedStagingFetch       = "hosted_staging_fetch_failed"
	SafeErrorMissingRestoreRoot       = "missing_restore_workspace"
	SafeErrorRestoreReportFailed      = "restore_evidence_report_failed"
	SafeErrorRestoreSamplesNeedReview = "restore_samples_need_review"
)

type Result struct {
	Status         string
	Reason         string
	SafeErrorClass string
}

type Runner struct {
	Bindings          bindings.File
	HostedStaging     HostedStagingFetcher
	LocalDiskProvider storage.LocalDiskProvider
	RestoreEvidence   RestoreEvidenceRecorder
	RestoreWorkspace  string
}

type HostedStagingFetcher interface {
	FetchHostedStagingSource(ctx context.Context, claim controlplane.ClaimedJob, stagingObjectID string) (io.ReadCloser, error)
}

type RestoreEvidenceRecorder interface {
	RecordRestoreDrillEvidence(ctx context.Context, restoreDrillID string, request controlplane.RecordRestoreDrillEvidenceRequest) error
}

var checksumPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (r Runner) Execute(ctx context.Context, claim controlplane.ClaimedJob) Result {
	manifest := claim.Execution
	if manifest == nil {
		return blocked(SafeErrorMissingManifest, "Job is missing a safe execution manifest.")
	}

	if err := validateManifest(claim.Job.Kind, *manifest); err != nil {
		return blocked(SafeErrorInvalidManifest, err.Error())
	}

	switch claim.Job.Kind {
	case "placement-verification":
		binding, destinationPath, result := r.resolveDestination(*manifest)
		if result != nil {
			return *result
		}

		return r.verifyPlacement(ctx, binding.RootPath, destinationPath, manifest.ChecksumSHA256)
	case "archive-placement":
		binding, destinationPath, result := r.resolveDestination(*manifest)
		if result != nil {
			return *result
		}

		return r.placeArchive(ctx, claim, binding.RootPath, destinationPath, *manifest)
	case "restore-drill":
		return r.restoreDrill(ctx, claim, *manifest)
	default:
		return blocked(SafeErrorUnsupportedJob, "Job kind is not supported by the MVP desktop executor.")
	}
}

func (r Runner) resolveDestination(manifest controlplane.JobExecutionManifest) (bindings.StorageTargetBinding, string, *Result) {
	binding, exists := r.Bindings.Find(manifest.StorageTargetID)
	if !exists {
		result := blocked(SafeErrorMissingBinding, "No local binding exists for the requested storage target.")
		return bindings.StorageTargetBinding{}, "", &result
	}

	if bindings.NormalizeProvider(binding.Provider) != bindings.NormalizeProvider(manifest.Provider) {
		result := blocked(SafeErrorProviderMismatch, "Local binding provider does not match the job execution manifest.")
		return bindings.StorageTargetBinding{}, "", &result
	}

	if !isLocalDiskProvider(binding.Provider) {
		result := blocked(SafeErrorUnsupportedProvider, "Storage provider is not supported by the MVP desktop executor.")
		return bindings.StorageTargetBinding{}, "", &result
	}

	destinationPath, err := safeJoin(binding.RootPath, manifest.RelativePath)
	if err != nil {
		result := blocked(SafeErrorInvalidManifest, err.Error())
		return bindings.StorageTargetBinding{}, "", &result
	}

	return binding, destinationPath, nil
}

func (r Runner) verifyPlacement(ctx context.Context, rootPath string, destinationPath string, checksum string) Result {
	if err := r.LocalDiskProvider.Health(ctx, storage.HealthRequest{RootPath: rootPath}); err != nil {
		return blocked(SafeErrorDiskUnavailable, "Storage target is unavailable or not a directory.")
	}

	if err := r.LocalDiskProvider.Verify(ctx, storage.VerifyRequest{
		Path:             destinationPath,
		ExpectedChecksum: checksum,
	}); err != nil {
		if errors.Is(err, storage.ErrChecksumMismatch) {
			return blocked(SafeErrorChecksumMismatch, "Placement checksum does not match the expected blob checksum.")
		}

		return blocked(SafeErrorDiskUnavailable, "Placement could not be read from the bound storage target.")
	}

	return Result{
		Status: StatusSucceeded,
		Reason: "Placement checksum was verified on the bound storage target.",
	}
}

func (r Runner) placeArchive(ctx context.Context, claim controlplane.ClaimedJob, rootPath string, destinationPath string, manifest controlplane.JobExecutionManifest) Result {
	if manifest.Source == nil {
		return blocked(SafeErrorUnsupportedSource, "Archive placement requires a supported non-path source reference.")
	}

	switch manifest.Source.Kind {
	case "agent-local-staging":
		return blocked(SafeErrorUnsupportedSource, "Agent-local staging source manifest is not configured yet.")
	case "hosted-staging":
		return r.placeHostedStagingArchive(ctx, claim, rootPath, destinationPath, manifest)
	default:
		return blocked(SafeErrorUnsupportedSource, "Source kind is not supported by the MVP desktop executor.")
	}
}

func (r Runner) placeHostedStagingArchive(ctx context.Context, claim controlplane.ClaimedJob, rootPath string, destinationPath string, manifest controlplane.JobExecutionManifest) Result {
	if r.HostedStaging == nil || manifest.Source == nil || manifest.Source.StagingObjectID == "" {
		return blocked(SafeErrorUnsupportedSource, "Hosted staging source is not configured for this archive placement job.")
	}

	if err := r.LocalDiskProvider.Health(ctx, storage.HealthRequest{RootPath: rootPath}); err != nil {
		return blocked(SafeErrorDiskUnavailable, "Storage target is unavailable or not a directory.")
	}

	source, err := r.HostedStaging.FetchHostedStagingSource(ctx, claim, manifest.Source.StagingObjectID)
	if err != nil {
		return blocked(SafeErrorHostedStagingFetch, "Hosted staging source could not be fetched from the control plane.")
	}
	defer source.Close()

	temporaryFile, err := os.CreateTemp("", "life-loop-hosted-staging-*")
	if err != nil {
		return blocked(SafeErrorDiskUnavailable, "Temporary archive source could not be created.")
	}

	temporaryPath := temporaryFile.Name()
	defer os.Remove(temporaryPath)

	if _, err := io.Copy(temporaryFile, source); err != nil {
		_ = temporaryFile.Close()
		return blocked(SafeErrorHostedStagingFetch, "Hosted staging source could not be copied into a temporary archive source.")
	}

	if err := temporaryFile.Sync(); err != nil {
		_ = temporaryFile.Close()
		return blocked(SafeErrorDiskUnavailable, "Temporary archive source could not be flushed.")
	}

	if err := temporaryFile.Close(); err != nil {
		return blocked(SafeErrorDiskUnavailable, "Temporary archive source could not be closed.")
	}

	if _, err := r.LocalDiskProvider.Put(ctx, storage.PutRequest{
		SourcePath:       temporaryPath,
		DestinationPath:  destinationPath,
		ExpectedChecksum: manifest.ChecksumSHA256,
	}); err != nil {
		if errors.Is(err, storage.ErrChecksumMismatch) {
			return blocked(SafeErrorChecksumMismatch, "Hosted staging source checksum does not match the expected blob checksum.")
		}

		return blocked(SafeErrorDiskUnavailable, "Hosted staging source could not be placed on the bound storage target.")
	}

	return Result{
		Status: StatusSucceeded,
		Reason: "Hosted staging source was placed and checksum verified on the bound storage target.",
	}
}

func (r Runner) restoreDrill(ctx context.Context, claim controlplane.ClaimedJob, manifest controlplane.JobExecutionManifest) Result {
	if r.RestoreEvidence == nil {
		return blocked(SafeErrorRestoreReportFailed, "Restore evidence recorder is not configured.")
	}

	if r.RestoreWorkspace == "" {
		return r.blockRestoreDrill(ctx, manifest, SafeErrorMissingRestoreRoot, "Restore drill workspace is not configured.")
	}

	if err := r.LocalDiskProvider.Health(ctx, storage.HealthRequest{RootPath: r.RestoreWorkspace}); err != nil {
		return r.blockRestoreDrill(ctx, manifest, SafeErrorDiskUnavailable, "Restore drill workspace is unavailable or not a directory.")
	}

	verifiedCount := 0
	blockedCount := 0

	for _, sample := range manifest.Samples {
		result := r.restoreDrillSample(ctx, claim, manifest.RestoreDrillID, sample)
		if result.SafeErrorClass == SafeErrorRestoreReportFailed {
			return result
		}

		if result.Status == StatusSucceeded {
			verifiedCount++
			continue
		}

		blockedCount++
	}

	if verifiedCount == len(manifest.Samples) {
		return Result{
			Status: StatusSucceeded,
			Reason: fmt.Sprintf("Restore drill verified %d sampled assets.", verifiedCount),
		}
	}

	return Result{
		Status:         StatusCompletedWithWarnings,
		Reason:         fmt.Sprintf("Restore drill verified %d/%d sampled assets; %d samples need review.", verifiedCount, len(manifest.Samples), blockedCount),
		SafeErrorClass: SafeErrorRestoreSamplesNeedReview,
	}
}

func (r Runner) restoreDrillSample(ctx context.Context, claim controlplane.ClaimedJob, restoreDrillID string, sample controlplane.RestoreDrillSample) Result {
	binding, exists := r.Bindings.Find(sample.Source.StorageTargetID)
	if !exists {
		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorMissingBinding, "Restore source binding is not configured.")
	}

	if bindings.NormalizeProvider(binding.Provider) != bindings.NormalizeProvider(sample.Source.Provider) {
		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorProviderMismatch, "Restore source provider does not match the local binding.")
	}

	if !isLocalDiskProvider(binding.Provider) {
		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorUnsupportedProvider, "Restore source provider is not supported by the MVP desktop executor.")
	}

	if err := r.LocalDiskProvider.Health(ctx, storage.HealthRequest{RootPath: binding.RootPath}); err != nil {
		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorDiskUnavailable, "Restore source target is unavailable or not a directory.")
	}

	sourcePath, err := safeJoin(binding.RootPath, sample.Source.RelativePath)
	if err != nil {
		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorInvalidManifest, "Restore source relative path is invalid.")
	}

	destinationPath, err := safeJoin(filepath.Join(r.RestoreWorkspace, "restore-drills", claim.Job.ID), filepath.Join(sample.AssetID, filepath.Base(sample.Source.RelativePath)))
	if err != nil {
		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorInvalidManifest, "Restore destination could not be derived safely.")
	}

	if _, err := r.LocalDiskProvider.Put(ctx, storage.PutRequest{
		SourcePath:       sourcePath,
		DestinationPath:  destinationPath,
		ExpectedChecksum: sample.Source.ChecksumSHA256,
	}); err != nil {
		if errors.Is(err, storage.ErrChecksumMismatch) {
			return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "failed", SafeErrorChecksumMismatch, "Restore source checksum did not match the expected blob checksum.")
		}

		return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "blocked", SafeErrorDiskUnavailable, "Restore sample could not be copied into the local drill workspace.")
	}

	return r.recordRestoreEvidence(ctx, restoreDrillID, sample, "verified", "", "Restore drill sample was copied and checksum verified.")
}

func (r Runner) blockRestoreDrill(ctx context.Context, manifest controlplane.JobExecutionManifest, safeErrorClass string, summary string) Result {
	for _, sample := range manifest.Samples {
		result := r.recordRestoreEvidence(ctx, manifest.RestoreDrillID, sample, "blocked", safeErrorClass, summary)
		if result.SafeErrorClass == SafeErrorRestoreReportFailed {
			return result
		}
	}

	return blocked(safeErrorClass, summary)
}

func (r Runner) recordRestoreEvidence(ctx context.Context, restoreDrillID string, sample controlplane.RestoreDrillSample, evidenceStatus string, safeErrorClass string, summary string) Result {
	request := controlplane.RecordRestoreDrillEvidenceRequest{
		AssetID:         sample.AssetID,
		CandidateStatus: sample.CandidateStatus,
		EvidenceStatus:  evidenceStatus,
		Summary:         summary,
	}

	if sample.Source.StorageTargetID != "" {
		request.StorageTargetID = sample.Source.StorageTargetID
	}

	if evidenceStatus == "verified" {
		request.ChecksumSHA256 = sample.Source.ChecksumSHA256
	}

	if safeErrorClass != "" {
		request.SafeErrorClass = safeErrorClass
	}

	if err := r.RestoreEvidence.RecordRestoreDrillEvidence(ctx, restoreDrillID, request); err != nil {
		return blocked(SafeErrorRestoreReportFailed, "Restore drill evidence could not be reported to the control plane.")
	}

	if evidenceStatus == "verified" {
		return Result{Status: StatusSucceeded, Reason: summary}
	}

	return Result{Status: StatusBlocked, Reason: summary, SafeErrorClass: safeErrorClass}
}

func validateManifest(jobKind string, manifest controlplane.JobExecutionManifest) error {
	if manifest.SchemaVersion != 1 {
		return fmt.Errorf("Execution manifest schema version is unsupported.")
	}

	if manifest.Operation != jobKind {
		return fmt.Errorf("Execution manifest operation does not match the claimed job kind.")
	}

	if manifest.Operation != "archive-placement" && manifest.Operation != "placement-verification" && manifest.Operation != "restore-drill" {
		return fmt.Errorf("Execution manifest operation is unsupported.")
	}

	if manifest.Operation == "restore-drill" {
		if manifest.RestoreDrillID == "" {
			return fmt.Errorf("Restore drill execution manifest is missing a restore drill id.")
		}

		if len(manifest.Samples) < 1 || len(manifest.Samples) > 50 {
			return fmt.Errorf("Restore drill execution manifest requires one to fifty samples.")
		}

		for _, sample := range manifest.Samples {
			if sample.AssetID == "" || sample.CandidateStatus == "" || sample.Source.StorageTargetID == "" || sample.Source.Provider == "" || sample.Source.RelativePath == "" {
				return fmt.Errorf("Restore drill execution sample is missing required metadata.")
			}

			if !checksumPattern.MatchString(sample.Source.ChecksumSHA256) {
				return fmt.Errorf("Restore drill execution sample checksum is invalid.")
			}

			if _, err := safeJoin("restore-source-root", sample.Source.RelativePath); err != nil {
				return fmt.Errorf("Restore drill execution sample relative path is invalid.")
			}
		}

		return nil
	}

	if manifest.StorageTargetID == "" {
		return fmt.Errorf("Execution manifest is missing a storage target id.")
	}

	if manifest.Provider == "" {
		return fmt.Errorf("Execution manifest is missing a provider.")
	}

	if manifest.RelativePath == "" {
		return fmt.Errorf("Execution manifest is missing a relative path.")
	}

	if !checksumPattern.MatchString(manifest.ChecksumSHA256) {
		return fmt.Errorf("Execution manifest checksum is invalid.")
	}

	return nil
}

func safeJoin(rootPath string, relativePath string) (string, error) {
	if rootPath == "" {
		return "", fmt.Errorf("Local binding root is empty.")
	}

	if filepath.IsAbs(relativePath) || strings.HasPrefix(relativePath, "/") || strings.HasPrefix(relativePath, `\`) || strings.Contains(relativePath, ":") {
		return "", fmt.Errorf("Execution manifest relative path must not be absolute.")
	}

	for _, segment := range strings.Split(strings.ReplaceAll(relativePath, `\`, "/"), "/") {
		if segment == ".." {
			return "", fmt.Errorf("Execution manifest relative path escapes the storage target root.")
		}
	}

	cleaned := filepath.Clean(relativePath)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("Execution manifest relative path escapes the storage target root.")
	}

	joined := filepath.Join(rootPath, cleaned)
	cleanRoot := filepath.Clean(rootPath)
	relativeToRoot, err := filepath.Rel(cleanRoot, joined)
	if err != nil || relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("Execution manifest relative path escapes the storage target root.")
	}

	return joined, nil
}

func blocked(safeErrorClass string, reason string) Result {
	return Result{
		Status:         StatusBlocked,
		Reason:         reason,
		SafeErrorClass: safeErrorClass,
	}
}

func isLocalDiskProvider(provider string) bool {
	switch bindings.NormalizeProvider(provider) {
	case "local-disk", "external-drive":
		return true
	default:
		return false
	}
}
