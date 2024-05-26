CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    transaction_date DATE NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    amount FLOAT NOT NULL,
    category TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'CASH',
    description TEXT NOT NULL DEFAULT '',
    confirm BOOLEAN NOT NULL DEFAULT false
);
