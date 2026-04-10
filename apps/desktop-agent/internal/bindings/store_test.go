package bindings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReturnsEmptyFileWhenMissing(t *testing.T) {
	t.Parallel()

	bindingsFile, err := Load(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if len(bindingsFile.Bindings) != 0 {
		t.Fatalf("expected no bindings, got %d", len(bindingsFile.Bindings))
	}
}

func TestSaveAndLoadRoundTripBinding(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "storage-bindings.json")
	rootPath := filepath.Join(t.TempDir(), "archive-primary")
	input := File{
		Bindings: []StorageTargetBinding{
			{
				StorageTargetID: "target-1",
				Provider:        "local-disk",
				RootPath:        rootPath,
			},
		},
	}

	if err := Save(path, input); err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat binding file: %v", err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected file mode 0600, got %v", info.Mode().Perm())
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	binding, ok := loaded.Find("target-1")
	if !ok {
		t.Fatalf("expected target-1 binding")
	}

	if binding.Provider != "local-disk" || binding.RootPath != rootPath {
		t.Fatalf("unexpected binding: %#v", binding)
	}
}

func TestLoadRejectsRelativeRootPath(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "storage-bindings.json")
	if err := os.WriteFile(path, []byte(`{"bindings":[{"storageTargetId":"target-1","provider":"local-disk","rootPath":"relative/path"}]}`), 0o600); err != nil {
		t.Fatalf("write binding file: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatalf("expected relative root path to be rejected")
	}
}

func TestLoadRejectsDuplicateStorageTargetIDs(t *testing.T) {
	t.Parallel()

	rootPath := t.TempDir()
	path := filepath.Join(t.TempDir(), "storage-bindings.json")
	content := `{"bindings":[` +
		`{"storageTargetId":"target-1","provider":"local-disk","rootPath":"` + rootPath + `"},` +
		`{"storageTargetId":"target-1","provider":"local-disk","rootPath":"` + rootPath + `"}` +
		`]}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write binding file: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatalf("expected duplicate storage target ids to be rejected")
	}
}

func TestCoverageReportsBoundMissingExtraAndProviderMismatch(t *testing.T) {
	t.Parallel()

	bindingsFile := File{
		Bindings: []StorageTargetBinding{
			{
				StorageTargetID: "target-bound",
				Provider:        "local-disk",
				RootPath:        filepath.Join(t.TempDir(), "bound"),
			},
			{
				StorageTargetID: "target-mismatch",
				Provider:        "external-drive",
				RootPath:        filepath.Join(t.TempDir(), "mismatch"),
			},
			{
				StorageTargetID: "target-extra",
				Provider:        "local-disk",
				RootPath:        filepath.Join(t.TempDir(), "extra"),
			},
		},
	}

	report := Coverage(bindingsFile, []TargetReference{
		{
			StorageTargetID: "target-bound",
			Provider:        "LocalDiskProvider",
			Role:            "archive-primary",
		},
		{
			StorageTargetID: "target-missing",
			Provider:        "local-disk",
			Role:            "archive-replica",
		},
		{
			StorageTargetID: "target-mismatch",
			Provider:        "local-disk",
			Role:            "archive-primary",
		},
	})

	if len(report.Bound) != 1 || report.Bound[0].StorageTargetID != "target-bound" {
		t.Fatalf("unexpected bound targets: %#v", report.Bound)
	}

	if len(report.Missing) != 1 || report.Missing[0].StorageTargetID != "target-missing" {
		t.Fatalf("unexpected missing targets: %#v", report.Missing)
	}

	if len(report.Extra) != 1 || report.Extra[0].StorageTargetID != "target-extra" {
		t.Fatalf("unexpected extra bindings: %#v", report.Extra)
	}

	if len(report.ProviderMismatches) != 1 ||
		report.ProviderMismatches[0].Target.StorageTargetID != "target-mismatch" {
		t.Fatalf("unexpected provider mismatches: %#v", report.ProviderMismatches)
	}
}
