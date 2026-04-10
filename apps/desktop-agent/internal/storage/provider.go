package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

var (
	ErrChecksumMismatch = errors.New("storage checksum mismatch")
	ErrNotImplemented   = errors.New("storage operation not implemented")
)

type PutRequest struct {
	SourcePath       string
	DestinationPath  string
	ExpectedChecksum string
}

type PutResult struct {
	ChecksumSHA256 string
	SizeBytes      int64
}

type VerifyRequest struct {
	Path             string
	ExpectedChecksum string
}

type ListRequest struct {
	RootPath string
}

type HealthRequest struct {
	RootPath string
}

type Provider interface {
	Put(ctx context.Context, request PutRequest) (PutResult, error)
	Get(ctx context.Context, path string) (io.ReadCloser, error)
	Verify(ctx context.Context, request VerifyRequest) error
	List(ctx context.Context, request ListRequest) ([]string, error)
	Delete(ctx context.Context, path string) error
	Health(ctx context.Context, request HealthRequest) error
	Capabilities() []string
}

type LocalDiskProvider struct{}

// TODO(mvp-deferred): Add concrete provider implementations for external drives, S3-compatible storage, SMB, and WebDAV.
func (LocalDiskProvider) Put(ctx context.Context, request PutRequest) (PutResult, error) {
	if err := ctx.Err(); err != nil {
		return PutResult{}, err
	}

	if request.SourcePath == "" || request.DestinationPath == "" {
		return PutResult{}, fmt.Errorf("source and destination paths are required")
	}

	sourceFile, err := os.Open(request.SourcePath)
	if err != nil {
		return PutResult{}, fmt.Errorf("open source file: %w", err)
	}
	defer sourceFile.Close()

	destinationDirectory := filepath.Dir(request.DestinationPath)
	if err := os.MkdirAll(destinationDirectory, 0o755); err != nil {
		return PutResult{}, fmt.Errorf("create destination directory: %w", err)
	}

	tempFile, err := os.CreateTemp(destinationDirectory, ".life-loop-write-*")
	if err != nil {
		return PutResult{}, fmt.Errorf("create temp destination file: %w", err)
	}

	tempPath := tempFile.Name()
	cleanupTemp := true
	defer func() {
		_ = tempFile.Close()
		if cleanupTemp {
			_ = os.Remove(tempPath)
		}
	}()

	hasher := sha256.New()
	writtenBytes, err := io.Copy(io.MultiWriter(tempFile, hasher), sourceFile)
	if err != nil {
		return PutResult{}, fmt.Errorf("copy source into destination: %w", err)
	}

	calculatedChecksum := hex.EncodeToString(hasher.Sum(nil))
	if request.ExpectedChecksum != "" && request.ExpectedChecksum != calculatedChecksum {
		return PutResult{}, fmt.Errorf(
			"%w: expected %s, got %s",
			ErrChecksumMismatch,
			request.ExpectedChecksum,
			calculatedChecksum,
		)
	}

	if err := tempFile.Sync(); err != nil {
		return PutResult{}, fmt.Errorf("flush temp file: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		return PutResult{}, fmt.Errorf("close temp file before rename: %w", err)
	}

	if err := os.Rename(tempPath, request.DestinationPath); err != nil {
		return PutResult{}, fmt.Errorf("atomically move file into place: %w", err)
	}

	cleanupTemp = false

	if err := syncDirectory(destinationDirectory); err != nil {
		return PutResult{}, fmt.Errorf("flush destination directory: %w", err)
	}

	return PutResult{
		ChecksumSHA256: calculatedChecksum,
		SizeBytes:      writtenBytes,
	}, nil
}

func (LocalDiskProvider) Get(ctx context.Context, path string) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open path: %w", err)
	}

	return file, nil
}

func (LocalDiskProvider) Verify(ctx context.Context, request VerifyRequest) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	if request.Path == "" || request.ExpectedChecksum == "" {
		return fmt.Errorf("path and expected checksum are required")
	}

	file, err := os.Open(request.Path)
	if err != nil {
		return fmt.Errorf("open file for verification: %w", err)
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return fmt.Errorf("hash file for verification: %w", err)
	}

	actualChecksum := hex.EncodeToString(hasher.Sum(nil))
	if actualChecksum != request.ExpectedChecksum {
		return fmt.Errorf("%w: expected %s, got %s", ErrChecksumMismatch, request.ExpectedChecksum, actualChecksum)
	}

	return nil
}

func (LocalDiskProvider) List(ctx context.Context, request ListRequest) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(request.RootPath)
	if err != nil {
		return nil, fmt.Errorf("read directory: %w", err)
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		paths = append(paths, filepath.Join(request.RootPath, entry.Name()))
	}

	return paths, nil
}

func (LocalDiskProvider) Delete(ctx context.Context, path string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	if err := os.Remove(path); err != nil {
		return fmt.Errorf("delete path: %w", err)
	}

	return nil
}

func (LocalDiskProvider) Health(ctx context.Context, request HealthRequest) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	info, err := os.Stat(request.RootPath)
	if err != nil {
		return fmt.Errorf("stat root path: %w", err)
	}

	if !info.IsDir() {
		return fmt.Errorf("health root must be a directory")
	}

	return nil
}

func (LocalDiskProvider) Capabilities() []string {
	return []string{"atomic-write", "checksum-verify", "fsync-directory"}
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()

	return directory.Sync()
}
