package domain

import (
	"encoding/json"
	"time"
)

// WidgetState stores the state of a widget.
type WidgetState struct {
	WidgetID   string
	LastRun    time.Time
	LastData   any
	ErrorCount int
	LastError  string
}

// NewWidgetState creates a new widget state.
func NewWidgetState(widgetID string) *WidgetState {
	return &WidgetState{
		WidgetID: widgetID,
	}
}

// RecordSuccess records a successful widget update.
func (s *WidgetState) RecordSuccess(data any) {
	s.LastRun = time.Now()
	s.LastData = data
	s.ErrorCount = 0
	s.LastError = ""
}

// RecordError records a widget error.
func (s *WidgetState) RecordError(errMsg string) {
	s.ErrorCount++
	s.LastError = errMsg
}

// ResetErrors clears the error state.
func (s *WidgetState) ResetErrors() {
	s.ErrorCount = 0
	s.LastError = ""
}

// WidgetConfig holds configuration for a widget.
type WidgetConfig struct {
	WidgetID string
	Enabled  bool
	Settings map[string]any
}

// GetString returns a string setting or the default value.
func (c WidgetConfig) GetString(key, defaultValue string) string {
	if c.Settings == nil {
		return defaultValue
	}
	if val, ok := c.Settings[key]; ok {
		if s, ok := val.(string); ok {
			return s
		}
	}
	return defaultValue
}

// GetInt returns an int setting or the default value.
func (c WidgetConfig) GetInt(key string, defaultValue int) int {
	if c.Settings == nil {
		return defaultValue
	}
	if val, ok := c.Settings[key]; ok {
		switch v := val.(type) {
		case int:
			return v
		case int64:
			return int(v)
		case float64:
			return int(v)
		case json.Number:
			if i, err := v.Int64(); err == nil {
				return int(i)
			}
		}
	}
	return defaultValue
}

// TimeSeriesPoint represents a single data point in a time series.
type TimeSeriesPoint struct {
	Timestamp time.Time
	Value     any
}

// NewTimeSeriesPoint creates a new time series point.
func NewTimeSeriesPoint(timestamp time.Time, value any) TimeSeriesPoint {
	return TimeSeriesPoint{
		Timestamp: timestamp,
		Value:     value,
	}
}
