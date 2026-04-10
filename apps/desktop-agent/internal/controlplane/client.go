package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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

func (c *Client) doJSON(ctx context.Context, method string, path string, body any, bearerToken string, target any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal request body: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
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
