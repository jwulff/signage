package pixoo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewClient(t *testing.T) {
	client := NewClient("192.168.1.100")

	assert.Equal(t, "192.168.1.100", client.IP)
	assert.Equal(t, DefaultPort, client.Port)
	assert.NotNil(t, client.HTTPClient)
}

func TestNewClientWithPort(t *testing.T) {
	client := NewClientWithPort("192.168.1.100", 8080)

	assert.Equal(t, "192.168.1.100", client.IP)
	assert.Equal(t, 8080, client.Port)
}

func TestClientEndpoint(t *testing.T) {
	client := NewClient("192.168.1.100")
	assert.Equal(t, "http://192.168.1.100:80/post", client.Endpoint())

	clientCustomPort := NewClientWithPort("192.168.1.100", 8080)
	assert.Equal(t, "http://192.168.1.100:8080/post", clientCustomPort.Endpoint())
}

func TestClientSendFrame(t *testing.T) {
	var receivedCommand FrameCommand
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		err := json.NewDecoder(r.Body).Decode(&receivedCommand)
		require.NoError(t, err)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"error_code":0}`))
	}))
	defer server.Close()

	// Extract host and port from test server
	client := newTestClient(server)

	frame := domain.NewFrameWithColor(64, 64, domain.NewRGB(255, 0, 0))
	err := client.SendFrame(context.Background(), frame)

	require.NoError(t, err)
	assert.Equal(t, "Draw/SendHttpGif", receivedCommand.Command)
	assert.Equal(t, 64, receivedCommand.PicWidth)
	assert.NotEmpty(t, receivedCommand.PicData)
}

func TestClientSendFrameError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := newTestClient(server)
	frame := domain.NewFrame(64, 64)

	err := client.SendFrame(context.Background(), frame)
	assert.Error(t, err)
}

func TestClientSendFrameTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := newTestClient(server)
	client.HTTPClient.Timeout = 50 * time.Millisecond

	frame := domain.NewFrame(64, 64)
	ctx := context.Background()

	err := client.SendFrame(ctx, frame)
	assert.Error(t, err)
}

func TestClientGetDeviceTime(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var cmd PixooCommand
		_ = json.NewDecoder(r.Body).Decode(&cmd)
		assert.Equal(t, "Device/GetDeviceTime", cmd.Command)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"error_code":0,"UTCTime":1706000000}`))
	}))
	defer server.Close()

	client := newTestClient(server)
	resp, err := client.GetDeviceTime(context.Background())

	require.NoError(t, err)
	assert.Contains(t, string(resp), "UTCTime")
}

func TestClientSetBrightness(t *testing.T) {
	var receivedCommand BrightnessCommand
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		err := json.NewDecoder(r.Body).Decode(&receivedCommand)
		require.NoError(t, err)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"error_code":0}`))
	}))
	defer server.Close()

	client := newTestClient(server)
	err := client.SetBrightness(context.Background(), 75)

	require.NoError(t, err)
	assert.Equal(t, "Channel/SetBrightness", receivedCommand.Command)
	assert.Equal(t, 75, receivedCommand.Brightness)
}

func TestClientIsReachable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"error_code":0}`))
	}))
	defer server.Close()

	client := newTestClient(server)
	reachable := client.IsReachable(context.Background())

	assert.True(t, reachable)
}

func TestClientIsReachableFailure(t *testing.T) {
	// Use a closed server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	server.Close()

	client := newTestClient(server)
	client.HTTPClient.Timeout = 100 * time.Millisecond

	reachable := client.IsReachable(context.Background())
	assert.False(t, reachable)
}

// newTestClient creates a client configured to use a test server
func newTestClient(server *httptest.Server) *Client {
	// Parse the test server URL to get host and port
	url := server.URL
	// Remove http:// prefix and split by :
	host := url[7:] // skip "http://"

	client := &Client{
		IP:         host,
		Port:       0, // Will be ignored since we use the full URL
		HTTPClient: server.Client(),
		testURL:    server.URL + "/post",
	}
	return client
}
