package executor

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/life-loop/desktop-agent/internal/bindings"
	"github.com/life-loop/desktop-agent/internal/controlplane"
	"github.com/life-loop/desktop-agent/internal/storage"
)

const (
	StatusSucceeded = "succeeded"
	StatusBlocked   = "blocked"

	SafeErrorMissingManifest     = "missing_execution_manifest"
	SafeErrorInvalidManifest     = "invalid_execution_manifest"
	SafeErrorMissingBinding      = "missing_binding"
	SafeErrorProviderMismatch    = "provider_mismatch"
	SafeErrorUnsupportedJob      = "unsupported_job_kind"
	SafeErrorUnsupportedSource   = "unsupported_source"
	SafeErrorUnsupportedProvider = "unsupported_provider"
	SafeErrorDiskUnavailable     = "disk_unavailable"
	SafeErrorChecksumMismatch    = "checksum_mismatch"
)

type Result struct {
	Status         string
	Reason         string
	SafeErrorClass string
}

type Runner struct {
	Bindings          bindings.File
	LocalDiskProvider storage.LocalDiskProvider
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

	binding, exists := r.Bindings.Find(manifest.StorageTargetID)
	if !exists {
		return blocked(SafeErrorMissingBinding, "No local binding exists for the requested storage target.")
	}

	if bindings.NormalizeProvider(binding.Provider) != bindings.NormalizeProvider(manifest.Provider) {
		return blocked(SafeErrorProviderMismatch, "Local binding provider does not match the job execution manifest.")
	}

	if !isLocalDiskProvider(binding.Provider) {
		return blocked(SafeErrorUnsupportedProvider, "Storage provider is not supported by the MVP desktop executor.")
	}

	destinationPath, err := safeJoin(binding.RootPath, manifest.RelativePath)
	if err != nil {
		return blocked(SafeErrorInvalidManifest, err.Error())
	}

	switch claim.Job.Kind {
	case "placement-verification":
		return r.verifyPlacement(ctx, binding.RootPath, destinationPath, manifest.ChecksumSHA256)
	case "archive-placement":
		return r.placeArchive(ctx, binding.RootPath, destinationPath, *manifest)
	default:
		return blocked(SafeErrorUnsupportedJob, "Job kind is not supported by the MVP desktop executor.")
	}
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

func (r Runner) placeArchive(_ context.Context, _ string, _ string, manifest controlplane.JobExecutionManifest) Result {
	if manifest.Source == nil {
		return blocked(SafeErrorUnsupportedSource, "Archive placement requires a supported non-path source reference.")
	}

	switch manifest.Source.Kind {
	case "agent-local-staging":
		return blocked(SafeErrorUnsupportedSource, "Agent-local staging source manifest is not configured yet.")
	case "hosted-staging":
		return blocked(SafeErrorUnsupportedSource, "Hosted staging fetch is not implemented yet.")
	default:
		return blocked(SafeErrorUnsupportedSource, "Source kind is not supported by the MVP desktop executor.")
	}
}

func validateManifest(jobKind string, manifest controlplane.JobExecutionManifest) error {
	if manifest.SchemaVersion != 1 {
		return fmt.Errorf("Execution manifest schema version is unsupported.")
	}

	if manifest.Operation != jobKind {
		return fmt.Errorf("Execution manifest operation does not match the claimed job kind.")
	}

	if manifest.Operation != "archive-placement" && manifest.Operation != "placement-verification" {
		return fmt.Errorf("Execution manifest operation is unsupported.")
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
