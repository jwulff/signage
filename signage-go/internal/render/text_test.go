package render

import (
	"testing"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDrawText(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	white := domain.NewRGB(255, 255, 255)

	DrawText(frame, "A", 0, 0, white)

	// Check that pixels are set (based on 'A' bitmap)
	// 'A' first row is 0b01110, so bits 1,2,3 should be set
	pixel := frame.GetPixel(1, 0)
	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(white), "Pixel at (1,0) should be white")

	pixel = frame.GetPixel(2, 0)
	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(white), "Pixel at (2,0) should be white")
}

func TestDrawTextMultipleChars(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	red := domain.NewRGB(255, 0, 0)

	DrawText(frame, "AB", 0, 0, red)

	// 'A' starts at x=0, 'B' starts at x=6 (5 width + 1 spacing)
	// Check 'B' area - first row of 'B' is 0b11110
	pixel := frame.GetPixel(6, 0)
	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(red), "Pixel at (6,0) should be red")
}

func TestDrawTextCentered(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	blue := domain.NewRGB(0, 0, 255)

	// "A" is 5 pixels wide, centered on 64 should be at x=(64-5)/2=29
	DrawTextCentered(frame, "A", 64, 10, blue)

	// Check pixel at expected position
	pixel := frame.GetPixel(30, 10) // Center bit of 'A' at row 0
	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(blue))
}

func TestDrawTextRightAligned(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	green := domain.NewRGB(0, 255, 0)

	// "A" is 5 pixels wide, right-aligned to x=63 should start at x=59
	DrawTextRightAligned(frame, "A", 63, 0, green)

	// Check that text ends at x=63
	// 'A' last column (rightmost) at row 3 (0b10001) has bit set at position 0 and 4
	pixel := frame.GetPixel(63, 3)
	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(green))
}

func TestDrawTextOutOfBounds(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	white := domain.NewRGB(255, 255, 255)

	// Should not panic when drawing partially off screen
	DrawText(frame, "TEST", 60, 60, white)

	// Also should handle negative coordinates
	DrawText(frame, "TEST", -10, -5, white)
}

func TestDrawTextEmpty(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	white := domain.NewRGB(255, 255, 255)

	// Should not panic with empty string
	DrawText(frame, "", 0, 0, white)
}

func TestDrawChar(t *testing.T) {
	frame := domain.NewFrame(10, 10)
	yellow := domain.NewRGB(255, 255, 0)

	DrawChar(frame, 'X', 2, 1, yellow)

	// 'X' has specific pattern, check a known pixel
	// Row 0 of 'X' is 0b10001
	pixel := frame.GetPixel(2, 1)
	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(yellow))
}

func TestTextBounds(t *testing.T) {
	bounds := TextBounds("Hello")

	assert.Equal(t, 29, bounds.Width)  // 5*5 + 4*1
	assert.Equal(t, 7, bounds.Height)  // CharHeight
}

func TestTextBoundsEmpty(t *testing.T) {
	bounds := TextBounds("")

	assert.Equal(t, 0, bounds.Width)
	assert.Equal(t, 0, bounds.Height)
}
