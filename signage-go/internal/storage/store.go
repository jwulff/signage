// Package storage provides storage abstractions for the signage system.
package storage

import (
	"context"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
)

// Store is the interface for persistent storage.
type Store interface {
	// Connection management
	SaveConnection(ctx context.Context, conn *domain.Connection) error
	DeleteConnection(ctx context.Context, id string) error
	GetConnections(ctx context.Context) ([]*domain.Connection, error)
	GetConnectionCount(ctx context.Context) (int, error)

	// Widget state
	GetWidgetState(ctx context.Context, widgetID string) (*domain.WidgetState, error)
	SaveWidgetState(ctx context.Context, state *domain.WidgetState) error

	// Time series data
	StoreDataPoints(ctx context.Context, widgetID string, points []domain.TimeSeriesPoint) error
	QueryHistory(ctx context.Context, widgetID string, since, until time.Time) ([]domain.TimeSeriesPoint, error)
	DeleteOldData(ctx context.Context, widgetID string, before time.Time) error

	// Frame cache
	CacheFrame(ctx context.Context, frame *CachedFrame) error
	GetCachedFrame(ctx context.Context) (*CachedFrame, error)

	// Configuration
	GetConfig(ctx context.Context, key string) (string, error)
	SetConfig(ctx context.Context, key, value string) error
	DeleteConfig(ctx context.Context, key string) error

	// Device management
	SaveDevice(ctx context.Context, device *Device) error
	GetDevice(ctx context.Context, id string) (*Device, error)
	GetDevices(ctx context.Context) ([]*Device, error)
	DeleteDevice(ctx context.Context, id string) error

	// Lifecycle
	Close() error
}

// CachedFrame represents a cached rendered frame.
type CachedFrame struct {
	FrameData   []byte
	GeneratedAt time.Time
}

// Device represents a stored Pixoo device.
type Device struct {
	ID        string
	IP        string
	Name      string
	Type      string
	CreatedAt time.Time
	LastSeen  time.Time
}

// NewDevice creates a new device record.
func NewDevice(id, ip, name, deviceType string) *Device {
	now := time.Now()
	return &Device{
		ID:        id,
		IP:        ip,
		Name:      name,
		Type:      deviceType,
		CreatedAt: now,
		LastSeen:  now,
	}
}

// ErrNotFound is returned when a record is not found.
type ErrNotFound struct {
	Resource string
	ID       string
}

func (e ErrNotFound) Error() string {
	return e.Resource + " not found: " + e.ID
}

// IsNotFound checks if an error is a not found error.
func IsNotFound(err error) bool {
	_, ok := err.(ErrNotFound)
	return ok
}
