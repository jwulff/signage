package sqlite

import (
	"context"
	"testing"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/jwulff/signage-go/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestStore(t *testing.T) *Store {
	store, err := NewMemoryStore()
	require.NoError(t, err)
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestNewMemoryStore(t *testing.T) {
	store, err := NewMemoryStore()
	require.NoError(t, err)
	defer store.Close()

	assert.NotNil(t, store)
}

func TestNewFileStore(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewFileStore(tmpDir + "/test.db")
	require.NoError(t, err)
	defer store.Close()

	assert.NotNil(t, store)
}

// Device tests

func TestSaveAndGetDevice(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	device := storage.NewDevice("dev-1", "192.168.1.100", "Test Device", "pixoo64")

	err := store.SaveDevice(ctx, device)
	require.NoError(t, err)

	retrieved, err := store.GetDevice(ctx, "dev-1")
	require.NoError(t, err)

	assert.Equal(t, device.ID, retrieved.ID)
	assert.Equal(t, device.IP, retrieved.IP)
	assert.Equal(t, device.Name, retrieved.Name)
	assert.Equal(t, device.Type, retrieved.Type)
}

func TestGetDeviceNotFound(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_, err := store.GetDevice(ctx, "nonexistent")
	assert.True(t, storage.IsNotFound(err))
}

func TestGetDevices(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	// Save multiple devices
	_ = store.SaveDevice(ctx, storage.NewDevice("dev-1", "192.168.1.100", "Device 1", "pixoo64"))
	_ = store.SaveDevice(ctx, storage.NewDevice("dev-2", "192.168.1.101", "Device 2", "pixoo64"))

	devices, err := store.GetDevices(ctx)
	require.NoError(t, err)

	assert.Len(t, devices, 2)
}

func TestDeleteDevice(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	device := storage.NewDevice("dev-1", "192.168.1.100", "Test Device", "pixoo64")
	_ = store.SaveDevice(ctx, device)

	err := store.DeleteDevice(ctx, "dev-1")
	require.NoError(t, err)

	_, err = store.GetDevice(ctx, "dev-1")
	assert.True(t, storage.IsNotFound(err))
}

// Connection tests

func TestSaveAndGetConnections(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	conn := domain.NewConnection("conn-1", "term-1")

	err := store.SaveConnection(ctx, conn)
	require.NoError(t, err)

	connections, err := store.GetConnections(ctx)
	require.NoError(t, err)

	assert.Len(t, connections, 1)
	assert.Equal(t, conn.ID, connections[0].ID)
	assert.Equal(t, conn.TerminalID, connections[0].TerminalID)
}

func TestGetConnectionCount(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_ = store.SaveConnection(ctx, domain.NewConnection("conn-1", "term-1"))
	_ = store.SaveConnection(ctx, domain.NewConnection("conn-2", "term-2"))

	count, err := store.GetConnectionCount(ctx)
	require.NoError(t, err)

	assert.Equal(t, 2, count)
}

func TestDeleteConnection(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_ = store.SaveConnection(ctx, domain.NewConnection("conn-1", "term-1"))

	err := store.DeleteConnection(ctx, "conn-1")
	require.NoError(t, err)

	count, _ := store.GetConnectionCount(ctx)
	assert.Equal(t, 0, count)
}

// Widget state tests

func TestSaveAndGetWidgetState(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	state := domain.NewWidgetState("blood-sugar")
	state.RecordSuccess(map[string]any{"glucose": 120})

	err := store.SaveWidgetState(ctx, state)
	require.NoError(t, err)

	retrieved, err := store.GetWidgetState(ctx, "blood-sugar")
	require.NoError(t, err)

	assert.Equal(t, state.WidgetID, retrieved.WidgetID)
	assert.False(t, retrieved.LastRun.IsZero())
}

func TestGetWidgetStateNotFound(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_, err := store.GetWidgetState(ctx, "nonexistent")
	assert.True(t, storage.IsNotFound(err))
}

// Time series tests

func TestStoreAndQueryDataPoints(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	now := time.Now()
	points := []domain.TimeSeriesPoint{
		{Timestamp: now.Add(-2 * time.Hour), Value: map[string]any{"glucose": 100}},
		{Timestamp: now.Add(-1 * time.Hour), Value: map[string]any{"glucose": 110}},
		{Timestamp: now, Value: map[string]any{"glucose": 120}},
	}

	err := store.StoreDataPoints(ctx, "blood-sugar", points)
	require.NoError(t, err)

	// Query all
	results, err := store.QueryHistory(ctx, "blood-sugar", now.Add(-3*time.Hour), now.Add(time.Hour))
	require.NoError(t, err)

	assert.Len(t, results, 3)
}

func TestQueryHistoryTimeRange(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	now := time.Now()
	points := []domain.TimeSeriesPoint{
		{Timestamp: now.Add(-3 * time.Hour), Value: map[string]any{"glucose": 90}},
		{Timestamp: now.Add(-2 * time.Hour), Value: map[string]any{"glucose": 100}},
		{Timestamp: now.Add(-1 * time.Hour), Value: map[string]any{"glucose": 110}},
		{Timestamp: now, Value: map[string]any{"glucose": 120}},
	}

	_ = store.StoreDataPoints(ctx, "blood-sugar", points)

	// Query only last 90 minutes
	results, err := store.QueryHistory(ctx, "blood-sugar", now.Add(-90*time.Minute), now.Add(time.Minute))
	require.NoError(t, err)

	assert.Len(t, results, 2)
}

func TestDeleteOldData(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	now := time.Now()
	points := []domain.TimeSeriesPoint{
		{Timestamp: now.Add(-48 * time.Hour), Value: map[string]any{"old": true}},
		{Timestamp: now, Value: map[string]any{"new": true}},
	}

	_ = store.StoreDataPoints(ctx, "blood-sugar", points)

	err := store.DeleteOldData(ctx, "blood-sugar", now.Add(-24*time.Hour))
	require.NoError(t, err)

	results, _ := store.QueryHistory(ctx, "blood-sugar", now.Add(-72*time.Hour), now.Add(time.Hour))
	assert.Len(t, results, 1)
}

// Frame cache tests

func TestCacheAndGetFrame(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	frame := &storage.CachedFrame{
		FrameData:   []byte{1, 2, 3, 4},
		GeneratedAt: time.Now(),
	}

	err := store.CacheFrame(ctx, frame)
	require.NoError(t, err)

	retrieved, err := store.GetCachedFrame(ctx)
	require.NoError(t, err)

	assert.Equal(t, frame.FrameData, retrieved.FrameData)
}

func TestGetCachedFrameNotFound(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_, err := store.GetCachedFrame(ctx)
	assert.True(t, storage.IsNotFound(err))
}

// Config tests

func TestSetAndGetConfig(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	err := store.SetConfig(ctx, "timezone", "America/Los_Angeles")
	require.NoError(t, err)

	value, err := store.GetConfig(ctx, "timezone")
	require.NoError(t, err)

	assert.Equal(t, "America/Los_Angeles", value)
}

func TestGetConfigNotFound(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_, err := store.GetConfig(ctx, "nonexistent")
	assert.True(t, storage.IsNotFound(err))
}

func TestDeleteConfig(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_ = store.SetConfig(ctx, "key", "value")

	err := store.DeleteConfig(ctx, "key")
	require.NoError(t, err)

	_, err = store.GetConfig(ctx, "key")
	assert.True(t, storage.IsNotFound(err))
}

func TestUpdateConfig(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	_ = store.SetConfig(ctx, "key", "value1")
	_ = store.SetConfig(ctx, "key", "value2")

	value, err := store.GetConfig(ctx, "key")
	require.NoError(t, err)

	assert.Equal(t, "value2", value)
}
