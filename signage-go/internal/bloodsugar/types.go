package bloodsugar

import (
	"strings"
	"time"
)

// RangeStatus represents the glucose range classification.
type RangeStatus string

const (
	RangeUrgentLow RangeStatus = "urgentLow"
	RangeLow       RangeStatus = "low"
	RangeNormal    RangeStatus = "normal"
	RangeHigh      RangeStatus = "high"
	RangeVeryHigh  RangeStatus = "veryHigh"
)

// Glucose thresholds in mg/dL.
const (
	ThresholdUrgentLow = 55
	ThresholdLow       = 70
	ThresholdHigh      = 180
	ThresholdVeryHigh  = 250
)

// StaleThreshold is how old a reading can be before it's considered stale.
const StaleThreshold = 10 * time.Minute

// Data holds blood sugar reading information.
type Data struct {
	Glucose     int         // mg/dL
	GlucoseMmol float64     // mmol/L
	Trend       string      // Raw trend from Dexcom (e.g., "Flat", "SingleUp")
	TrendArrow  string      // Display arrow (for text display)
	Delta       int         // Change from previous reading in mg/dL
	Timestamp   int64       // Unix milliseconds
	IsStale     bool        // True if data is >10 minutes old
	RangeStatus RangeStatus // Range classification
}

// TrendArrows maps Dexcom trend names to Unicode arrows (for text display).
var TrendArrows = map[string]string{
	"doubleup":     "^^",
	"singleup":     "^",
	"fortyfiveup":  "/",
	"flat":         "-",
	"fortyfivedown": "\\",
	"singledown":   "v",
	"doubledown":   "vv",
}

// ClassifyRange determines the range status for a glucose value.
func ClassifyRange(mgdl int) RangeStatus {
	if mgdl < ThresholdUrgentLow {
		return RangeUrgentLow
	}
	if mgdl < ThresholdLow {
		return RangeLow
	}
	if mgdl <= ThresholdHigh {
		return RangeNormal
	}
	if mgdl <= ThresholdVeryHigh {
		return RangeHigh
	}
	return RangeVeryHigh
}

// MapTrendArrow converts a Dexcom trend string to a display arrow.
func MapTrendArrow(trend string) string {
	lower := strings.ToLower(trend)
	if arrow, ok := TrendArrows[lower]; ok {
		return arrow
	}
	return "?"
}

// IsStaleReading checks if a timestamp is older than the stale threshold.
func IsStaleReading(timestampMs int64) bool {
	readingTime := time.UnixMilli(timestampMs)
	return time.Since(readingTime) >= StaleThreshold
}

// MgdlToMmol converts mg/dL to mmol/L.
func MgdlToMmol(mgdl int) float64 {
	return float64(int(float64(mgdl)/18.0182*10+0.5)) / 10.0
}

// HistoryPoint represents a single point in the glucose history.
type HistoryPoint struct {
	Timestamp int64 // Unix milliseconds
	Value     int   // mg/dL
}
