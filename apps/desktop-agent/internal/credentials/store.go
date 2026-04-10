package credentials

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type StoredCredential struct {
	DeviceID   string `json:"deviceId"`
	LibraryID  string `json:"libraryId"`
	DeviceName string `json:"deviceName"`
	Credential string `json:"credential"`
	IssuedAt   string `json:"issuedAt"`
}

func Load(path string) (*StoredCredential, error) {
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("read credential file: %w", err)
	}

	var storedCredential StoredCredential
	if err := json.Unmarshal(content, &storedCredential); err != nil {
		return nil, fmt.Errorf("decode credential file: %w", err)
	}

	if storedCredential.Credential == "" {
		return nil, fmt.Errorf("credential file at %s is missing a device credential", path)
	}

	return &storedCredential, nil
}

func Save(path string, storedCredential StoredCredential) error {
	if path == "" {
		return fmt.Errorf("credential path is required")
	}

	if storedCredential.Credential == "" {
		return fmt.Errorf("device credential is required")
	}

	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create credential directory: %w", err)
	}

	content, err := json.MarshalIndent(storedCredential, "", "  ")
	if err != nil {
		return fmt.Errorf("encode credential file: %w", err)
	}

	tempFile, err := os.CreateTemp(directory, ".device-credential-*")
	if err != nil {
		return fmt.Errorf("create temp credential file: %w", err)
	}

	tempPath := tempFile.Name()
	cleanupTemp := true
	defer func() {
		_ = tempFile.Close()
		if cleanupTemp {
			_ = os.Remove(tempPath)
		}
	}()

	if err := tempFile.Chmod(0o600); err != nil {
		return fmt.Errorf("set temp credential permissions: %w", err)
	}

	if _, err := tempFile.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write temp credential file: %w", err)
	}

	if err := tempFile.Sync(); err != nil {
		return fmt.Errorf("flush temp credential file: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp credential file: %w", err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("persist credential file: %w", err)
	}

	if err := syncDirectory(directory); err != nil {
		return fmt.Errorf("flush credential directory: %w", err)
	}

	cleanupTemp = false

	return nil
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()

	return directory.Sync()
}
