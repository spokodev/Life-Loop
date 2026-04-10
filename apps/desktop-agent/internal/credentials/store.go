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
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create credential directory: %w", err)
	}

	content, err := json.MarshalIndent(storedCredential, "", "  ")
	if err != nil {
		return fmt.Errorf("encode credential file: %w", err)
	}

	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, content, 0o600); err != nil {
		return fmt.Errorf("write temp credential file: %w", err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("persist credential file: %w", err)
	}

	return nil
}
