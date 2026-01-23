package bloodsugar

import (
	"testing"
	"time"
)

func TestClassifyRange(t *testing.T) {
	tests := []struct {
		mgdl     int
		expected RangeStatus
	}{
		{40, RangeUrgentLow},
		{54, RangeUrgentLow},
		{55, RangeLow},
		{69, RangeLow},
		{70, RangeNormal},
		{100, RangeNormal},
		{180, RangeNormal},
		{181, RangeHigh},
		{250, RangeHigh},
		{251, RangeVeryHigh},
		{400, RangeVeryHigh},
	}

	for _, tt := range tests {
		result := ClassifyRange(tt.mgdl)
		if result != tt.expected {
			t.Errorf("ClassifyRange(%d) = %s, want %s", tt.mgdl, result, tt.expected)
		}
	}
}

func TestMapTrendArrow(t *testing.T) {
	tests := []struct {
		trend    string
		expected string
	}{
		{"Flat", "-"},
		{"SingleUp", "^"},
		{"SingleDown", "v"},
		{"DoubleUp", "^^"},
		{"DoubleDown", "vv"},
		{"FortyFiveUp", "/"},
		{"FortyFiveDown", "\\"},
		{"Unknown", "?"},
		{"", "?"},
	}

	for _, tt := range tests {
		result := MapTrendArrow(tt.trend)
		if result != tt.expected {
			t.Errorf("MapTrendArrow(%q) = %q, want %q", tt.trend, result, tt.expected)
		}
	}
}

func TestIsStaleReading(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name        string
		timestampMs int64
		expected    bool
	}{
		{
			name:        "fresh reading (1 minute ago)",
			timestampMs: now.Add(-1 * time.Minute).UnixMilli(),
			expected:    false,
		},
		{
			name:        "fresh reading (9 minutes ago)",
			timestampMs: now.Add(-9 * time.Minute).UnixMilli(),
			expected:    false,
		},
		{
			name:        "stale reading (10 minutes ago)",
			timestampMs: now.Add(-10 * time.Minute).UnixMilli(),
			expected:    true,
		},
		{
			name:        "stale reading (15 minutes ago)",
			timestampMs: now.Add(-15 * time.Minute).UnixMilli(),
			expected:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsStaleReading(tt.timestampMs)
			if result != tt.expected {
				t.Errorf("IsStaleReading() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestMgdlToMmol(t *testing.T) {
	tests := []struct {
		mgdl     int
		expected float64
	}{
		{100, 5.5},
		{180, 10.0},
		{70, 3.9},
		{250, 13.9},
	}

	for _, tt := range tests {
		result := MgdlToMmol(tt.mgdl)
		if result != tt.expected {
			t.Errorf("MgdlToMmol(%d) = %.1f, want %.1f", tt.mgdl, result, tt.expected)
		}
	}
}
