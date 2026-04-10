package credentials

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReturnsNilWhenCredentialFileIsMissing(t *testing.T) {
	t.Parallel()

	credential, err := Load(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if credential != nil {
		t.Fatalf("expected missing credential file to return nil")
	}
}

func TestSaveAndLoadRoundTripCredentialWithRestrictivePermissions(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "device-credential.json")
	input := StoredCredential{
		DeviceID:   "device-1",
		LibraryID:  "library-1",
		DeviceName: "desktop",
		Credential: "credential.secret",
		IssuedAt:   "2026-04-10T00:00:00Z",
	}

	if err := Save(path, input); err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat credential file: %v", err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected credential file mode 0600, got %v", info.Mode().Perm())
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if loaded == nil {
		t.Fatalf("expected credential to load")
	}

	if *loaded != input {
		t.Fatalf("unexpected loaded credential: %#v", loaded)
	}
}

func TestSaveRejectsEmptyCredential(t *testing.T) {
	t.Parallel()

	err := Save(filepath.Join(t.TempDir(), "device-credential.json"), StoredCredential{})
	if err == nil {
		t.Fatalf("expected Save to reject empty credential")
	}
}

func TestLoadRejectsCredentialFileWithoutCredential(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "device-credential.json")
	if err := os.WriteFile(path, []byte(`{"deviceId":"device-1"}`), 0o600); err != nil {
		t.Fatalf("write credential file: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatalf("expected Load to reject missing device credential")
	}
}
