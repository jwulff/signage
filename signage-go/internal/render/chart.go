package render

import (
	"math"
	"sort"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
)

// intAbs returns the absolute value of an integer.
func intAbs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// Target range constants for coloring.
const (
	TargetLow    = 70
	TargetHigh   = 180
	TargetCenter = 120 // Sweet spot - pure green here
)

// ChartPoint represents a single point on the chart.
type ChartPoint struct {
	Timestamp int64 // Unix milliseconds
	Value     int   // Glucose in mg/dL
}

// ChartConfig configures the chart rendering.
type ChartConfig struct {
	X           int
	Y           int
	Width       int
	Height      int
	Duration    time.Duration // Time range to show (default: 3 hours)
	OffsetHours int           // Hours offset from now (chart ends at now - offset)
	Padding     int           // Padding in mg/dL above/below data range
	TimeMarkers []time.Time   // Timestamps for vertical marker lines
	Timezone    string        // Timezone for marker calculations
}

// NewChartConfig creates a chart config with sensible defaults.
func NewChartConfig(x, y, width, height int) ChartConfig {
	return ChartConfig{
		X:        x,
		Y:        y,
		Width:    width,
		Height:   height,
		Duration: 3 * time.Hour,
		Padding:  15,
		Timezone: "America/Los_Angeles",
	}
}

// ApplyDefaults applies default values to zero fields.
func (c *ChartConfig) ApplyDefaults() {
	if c.Duration == 0 {
		c.Duration = 3 * time.Hour
	}
	if c.Padding == 0 {
		c.Padding = 15
	}
	if c.Timezone == "" {
		c.Timezone = "America/Los_Angeles"
	}
}

// SortChartPoints sorts points by timestamp ascending.
func SortChartPoints(points []ChartPoint) {
	sort.Slice(points, func(i, j int) bool {
		return points[i].Timestamp < points[j].Timestamp
	})
}

// DrawChart is a simple wrapper for rendering a chart with default settings.
// hours is the time range to display, offsetHours shifts the end time back.
func DrawChart(frame *domain.Frame, points []ChartPoint, x, y, width, height, hours, offsetHours int) {
	cfg := ChartConfig{
		X:           x,
		Y:           y,
		Width:       width,
		Height:      height,
		Duration:    time.Duration(hours) * time.Hour,
		OffsetHours: offsetHours,
	}
	RenderChart(frame, points, cfg)
}

// RenderChart renders a sparkline chart of blood sugar history.
func RenderChart(frame *domain.Frame, points []ChartPoint, cfg ChartConfig) {
	cfg.ApplyDefaults()

	if len(points) == 0 {
		return
	}

	now := time.Now()
	endTime := now.Add(-time.Duration(cfg.OffsetHours) * time.Hour)
	startTime := endTime.Add(-cfg.Duration)

	startMs := startTime.UnixMilli()
	endMs := endTime.UnixMilli()

	// Filter points to time range
	var visiblePoints []ChartPoint
	for _, p := range points {
		if p.Timestamp >= startMs && p.Timestamp <= endMs {
			visiblePoints = append(visiblePoints, p)
		}
	}

	if len(visiblePoints) == 0 {
		return
	}

	// Sort by timestamp
	SortChartPoints(visiblePoints)

	// Calculate data range
	minGlucose, maxGlucose := calculateDataRange(visiblePoints, cfg.Padding)
	glucoseRange := maxGlucose - minGlucose

	// Draw time markers first (so chart line appears on top)
	for _, marker := range cfg.TimeMarkers {
		markerMs := marker.UnixMilli()
		if markerMs >= startMs && markerMs <= endMs {
			markerX := timestampToX(markerMs, startMs, endMs, cfg)
			if markerX >= cfg.X && markerX < cfg.X+cfg.Width {
				color := getMarkerColor(marker, cfg.Timezone)
				for py := cfg.Y; py < cfg.Y+cfg.Height; py++ {
					frame.SetPixel(markerX, py, color)
				}
			}
		}
	}

	// Draw line chart
	var prevX, prevY int
	hasPrev := false

	for _, point := range visiblePoints {
		px := timestampToX(point.Timestamp, startMs, endMs, cfg)
		py := glucoseToY(point.Value, minGlucose, maxGlucose, cfg)

		// Clamp to chart bounds
		if px < cfg.X || px >= cfg.X+cfg.Width {
			continue
		}

		// Draw point
		if py >= cfg.Y && py < cfg.Y+cfg.Height {
			glucoseAtY := yToGlucose(py, minGlucose, glucoseRange, cfg)
			color := GetChartGlucoseColor(glucoseAtY)
			frame.SetPixel(px, py, color)
		}

		// Connect to previous point
		if hasPrev {
			drawChartLine(frame, prevX, prevY, px, py, minGlucose, glucoseRange, cfg)
		}

		prevX = px
		prevY = py
		hasPrev = true
	}
}

// calculateDataRange computes the min/max glucose with padding.
func calculateDataRange(points []ChartPoint, padding int) (int, int) {
	if len(points) == 0 {
		return 70, 180
	}

	dataMin := points[0].Value
	dataMax := points[0].Value
	for _, p := range points[1:] {
		if p.Value < dataMin {
			dataMin = p.Value
		}
		if p.Value > dataMax {
			dataMax = p.Value
		}
	}

	// Ensure minimum range of 30 mg/dL
	const minRange = 30
	rawRange := dataMax - dataMin
	extraPadding := 0
	if rawRange < minRange {
		extraPadding = (minRange - rawRange) / 2
	}

	minGlucose := dataMin - padding - extraPadding
	maxGlucose := dataMax + padding + extraPadding

	// Clamp to reasonable bounds
	if minGlucose < 40 {
		minGlucose = 40
	}
	if maxGlucose > 400 {
		maxGlucose = 400
	}

	return minGlucose, maxGlucose
}

// timestampToX converts a Unix millisecond timestamp to X pixel position.
func timestampToX(ts, startMs, endMs int64, cfg ChartConfig) int {
	timeRange := endMs - startMs
	if timeRange == 0 {
		return cfg.X
	}
	offset := ts - startMs
	return cfg.X + int(math.Round(float64(offset)/float64(timeRange)*float64(cfg.Width-1)))
}

// glucoseToY converts a glucose value to Y pixel position.
func glucoseToY(glucose, minGlucose, maxGlucose int, cfg ChartConfig) int {
	glucoseRange := maxGlucose - minGlucose
	if glucoseRange == 0 {
		return cfg.Y + cfg.Height/2
	}

	// Clamp glucose to range
	if glucose < minGlucose {
		glucose = minGlucose
	}
	if glucose > maxGlucose {
		glucose = maxGlucose
	}

	// Higher glucose = lower Y (top of chart)
	normalizedGlucose := float64(glucose-minGlucose) / float64(glucoseRange)
	return cfg.Y + cfg.Height - 1 - int(math.Round(normalizedGlucose*float64(cfg.Height-1)))
}

// yToGlucose converts Y pixel position back to glucose value.
func yToGlucose(y, minGlucose, glucoseRange int, cfg ChartConfig) int {
	if cfg.Height <= 1 {
		return minGlucose
	}
	normalizedY := float64(cfg.Y+cfg.Height-1-y) / float64(cfg.Height-1)
	return minGlucose + int(normalizedY*float64(glucoseRange))
}

// getMarkerColor returns the color for a time marker based on hour of day.
func getMarkerColor(t time.Time, timezone string) domain.RGB {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	localTime := t.In(loc)
	hour := localTime.Hour()

	// Sunlight percentage using cosine curve
	// Peaks at noon (100%), bottoms at midnight (0%)
	sunlight := (1 + math.Cos(float64(hour-12)*math.Pi/12)) / 2

	// Purple (midnight) to yellow (noon)
	purple := domain.RGB{R: 120, G: 50, B: 180}
	yellow := domain.RGB{R: 120, G: 100, B: 25}

	return LerpColor(purple, yellow, sunlight)
}

// GetChartGlucoseColor returns the color for a glucose value with gradient in normal range.
func GetChartGlucoseColor(glucose int) domain.RGB {
	if glucose < 55 {
		return ColorGlucoseUrgentLow
	}
	if glucose < TargetLow {
		return ColorGlucoseLow
	}
	if glucose > 250 {
		return ColorGlucoseUrgentHigh
	}
	if glucose > TargetHigh {
		return ColorGlucoseHigh
	}

	// Normal range (70-180) with gradient toward edges
	if glucose <= TargetCenter {
		// 70-120: blend from orange-tinted to pure green
		t := float64(glucose-TargetLow) / float64(TargetCenter-TargetLow)
		edgeColor := LerpColor(ColorGlucoseLow, ColorGlucoseNormal, 0.3)
		return LerpColor(edgeColor, ColorGlucoseNormal, t)
	}

	// 120-180: blend from pure green to yellow-tinted
	t := float64(glucose-TargetCenter) / float64(TargetHigh-TargetCenter)
	edgeColor := LerpColor(ColorGlucoseNormal, ColorGlucoseHigh, 0.7)
	return LerpColor(ColorGlucoseNormal, edgeColor, t)
}

// drawChartLine draws a line between two points with per-pixel glucose coloring.
func drawChartLine(frame *domain.Frame, x0, y0, x1, y1, minGlucose, glucoseRange int, cfg ChartConfig) {
	dx := intAbs(x1 - x0)
	dy := -intAbs(y1 - y0)
	sx := 1
	if x0 >= x1 {
		sx = -1
	}
	sy := 1
	if y0 >= y1 {
		sy = -1
	}
	err := dx + dy

	currentX, currentY := x0, y0

	for {
		// Only draw if within chart bounds
		if currentX >= cfg.X && currentX < cfg.X+cfg.Width &&
			currentY >= cfg.Y && currentY < cfg.Y+cfg.Height {
			glucose := yToGlucose(currentY, minGlucose, glucoseRange, cfg)
			color := GetChartGlucoseColor(glucose)
			frame.SetPixel(currentX, currentY, color)
		}

		if currentX == x1 && currentY == y1 {
			break
		}

		e2 := 2 * err
		if e2 >= dy {
			err += dy
			currentX += sx
		}
		if e2 <= dx {
			err += dx
			currentY += sy
		}
	}
}
