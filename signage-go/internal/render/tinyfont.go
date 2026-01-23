package render

import "github.com/jwulff/signage-go/internal/domain"

// Tiny font constants (3x5 pixels)
const (
	TinyCharWidth  = 3
	TinyCharHeight = 5
	TinyCharSpace  = 1
)

// tinyFontData contains the 3x5 bitmap font data.
var tinyFontData = map[rune][TinyCharHeight]uint8{
	// Numbers
	'0': {0b111, 0b101, 0b101, 0b101, 0b111},
	'1': {0b010, 0b110, 0b010, 0b010, 0b111},
	'2': {0b111, 0b001, 0b111, 0b100, 0b111},
	'3': {0b111, 0b001, 0b111, 0b001, 0b111},
	'4': {0b101, 0b101, 0b111, 0b001, 0b001},
	'5': {0b111, 0b100, 0b111, 0b001, 0b111},
	'6': {0b111, 0b100, 0b111, 0b101, 0b111},
	'7': {0b111, 0b001, 0b001, 0b001, 0b001},
	'8': {0b111, 0b101, 0b111, 0b101, 0b111},
	'9': {0b111, 0b101, 0b111, 0b001, 0b111},

	// Uppercase letters
	'A': {0b010, 0b101, 0b111, 0b101, 0b101},
	'B': {0b110, 0b101, 0b110, 0b101, 0b110},
	'C': {0b011, 0b100, 0b100, 0b100, 0b011},
	'D': {0b110, 0b101, 0b101, 0b101, 0b110},
	'E': {0b111, 0b100, 0b110, 0b100, 0b111},
	'F': {0b111, 0b100, 0b110, 0b100, 0b100},
	'G': {0b011, 0b100, 0b101, 0b101, 0b011},
	'H': {0b101, 0b101, 0b111, 0b101, 0b101},
	'I': {0b111, 0b010, 0b010, 0b010, 0b111},
	'J': {0b011, 0b001, 0b001, 0b101, 0b010},
	'K': {0b101, 0b110, 0b100, 0b110, 0b101},
	'L': {0b100, 0b100, 0b100, 0b100, 0b111},
	'M': {0b101, 0b111, 0b101, 0b101, 0b101},
	'N': {0b101, 0b111, 0b111, 0b101, 0b101},
	'O': {0b010, 0b101, 0b101, 0b101, 0b010},
	'P': {0b110, 0b101, 0b110, 0b100, 0b100},
	'Q': {0b010, 0b101, 0b101, 0b111, 0b011},
	'R': {0b110, 0b101, 0b110, 0b101, 0b101},
	'S': {0b011, 0b100, 0b010, 0b001, 0b110},
	'T': {0b111, 0b010, 0b010, 0b010, 0b010},
	'U': {0b101, 0b101, 0b101, 0b101, 0b111},
	'V': {0b101, 0b101, 0b101, 0b101, 0b010},
	'W': {0b101, 0b101, 0b101, 0b111, 0b101},
	'X': {0b101, 0b101, 0b010, 0b101, 0b101},
	'Y': {0b101, 0b101, 0b010, 0b010, 0b010},
	'Z': {0b111, 0b001, 0b010, 0b100, 0b111},

	// Symbols
	' ': {0b000, 0b000, 0b000, 0b000, 0b000},
	'/': {0b001, 0b001, 0b010, 0b100, 0b100},
	'-': {0b000, 0b000, 0b111, 0b000, 0b000},
	':': {0b000, 0b010, 0b000, 0b010, 0b000},
	'.': {0b000, 0b000, 0b000, 0b000, 0b010},
}

// GetTinyCharBitmap returns the bitmap data for a tiny font character.
func GetTinyCharBitmap(char rune) [TinyCharHeight]uint8 {
	if bitmap, ok := tinyFontData[char]; ok {
		return bitmap
	}
	return tinyFontData[' ']
}

// MeasureTinyText returns the width of text in the tiny font.
func MeasureTinyText(text string) int {
	runes := []rune(text)
	if len(runes) == 0 {
		return 0
	}
	return len(runes)*TinyCharWidth + (len(runes)-1)*TinyCharSpace
}

// DrawTinyText draws text using the 3x5 tiny font.
func DrawTinyText(frame *domain.Frame, text string, x, y int, color domain.RGB) {
	currentX := x
	for _, char := range text {
		drawTinyChar(frame, char, currentX, y, color)
		currentX += TinyCharWidth + TinyCharSpace
	}
}

// DrawTinyTextCentered draws tiny text centered horizontally.
func DrawTinyTextCentered(frame *domain.Frame, text string, width, y int, color domain.RGB) {
	textWidth := MeasureTinyText(text)
	x := (width - textWidth) / 2
	DrawTinyText(frame, text, x, y, color)
}

func drawTinyChar(frame *domain.Frame, char rune, x, y int, color domain.RGB) {
	bitmap := GetTinyCharBitmap(char)
	for row := 0; row < TinyCharHeight; row++ {
		for col := 0; col < TinyCharWidth; col++ {
			if (bitmap[row] & (1 << (TinyCharWidth - 1 - col))) != 0 {
				frame.SetPixel(x+col, y+row, color)
			}
		}
	}
}
