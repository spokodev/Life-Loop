package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalDiskProviderPutWritesAtomicallyAndVerifiesChecksum(t *testing.T) {
	t.Parallel()

	temporaryDirectory := t.TempDir()
	sourcePath := filepath.Join(temporaryDirectory, "source.txt")
	destinationPath := filepath.Join(temporaryDirectory, "archive", "copied.txt")
	content := []byte("life-loop-archive-content")

	if err := os.WriteFile(sourcePath, content, 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	expectedChecksum := hashBytes(content)
	provider := LocalDiskProvider{}

	result, err := provider.Put(context.Background(), PutRequest{
		SourcePath:       sourcePath,
		DestinationPath:  destinationPath,
		ExpectedChecksum: expectedChecksum,
	})
	if err != nil {
		t.Fatalf("put file: %v", err)
	}

	if result.ChecksumSHA256 != expectedChecksum {
		t.Fatalf("unexpected checksum: got %s want %s", result.ChecksumSHA256, expectedChecksum)
	}

	if result.SizeBytes != int64(len(content)) {
		t.Fatalf("unexpected size: got %d want %d", result.SizeBytes, len(content))
	}

	writtenContent, err := os.ReadFile(destinationPath)
	if err != nil {
		t.Fatalf("read destination file: %v", err)
	}

	if string(writtenContent) != string(content) {
		t.Fatalf("destination content mismatch: got %q want %q", string(writtenContent), string(content))
	}

	tempMatches, err := filepath.Glob(filepath.Join(filepath.Dir(destinationPath), ".life-loop-write-*"))
	if err != nil {
		t.Fatalf("glob temp files: %v", err)
	}

	if len(tempMatches) != 0 {
		t.Fatalf("expected no leftover temp files, found %v", tempMatches)
	}
}

func TestLocalDiskProviderPutRejectsChecksumMismatch(t *testing.T) {
	t.Parallel()

	temporaryDirectory := t.TempDir()
	sourcePath := filepath.Join(temporaryDirectory, "source.txt")
	destinationPath := filepath.Join(temporaryDirectory, "archive", "copied.txt")

	if err := os.WriteFile(sourcePath, []byte("wrong-content"), 0o600); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	provider := LocalDiskProvider{}

	_, err := provider.Put(context.Background(), PutRequest{
		SourcePath:       sourcePath,
		DestinationPath:  destinationPath,
		ExpectedChecksum: hashBytes([]byte("expected-content")),
	})
	if !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("expected checksum mismatch, got %v", err)
	}

	if _, statErr := os.Stat(destinationPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("destination should not exist after checksum mismatch, got %v", statErr)
	}
}

func TestLocalDiskProviderVerifyDetectsMismatchedContent(t *testing.T) {
	t.Parallel()

	temporaryDirectory := t.TempDir()
	path := filepath.Join(temporaryDirectory, "asset.txt")
	content := []byte("verified-content")

	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write verification file: %v", err)
	}

	provider := LocalDiskProvider{}

	if err := provider.Verify(context.Background(), VerifyRequest{
		Path:             path,
		ExpectedChecksum: hashBytes(content),
	}); err != nil {
		t.Fatalf("verify should succeed: %v", err)
	}

	err := provider.Verify(context.Background(), VerifyRequest{
		Path:             path,
		ExpectedChecksum: hashBytes([]byte("different-content")),
	})
	if !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("expected checksum mismatch, got %v", err)
	}
}

func TestLocalDiskProviderHealthRequiresDirectory(t *testing.T) {
	t.Parallel()

	temporaryDirectory := t.TempDir()
	filePath := filepath.Join(temporaryDirectory, "not-a-directory")

	if err := os.WriteFile(filePath, []byte("content"), 0o600); err != nil {
		t.Fatalf("write file path: %v", err)
	}

	provider := LocalDiskProvider{}

	if err := provider.Health(context.Background(), HealthRequest{RootPath: temporaryDirectory}); err != nil {
		t.Fatalf("directory health should pass: %v", err)
	}

	if err := provider.Health(context.Background(), HealthRequest{RootPath: filePath}); err == nil {
		t.Fatal("expected file path health check to fail")
	}
}

func hashBytes(input []byte) string {
	sum := sha256.Sum256(input)
	return hex.EncodeToString(sum[:])
}
