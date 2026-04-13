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

func TestListStorageTargetsAllowsCredentialScopedRequestWithoutLibraryQuery(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if got := request.URL.RawQuery; got != "" {
			t.Fatalf("unexpected query for credential-scoped request: %s", got)
		}

		if got := request.Header.Get("Authorization"); got != "Bearer credential-1" {
			t.Fatalf("unexpected authorization header: %s", got)
		}

		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(ListStorageTargetsResponse{
			StorageTargets: []StorageTarget{},
		}); err != nil {
			t.Fatalf("encode response: %v", err)
		}
	}))
	defer server.Close()

	client := &Client{
		baseURL:    server.URL,
		httpClient: server.Client(),
	}

	targets, err := client.ListStorageTargets(context.Background(), "credential-1", "")
	if err != nil {
		t.Fatalf("ListStorageTargets returned error: %v", err)
	}

	if len(targets) != 0 {
		t.Fatalf("expected no targets, got %#v", targets)
	}
}

func TestClaimJobPostsSupportedKindsWithBearer(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", request.Method)
		}

		if request.URL.Path != "/v1/jobs/claims" {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}

		if got := request.Header.Get("Authorization"); got != "Bearer credential-1" {
			t.Fatalf("unexpected authorization header: %s", got)
		}

		body := ClaimJobRequest{}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}

		if len(body.Kinds) != 2 || body.Kinds[0] != "archive-placement" || body.Kinds[1] != "placement-verification" {
			t.Fatalf("unexpected kinds: %#v", body.Kinds)
		}

		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(ClaimJobResponse{
			Claim: &ClaimedJob{
				Job: Job{
					ID:            "job-1",
					Kind:          "placement-verification",
					Status:        "running",
					CorrelationID: "correlation-1",
				},
				Lease: JobLease{
					LeaseToken:     "lease-token",
					LeaseExpiresAt: "2026-01-01T00:05:00Z",
				},
				Execution: &JobExecutionManifest{
					SchemaVersion:   1,
					Operation:       "placement-verification",
					StorageTargetID: "target-1",
					Provider:        "local-disk",
					RelativePath:    "asset/original.bin",
					ChecksumSHA256:  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

	claim, err := client.ClaimJob(context.Background(), "credential-1", ClaimJobRequest{
		Kinds:        []string{"archive-placement", "placement-verification"},
		LeaseSeconds: 300,
	})
	if err != nil {
		t.Fatalf("ClaimJob returned error: %v", err)
	}

	if claim.Claim == nil || claim.Claim.Execution == nil || claim.Claim.Job.ID != "job-1" {
		t.Fatalf("unexpected claim response: %#v", claim)
	}
}

func TestCompleteJobClaimPostsLeaseAndSafeErrorClass(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", request.Method)
		}

		if request.URL.Path != "/v1/jobs/job-1/claims/complete" {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}

		if got := request.Header.Get("Authorization"); got != "Bearer credential-1" {
			t.Fatalf("unexpected authorization header: %s", got)
		}

		body := CompleteJobClaimRequest{}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}

		if body.LeaseToken != "lease-token" || body.Status != "blocked" || body.SafeErrorClass != "missing_binding" {
			t.Fatalf("unexpected completion body: %#v", body)
		}

		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(CompleteJobClaimResponse{
			Job: Job{
				ID:            "job-1",
				Kind:          "placement-verification",
				Status:        "blocked",
				CorrelationID: "correlation-1",
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

	response, err := client.CompleteJobClaim(context.Background(), "credential-1", "job-1", CompleteJobClaimRequest{
		LeaseToken:     "lease-token",
		Status:         "blocked",
		Reason:         "No local binding exists for the requested storage target.",
		SafeErrorClass: "missing_binding",
	})
	if err != nil {
		t.Fatalf("CompleteJobClaim returned error: %v", err)
	}

	if response.Job.Status != "blocked" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestRecordRestoreDrillEvidencePostsSafeEvidence(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", request.Method)
		}

		if request.URL.Path != "/v1/restore/drills/drill-1/evidence" {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}

		if got := request.Header.Get("Authorization"); got != "Bearer credential-1" {
			t.Fatalf("unexpected authorization header: %s", got)
		}

		body := RecordRestoreDrillEvidenceRequest{}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}

		if body.AssetID != "asset-1" || body.StorageTargetID != "target-1" || body.EvidenceStatus != "verified" || body.ChecksumSHA256 == "" {
			t.Fatalf("unexpected evidence body: %#v", body)
		}

		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(RecordRestoreDrillEvidenceResponse{
			Drill: RestoreDrill{
				ID:     "drill-1",
				Status: "passed",
			},
			Evidence: RestoreDrillEvidence{
				ID:             "evidence-1",
				AssetID:        "asset-1",
				EvidenceStatus: "verified",
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

	response, err := client.RecordRestoreDrillEvidence(context.Background(), "credential-1", "drill-1", RecordRestoreDrillEvidenceRequest{
		AssetID:         "asset-1",
		StorageTargetID: "target-1",
		CandidateStatus: "ready",
		EvidenceStatus:  "verified",
		ChecksumSHA256:  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Summary:         "Restore drill sample was copied and checksum verified.",
	})
	if err != nil {
		t.Fatalf("RecordRestoreDrillEvidence returned error: %v", err)
	}

	if response.Drill.Status != "passed" || response.Evidence.EvidenceStatus != "verified" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestFetchHostedStagingSourcePostsLeaseAndReturnsStream(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", request.Method)
		}

		if request.URL.Path != "/v1/jobs/job-1/sources/hosted-staging/staging-1" {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}

		if got := request.Header.Get("Authorization"); got != "Bearer credential-1" {
			t.Fatalf("unexpected authorization header: %s", got)
		}

		if got := request.Header.Get("Accept"); got != "application/octet-stream" {
			t.Fatalf("unexpected accept header: %s", got)
		}

		body := FetchHostedStagingSourceRequest{}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}

		if body.LeaseToken != "lease-token" {
			t.Fatalf("unexpected lease token: %q", body.LeaseToken)
		}

		response.Header().Set("Content-Type", "application/octet-stream")
		if _, err := response.Write([]byte("hosted staging bytes")); err != nil {
			t.Fatalf("write response: %v", err)
		}
	}))
	defer server.Close()

	client := &Client{
		baseURL:    server.URL,
		httpClient: server.Client(),
	}

	stream, err := client.FetchHostedStagingSource(context.Background(), "credential-1", "job-1", "staging-1", "lease-token")
	if err != nil {
		t.Fatalf("FetchHostedStagingSource returned error: %v", err)
	}
	defer stream.Close()

	body, err := io.ReadAll(stream)
	if err != nil {
		t.Fatalf("read hosted staging stream: %v", err)
	}

	if string(body) != "hosted staging bytes" {
		t.Fatalf("unexpected stream body: %q", string(body))
	}
}

func TestFetchHostedStagingSourceReturnsProblemDetail(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusConflict)
		if err := json.NewEncoder(response).Encode(problemResponse{
			Title:  "Hosted staging source unavailable",
			Detail: "Hosted staging object has expired.",
		}); err != nil {
			t.Fatalf("encode response: %v", err)
		}
	}))
	defer server.Close()

	client := &Client{
		baseURL:    server.URL,
		httpClient: server.Client(),
	}

	stream, err := client.FetchHostedStagingSource(context.Background(), "credential-1", "job-1", "staging-1", "lease-token")
	if err == nil {
		if stream != nil {
			stream.Close()
		}
		t.Fatal("expected FetchHostedStagingSource to return an error")
	}

	if got := err.Error(); got != "control plane returned status 409: Hosted staging object has expired." {
		t.Fatalf("unexpected error: %s", got)
	}
}
