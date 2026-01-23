package render

import "github.com/jwulff/signage-go/internal/domain"

// DisplayWidth is the default Pixoo64 display width.
const DisplayWidth = 64

// DisplayHeight is the default Pixoo64 display height.
const DisplayHeight = 64

// Bounds represents the bounding box of rendered text.
type Bounds struct {
	Width  int
	Height int
}

// DrawText draws text at the specified position.
func DrawText(frame *domain.Frame, text string, x, y int, color domain.RGB) {
	DrawTextWithSpacing(frame, text, x, y, color, CharSpacing)
}

// DrawTextWithSpacing draws text with custom character spacing.
func DrawTextWithSpacing(frame *domain.Frame, text string, x, y int, color domain.RGB, spacing int) {
	currentX := x
	for _, char := range text {
		DrawChar(frame, char, currentX, y, color)
		currentX += CharWidth + spacing
	}
}

// DrawTextCentered draws text centered horizontally within the given width.
func DrawTextCentered(frame *domain.Frame, text string, width, y int, color domain.RGB) {
	textWidth := MeasureText(text)
	x := (width - textWidth) / 2
	DrawText(frame, text, x, y, color)
}

// DrawTextCenteredAt draws text centered at a specific x coordinate.
func DrawTextCenteredAt(frame *domain.Frame, text string, centerX, y int, color domain.RGB) {
	textWidth := MeasureText(text)
	x := centerX - textWidth/2
	DrawText(frame, text, x, y, color)
}

// DrawTextRightAligned draws text right-aligned to the specified x position.
func DrawTextRightAligned(frame *domain.Frame, text string, rightX, y int, color domain.RGB) {
	textWidth := MeasureText(text)
	x := rightX - textWidth + 1
	DrawText(frame, text, x, y, color)
}

// DrawChar draws a single character at the specified position.
func DrawChar(frame *domain.Frame, char rune, x, y int, color domain.RGB) {
	bitmap := GetCharBitmap(char)

	for row := 0; row < CharHeight; row++ {
		for col := 0; col < CharWidth; col++ {
			if HasBitSet(bitmap[row], col) {
				frame.SetPixel(x+col, y+row, color)
			}
		}
	}
}

// TextBounds returns the bounding box for the given text.
func TextBounds(text string) Bounds {
	if len(text) == 0 {
		return Bounds{Width: 0, Height: 0}
	}
	return Bounds{
		Width:  MeasureText(text),
		Height: CharHeight,
	}
}
