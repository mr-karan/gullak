-- name: CreateTransaction :exec
-- Inserts a new transaction into the database.
INSERT INTO transactions (created_at, amount, currency, category, description, mode)
VALUES (?, ?, ?, ?, ?, ?);


-- name: ListTransactions :many
-- Retrieves all transactions from the database.
SELECT * FROM transactions;
