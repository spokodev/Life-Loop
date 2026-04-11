package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type Device struct {
	ID         string  `json:"id"`
	LibraryID  string  `json:"libraryId"`
	Name       string  `json:"name"`
	Platform   string  `json:"platform"`
	Status     string  `json:"status"`
	LastSeenAt *string `json:"lastSeenAt"`
}

type DeviceCredential struct {
	Token    string `json:"token"`
	IssuedAt string `json:"issuedAt"`
}

type RedeemEnrollmentTokenResponse struct {
	Device     Device           `json:"device"`
	Credential DeviceCredential `json:"credential"`
}

type HeartbeatRequest struct {
	ObservedAt   string `json:"observedAt"`
	Hostname     string `json:"hostname,omitempty"`
	AgentVersion string `json:"agentVersion,omitempty"`
}

type HeartbeatResponse struct {
	AcceptedAt string `json:"acceptedAt"`
	Device     Device `json:"device"`
}

type StorageTarget struct {
	ID          string `json:"id"`
	LibraryID   string `json:"libraryId"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	Provider    string `json:"provider"`
	Writable    bool   `json:"writable"`
	Healthy     bool   `json:"healthy"`
	HealthState string `json:"healthState"`
}

type ListStorageTargetsResponse struct {
	StorageTargets []StorageTarget `json:"storageTargets"`
}

type Job struct {
	ID                string  `json:"id"`
	LibraryID         string  `json:"libraryId,omitempty"`
	AssetID           string  `json:"assetId,omitempty"`
	DeviceID          string  `json:"deviceId,omitempty"`
	ClaimedByDeviceID string  `json:"claimedByDeviceId,omitempty"`
	Kind              string  `json:"kind"`
	Status            string  `json:"status"`
	CorrelationID     string  `json:"correlationId"`
	AttemptCount      int     `json:"attemptCount"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
	LeaseExpiresAt    *string `json:"leaseExpiresAt,omitempty"`
	LastHeartbeatAt   *string `json:"lastHeartbeatAt,omitempty"`
	StartedAt         *string `json:"startedAt,omitempty"`
	CompletedAt       *string `json:"completedAt,omitempty"`
	BlockingReason    string  `json:"blockingReason,omitempty"`
}

type JobLease struct {
	LeaseToken     string `json:"leaseToken"`
	LeaseExpiresAt string `json:"leaseExpiresAt"`
}

type JobExecutionSource struct {
	Kind            string `json:"kind"`
	LocalSourceID   string `json:"localSourceId,omitempty"`
	StagingObjectID string `json:"stagingObjectId,omitempty"`
}

type JobExecutionManifest struct {
	SchemaVersion   int                 `json:"schemaVersion"`
	Operation       string              `json:"operation"`
	StorageTargetID string              `json:"storageTargetId"`
	Provider        string              `json:"provider"`
	RelativePath    string              `json:"relativePath"`
	BlobID          string              `json:"blobId,omitempty"`
	AssetID         string              `json:"assetId,omitempty"`
	ChecksumSHA256  string              `json:"checksumSha256"`
	SizeBytes       int64               `json:"sizeBytes,omitempty"`
	Source          *JobExecutionSource `json:"source,omitempty"`
}

type ClaimJobRequest struct {
	Kinds        []string `json:"kinds,omitempty"`
	LeaseSeconds int      `json:"leaseSeconds,omitempty"`
}

type ClaimedJob struct {
	Job       Job                   `json:"job"`
	Lease     JobLease              `json:"lease"`
	Execution *JobExecutionManifest `json:"execution,omitempty"`
}

type ClaimJobResponse struct {
	Claim                 *ClaimedJob `json:"claim,omitempty"`
	RecoveredExpiredCount int         `json:"recoveredExpiredCount"`
}

type HeartbeatJobClaimRequest struct {
	LeaseToken   string `json:"leaseToken"`
	LeaseSeconds int    `json:"leaseSeconds,omitempty"`
}

type CompleteJobClaimRequest struct {
	LeaseToken     string `json:"leaseToken"`
	Status         string `json:"status"`
	Reason         string `json:"reason,omitempty"`
	SafeErrorClass string `json:"safeErrorClass,omitempty"`
}

type CompleteJobClaimResponse struct {
	Job Job `json:"job"`
}

type FetchHostedStagingSourceRequest struct {
	LeaseToken string `json:"leaseToken"`
}

type HostedStagingFetcher struct {
	Client     *Client
	Credential string
}

type problemResponse struct {
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) RedeemEnrollmentToken(ctx context.Context, enrollmentToken string) (RedeemEnrollmentTokenResponse, error) {
	responseBody := RedeemEnrollmentTokenResponse{}
	err := c.doJSON(ctx, http.MethodPost, "/v1/device-auth/redeem", map[string]string{
		"enrollmentToken": enrollmentToken,
	}, "", &responseBody)
	if err != nil {
		return RedeemEnrollmentTokenResponse{}, err
	}

	return responseBody, nil
}

func (c *Client) SendHeartbeat(ctx context.Context, credential string, request HeartbeatRequest) (HeartbeatResponse, error) {
	responseBody := HeartbeatResponse{}
	err := c.doJSON(ctx, http.MethodPost, "/v1/device-auth/heartbeat", request, credential, &responseBody)
	if err != nil {
		return HeartbeatResponse{}, err
	}

	return responseBody, nil
}

func (c *Client) ListStorageTargets(ctx context.Context, credential string, libraryID string) ([]StorageTarget, error) {
	endpoint := "/v1/storage-targets"
	if libraryID != "" {
		query := url.Values{}
		query.Set("libraryId", libraryID)
		endpoint += "?" + query.Encode()
	}

	responseBody := ListStorageTargetsResponse{}
	err := c.doJSON(ctx, http.MethodGet, endpoint, nil, credential, &responseBody)
	if err != nil {
		return nil, err
	}

	return responseBody.StorageTargets, nil
}

func (c *Client) ClaimJob(ctx context.Context, credential string, request ClaimJobRequest) (ClaimJobResponse, error) {
	responseBody := ClaimJobResponse{}
	err := c.doJSON(ctx, http.MethodPost, "/v1/jobs/claims", request, credential, &responseBody)
	if err != nil {
		return ClaimJobResponse{}, err
	}

	return responseBody, nil
}

func (c *Client) HeartbeatJobClaim(ctx context.Context, credential string, jobID string, request HeartbeatJobClaimRequest) (ClaimedJob, error) {
	responseBody := ClaimedJob{}
	err := c.doJSON(ctx, http.MethodPost, "/v1/jobs/"+url.PathEscape(jobID)+"/claims/heartbeat", request, credential, &responseBody)
	if err != nil {
		return ClaimedJob{}, err
	}

	return responseBody, nil
}

func (c *Client) CompleteJobClaim(ctx context.Context, credential string, jobID string, request CompleteJobClaimRequest) (CompleteJobClaimResponse, error) {
	responseBody := CompleteJobClaimResponse{}
	err := c.doJSON(ctx, http.MethodPost, "/v1/jobs/"+url.PathEscape(jobID)+"/claims/complete", request, credential, &responseBody)
	if err != nil {
		return CompleteJobClaimResponse{}, err
	}

	return responseBody, nil
}

func (c *Client) FetchHostedStagingSource(ctx context.Context, credential string, jobID string, stagingObjectID string, leaseToken string) (io.ReadCloser, error) {
	payload, err := json.Marshal(FetchHostedStagingSourceRequest{LeaseToken: leaseToken})
	if err != nil {
		return nil, fmt.Errorf("marshal request body: %w", err)
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/v1/jobs/"+url.PathEscape(jobID)+"/sources/hosted-staging/"+url.PathEscape(stagingObjectID),
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	request.Header.Set("Accept", "application/octet-stream")
	request.Header.Set("Authorization", "Bearer "+credential)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.streamingHTTPClient().Do(request)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}

	if response.StatusCode >= 400 {
		defer response.Body.Close()
		problem := problemResponse{}
		if decodeErr := json.NewDecoder(response.Body).Decode(&problem); decodeErr != nil {
			return nil, fmt.Errorf("control plane returned status %d", response.StatusCode)
		}

		detail := problem.Detail
		if detail == "" {
			detail = problem.Title
		}

		return nil, fmt.Errorf("control plane returned status %d: %s", response.StatusCode, detail)
	}

	return response.Body, nil
}

func (f HostedStagingFetcher) FetchHostedStagingSource(ctx context.Context, claim ClaimedJob, stagingObjectID string) (io.ReadCloser, error) {
	if f.Client == nil {
		return nil, fmt.Errorf("control plane client is not configured")
	}

	return f.Client.FetchHostedStagingSource(ctx, f.Credential, claim.Job.ID, stagingObjectID, claim.Lease.LeaseToken)
}

func (c *Client) doJSON(ctx context.Context, method string, path string, body any, bearerToken string, target any) error {
	var requestBody io.Reader = http.NoBody
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request body: %w", err)
		}

		requestBody = bytes.NewReader(payload)
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, requestBody)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	request.Header.Set("Accept", "application/json")

	if bearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+bearerToken)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		problem := problemResponse{}
		if decodeErr := json.NewDecoder(response.Body).Decode(&problem); decodeErr != nil {
			return fmt.Errorf("control plane returned status %d", response.StatusCode)
		}

		detail := problem.Detail
		if detail == "" {
			detail = problem.Title
		}

		return fmt.Errorf("control plane returned status %d: %s", response.StatusCode, detail)
	}

	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	return nil
}

func (c *Client) streamingHTTPClient() *http.Client {
	if c.httpClient.Timeout == 0 {
		return c.httpClient
	}

	return &http.Client{
		Transport:     c.httpClient.Transport,
		CheckRedirect: c.httpClient.CheckRedirect,
		Jar:           c.httpClient.Jar,
	}
}
