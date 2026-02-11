package pixoo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
)

// DefaultPort is the default Pixoo HTTP API port.
const DefaultPort = 80

// DefaultTimeout is the default HTTP request timeout.
const DefaultTimeout = 5 * time.Second

// Client is an HTTP client for communicating with Pixoo devices.
type Client struct {
	IP         string
	Port       int
	HTTPClient *http.Client
	testURL    string // For testing with httptest
}

// NewClient creates a new Pixoo client with default settings.
func NewClient(ip string) *Client {
	return &Client{
		IP:   ip,
		Port: DefaultPort,
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}
}

// NewClientWithPort creates a new Pixoo client with a custom port.
func NewClientWithPort(ip string, port int) *Client {
	return &Client{
		IP:   ip,
		Port: port,
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}
}

// Endpoint returns the full API endpoint URL.
func (c *Client) Endpoint() string {
	if c.testURL != "" {
		return c.testURL
	}
	return fmt.Sprintf("http://%s:%d/post", c.IP, c.Port)
}

// sendCommand sends a command to the Pixoo device.
func (c *Client) sendCommand(ctx context.Context, command any) ([]byte, error) {
	data, err := json.Marshal(command)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal command: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.Endpoint(), bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d, body: %s", resp.StatusCode, string(body))
	}

	return body, nil
}

// SelectAPIChannel switches the Pixoo to channel 4 (custom API mode).
// This must be called before sending frames to ensure our content is displayed.
func (c *Client) SelectAPIChannel(ctx context.Context) error {
	cmd := map[string]any{
		"Command":     "Channel/SetIndex",
		"SelectIndex": 4,
	}
	_, err := c.sendCommand(ctx, cmd)
	return err
}

// ResetGifID resets the GIF state before sending a new frame.
func (c *Client) ResetGifID(ctx context.Context) error {
	cmd := map[string]any{
		"Command": "Draw/ResetHttpGifId",
	}
	_, err := c.sendCommand(ctx, cmd)
	return err
}

// SendFrame sends a frame to the Pixoo device.
// It automatically switches to the API channel and resets the GIF state first.
func (c *Client) SendFrame(ctx context.Context, frame *domain.Frame) error {
	// Step 1: Switch to channel 4 (API mode)
	if err := c.SelectAPIChannel(ctx); err != nil {
		return fmt.Errorf("failed to select API channel: %w", err)
	}

	// Step 2: Reset GIF state
	if err := c.ResetGifID(ctx); err != nil {
		return fmt.Errorf("failed to reset GIF ID: %w", err)
	}

	// Step 3: Send the frame with a unique PicID
	opts := &FrameCommandOptions{
		PicID: int(time.Now().UnixMilli() % 100000),
	}
	cmd := CreatePixooFrameCommand(frame, opts)
	_, err := c.sendCommand(ctx, cmd)
	return err
}

// SendFrameWithOptions sends a frame with custom options.
func (c *Client) SendFrameWithOptions(ctx context.Context, frame *domain.Frame, opts *FrameCommandOptions) error {
	cmd := CreatePixooFrameCommand(frame, opts)
	_, err := c.sendCommand(ctx, cmd)
	return err
}

// GetDeviceTime queries the device time.
func (c *Client) GetDeviceTime(ctx context.Context) ([]byte, error) {
	cmd := CreateDeviceTimeCommand()
	return c.sendCommand(ctx, cmd)
}

// SetBrightness sets the display brightness (0-100).
func (c *Client) SetBrightness(ctx context.Context, brightness int) error {
	cmd := CreateBrightnessCommand(brightness)
	_, err := c.sendCommand(ctx, cmd)
	return err
}

// IsReachable checks if the device is reachable.
func (c *Client) IsReachable(ctx context.Context) bool {
	_, err := c.GetDeviceTime(ctx)
	return err == nil
}
