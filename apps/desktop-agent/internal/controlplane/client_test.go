package controlplane

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListStorageTargetsUsesLibraryQueryBearerAndNoBody(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			t.Fatalf("expected GET, got %s", request.Method)
		}

		if request.URL.Path != "/v1/storage-targets" {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}

		if got := request.URL.Query().Get("libraryId"); got != "library-1" {
			t.Fatalf("unexpected libraryId query: %s", got)
		}

		if got := request.Header.Get("Authorization"); got != "Bearer credential-1" {
			t.Fatalf("unexpected authorization header: %s", got)
		}

		if got := request.Header.Get("Content-Type"); got != "" {
			t.Fatalf("GET request should not set a content type, got %s", got)
		}

		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}

		if len(body) != 0 {
			t.Fatalf("GET request should not include a body, got %q", string(body))
		}

		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(ListStorageTargetsResponse{
			StorageTargets: []StorageTarget{
				{
					ID:          "target-1",
					LibraryID:   "library-1",
					Name:        "Archive primary",
					Role:        "archive-primary",
					Provider:    "LocalDiskProvider",
					Writable:    true,
					Healthy:     true,
					HealthState: "healthy",
				},
			},
		}); err != nil {
			t.Fatalf("encode response: %v", err)
		}
	}))
	defer server.Close()

	client := &Client{
		baseURL:    server.URL,
		httpClient: server.Client(),
	}

	targets, err := client.ListStorageTargets(context.Background(), "credential-1", "library-1")
	if err != nil {
		t.Fatalf("ListStorageTargets returned error: %v", err)
	}

	if len(targets) != 1 || targets[0].ID != "target-1" || targets[0].Provider != "LocalDiskProvider" {
		t.Fatalf("unexpected targets: %#v", targets)
	}
}
