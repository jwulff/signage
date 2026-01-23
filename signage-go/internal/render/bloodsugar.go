package render

import (
	"fmt"
	"time"

	"github.com/jwulff/signage-go/internal/bloodsugar"
	"github.com/jwulff/signage-go/internal/domain"
)

// Blood sugar region boundaries (bottom half of display).
const (
	BGRegionStart = 32
	BGRegionEnd   = 63
)

// Layout configuration for blood sugar renderer.
const (
	BGTextRow    = 34 // 2px margin from top of region
	BGTextMargin = 1  // Left/right margin for text

	BGChartX      = 1
	BGChartY      = 42 // After text row
	BGChartWidth  = 62 // Full width minus margins
	BGChartHeight = 21 // Rows 42-62
)

// Trend arrow bitmaps (7 wide x 8 tall).
// Each row is a byte, bits represent pixels left to right.
var trendArrows = map[string][]byte{
	// Double up - two chevrons
	"doubleup": {
		0b0001000,
		0b0010100,
		0b0100010,
		0b0001000,
		0b0010100,
		0b0100010,
		0b0000000,
		0b0000000,
	},
	// Single up arrow
	"singleup": {
		0b0001000,
		0b0010100,
		0b0100010,
		0b0001000,
		0b0001000,
		0b0001000,
		0b0001000,
		0b0000000,
	},
	// Diagonal up-right
	"fortyfiveup": {
		0b0001110,
		0b0000110,
		0b0001010,
		0b0010000,
		0b0100000,
		0b1000000,
		0b0000000,
		0b0000000,
	},
	// Flat/steady
	"flat": {
		0b0000000,
		0b0000100,
		0b0000010,
		0b1111111,
		0b0000010,
		0b0000100,
		0b0000000,
		0b0000000,
	},
	// Diagonal down-right
	"fortyfivedown": {
		0b0000000,
		0b0000000,
		0b1000000,
		0b0100000,
		0b0010000,
		0b0001010,
		0b0000110,
		0b0001110,
	},
	// Single down arrow
	"singledown": {
		0b0000000,
		0b0001000,
		0b0001000,
		0b0001000,
		0b0001000,
		0b0100010,
		0b0010100,
		0b0001000,
	},
	// Double down - two chevrons
	"doubledown": {
		0b0000000,
		0b0000000,
		0b0100010,
		0b0010100,
		0b0001000,
		0b0100010,
		0b0010100,
		0b0001000,
	},
}

const (
	ArrowWidth  = 7
	ArrowHeight = 8
)

// drawTrendArrow draws a trend arrow at the specified position.
// Returns the width consumed.
func drawTrendArrow(frame *domain.Frame, trend string, x, y int, color domain.RGB) int {
	// Normalize trend to lowercase
	lower := ""
	for _, r := range trend {
		if r >= 'A' && r <= 'Z' {
			lower += string(r - 'A' + 'a')
		} else {
			lower += string(r)
		}
	}

	bitmap, ok := trendArrows[lower]
	if !ok {
		return 0
	}

	for row := 0; row < ArrowHeight; row++ {
		for col := 0; col < ArrowWidth; col++ {
			bit := (bitmap[row] >> (ArrowWidth - 1 - col)) & 1
			if bit == 1 {
				px := x + col
				py := y + row
				if px >= 0 && px < frame.Width && py >= BGRegionStart && py <= BGRegionEnd {
					frame.SetPixel(px, py, color)
				}
			}
		}
	}

	return ArrowWidth + 1 // Width plus spacing
}

// getGlucoseColor returns the color for a glucose value based on range.
func getGlucoseColor(rangeStatus bloodsugar.RangeStatus, isStale bool) domain.RGB {
	if isStale {
		return ColorStale
	}

	switch rangeStatus {
	case bloodsugar.RangeUrgentLow:
		return ColorUrgentLow
	case bloodsugar.RangeLow:
		return ColorLow
	case bloodsugar.RangeNormal:
		return ColorNormal
	case bloodsugar.RangeHigh:
		return ColorHigh
	case bloodsugar.RangeVeryHigh:
		return ColorVeryHigh
	default:
		return ColorNormal
	}
}

// minutesAgo calculates how many minutes ago a timestamp was.
func minutesAgo(timestampMs int64) int {
	readingTime := time.UnixMilli(timestampMs)
	return int(time.Since(readingTime).Minutes())
}

// RenderBloodSugar renders the blood sugar region to the frame.
func RenderBloodSugar(frame *domain.Frame, data *bloodsugar.Data, history []bloodsugar.HistoryPoint) {
	if data == nil {
		// Error state
		errText := "BG ERR"
		DrawTextCentered(frame, errText, frame.Width, BGTextRow, ColorUrgentLow)
		return
	}

	valueColor := getGlucoseColor(data.RangeStatus, data.IsStale)

	// Format display strings
	glucoseStr := fmt.Sprintf("%d", data.Glucose)
	deltaStr := fmt.Sprintf("%+d", data.Delta)
	mins := minutesAgo(data.Timestamp)
	timeStr := fmt.Sprintf("%dm", mins)

	// Calculate total width: arrow + space + glucose + space + delta + space + time
	arrowW := ArrowWidth + 2
	glucoseW := MeasureText(glucoseStr)
	spaceW := 6
	deltaW := MeasureText(deltaStr)
	timeW := MeasureText(timeStr)

	fullWidth := arrowW + glucoseW + spaceW + deltaW + spaceW + timeW
	availableWidth := frame.Width - BGTextMargin*2

	// Use tight spacing if needed (remove space after glucose)
	useFullSpacing := fullWidth <= availableWidth
	var totalWidth int
	if useFullSpacing {
		totalWidth = fullWidth
	} else {
		totalWidth = arrowW + glucoseW + deltaW + spaceW + timeW
	}

	// Center the text
	startX := (frame.Width - totalWidth) / 2
	if startX < BGTextMargin {
		startX = BGTextMargin
	}
	maxX := frame.Width - totalWidth - BGTextMargin
	if startX > maxX {
		startX = maxX
	}

	// Draw trend arrow in glucose color
	drawTrendArrow(frame, data.Trend, startX, BGTextRow, valueColor)

	// Draw glucose value
	textX := startX + arrowW
	DrawText(frame, glucoseStr, textX, BGTextRow, valueColor)
	textX += glucoseW

	// Add space if using full spacing
	if useFullSpacing {
		textX += spaceW
	}

	// Draw delta and time in white
	DrawText(frame, deltaStr, textX, BGTextRow, ColorWhite)
	textX += deltaW + spaceW
	DrawText(frame, timeStr, textX, BGTextRow, ColorWhite)

	// Draw chart if we have history
	if len(history) > 0 {
		renderBloodSugarChart(frame, history)
	}
}

// renderBloodSugarChart renders the glucose history chart.
func renderBloodSugarChart(frame *domain.Frame, history []bloodsugar.HistoryPoint) {
	// Convert history points to chart points
	points := make([]ChartPoint, len(history))
	for i, hp := range history {
		points[i] = ChartPoint{
			Timestamp: hp.Timestamp,
			Value:     hp.Value,
		}
	}

	// Render split chart: left half = 21h, right half = 3h
	leftWidth := BGChartWidth / 2
	rightWidth := BGChartWidth - leftWidth

	// Left chart: 21 hours (offset by 3 hours)
	DrawChart(frame, points, BGChartX, BGChartY, leftWidth, BGChartHeight, 21, 3)

	// Right chart: 3 hours (recent)
	DrawChart(frame, points, BGChartX+leftWidth, BGChartY, rightWidth, BGChartHeight, 3, 0)

	// Draw time labels
	DrawTinyText(frame, "21h", BGChartX, BGChartY+BGChartHeight-5, ColorVeryDim)
	DrawTinyText(frame, "3h", BGChartX+leftWidth, BGChartY+BGChartHeight-5, ColorVeryDim)
}
