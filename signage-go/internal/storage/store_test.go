package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewDevice(t *testing.T) {
	device := NewDevice("dev-1", "192.168.1.100", "Living Room", "pixoo64")

	assert.Equal(t, "dev-1", device.ID)
	assert.Equal(t, "192.168.1.100", device.IP)
	assert.Equal(t, "Living Room", device.Name)
	assert.Equal(t, "pixoo64", device.Type)
	assert.False(t, device.CreatedAt.IsZero())
	assert.False(t, device.LastSeen.IsZero())
	assert.True(t, device.CreatedAt.Before(time.Now().Add(time.Second)))
}

func TestErrNotFound(t *testing.T) {
	err := ErrNotFound{Resource: "device", ID: "123"}

	assert.Equal(t, "device not found: 123", err.Error())
	assert.True(t, IsNotFound(err))
}

func TestIsNotFoundFalse(t *testing.T) {
	assert.False(t, IsNotFound(nil))
	assert.False(t, IsNotFound(assert.AnError))
}

func TestCachedFrame(t *testing.T) {
	now := time.Now()
	frame := &CachedFrame{
		FrameData:   []byte{1, 2, 3},
		GeneratedAt: now,
	}

	assert.Equal(t, []byte{1, 2, 3}, frame.FrameData)
	assert.Equal(t, now, frame.GeneratedAt)
}
