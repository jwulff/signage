package render

import (
	"time"

	"github.com/jwulff/signage-go/internal/bloodsugar"
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

// ComposerData contains all data needed to render a frame.
type ComposerData struct {
	Time           time.Time
	BloodSugar     *bloodsugar.Data
	BloodSugarHistory []bloodsugar.HistoryPoint
}

// ComposeFrame generates a complete frame with all widgets.
func ComposeFrame(data ComposerData) *domain.Frame {
	frame := domain.NewFrameWithColor(DisplayWidth, DisplayHeight, ColorBg)

	// Render clock region (top half)
	RenderClock(frame, data.Time)

	// Render blood sugar region (bottom half)
	RenderBloodSugar(frame, data.BloodSugar, data.BloodSugarHistory)

	return frame
}

// ComposeClockOnlyFrame generates a frame with just the clock.
func ComposeClockOnlyFrame(t time.Time) *domain.Frame {
	frame := domain.NewFrameWithColor(DisplayWidth, DisplayHeight, ColorBg)
	RenderClock(frame, t)
	return frame
}

