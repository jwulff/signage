// Package sqlite provides a SQLite implementation of the storage.Store interface.
package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/jwulff/signage-go/internal/storage"

	_ "modernc.org/sqlite"
)

// Store is a SQLite implementation of storage.Store.
type Store struct {
	db *sql.DB
}

// NewMemoryStore creates an in-memory SQLite store.
func NewMemoryStore() (*Store, error) {
	return newStore(":memory:")
}

// NewFileStore creates a file-based SQLite store.
func NewFileStore(path string) (*Store, error) {
	return newStore(path)
}

func newStore(dsn string) (*Store, error) {
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}

	return store, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(schema)
	return err
}

// Close closes the database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// Device methods

func (s *Store) SaveDevice(ctx context.Context, device *storage.Device) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO devices (id, ip, name, type, created_at, last_seen)
		VALUES (?, ?, ?, ?, ?, ?)
	`, device.ID, device.IP, device.Name, device.Type, device.CreatedAt, device.LastSeen)
	return err
}

func (s *Store) GetDevice(ctx context.Context, id string) (*storage.Device, error) {
	var device storage.Device
	err := s.db.QueryRowContext(ctx, `
		SELECT id, ip, name, type, created_at, last_seen FROM devices WHERE id = ?
	`, id).Scan(&device.ID, &device.IP, &device.Name, &device.Type, &device.CreatedAt, &device.LastSeen)
	if err == sql.ErrNoRows {
		return nil, storage.ErrNotFound{Resource: "device", ID: id}
	}
	if err != nil {
		return nil, err
	}
	return &device, nil
}

func (s *Store) GetDevices(ctx context.Context) ([]*storage.Device, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, ip, name, type, created_at, last_seen FROM devices ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*storage.Device
	for rows.Next() {
		var device storage.Device
		if err := rows.Scan(&device.ID, &device.IP, &device.Name, &device.Type, &device.CreatedAt, &device.LastSeen); err != nil {
			return nil, err
		}
		devices = append(devices, &device)
	}
	return devices, rows.Err()
}

func (s *Store) DeleteDevice(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM devices WHERE id = ?", id)
	return err
}

// Connection methods

func (s *Store) SaveConnection(ctx context.Context, conn *domain.Connection) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO connections (id, terminal_id, connected_at)
		VALUES (?, ?, ?)
	`, conn.ID, conn.TerminalID, conn.ConnectedAt)
	return err
}

func (s *Store) DeleteConnection(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM connections WHERE id = ?", id)
	return err
}

func (s *Store) GetConnections(ctx context.Context) ([]*domain.Connection, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, terminal_id, connected_at FROM connections
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conns []*domain.Connection
	for rows.Next() {
		var conn domain.Connection
		if err := rows.Scan(&conn.ID, &conn.TerminalID, &conn.ConnectedAt); err != nil {
			return nil, err
		}
		conns = append(conns, &conn)
	}
	return conns, rows.Err()
}

func (s *Store) GetConnectionCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM connections").Scan(&count)
	return count, err
}

// Widget state methods

func (s *Store) SaveWidgetState(ctx context.Context, state *domain.WidgetState) error {
	dataJSON, err := json.Marshal(state.LastData)
	if err != nil {
		return fmt.Errorf("failed to marshal last_data: %w", err)
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO widget_state (widget_id, last_run, last_data, error_count, last_error)
		VALUES (?, ?, ?, ?, ?)
	`, state.WidgetID, state.LastRun, string(dataJSON), state.ErrorCount, state.LastError)
	return err
}

func (s *Store) GetWidgetState(ctx context.Context, widgetID string) (*domain.WidgetState, error) {
	var state domain.WidgetState
	var dataJSON string

	err := s.db.QueryRowContext(ctx, `
		SELECT widget_id, last_run, last_data, error_count, last_error
		FROM widget_state WHERE widget_id = ?
	`, widgetID).Scan(&state.WidgetID, &state.LastRun, &dataJSON, &state.ErrorCount, &state.LastError)

	if err == sql.ErrNoRows {
		return nil, storage.ErrNotFound{Resource: "widget_state", ID: widgetID}
	}
	if err != nil {
		return nil, err
	}

	if dataJSON != "" {
		if err := json.Unmarshal([]byte(dataJSON), &state.LastData); err != nil {
			return nil, fmt.Errorf("failed to unmarshal last_data: %w", err)
		}
	}

	return &state, nil
}

// Time series methods

func (s *Store) StoreDataPoints(ctx context.Context, widgetID string, points []domain.TimeSeriesPoint) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT OR REPLACE INTO readings (widget_id, timestamp, value)
		VALUES (?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, point := range points {
		valueJSON, err := json.Marshal(point.Value)
		if err != nil {
			return fmt.Errorf("failed to marshal value: %w", err)
		}
		if _, err := stmt.ExecContext(ctx, widgetID, point.Timestamp, string(valueJSON)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) QueryHistory(ctx context.Context, widgetID string, since, until time.Time) ([]domain.TimeSeriesPoint, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT timestamp, value FROM readings
		WHERE widget_id = ? AND timestamp >= ? AND timestamp <= ?
		ORDER BY timestamp ASC
	`, widgetID, since, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []domain.TimeSeriesPoint
	for rows.Next() {
		var point domain.TimeSeriesPoint
		var valueJSON string
		if err := rows.Scan(&point.Timestamp, &valueJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(valueJSON), &point.Value); err != nil {
			return nil, fmt.Errorf("failed to unmarshal value: %w", err)
		}
		points = append(points, point)
	}
	return points, rows.Err()
}

func (s *Store) DeleteOldData(ctx context.Context, widgetID string, before time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM readings WHERE widget_id = ? AND timestamp < ?
	`, widgetID, before)
	return err
}

// Frame cache methods

func (s *Store) CacheFrame(ctx context.Context, frame *storage.CachedFrame) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO frame_cache (id, frame_data, generated_at)
		VALUES (1, ?, ?)
	`, frame.FrameData, frame.GeneratedAt)
	return err
}

func (s *Store) GetCachedFrame(ctx context.Context) (*storage.CachedFrame, error) {
	var frame storage.CachedFrame
	err := s.db.QueryRowContext(ctx, `
		SELECT frame_data, generated_at FROM frame_cache WHERE id = 1
	`).Scan(&frame.FrameData, &frame.GeneratedAt)

	if err == sql.ErrNoRows {
		return nil, storage.ErrNotFound{Resource: "frame_cache", ID: "1"}
	}
	if err != nil {
		return nil, err
	}
	return &frame, nil
}

// Config methods

func (s *Store) GetConfig(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, "SELECT value FROM config WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", storage.ErrNotFound{Resource: "config", ID: key}
	}
	return value, err
}

func (s *Store) SetConfig(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO config (key, value, updated_at)
		VALUES (?, ?, ?)
	`, key, value, time.Now())
	return err
}

func (s *Store) DeleteConfig(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM config WHERE key = ?", key)
	return err
}

// Verify interface compliance
var _ storage.Store = (*Store)(nil)
