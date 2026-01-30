package render

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFontConstants(t *testing.T) {
	assert.Equal(t, 5, CharWidth)
	assert.Equal(t, 7, CharHeight)
}

func TestGetCharBitmap(t *testing.T) {
	// Test known character 'A'
	bitmap := GetCharBitmap('A')
	assert.Len(t, bitmap, CharHeight)

	// 'A' should have bits set in the first row
	// First row is 0b01110 = 14
	assert.Equal(t, uint8(0b01110), bitmap[0])
}

func TestGetCharBitmapUnknown(t *testing.T) {
	// Unknown character should return space bitmap
	bitmap := GetCharBitmap('€')
	spaceBitmap := GetCharBitmap(' ')

	assert.Equal(t, spaceBitmap, bitmap)
}

func TestGetCharBitmapDigits(t *testing.T) {
	// All digits should have valid bitmaps
	for _, digit := range "0123456789" {
		bitmap := GetCharBitmap(digit)
		assert.Len(t, bitmap, CharHeight, "Digit %c should have 7 rows", digit)
	}
}

func TestGetCharBitmapUppercase(t *testing.T) {
	// All uppercase letters should have valid bitmaps
	for _, letter := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
		bitmap := GetCharBitmap(letter)
		assert.Len(t, bitmap, CharHeight, "Letter %c should have 7 rows", letter)
	}
}

func TestGetCharBitmapLowercase(t *testing.T) {
	// All lowercase letters should have valid bitmaps
	for _, letter := range "abcdefghijklmnopqrstuvwxyz" {
		bitmap := GetCharBitmap(letter)
		assert.Len(t, bitmap, CharHeight, "Letter %c should have 7 rows", letter)
	}
}

func TestGetCharBitmapSpecialChars(t *testing.T) {
	specialChars := "!?.,:-+'^/\\ "
	for _, char := range specialChars {
		bitmap := GetCharBitmap(char)
		assert.Len(t, bitmap, CharHeight, "Char %c should have 7 rows", char)
	}
}

func TestMeasureText(t *testing.T) {
	// Empty string
	assert.Equal(t, 0, MeasureText(""))

	// Single character: 5 pixels wide
	assert.Equal(t, 5, MeasureText("A"))

	// Two characters: 5 + 1 (spacing) + 5 = 11 pixels
	assert.Equal(t, 11, MeasureText("AB"))

	// Three characters: 5 + 1 + 5 + 1 + 5 = 17 pixels
	assert.Equal(t, 17, MeasureText("ABC"))

	// Full time string "10:45": 5 chars = 5*5 + 4*1 = 29 pixels
	assert.Equal(t, 29, MeasureText("10:45"))
}

func TestMeasureTextWithSpacing(t *testing.T) {
	// With custom spacing of 2
	assert.Equal(t, 0, MeasureTextWithSpacing("", 2))
	assert.Equal(t, 5, MeasureTextWithSpacing("A", 2))
	assert.Equal(t, 12, MeasureTextWithSpacing("AB", 2)) // 5 + 2 + 5
}

func TestBitmapHasBitSet(t *testing.T) {
	// Test with 'A' which has 0b01110 in first row
	bitmap := GetCharBitmap('A')

	// Bit positions (from left): 0, 1, 2, 3, 4
	// 0b01110 means bits 1, 2, 3 are set (reading left to right)
	assert.False(t, HasBitSet(bitmap[0], 0))
	assert.True(t, HasBitSet(bitmap[0], 1))
	assert.True(t, HasBitSet(bitmap[0], 2))
	assert.True(t, HasBitSet(bitmap[0], 3))
	assert.False(t, HasBitSet(bitmap[0], 4))
}
