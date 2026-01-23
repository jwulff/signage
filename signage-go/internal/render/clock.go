package render

import (
	"fmt"
	"math"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
)

// Clock layout constants
const (
	ClockTimeY = 2  // Y position for time
	ClockDateY = 11 // Y position for date (tiny font)
	BandY      = 18 // Y position for sunlight band
	BandHeight = 8  // Height of sunlight band
	BandMargin = 1  // Left/right margin for band
)

// RenderClock renders the clock region (time, date, sunlight band).
func RenderClock(frame *domain.Frame, t time.Time) {
	// Format time as "H:MM" (12-hour without leading zero)
	hour := t.Hour() % 12
	if hour == 0 {
		hour = 12
	}
	timeStr := fmt.Sprintf("%d:%02d", hour, t.Minute())

	// Draw time centered
	DrawTextCentered(frame, timeStr, frame.Width, ClockTimeY, ColorTime)

	// Format date as "MON JAN 2 2006"
	days := []string{"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"}
	months := []string{"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"}
	dayName := days[t.Weekday()]
	monthName := months[t.Month()-1]
	dateStr := fmt.Sprintf("%s %s %d %d", dayName, monthName, t.Day(), t.Year())

	// Draw date with tiny font
	DrawTinyTextCentered(frame, dateStr, frame.Width, ClockDateY, ColorDate)

	// Draw sunlight band
	renderSunlightBand(frame, t.Hour())
}

// renderSunlightBand draws the 24-hour sunlight gradient.
// Left edge = 12 hours ago, center = now, right edge = 12 hours from now.
func renderSunlightBand(frame *domain.Frame, currentHour int) {
	bandWidth := frame.Width - BandMargin*2
	bandX := BandMargin

	for px := 0; px < bandWidth; px++ {
		// Map pixel position to hours offset from now (-12 to +12)
		hoursOffset := (float64(px)/float64(bandWidth-1) - 0.5) * 24
		hour := int(float64(currentHour)+hoursOffset+24) % 24

		// Get sunlight percentage using cosine curve
		// Peaks at noon (100%), bottoms at midnight (0%)
		sunlight := (1 + math.Cos(float64(hour-12)*math.Pi/12)) / 2

		// Base color: dark blue (night) to light yellow (day)
		r := uint8(20 + sunlight*180)  // 20-200
		g := uint8(20 + sunlight*160)  // 20-180
		b := uint8(40 + (1-sunlight)*80) // 40-120 (more blue at night)

		// Draw vertical strip
		for py := BandY; py < BandY+BandHeight; py++ {
			frame.SetPixel(bandX+px, py, domain.NewRGB(r, g, b))
		}
	}

	// Draw center line (now indicator) - white
	centerX := bandX + bandWidth/2
	for py := BandY; py < BandY+BandHeight; py++ {
		frame.SetPixel(centerX, py, ColorWhite)
	}
}

// getSunlightPercent returns sunlight percentage (0-1) for an hour (0-23).
func getSunlightPercent(hour int) float64 {
	return (1 + math.Cos(float64(hour-12)*math.Pi/12)) / 2
}
