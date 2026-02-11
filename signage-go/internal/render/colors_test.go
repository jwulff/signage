package render

import (
	"testing"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/stretchr/testify/assert"
)

func TestGetGlucoseColorUrgentLow(t *testing.T) {
	color := GetGlucoseColor(40)
	assert.Equal(t, ColorGlucoseUrgentLow, color)

	color = GetGlucoseColor(54)
	assert.Equal(t, ColorGlucoseUrgentLow, color)
}

func TestGetGlucoseColorLow(t *testing.T) {
	color := GetGlucoseColor(55)
	assert.Equal(t, ColorGlucoseLow, color)

	color = GetGlucoseColor(69)
	assert.Equal(t, ColorGlucoseLow, color)
}

func TestGetGlucoseColorNormal(t *testing.T) {
	color := GetGlucoseColor(70)
	assert.Equal(t, ColorGlucoseNormal, color)

	color = GetGlucoseColor(120)
	assert.Equal(t, ColorGlucoseNormal, color)

	color = GetGlucoseColor(180)
	assert.Equal(t, ColorGlucoseNormal, color)
}

func TestGetGlucoseColorHigh(t *testing.T) {
	color := GetGlucoseColor(181)
	assert.Equal(t, ColorGlucoseHigh, color)

	color = GetGlucoseColor(250)
	assert.Equal(t, ColorGlucoseHigh, color)
}

func TestGetGlucoseColorUrgentHigh(t *testing.T) {
	color := GetGlucoseColor(251)
	assert.Equal(t, ColorGlucoseUrgentHigh, color)

	color = GetGlucoseColor(400)
	assert.Equal(t, ColorGlucoseUrgentHigh, color)
}

func TestLerpColor(t *testing.T) {
	black := domain.NewRGB(0, 0, 0)
	white := domain.NewRGB(255, 255, 255)

	// At t=0, should return first color
	result := LerpColor(black, white, 0)
	assert.Equal(t, black, result)

	// At t=1, should return second color
	result = LerpColor(black, white, 1)
	assert.Equal(t, white, result)

	// At t=0.5, should return midpoint
	result = LerpColor(black, white, 0.5)
	assert.Equal(t, domain.NewRGB(127, 127, 127), result)
}

func TestLerpColorOutOfRange(t *testing.T) {
	red := domain.NewRGB(255, 0, 0)
	blue := domain.NewRGB(0, 0, 255)

	// t < 0 should clamp to first color
	result := LerpColor(red, blue, -0.5)
	assert.Equal(t, red, result)

	// t > 1 should clamp to second color
	result = LerpColor(red, blue, 1.5)
	assert.Equal(t, blue, result)
}

func TestDimColor(t *testing.T) {
	white := domain.NewRGB(200, 100, 50)

	// Full brightness
	result := DimColor(white, 1.0)
	assert.Equal(t, white, result)

	// Half brightness
	result = DimColor(white, 0.5)
	assert.Equal(t, domain.NewRGB(100, 50, 25), result)

	// Zero brightness
	result = DimColor(white, 0.0)
	assert.Equal(t, ColorBlack, result)
}

func TestDimColorOutOfRange(t *testing.T) {
	color := domain.NewRGB(100, 100, 100)

	// Factor > 1 should return original
	result := DimColor(color, 1.5)
	assert.Equal(t, color, result)

	// Factor < 0 should return black
	result = DimColor(color, -0.5)
	assert.Equal(t, ColorBlack, result)
}
