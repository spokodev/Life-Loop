package executor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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
