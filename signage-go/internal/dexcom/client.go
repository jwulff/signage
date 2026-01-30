package dexcom

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

// Dexcom Share API endpoints (US region)
const (
	BaseURL = "https://share2.dexcom.com/ShareWebServices/Services"
	AppID   = "d89443d2-327c-4a6f-89e5-496bbb0317db"
)

// Client is an HTTP client for the Dexcom Share API.
type Client struct {
	Username   string
	Password   string
	HTTPClient *http.Client
	sessionID  string
}

// NewClient creates a new Dexcom API client.
func NewClient(username, password string) *Client {
	return &Client{
		Username: username,
		Password: password,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Reading represents a glucose reading from Dexcom.
type Reading struct {
	WT    string // Timestamp like "Date(1234567890000)"
	ST    string // System time
	DT    string // Display time
	Value int    // Glucose in mg/dL
	Trend string // Trend direction
}

// authenticate gets a session ID from Dexcom.
func (c *Client) authenticate(ctx context.Context) error {
	// Step 1: Get account ID
	authBody := map[string]string{
		"accountName":   c.Username,
		"password":      c.Password,
		"applicationId": AppID,
	}

	data, err := json.Marshal(authBody)
	if err != nil {
		return fmt.Errorf("failed to marshal auth request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST",
		BaseURL+"/General/AuthenticatePublisherAccount",
		bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("auth request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read auth response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("auth failed with status %d: %s", resp.StatusCode, string(body))
	}

	var accountID string
	if err := json.Unmarshal(body, &accountID); err != nil {
		return fmt.Errorf("failed to parse account ID: %w", err)
	}

	// Step 2: Get session ID
	loginBody := map[string]string{
		"accountId":     accountID,
		"password":      c.Password,
		"applicationId": AppID,
	}

	data, err = json.Marshal(loginBody)
	if err != nil {
		return fmt.Errorf("failed to marshal login request: %w", err)
	}

	req, err = http.NewRequestWithContext(ctx, "POST",
		BaseURL+"/General/LoginPublisherAccountById",
		bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err = c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read login response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("login failed with status %d: %s", resp.StatusCode, string(body))
	}

	if err := json.Unmarshal(body, &c.sessionID); err != nil {
		return fmt.Errorf("failed to parse session ID: %w", err)
	}

	return nil
}

// FetchReadings fetches glucose readings from Dexcom.
func (c *Client) FetchReadings(ctx context.Context, maxCount, minutes int) ([]Reading, error) {
	// Authenticate if we don't have a session
	if c.sessionID == "" {
		if err := c.authenticate(ctx); err != nil {
			return nil, err
		}
	}

	url := fmt.Sprintf("%s/Publisher/ReadPublisherLatestGlucoseValues?sessionId=%s&minutes=%d&maxCount=%d",
		BaseURL, c.sessionID, minutes, maxCount)

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create fetch request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read fetch response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		// Session might have expired, try re-authenticating
		c.sessionID = ""
		if err := c.authenticate(ctx); err != nil {
			return nil, err
		}
		return c.FetchReadings(ctx, maxCount, minutes)
	}

	var readings []Reading
	if err := json.Unmarshal(body, &readings); err != nil {
		return nil, fmt.Errorf("failed to parse readings: %w", err)
	}

	return readings, nil
}

// ParseTimestamp parses a Dexcom timestamp "Date(1234567890000)" to Unix milliseconds.
func ParseTimestamp(wt string) int64 {
	re := regexp.MustCompile(`Date\((\d+)\)`)
	matches := re.FindStringSubmatch(wt)
	if len(matches) < 2 {
		return 0
	}
	ms, err := strconv.ParseInt(matches[1], 10, 64)
	if err != nil {
		return 0
	}
	return ms
}
