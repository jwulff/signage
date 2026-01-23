package render

import "github.com/jwulff/signage-go/internal/domain"

// Common colors for the display.
var (
	// Background
	ColorBlack = domain.NewRGB(0, 0, 0)
	ColorBg    = ColorBlack

	// Text colors
	ColorWhite      = domain.NewRGB(255, 255, 255)
	ColorGray       = domain.NewRGB(128, 128, 128)
	ColorDimGray    = domain.NewRGB(64, 64, 64)
	ColorLightGray  = domain.NewRGB(192, 192, 192)

	// Clock/time colors
	ColorTime = domain.NewRGB(255, 255, 255)
	ColorDate = domain.NewRGB(180, 180, 180)

	// Blood sugar colors - following Dexcom color scheme
	ColorGlucoseUrgentLow  = domain.NewRGB(255, 0, 0)     // Red - below 55
	ColorGlucoseLow        = domain.NewRGB(255, 100, 100) // Light red - 55-70
	ColorGlucoseNormal     = domain.NewRGB(0, 255, 0)     // Green - 70-180
	ColorGlucoseHigh       = domain.NewRGB(255, 255, 0)   // Yellow - 180-250
	ColorGlucoseUrgentHigh = domain.NewRGB(255, 165, 0)   // Orange - above 250

	// Trend arrow colors
	ColorTrendNormal = domain.NewRGB(200, 200, 200)
	ColorTrendRising = domain.NewRGB(255, 200, 0)
	ColorTrendFalling = domain.NewRGB(255, 100, 100)

	// Chart colors
	ColorChartLine     = domain.NewRGB(0, 200, 0)
	ColorChartLow      = domain.NewRGB(255, 100, 100)
	ColorChartHigh     = domain.NewRGB(255, 200, 0)
	ColorChartGrid     = domain.NewRGB(40, 40, 40)
	ColorChartTarget   = domain.NewRGB(0, 100, 0) // Target range indicator

	// Weather colors
	ColorSunlight    = domain.NewRGB(255, 200, 50)
	ColorDaylight    = domain.NewRGB(100, 150, 200)
	ColorNight       = domain.NewRGB(30, 30, 60)
	ColorTemperature = domain.NewRGB(255, 128, 0)
)

// GetGlucoseColor returns the appropriate color for a glucose value.
func GetGlucoseColor(mgdl int) domain.RGB {
	switch {
	case mgdl < 55:
		return ColorGlucoseUrgentLow
	case mgdl < 70:
		return ColorGlucoseLow
	case mgdl <= 180:
		return ColorGlucoseNormal
	case mgdl <= 250:
		return ColorGlucoseHigh
	default:
		return ColorGlucoseUrgentHigh
	}
}

// LerpColor linearly interpolates between two colors.
func LerpColor(a, b domain.RGB, t float64) domain.RGB {
	if t <= 0 {
		return a
	}
	if t >= 1 {
		return b
	}
	return domain.NewRGB(
		uint8(float64(a.R)+t*float64(int(b.R)-int(a.R))),
		uint8(float64(a.G)+t*float64(int(b.G)-int(a.G))),
		uint8(float64(a.B)+t*float64(int(b.B)-int(a.B))),
	)
}

// DimColor reduces the brightness of a color by a factor (0-1).
func DimColor(c domain.RGB, factor float64) domain.RGB {
	if factor <= 0 {
		return ColorBlack
	}
	if factor >= 1 {
		return c
	}
	return domain.NewRGB(
		uint8(float64(c.R)*factor),
		uint8(float64(c.G)*factor),
		uint8(float64(c.B)*factor),
	)
}
