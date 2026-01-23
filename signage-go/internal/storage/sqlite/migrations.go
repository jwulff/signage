package sqlite

// schema contains the database schema DDL.
const schema = `
-- Devices
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    name TEXT,
    type TEXT DEFAULT 'pixoo64',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME
);

-- Connections
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    terminal_id TEXT NOT NULL,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Widget state
CREATE TABLE IF NOT EXISTS widget_state (
    widget_id TEXT PRIMARY KEY,
    last_run DATETIME,
    last_data TEXT,
    error_count INTEGER DEFAULT 0,
    last_error TEXT
);

-- Time series readings
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    widget_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(widget_id, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_readings_widget_time ON readings(widget_id, timestamp);

-- Configuration
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Frame cache
CREATE TABLE IF NOT EXISTS frame_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    frame_data BLOB NOT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`
