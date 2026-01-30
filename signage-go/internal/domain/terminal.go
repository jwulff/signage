package domain

import "time"

// TerminalType represents the type of terminal device.
type TerminalType string

const (
	TerminalTypePixoo64 TerminalType = "pixoo64"
	TerminalTypeWeb     TerminalType = "web"
	TerminalTypeOther   TerminalType = "other"
)

// DisplaySize represents display dimensions.
type DisplaySize struct {
	Width  int
	Height int
}

// Terminal represents a display device.
type Terminal struct {
	ID        string
	Name      string
	Size      DisplaySize
	Type      TerminalType
	IPAddress string // For Pixoo devices
}

// NewTerminal creates a new terminal.
func NewTerminal(id, name string, termType TerminalType, width, height int) *Terminal {
	return &Terminal{
		ID:   id,
		Name: name,
		Type: termType,
		Size: DisplaySize{
			Width:  width,
			Height: height,
		},
	}
}

// Connection represents a WebSocket connection to a terminal.
type Connection struct {
	ID          string
	TerminalID  string
	ConnectedAt time.Time
}

// NewConnection creates a new connection with the current timestamp.
func NewConnection(id, terminalID string) *Connection {
	return &Connection{
		ID:          id,
		TerminalID:  terminalID,
		ConnectedAt: time.Now(),
	}
}

// IsExpired checks if the connection has exceeded the given duration.
func (c *Connection) IsExpired(maxAge time.Duration) bool {
	return time.Since(c.ConnectedAt) > maxAge
}

// Refresh updates the connection timestamp to now.
func (c *Connection) Refresh() {
	c.ConnectedAt = time.Now()
}
