// Package domain contains core domain types for the signage system.
package domain

import "fmt"

// Pixoo64Size is the default Pixoo64 display size (64x64).
const Pixoo64Size = 64

// BytesPerPixel is the number of bytes per pixel (RGB).
const BytesPerPixel = 3

// RGB represents an RGB color with 8-bit channels.
type RGB struct {
	R, G, B uint8
}

// NewRGB creates a new RGB color.
func NewRGB(r, g, b uint8) RGB {
	return RGB{R: r, G: g, B: b}
}

// Equals checks if two RGB colors are equal.
func (c RGB) Equals(other RGB) bool {
	return c.R == other.R && c.G == other.G && c.B == other.B
}

// String returns a string representation of the RGB color.
func (c RGB) String() string {
	return fmt.Sprintf("RGB(%d, %d, %d)", c.R, c.G, c.B)
}

// Frame represents a single frame of pixel data.
type Frame struct {
	Width  int
	Height int
	// Pixels is a flat array of RGB values: [r0,g0,b0, r1,g1,b1, ...]
	Pixels []byte
}

// NewFrame creates a new frame filled with black (0, 0, 0).
func NewFrame(width, height int) *Frame {
	return &Frame{
		Width:  width,
		Height: height,
		Pixels: make([]byte, width*height*BytesPerPixel),
	}
}

// NewFrameWithColor creates a new frame filled with the specified color.
func NewFrameWithColor(width, height int, color RGB) *Frame {
	f := NewFrame(width, height)
	f.Fill(color)
	return f
}

// SetPixel sets a single pixel in the frame. Out of bounds coordinates are silently ignored.
func (f *Frame) SetPixel(x, y int, color RGB) {
	if x < 0 || x >= f.Width || y < 0 || y >= f.Height {
		return
	}
	offset := (y*f.Width + x) * BytesPerPixel
	f.Pixels[offset] = color.R
	f.Pixels[offset+1] = color.G
	f.Pixels[offset+2] = color.B
}

// GetPixel returns the color at the specified coordinates, or nil if out of bounds.
func (f *Frame) GetPixel(x, y int) *RGB {
	if x < 0 || x >= f.Width || y < 0 || y >= f.Height {
		return nil
	}
	offset := (y*f.Width + x) * BytesPerPixel
	return &RGB{
		R: f.Pixels[offset],
		G: f.Pixels[offset+1],
		B: f.Pixels[offset+2],
	}
}

// Fill fills the entire frame with the specified color.
func (f *Frame) Fill(color RGB) {
	for i := 0; i < f.Width*f.Height; i++ {
		offset := i * BytesPerPixel
		f.Pixels[offset] = color.R
		f.Pixels[offset+1] = color.G
		f.Pixels[offset+2] = color.B
	}
}

// Clear clears the frame to black (0, 0, 0).
func (f *Frame) Clear() {
	for i := range f.Pixels {
		f.Pixels[i] = 0
	}
}

// Clone creates a deep copy of the frame.
func (f *Frame) Clone() *Frame {
	clone := &Frame{
		Width:  f.Width,
		Height: f.Height,
		Pixels: make([]byte, len(f.Pixels)),
	}
	copy(clone.Pixels, f.Pixels)
	return clone
}

// DrawRect draws a rectangle outline (not filled).
func (f *Frame) DrawRect(x, y, width, height int, color RGB) {
	// Top and bottom edges
	for i := 0; i < width; i++ {
		f.SetPixel(x+i, y, color)
		f.SetPixel(x+i, y+height-1, color)
	}
	// Left and right edges
	for i := 0; i < height; i++ {
		f.SetPixel(x, y+i, color)
		f.SetPixel(x+width-1, y+i, color)
	}
}

// FillRect fills a rectangular area with the specified color.
func (f *Frame) FillRect(x, y, width, height int, color RGB) {
	for dy := 0; dy < height; dy++ {
		for dx := 0; dx < width; dx++ {
			f.SetPixel(x+dx, y+dy, color)
		}
	}
}

// DrawLine draws a line using Bresenham's algorithm.
func (f *Frame) DrawLine(x0, y0, x1, y1 int, color RGB) {
	dx := abs(x1 - x0)
	dy := -abs(y1 - y0)
	sx := 1
	if x0 >= x1 {
		sx = -1
	}
	sy := 1
	if y0 >= y1 {
		sy = -1
	}
	err := dx + dy

	for {
		f.SetPixel(x0, y0, color)
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 >= dy {
			err += dy
			x0 += sx
		}
		if e2 <= dx {
			err += dx
			y0 += sy
		}
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
