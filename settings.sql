-- Settings table to store user preferences
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton pattern: only one row allowed
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO settings (id, currency, timezone) VALUES (1, 'INR', 'Asia/Kolkata');
