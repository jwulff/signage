// Package pixoo implements the Pixoo64 protocol.
//
// The Pixoo64 has a local HTTP API at port 80.
// Endpoint: POST http://<ip>/post
//
// Frame format:
// - 64x64 pixels
// - RGB (3 bytes per pixel)
// - Base64 encoded
// - Total: 64 * 64 * 3 = 12,288 bytes raw, ~16KB base64
package pixoo

import (
	"encoding/base64"
	"fmt"

	"github.com/jwulff/signage-go/internal/domain"
)

// PixooCommand represents a Pixoo API command.
type PixooCommand struct {
	Command string `json:"Command"`
}

// FrameCommand represents a Draw/SendHttpGif command.
type FrameCommand struct {
	Command   string `json:"Command"`
	PicNum    int    `json:"PicNum"`
	PicWidth  int    `json:"PicWidth"`
	PicOffset int    `json:"PicOffset"`
	PicID     int    `json:"PicID"`
	PicSpeed  int    `json:"PicSpeed"`
	PicData   string `json:"PicData"`
}

// BrightnessCommand represents a Channel/SetBrightness command.
type BrightnessCommand struct {
	Command    string `json:"Command"`
	Brightness int    `json:"Brightness"`
}

// FrameCommandOptions configures frame command parameters.
type FrameCommandOptions struct {
	PicID int
	Speed int
}

// EncodeFrameToBase64 encodes frame pixels to base64 for Pixoo API.
func EncodeFrameToBase64(frame *domain.Frame) string {
	return base64.StdEncoding.EncodeToString(frame.Pixels)
}

// DecodeBase64ToFrame decodes base64 to a frame.
func DecodeBase64ToFrame(encoded string, width, height int) (*domain.Frame, error) {
	pixels, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	expectedSize := width * height * domain.BytesPerPixel
	if len(pixels) != expectedSize {
		return nil, fmt.Errorf("pixel data size mismatch: expected %d, got %d", expectedSize, len(pixels))
	}

	return &domain.Frame{
		Width:  width,
		Height: height,
		Pixels: pixels,
	}, nil
}

// CreatePixooFrameCommand creates a Draw/SendHttpGif command.
func CreatePixooFrameCommand(frame *domain.Frame, opts *FrameCommandOptions) FrameCommand {
	picID := 1
	speed := 1000

	if opts != nil {
		if opts.PicID > 0 {
			picID = opts.PicID
		}
		if opts.Speed > 0 {
			speed = opts.Speed
		}
	}

	return FrameCommand{
		Command:   "Draw/SendHttpGif",
		PicNum:    1,
		PicWidth:  frame.Width,
		PicOffset: 0,
		PicID:     picID,
		PicSpeed:  speed,
		PicData:   EncodeFrameToBase64(frame),
	}
}

// CreateDeviceTimeCommand creates a Device/GetDeviceTime command.
func CreateDeviceTimeCommand() PixooCommand {
	return PixooCommand{
		Command: "Device/GetDeviceTime",
	}
}

// CreateBrightnessCommand creates a Channel/SetBrightness command.
func CreateBrightnessCommand(brightness int) BrightnessCommand {
	// Clamp to 0-100
	if brightness < 0 {
		brightness = 0
	}
	if brightness > 100 {
		brightness = 100
	}

	return BrightnessCommand{
		Command:    "Channel/SetBrightness",
		Brightness: brightness,
	}
}
