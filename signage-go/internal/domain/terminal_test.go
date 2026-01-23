package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestTerminalType(t *testing.T) {
	assert.Equal(t, TerminalType("pixoo64"), TerminalTypePixoo64)
	assert.Equal(t, TerminalType("web"), TerminalTypeWeb)
	assert.Equal(t, TerminalType("other"), TerminalTypeOther)
}

func TestNewTerminal(t *testing.T) {
	terminal := NewTerminal("term-1", "Living Room Display", TerminalTypePixoo64, 64, 64)

	assert.Equal(t, "term-1", terminal.ID)
	assert.Equal(t, "Living Room Display", terminal.Name)
	assert.Equal(t, TerminalTypePixoo64, terminal.Type)
	assert.Equal(t, 64, terminal.Size.Width)
	assert.Equal(t, 64, terminal.Size.Height)
	assert.Empty(t, terminal.IPAddress)
}

func TestTerminalWithIP(t *testing.T) {
	terminal := NewTerminal("term-1", "Pixoo", TerminalTypePixoo64, 64, 64)
	terminal.IPAddress = "192.168.1.100"

	assert.Equal(t, "192.168.1.100", terminal.IPAddress)
}

func TestDisplaySize(t *testing.T) {
	size := DisplaySize{Width: 64, Height: 64}

	assert.Equal(t, 64, size.Width)
	assert.Equal(t, 64, size.Height)
}

func TestNewConnection(t *testing.T) {
	conn := NewConnection("conn-123", "term-456")

	assert.Equal(t, "conn-123", conn.ID)
	assert.Equal(t, "term-456", conn.TerminalID)
	assert.False(t, conn.ConnectedAt.IsZero())
	assert.True(t, conn.ConnectedAt.Before(time.Now().Add(time.Second)))
}

func TestConnectionIsExpired(t *testing.T) {
	conn := NewConnection("conn-123", "term-456")
	conn.ConnectedAt = time.Now().Add(-2 * time.Hour)

	assert.True(t, conn.IsExpired(time.Hour))
	assert.False(t, conn.IsExpired(3*time.Hour))
}

func TestConnectionRefresh(t *testing.T) {
	conn := NewConnection("conn-123", "term-456")
	oldTime := conn.ConnectedAt
	time.Sleep(10 * time.Millisecond)

	conn.Refresh()

	assert.True(t, conn.ConnectedAt.After(oldTime))
}
