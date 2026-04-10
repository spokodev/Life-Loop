package bindings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type StorageTargetBinding struct {
	StorageTargetID string `json:"storageTargetId"`
	Provider        string `json:"provider"`
	RootPath        string `json:"rootPath"`
}

type File struct {
	Bindings []StorageTargetBinding `json:"bindings"`
}

func (f File) Find(storageTargetID string) (StorageTargetBinding, bool) {
	for _, binding := range f.Bindings {
		if binding.StorageTargetID == storageTargetID {
			return binding, true
		}
	}

	return StorageTargetBinding{}, false
}

func Load(path string) (File, error) {
	if path == "" {
		return File{}, fmt.Errorf("storage bindings path is required")
	}

	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return File{}, nil
		}

		return File{}, fmt.Errorf("read storage bindings: %w", err)
	}

	bindingsFile := File{}
	if err := json.Unmarshal(content, &bindingsFile); err != nil {
		return File{}, fmt.Errorf("decode storage bindings: %w", err)
	}

	if err := validate(bindingsFile); err != nil {
		return File{}, err
	}

	return bindingsFile, nil
}

func Save(path string, bindingsFile File) error {
	if path == "" {
		return fmt.Errorf("storage bindings path is required")
	}

	if err := validate(bindingsFile); err != nil {
		return err
	}

	content, err := json.MarshalIndent(bindingsFile, "", "  ")
	if err != nil {
		return fmt.Errorf("encode storage bindings: %w", err)
	}

	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create storage bindings directory: %w", err)
	}

	tempFile, err := os.CreateTemp(directory, ".storage-bindings-*")
	if err != nil {
		return fmt.Errorf("create temp storage bindings file: %w", err)
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
		return fmt.Errorf("set temp storage bindings permissions: %w", err)
	}

	if _, err := tempFile.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write storage bindings: %w", err)
	}

	if err := tempFile.Sync(); err != nil {
		return fmt.Errorf("flush storage bindings: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp storage bindings file: %w", err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace storage bindings: %w", err)
	}

	if err := syncDirectory(directory); err != nil {
		return fmt.Errorf("flush storage bindings directory: %w", err)
	}

	cleanupTemp = false

	return nil
}

func validate(bindingsFile File) error {
	seen := map[string]struct{}{}

	for _, binding := range bindingsFile.Bindings {
		if binding.StorageTargetID == "" {
			return fmt.Errorf("storage target id is required")
		}

		if binding.Provider == "" {
			return fmt.Errorf("provider is required for storage target %s", binding.StorageTargetID)
		}

		if binding.RootPath == "" {
			return fmt.Errorf("root path is required for storage target %s", binding.StorageTargetID)
		}

		if !filepath.IsAbs(binding.RootPath) {
			return fmt.Errorf("root path for storage target %s must be absolute", binding.StorageTargetID)
		}

		if _, exists := seen[binding.StorageTargetID]; exists {
			return fmt.Errorf("duplicate binding for storage target %s", binding.StorageTargetID)
		}

		seen[binding.StorageTargetID] = struct{}{}
	}

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
