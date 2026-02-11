package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRGB(t *testing.T) {
	rgb := NewRGB(255, 128, 64)
	assert.Equal(t, uint8(255), rgb.R)
	assert.Equal(t, uint8(128), rgb.G)
	assert.Equal(t, uint8(64), rgb.B)
}

func TestRGBEquals(t *testing.T) {
	rgb1 := NewRGB(100, 150, 200)
	rgb2 := NewRGB(100, 150, 200)
	rgb3 := NewRGB(100, 150, 201)

	assert.True(t, rgb1.Equals(rgb2))
	assert.False(t, rgb1.Equals(rgb3))
}

func TestRGBString(t *testing.T) {
	rgb := NewRGB(255, 128, 64)
	assert.Equal(t, "RGB(255, 128, 64)", rgb.String())
}

func TestNewFrame(t *testing.T) {
	frame := NewFrame(64, 64)

	assert.Equal(t, 64, frame.Width)
	assert.Equal(t, 64, frame.Height)
	assert.Equal(t, 64*64*BytesPerPixel, len(frame.Pixels))
}

func TestNewFrameWithColor(t *testing.T) {
	red := NewRGB(255, 0, 0)
	frame := NewFrameWithColor(8, 8, red)

	assert.Equal(t, 8, frame.Width)
	assert.Equal(t, 8, frame.Height)

	// Check all pixels are red
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			pixel := frame.GetPixel(x, y)
			require.NotNil(t, pixel)
			assert.True(t, pixel.Equals(red), "Pixel at (%d, %d) should be red", x, y)
		}
	}
}

func TestFrameSetGetPixel(t *testing.T) {
	frame := NewFrame(8, 8)
	blue := NewRGB(0, 0, 255)

	frame.SetPixel(3, 5, blue)
	pixel := frame.GetPixel(3, 5)

	require.NotNil(t, pixel)
	assert.True(t, pixel.Equals(blue))
}

func TestFrameSetPixelOutOfBounds(t *testing.T) {
	frame := NewFrame(8, 8)
	blue := NewRGB(0, 0, 255)

	// Should not panic, silently ignore out of bounds
	frame.SetPixel(-1, 0, blue)
	frame.SetPixel(0, -1, blue)
	frame.SetPixel(8, 0, blue)
	frame.SetPixel(0, 8, blue)
	frame.SetPixel(100, 100, blue)
}

func TestFrameGetPixelOutOfBounds(t *testing.T) {
	frame := NewFrame(8, 8)

	assert.Nil(t, frame.GetPixel(-1, 0))
	assert.Nil(t, frame.GetPixel(0, -1))
	assert.Nil(t, frame.GetPixel(8, 0))
	assert.Nil(t, frame.GetPixel(0, 8))
	assert.Nil(t, frame.GetPixel(100, 100))
}

func TestFrameFill(t *testing.T) {
	frame := NewFrame(4, 4)
	green := NewRGB(0, 255, 0)

	frame.Fill(green)

	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			pixel := frame.GetPixel(x, y)
			require.NotNil(t, pixel)
			assert.True(t, pixel.Equals(green), "Pixel at (%d, %d) should be green", x, y)
		}
	}
}

func TestFrameClear(t *testing.T) {
	red := NewRGB(255, 0, 0)
	frame := NewFrameWithColor(4, 4, red)

	frame.Clear()

	black := NewRGB(0, 0, 0)
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			pixel := frame.GetPixel(x, y)
			require.NotNil(t, pixel)
			assert.True(t, pixel.Equals(black), "Pixel at (%d, %d) should be black", x, y)
		}
	}
}

func TestFrameClone(t *testing.T) {
	red := NewRGB(255, 0, 0)
	original := NewFrameWithColor(4, 4, red)

	clone := original.Clone()

	// Verify clone has same dimensions and pixels
	assert.Equal(t, original.Width, clone.Width)
	assert.Equal(t, original.Height, clone.Height)
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			origPixel := original.GetPixel(x, y)
			clonePixel := clone.GetPixel(x, y)
			require.NotNil(t, clonePixel)
			assert.True(t, origPixel.Equals(*clonePixel))
		}
	}

	// Modify clone, verify original unchanged
	blue := NewRGB(0, 0, 255)
	clone.SetPixel(0, 0, blue)

	origPixel := original.GetPixel(0, 0)
	require.NotNil(t, origPixel)
	assert.True(t, origPixel.Equals(red), "Original should be unchanged after modifying clone")
}

func TestFrameDrawRect(t *testing.T) {
	frame := NewFrame(10, 10)
	white := NewRGB(255, 255, 255)

	frame.DrawRect(2, 2, 4, 3, white)

	// Check corners and edges
	assert.True(t, frame.GetPixel(2, 2).Equals(white))  // Top-left
	assert.True(t, frame.GetPixel(5, 2).Equals(white))  // Top-right
	assert.True(t, frame.GetPixel(2, 4).Equals(white))  // Bottom-left
	assert.True(t, frame.GetPixel(5, 4).Equals(white))  // Bottom-right
	assert.True(t, frame.GetPixel(3, 2).Equals(white))  // Top edge
	assert.True(t, frame.GetPixel(2, 3).Equals(white))  // Left edge

	// Check inside is still black
	black := NewRGB(0, 0, 0)
	assert.True(t, frame.GetPixel(3, 3).Equals(black))
	assert.True(t, frame.GetPixel(4, 3).Equals(black))
}

func TestFrameFillRect(t *testing.T) {
	frame := NewFrame(10, 10)
	yellow := NewRGB(255, 255, 0)

	frame.FillRect(1, 1, 3, 2, yellow)

	// Check filled area
	for y := 1; y <= 2; y++ {
		for x := 1; x <= 3; x++ {
			assert.True(t, frame.GetPixel(x, y).Equals(yellow), "Pixel at (%d, %d) should be yellow", x, y)
		}
	}

	// Check outside area is still black
	black := NewRGB(0, 0, 0)
	assert.True(t, frame.GetPixel(0, 0).Equals(black))
	assert.True(t, frame.GetPixel(4, 1).Equals(black))
}

func TestFrameDrawLine(t *testing.T) {
	frame := NewFrame(10, 10)
	red := NewRGB(255, 0, 0)

	// Horizontal line
	frame.DrawLine(1, 2, 5, 2, red)
	for x := 1; x <= 5; x++ {
		assert.True(t, frame.GetPixel(x, 2).Equals(red), "Pixel at (%d, 2) should be red", x)
	}

	// Vertical line
	frame.DrawLine(7, 1, 7, 5, red)
	for y := 1; y <= 5; y++ {
		assert.True(t, frame.GetPixel(7, y).Equals(red), "Pixel at (7, %d) should be red", y)
	}
}

func TestPixoo64Size(t *testing.T) {
	assert.Equal(t, 64, Pixoo64Size)
}

func TestBytesPerPixel(t *testing.T) {
	assert.Equal(t, 3, BytesPerPixel)
}
