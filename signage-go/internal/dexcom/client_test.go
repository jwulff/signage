package dexcom

import (
	"testing"
)

func TestParseTimestamp(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected int64
	}{
		{
			name:     "valid timestamp",
			input:    "Date(1705887600000)",
			expected: 1705887600000,
		},
		{
			name:     "another valid timestamp",
			input:    "Date(1234567890123)",
			expected: 1234567890123,
		},
		{
			name:     "invalid format - no Date wrapper",
			input:    "1705887600000",
			expected: 0,
		},
		{
			name:     "invalid format - empty",
			input:    "",
			expected: 0,
		},
		{
			name:     "invalid format - malformed",
			input:    "Date(abc)",
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParseTimestamp(tt.input)
			if result != tt.expected {
				t.Errorf("ParseTimestamp(%q) = %d, want %d", tt.input, result, tt.expected)
			}
		})
	}
}
