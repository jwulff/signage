package pixoo

import (
	"encoding/base64"
	"testing"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEncodeFrameToBase64(t *testing.T) {
	// Create a small 2x2 frame for testing
	frame := domain.NewFrame(2, 2)
	frame.SetPixel(0, 0, domain.NewRGB(255, 0, 0))   // Red
	frame.SetPixel(1, 0, domain.NewRGB(0, 255, 0))   // Green
	frame.SetPixel(0, 1, domain.NewRGB(0, 0, 255))   // Blue
	frame.SetPixel(1, 1, domain.NewRGB(255, 255, 0)) // Yellow

	encoded := EncodeFrameToBase64(frame)

	// Decode and verify
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	require.NoError(t, err)

	// Should be 2x2x3 = 12 bytes
	assert.Len(t, decoded, 12)

	// Verify pixel values
	assert.Equal(t, byte(255), decoded[0]) // R of pixel (0,0)
	assert.Equal(t, byte(0), decoded[1])   // G of pixel (0,0)
	assert.Equal(t, byte(0), decoded[2])   // B of pixel (0,0)

	assert.Equal(t, byte(0), decoded[3])   // R of pixel (1,0)
	assert.Equal(t, byte(255), decoded[4]) // G of pixel (1,0)
	assert.Equal(t, byte(0), decoded[5])   // B of pixel (1,0)
}

func TestDecodeBase64ToFrame(t *testing.T) {
	// Create expected pixel data: red, green, blue, yellow (2x2)
	pixels := []byte{
		255, 0, 0, // Red
		0, 255, 0, // Green
		0, 0, 255, // Blue
		255, 255, 0, // Yellow
	}
	encoded := base64.StdEncoding.EncodeToString(pixels)

	frame, err := DecodeBase64ToFrame(encoded, 2, 2)
	require.NoError(t, err)

	assert.Equal(t, 2, frame.Width)
	assert.Equal(t, 2, frame.Height)

	// Verify pixels
	red := frame.GetPixel(0, 0)
	require.NotNil(t, red)
	assert.Equal(t, uint8(255), red.R)
	assert.Equal(t, uint8(0), red.G)
	assert.Equal(t, uint8(0), red.B)

	green := frame.GetPixel(1, 0)
	require.NotNil(t, green)
	assert.Equal(t, uint8(0), green.R)
	assert.Equal(t, uint8(255), green.G)
	assert.Equal(t, uint8(0), green.B)
}

func TestDecodeBase64ToFrameInvalidBase64(t *testing.T) {
	_, err := DecodeBase64ToFrame("not-valid-base64!!!", 2, 2)
	assert.Error(t, err)
}

func TestDecodeBase64ToFrameWrongSize(t *testing.T) {
	pixels := []byte{255, 0, 0} // Only 1 pixel, but expecting 2x2
	encoded := base64.StdEncoding.EncodeToString(pixels)

	_, err := DecodeBase64ToFrame(encoded, 2, 2)
	assert.Error(t, err)
}

func TestCreatePixooFrameCommand(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	frame.SetPixel(0, 0, domain.NewRGB(255, 0, 0))

	cmd := CreatePixooFrameCommand(frame, nil)

	assert.Equal(t, "Draw/SendHttpGif", cmd.Command)
	assert.Equal(t, 1, cmd.PicNum)
	assert.Equal(t, 64, cmd.PicWidth)
	assert.Equal(t, 0, cmd.PicOffset)
	assert.Equal(t, 1, cmd.PicID)
	assert.Equal(t, 1000, cmd.PicSpeed)
	assert.NotEmpty(t, cmd.PicData)
}

func TestCreatePixooFrameCommandWithOptions(t *testing.T) {
	frame := domain.NewFrame(64, 64)

	opts := &FrameCommandOptions{
		PicID: 42,
		Speed: 500,
	}
	cmd := CreatePixooFrameCommand(frame, opts)

	assert.Equal(t, 42, cmd.PicID)
	assert.Equal(t, 500, cmd.PicSpeed)
}

func TestPixoo64FrameSize(t *testing.T) {
	// A 64x64 frame should have 64*64*3 = 12288 bytes raw
	frame := domain.NewFrame(64, 64)
	encoded := EncodeFrameToBase64(frame)

	decoded, err := base64.StdEncoding.DecodeString(encoded)
	require.NoError(t, err)
	assert.Len(t, decoded, 64*64*3)
}

func TestCreateDeviceTimeCommand(t *testing.T) {
	cmd := CreateDeviceTimeCommand()
	assert.Equal(t, "Device/GetDeviceTime", cmd.Command)
}

func TestCreateBrightnessCommand(t *testing.T) {
	cmd := CreateBrightnessCommand(75)
	assert.Equal(t, "Channel/SetBrightness", cmd.Command)
	assert.Equal(t, 75, cmd.Brightness)
}

func TestCreateBrightnessCommandClampValues(t *testing.T) {
	// Test clamping to 0-100 range
	cmdLow := CreateBrightnessCommand(-10)
	assert.Equal(t, 0, cmdLow.Brightness)

	cmdHigh := CreateBrightnessCommand(150)
	assert.Equal(t, 100, cmdHigh.Brightness)
}
