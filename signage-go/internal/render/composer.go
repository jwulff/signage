package render

import (
	"fmt"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
)

// Layout constants
const (
	// Clock region: rows 0-31
	ClockRegionEndY = 31

	// Glucose region: rows 32-63
	GlucoseRegionStartY = 32
	GlucoseValueY       = 34
	GlucoseUnitY        = 43
	ChartStartY         = 50
	ChartHeight         = 14
)

// GlucoseData contains blood sugar display information.
type GlucoseData struct {
	Value     int       // Current glucose in mg/dL
	Trend     string    // Trend arrow: "↑", "↗", "→", "↘", "↓", or ""
	Delta     int       // Change from previous reading
	Timestamp time.Time // When the reading was taken
}

// ComposerData contains all data needed to render a frame.
type ComposerData struct {
	Time           time.Time
	Glucose        *GlucoseData
	GlucoseHistory []ChartPoint
}

// ComposeFrame generates a complete frame with all widgets.
func ComposeFrame(data ComposerData) *domain.Frame {
	frame := domain.NewFrameWithColor(DisplayWidth, DisplayHeight, ColorBg)

	// Render clock region (top half)
	RenderClock(frame, data.Time)

	// Render glucose region (bottom half)
	if data.Glucose != nil {
		renderGlucoseValue(frame, data.Glucose)
	}

	// Render chart if we have history
	if len(data.GlucoseHistory) > 0 {
		chartCfg := NewChartConfig(0, ChartStartY, DisplayWidth, ChartHeight)
		RenderChart(frame, data.GlucoseHistory, chartCfg)
	}

	return frame
}

// ComposeClockOnlyFrame generates a frame with just the clock.
func ComposeClockOnlyFrame(t time.Time) *domain.Frame {
	frame := domain.NewFrameWithColor(DisplayWidth, DisplayHeight, ColorBg)
	RenderClock(frame, t)
	return frame
}

// renderGlucoseValue draws the glucose value and unit.
func renderGlucoseValue(frame *domain.Frame, data *GlucoseData) {
	// Get color based on glucose value
	color := GetGlucoseColor(data.Value)

	// Format value
	valueStr := fmt.Sprintf("%d", data.Value)

	// Draw value centered
	DrawTextCentered(frame, valueStr, frame.Width, GlucoseValueY, color)

	// Draw "mg/dL" label
	DrawTinyTextCentered(frame, "MG/DL", frame.Width, GlucoseUnitY, ColorDimGray)

	// Draw trend arrow if available
	if data.Trend != "" {
		// Position trend arrow to the right of the value
		valueWidth := MeasureText(valueStr)
		valueX := (frame.Width - valueWidth) / 2
		trendX := valueX + valueWidth + 2

		trendColor := ColorTrendNormal
		if data.Delta > 5 {
			trendColor = ColorTrendRising
		} else if data.Delta < -5 {
			trendColor = ColorTrendFalling
		}

		DrawText(frame, data.Trend, trendX, GlucoseValueY, trendColor)
	}
}
