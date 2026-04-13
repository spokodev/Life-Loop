package executor

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/life-loop/desktop-agent/internal/bindings"
	"github.com/life-loop/desktop-agent/internal/controlplane"
)

func TestExecuteBlocksMissingExecutionManifest(t *testing.T) {
	t.Parallel()

	result := Runner{}.Execute(context.Background(), controlplane.ClaimedJob{
		Job: controlplane.Job{
			ID:   "job-1",
			Kind: "placement-verification",
		},
	})

	assertBlocked(t, result, SafeErrorMissingManifest)
}

func TestExecuteBlocksMissingBinding(t *testing.T) {
	t.Parallel()

	result := Runner{}.Execute(context.Background(), verificationClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	assertBlocked(t, result, SafeErrorMissingBinding)
}

func TestExecuteBlocksProviderMismatch(t *testing.T) {
	t.Parallel()

	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "external-drive",
				RootPath:        t.TempDir(),
			},
		}},
	}
	result := runner.Execute(context.Background(), verificationClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	assertBlocked(t, result, SafeErrorProviderMismatch)
}

func TestExecuteBlocksUnsupportedProvider(t *testing.T) {
	t.Parallel()

	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "smb",
				RootPath:        t.TempDir(),
			},
		}},
	}
	result := runner.Execute(context.Background(), verificationClaim(t, "target-1", "smb", "asset/original.bin", hashBytes([]byte("content"))))

	assertBlocked(t, result, SafeErrorUnsupportedProvider)
}

func TestExecuteBlocksDiskUnavailable(t *testing.T) {
	t.Parallel()

	rootPath := filepath.Join(t.TempDir(), "missing-root")
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
	}
	result := runner.Execute(context.Background(), verificationClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	assertBlocked(t, result, SafeErrorDiskUnavailable)
}

func TestExecuteBlocksChecksumMismatch(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	if err := os.MkdirAll(filepath.Join(rootPath, "asset"), 0o755); err != nil {
		t.Fatalf("create asset directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(rootPath, "asset", "original.bin"), []byte("actual-content"), 0o600); err != nil {
		t.Fatalf("write placement: %v", err)
	}

	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
	}
	result := runner.Execute(context.Background(), verificationClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("expected-content"))))

	assertBlocked(t, result, SafeErrorChecksumMismatch)
}

func TestExecuteVerifiesPlacementAndIsRetrySafe(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	content := []byte("verified-placement")
	if err := os.MkdirAll(filepath.Join(rootPath, "asset"), 0o755); err != nil {
		t.Fatalf("create asset directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(rootPath, "asset", "original.bin"), content, 0o600); err != nil {
		t.Fatalf("write placement: %v", err)
	}

	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
	}
	claim := verificationClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes(content))

	first := runner.Execute(context.Background(), claim)
	second := runner.Execute(context.Background(), claim)

	if first.Status != StatusSucceeded || second.Status != StatusSucceeded {
		t.Fatalf("expected repeated verification to succeed, got %#v then %#v", first, second)
	}
}

func TestExecuteBlocksArchivePlacementWithoutSupportedSource(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
	}
	claim := controlplane.ClaimedJob{
		Job: controlplane.Job{
			ID:   "job-1",
			Kind: "archive-placement",
		},
		Execution: &controlplane.JobExecutionManifest{
			SchemaVersion:   1,
			Operation:       "archive-placement",
			StorageTargetID: "target-1",
			Provider:        "local-disk",
			RelativePath:    "asset/original.bin",
			ChecksumSHA256:  hashBytes([]byte("content")),
		},
	}

	result := runner.Execute(context.Background(), claim)

	assertBlocked(t, result, SafeErrorUnsupportedSource)
}

func TestExecutePlacesHostedStagingArchive(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	content := []byte("hosted staging archive bytes")
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
		HostedStaging: fakeHostedStagingFetcher{body: content},
	}
	claim := archivePlacementClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes(content), "staging-1")

	result := runner.Execute(context.Background(), claim)

	if result.Status != StatusSucceeded {
		t.Fatalf("expected hosted staging archive placement to succeed, got %#v", result)
	}

	destinationBytes, err := os.ReadFile(filepath.Join(rootPath, "asset", "original.bin"))
	if err != nil {
		t.Fatalf("read destination: %v", err)
	}

	if !bytes.Equal(destinationBytes, content) {
		t.Fatalf("unexpected destination bytes: %q", string(destinationBytes))
	}
}

func TestExecuteBlocksHostedStagingChecksumMismatch(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
		HostedStaging: fakeHostedStagingFetcher{body: []byte("unexpected bytes")},
	}
	claim := archivePlacementClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("expected bytes")), "staging-1")

	result := runner.Execute(context.Background(), claim)

	assertBlocked(t, result, SafeErrorChecksumMismatch)
	if _, err := os.Stat(filepath.Join(rootPath, "asset", "original.bin")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("destination should not exist after checksum mismatch, got err=%v", err)
	}
}

func TestExecuteBlocksHostedStagingFetchError(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
		HostedStaging: fakeHostedStagingFetcher{err: errors.New("upstream unavailable")},
	}
	claim := archivePlacementClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("expected bytes")), "staging-1")

	result := runner.Execute(context.Background(), claim)

	assertBlocked(t, result, SafeErrorHostedStagingFetch)
}

func TestExecuteBlocksHostedStagingWithoutFetcher(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
	}
	claim := archivePlacementClaim(t, "target-1", "local-disk", "asset/original.bin", hashBytes([]byte("expected bytes")), "staging-1")

	result := runner.Execute(context.Background(), claim)

	assertBlocked(t, result, SafeErrorUnsupportedSource)
}

func TestExecuteBlocksUnsafeRelativePath(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		}},
	}
	result := runner.Execute(context.Background(), verificationClaim(t, "target-1", "local-disk", "../escape.bin", hashBytes([]byte("content"))))

	assertBlocked(t, result, SafeErrorInvalidManifest)
}

func TestExecuteRestoreDrillCopiesSampleAndRecordsVerifiedEvidence(t *testing.T) {
	t.Parallel()

	sourceRoot := t.TempDir()
	restoreWorkspace := t.TempDir()
	content := []byte("restore drill source bytes")
	if err := os.MkdirAll(filepath.Join(sourceRoot, "asset"), 0o755); err != nil {
		t.Fatalf("create source directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "asset", "original.bin"), content, 0o600); err != nil {
		t.Fatalf("write source placement: %v", err)
	}

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        sourceRoot,
			},
		}},
		RestoreEvidence:  recorder,
		RestoreWorkspace: restoreWorkspace,
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes(content)))

	if result.Status != StatusSucceeded {
		t.Fatalf("expected restore drill success, got %#v", result)
	}

	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "verified" || recorder.requests[0].ChecksumSHA256 == "" {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}

	restoredBytes, err := os.ReadFile(filepath.Join(restoreWorkspace, "restore-drills", "job-1", "asset-1", "original.bin"))
	if err != nil {
		t.Fatalf("read restored copy: %v", err)
	}

	if !bytes.Equal(restoredBytes, content) {
		t.Fatalf("unexpected restored bytes: %q", string(restoredBytes))
	}
}

func TestExecuteRestoreDrillBlocksMissingWorkspaceAndRecordsEvidence(t *testing.T) {
	t.Parallel()

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		RestoreEvidence: recorder,
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	assertBlocked(t, result, SafeErrorMissingRestoreRoot)
	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "blocked" || recorder.requests[0].SafeErrorClass != SafeErrorMissingRestoreRoot {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func TestExecuteRestoreDrillRecordsMissingBinding(t *testing.T) {
	t.Parallel()

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		RestoreEvidence:  recorder,
		RestoreWorkspace: t.TempDir(),
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	if result.Status != StatusCompletedWithWarnings {
		t.Fatalf("expected completed_with_warnings, got %#v", result)
	}

	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "blocked" || recorder.requests[0].SafeErrorClass != SafeErrorMissingBinding {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func TestExecuteRestoreDrillRecordsProviderMismatch(t *testing.T) {
	t.Parallel()

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "external-drive",
				RootPath:        t.TempDir(),
			},
		}},
		RestoreEvidence:  recorder,
		RestoreWorkspace: t.TempDir(),
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	if result.Status != StatusCompletedWithWarnings {
		t.Fatalf("expected completed_with_warnings, got %#v", result)
	}

	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "blocked" || recorder.requests[0].SafeErrorClass != SafeErrorProviderMismatch {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func TestExecuteRestoreDrillRecordsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "smb",
				RootPath:        t.TempDir(),
			},
		}},
		RestoreEvidence:  recorder,
		RestoreWorkspace: t.TempDir(),
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "smb", "asset/original.bin", hashBytes([]byte("content"))))

	if result.Status != StatusCompletedWithWarnings {
		t.Fatalf("expected completed_with_warnings, got %#v", result)
	}

	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "blocked" || recorder.requests[0].SafeErrorClass != SafeErrorUnsupportedProvider {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func TestExecuteRestoreDrillRecordsUnavailableSourceDisk(t *testing.T) {
	t.Parallel()

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        filepath.Join(t.TempDir(), "missing-source"),
			},
		}},
		RestoreEvidence:  recorder,
		RestoreWorkspace: t.TempDir(),
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes([]byte("content"))))

	if result.Status != StatusCompletedWithWarnings {
		t.Fatalf("expected completed_with_warnings, got %#v", result)
	}

	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "blocked" || recorder.requests[0].SafeErrorClass != SafeErrorDiskUnavailable {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func TestExecuteRestoreDrillRecordsChecksumMismatch(t *testing.T) {
	t.Parallel()

	sourceRoot := t.TempDir()
	restoreWorkspace := t.TempDir()
	if err := os.MkdirAll(filepath.Join(sourceRoot, "asset"), 0o755); err != nil {
		t.Fatalf("create source directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "asset", "original.bin"), []byte("actual bytes"), 0o600); err != nil {
		t.Fatalf("write source placement: %v", err)
	}

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        sourceRoot,
			},
		}},
		RestoreEvidence:  recorder,
		RestoreWorkspace: restoreWorkspace,
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes([]byte("expected bytes"))))

	if result.Status != StatusCompletedWithWarnings {
		t.Fatalf("expected completed_with_warnings, got %#v", result)
	}

	if len(recorder.requests) != 1 || recorder.requests[0].EvidenceStatus != "failed" || recorder.requests[0].SafeErrorClass != SafeErrorChecksumMismatch {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func TestExecuteRestoreDrillBlocksWhenEvidenceReportFails(t *testing.T) {
	t.Parallel()

	sourceRoot := t.TempDir()
	restoreWorkspace := t.TempDir()
	content := []byte("restore drill source bytes")
	if err := os.MkdirAll(filepath.Join(sourceRoot, "asset"), 0o755); err != nil {
		t.Fatalf("create source directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "asset", "original.bin"), content, 0o600); err != nil {
		t.Fatalf("write source placement: %v", err)
	}

	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        sourceRoot,
			},
		}},
		RestoreEvidence:  &fakeRestoreEvidenceRecorder{err: errors.New("control plane unavailable")},
		RestoreWorkspace: restoreWorkspace,
	}

	result := runner.Execute(context.Background(), restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes(content)))

	assertBlocked(t, result, SafeErrorRestoreReportFailed)
}

func TestExecuteRestoreDrillIsRetrySafe(t *testing.T) {
	t.Parallel()

	sourceRoot := t.TempDir()
	restoreWorkspace := t.TempDir()
	content := []byte("restore drill retry-safe bytes")
	if err := os.MkdirAll(filepath.Join(sourceRoot, "asset"), 0o755); err != nil {
		t.Fatalf("create source directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "asset", "original.bin"), content, 0o600); err != nil {
		t.Fatalf("write source placement: %v", err)
	}

	recorder := &fakeRestoreEvidenceRecorder{}
	runner := Runner{
		Bindings: bindings.File{Bindings: []bindings.StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        sourceRoot,
			},
		}},
		RestoreEvidence:  recorder,
		RestoreWorkspace: restoreWorkspace,
	}
	claim := restoreDrillClaim("target-1", "local-disk", "asset/original.bin", hashBytes(content))

	first := runner.Execute(context.Background(), claim)
	second := runner.Execute(context.Background(), claim)

	if first.Status != StatusSucceeded || second.Status != StatusSucceeded {
		t.Fatalf("expected repeated restore drills to succeed, got %#v then %#v", first, second)
	}

	if len(recorder.requests) != 2 || recorder.requests[0].EvidenceStatus != "verified" || recorder.requests[1].EvidenceStatus != "verified" {
		t.Fatalf("unexpected evidence requests: %#v", recorder.requests)
	}
}

func verificationClaim(t *testing.T, targetID string, provider string, relativePath string, checksum string) controlplane.ClaimedJob {
	t.Helper()

	return controlplane.ClaimedJob{
		Job: controlplane.Job{
			ID:   "job-1",
			Kind: "placement-verification",
		},
		Execution: &controlplane.JobExecutionManifest{
			SchemaVersion:   1,
			Operation:       "placement-verification",
			StorageTargetID: targetID,
			Provider:        provider,
			RelativePath:    relativePath,
			ChecksumSHA256:  checksum,
		},
	}
}

func restoreDrillClaim(targetID string, provider string, relativePath string, checksum string) controlplane.ClaimedJob {
	return controlplane.ClaimedJob{
		Job: controlplane.Job{
			ID:   "job-1",
			Kind: "restore-drill",
		},
		Execution: &controlplane.JobExecutionManifest{
			SchemaVersion:  1,
			Operation:      "restore-drill",
			RestoreDrillID: "drill-1",
			Samples: []controlplane.RestoreDrillSample{
				{
					AssetID:         "asset-1",
					CandidateStatus: "ready",
					Source: controlplane.RestoreDrillSampleSource{
						StorageTargetID: targetID,
						Provider:        provider,
						RelativePath:    relativePath,
						ChecksumSHA256:  checksum,
					},
				},
			},
		},
	}
}

func archivePlacementClaim(t *testing.T, targetID string, provider string, relativePath string, checksum string, stagingObjectID string) controlplane.ClaimedJob {
	t.Helper()

	return controlplane.ClaimedJob{
		Job: controlplane.Job{
			ID:   "job-1",
			Kind: "archive-placement",
		},
		Lease: controlplane.JobLease{
			LeaseToken:     "lease-token",
			LeaseExpiresAt: "2026-01-01T00:05:00Z",
		},
		Execution: &controlplane.JobExecutionManifest{
			SchemaVersion:   1,
			Operation:       "archive-placement",
			StorageTargetID: targetID,
			Provider:        provider,
			RelativePath:    relativePath,
			ChecksumSHA256:  checksum,
			Source: &controlplane.JobExecutionSource{
				Kind:            "hosted-staging",
				StagingObjectID: stagingObjectID,
			},
		},
	}
}

func assertBlocked(t *testing.T, result Result, safeErrorClass string) {
	t.Helper()

	if result.Status != StatusBlocked {
		t.Fatalf("expected blocked result, got %#v", result)
	}

	if result.SafeErrorClass != safeErrorClass {
		t.Fatalf("unexpected safe error class: got %s want %s", result.SafeErrorClass, safeErrorClass)
	}
}

func hashBytes(input []byte) string {
	sum := sha256.Sum256(input)
	return hex.EncodeToString(sum[:])
}

type fakeHostedStagingFetcher struct {
	body []byte
	err  error
}

func (f fakeHostedStagingFetcher) FetchHostedStagingSource(_ context.Context, _ controlplane.ClaimedJob, _ string) (io.ReadCloser, error) {
	if f.err != nil {
		return nil, f.err
	}

	return io.NopCloser(bytes.NewReader(f.body)), nil
}

type fakeRestoreEvidenceRecorder struct {
	requests []controlplane.RecordRestoreDrillEvidenceRequest
	err      error
}

func (f *fakeRestoreEvidenceRecorder) RecordRestoreDrillEvidence(_ context.Context, _ string, request controlplane.RecordRestoreDrillEvidenceRequest) error {
	if f.err != nil {
		return f.err
	}

	f.requests = append(f.requests, request)
	return nil
}
