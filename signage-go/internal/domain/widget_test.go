package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewWidgetState(t *testing.T) {
	state := NewWidgetState("blood-sugar")

	assert.Equal(t, "blood-sugar", state.WidgetID)
	assert.True(t, state.LastRun.IsZero())
	assert.Nil(t, state.LastData)
	assert.Zero(t, state.ErrorCount)
	assert.Empty(t, state.LastError)
}

func TestWidgetStateRecordSuccess(t *testing.T) {
	state := NewWidgetState("clock")
	data := map[string]any{"time": "10:45"}

	state.RecordSuccess(data)

	assert.False(t, state.LastRun.IsZero())
	assert.Equal(t, data, state.LastData)
	assert.Zero(t, state.ErrorCount)
	assert.Empty(t, state.LastError)
}

func TestWidgetStateRecordError(t *testing.T) {
	state := NewWidgetState("weather")

	state.RecordError("API timeout")
	assert.Equal(t, 1, state.ErrorCount)
	assert.Equal(t, "API timeout", state.LastError)

	state.RecordError("Connection refused")
	assert.Equal(t, 2, state.ErrorCount)
	assert.Equal(t, "Connection refused", state.LastError)
}

func TestWidgetStateResetErrors(t *testing.T) {
	state := NewWidgetState("test")
	state.RecordError("error 1")
	state.RecordError("error 2")

	state.ResetErrors()

	assert.Zero(t, state.ErrorCount)
	assert.Empty(t, state.LastError)
}

func TestWidgetConfig(t *testing.T) {
	config := WidgetConfig{
		WidgetID: "blood-sugar",
		Enabled:  true,
		Settings: map[string]any{
			"unit":     "mg/dL",
			"lowAlert": 70,
		},
	}

	assert.Equal(t, "blood-sugar", config.WidgetID)
	assert.True(t, config.Enabled)
	assert.Equal(t, "mg/dL", config.Settings["unit"])
	assert.Equal(t, 70, config.Settings["lowAlert"])
}

func TestWidgetConfigGetString(t *testing.T) {
	config := WidgetConfig{
		WidgetID: "test",
		Settings: map[string]any{
			"stringVal": "hello",
			"intVal":    42,
		},
	}

	assert.Equal(t, "hello", config.GetString("stringVal", "default"))
	assert.Equal(t, "default", config.GetString("intVal", "default"))
	assert.Equal(t, "default", config.GetString("missing", "default"))
}

func TestWidgetConfigGetInt(t *testing.T) {
	config := WidgetConfig{
		WidgetID: "test",
		Settings: map[string]any{
			"intVal":     42,
			"floatVal":   3.14,
			"stringVal":  "hello",
			"jsonNumber": json.Number("100"),
		},
	}

	assert.Equal(t, 42, config.GetInt("intVal", 0))
	assert.Equal(t, 3, config.GetInt("floatVal", 0))
	assert.Equal(t, 0, config.GetInt("stringVal", 0))
	assert.Equal(t, 0, config.GetInt("missing", 0))
	assert.Equal(t, 100, config.GetInt("jsonNumber", 0))
}

func TestNewTimeSeriesPoint(t *testing.T) {
	now := time.Now()
	value := map[string]any{"glucose": 120}
	point := NewTimeSeriesPoint(now, value)

	assert.Equal(t, now, point.Timestamp)
	assert.Equal(t, value, point.Value)
}

func TestTimeSeriesPointJSON(t *testing.T) {
	point := TimeSeriesPoint{
		Timestamp: time.Date(2026, 1, 22, 10, 30, 0, 0, time.UTC),
		Value:     map[string]any{"glucose": 120, "trend": "flat"},
	}

	data, err := json.Marshal(point)
	require.NoError(t, err)

	var decoded TimeSeriesPoint
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, point.Timestamp.Unix(), decoded.Timestamp.Unix())
}
