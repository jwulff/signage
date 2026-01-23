package render

import (
	"testing"
	"time"

	"github.com/jwulff/signage-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChartPointSort(t *testing.T) {
	now := time.Now()
	points := []ChartPoint{
		{Timestamp: now.Add(-1 * time.Hour), Glucose: 100},
		{Timestamp: now.Add(-3 * time.Hour), Glucose: 90},
		{Timestamp: now.Add(-2 * time.Hour), Glucose: 95},
	}

	SortChartPoints(points)

	assert.Equal(t, 90, points[0].Glucose)
	assert.Equal(t, 95, points[1].Glucose)
	assert.Equal(t, 100, points[2].Glucose)
}

func TestNewChartConfig(t *testing.T) {
	cfg := NewChartConfig(0, 32, 64, 16)

	assert.Equal(t, 0, cfg.X)
	assert.Equal(t, 32, cfg.Y)
	assert.Equal(t, 64, cfg.Width)
	assert.Equal(t, 16, cfg.Height)
	assert.Equal(t, 3*time.Hour, cfg.Duration)
	assert.Equal(t, 15, cfg.Padding)
}

func TestRenderChartEmptyPoints(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	cfg := NewChartConfig(0, 48, 64, 16)

	// Should not panic with empty points
	RenderChart(frame, nil, cfg)
	RenderChart(frame, []ChartPoint{}, cfg)
}

func TestRenderChartSinglePoint(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	cfg := NewChartConfig(0, 48, 64, 16)

	now := time.Now()
	points := []ChartPoint{
		{Timestamp: now.Add(-30 * time.Minute), Glucose: 120},
	}

	// Should not panic with single point
	RenderChart(frame, points, cfg)

	// Check that something was drawn (at least one non-black pixel in chart area)
	hasPixel := false
	for y := cfg.Y; y < cfg.Y+cfg.Height; y++ {
		for x := cfg.X; x < cfg.X+cfg.Width; x++ {
			p := frame.GetPixel(x, y)
			if p != nil && (p.R > 0 || p.G > 0 || p.B > 0) {
				hasPixel = true
				break
			}
		}
	}
	assert.True(t, hasPixel, "Chart should have at least one pixel drawn")
}

func TestRenderChartMultiplePoints(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	cfg := NewChartConfig(0, 48, 64, 16)

	now := time.Now()
	points := []ChartPoint{
		{Timestamp: now.Add(-2*time.Hour - 30*time.Minute), Glucose: 100},
		{Timestamp: now.Add(-2 * time.Hour), Glucose: 110},
		{Timestamp: now.Add(-1*time.Hour - 30*time.Minute), Glucose: 130},
		{Timestamp: now.Add(-1 * time.Hour), Glucose: 120},
		{Timestamp: now.Add(-30 * time.Minute), Glucose: 115},
	}

	RenderChart(frame, points, cfg)

	// Count colored pixels
	coloredPixels := 0
	for y := cfg.Y; y < cfg.Y+cfg.Height; y++ {
		for x := cfg.X; x < cfg.X+cfg.Width; x++ {
			p := frame.GetPixel(x, y)
			if p != nil && (p.R > 0 || p.G > 0 || p.B > 0) {
				coloredPixels++
			}
		}
	}

	// Should have multiple colored pixels for a line chart
	assert.Greater(t, coloredPixels, 5, "Chart should have multiple pixels drawn")
}

func TestRenderChartOutsideTimeRange(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	cfg := NewChartConfig(0, 48, 64, 16)

	now := time.Now()
	// Points outside the default 3-hour range
	points := []ChartPoint{
		{Timestamp: now.Add(-5 * time.Hour), Glucose: 100},
		{Timestamp: now.Add(-4 * time.Hour), Glucose: 110},
	}

	RenderChart(frame, points, cfg)

	// Should have minimal pixels since data is out of range
	coloredPixels := 0
	for y := cfg.Y; y < cfg.Y+cfg.Height; y++ {
		for x := cfg.X; x < cfg.X+cfg.Width; x++ {
			p := frame.GetPixel(x, y)
			if p != nil && (p.R > 0 || p.G > 0 || p.B > 0) {
				coloredPixels++
			}
		}
	}

	assert.Equal(t, 0, coloredPixels, "Chart should be empty when data is out of range")
}

func TestGlucoseRangeColor(t *testing.T) {
	// Urgent low - should be red
	color := GetChartGlucoseColor(40)
	assert.True(t, color.R > color.G, "Urgent low should be reddish")

	// Normal - should be greenish
	color = GetChartGlucoseColor(120)
	assert.True(t, color.G > color.R, "Normal should be greenish")
	assert.True(t, color.G > color.B, "Normal should be greenish")

	// High - should be yellowish
	color = GetChartGlucoseColor(200)
	assert.True(t, color.R > color.B, "High should have more red than blue")
}

func TestChartDataRange(t *testing.T) {
	points := []ChartPoint{
		{Timestamp: time.Now(), Glucose: 80},
		{Timestamp: time.Now(), Glucose: 160},
	}

	minG, maxG := calculateDataRange(points, 15)

	assert.Less(t, minG, 80, "Min should be below lowest glucose")
	assert.Greater(t, maxG, 160, "Max should be above highest glucose")
}

func TestChartDataRangeMinimum(t *testing.T) {
	// Very narrow range should be expanded
	points := []ChartPoint{
		{Timestamp: time.Now(), Glucose: 100},
		{Timestamp: time.Now(), Glucose: 102},
	}

	minG, maxG := calculateDataRange(points, 15)
	dataRange := maxG - minG

	assert.GreaterOrEqual(t, dataRange, 30, "Range should be at least 30 mg/dL")
}

func TestTimeToX(t *testing.T) {
	now := time.Now()
	startTime := now.Add(-3 * time.Hour)
	endTime := now
	cfg := NewChartConfig(0, 0, 64, 16)

	// Point at start should be at x=0
	x := timeToX(startTime, startTime, endTime, cfg)
	assert.Equal(t, 0, x)

	// Point at end should be at x=63
	x = timeToX(endTime, startTime, endTime, cfg)
	assert.Equal(t, 63, x)

	// Point in middle should be near x=32
	midTime := now.Add(-90 * time.Minute)
	x = timeToX(midTime, startTime, endTime, cfg)
	assert.True(t, x > 25 && x < 40, "Mid point should be near center")
}

func TestGlucoseToY(t *testing.T) {
	cfg := NewChartConfig(0, 0, 64, 16)

	// Higher glucose should be higher on screen (lower Y value)
	yHigh := glucoseToY(180, 70, 180, cfg)
	yLow := glucoseToY(70, 70, 180, cfg)

	assert.Less(t, yHigh, yLow, "Higher glucose should have lower Y")
}

func TestRenderChartWithTimeMarkers(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	cfg := NewChartConfig(0, 48, 64, 16)

	now := time.Now()
	cfg.TimeMarkers = []time.Time{
		now.Add(-2 * time.Hour),
		now.Add(-1 * time.Hour),
	}

	points := []ChartPoint{
		{Timestamp: now.Add(-2 * time.Hour), Glucose: 100},
		{Timestamp: now, Glucose: 120},
	}

	// Should not panic
	RenderChart(frame, points, cfg)
}

func TestChartPointCreation(t *testing.T) {
	now := time.Now()
	point := ChartPoint{
		Timestamp: now,
		Glucose:   125,
	}

	assert.Equal(t, now, point.Timestamp)
	assert.Equal(t, 125, point.Glucose)
}

func TestChartConfigDefaults(t *testing.T) {
	cfg := &ChartConfig{
		X:      0,
		Y:      32,
		Width:  64,
		Height: 16,
	}
	cfg.ApplyDefaults()

	assert.Equal(t, 3*time.Hour, cfg.Duration)
	assert.Equal(t, 15, cfg.Padding)
	assert.Equal(t, "America/Los_Angeles", cfg.Timezone)
}

// Integration test - verify chart produces reasonable output
func TestRenderChartIntegration(t *testing.T) {
	frame := domain.NewFrame(64, 64)
	cfg := NewChartConfig(0, 47, 64, 17) // Common layout position

	now := time.Now()

	// Simulate 3 hours of glucose data every 5 minutes
	var points []ChartPoint
	for i := 0; i < 36; i++ {
		glucose := 100 + (i%6)*10 // Oscillates 100-150
		points = append(points, ChartPoint{
			Timestamp: now.Add(time.Duration(-i*5) * time.Minute),
			Glucose:   glucose,
		})
	}

	RenderChart(frame, points, cfg)

	// Verify chart area has content
	nonBlackPixels := 0
	for y := cfg.Y; y < cfg.Y+cfg.Height; y++ {
		for x := cfg.X; x < cfg.X+cfg.Width; x++ {
			p := frame.GetPixel(x, y)
			require.NotNil(t, p)
			if p.R > 0 || p.G > 0 || p.B > 0 {
				nonBlackPixels++
			}
		}
	}

	// With 36 points over 64 pixels width, should have substantial coverage
	assert.Greater(t, nonBlackPixels, 30, "Chart should have significant coverage")
}
