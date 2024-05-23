-- name: CreateTransaction :exec
-- Inserts a new transaction into the database.
INSERT INTO transactions (created_at, transaction_date, amount, currency, category, description, mode)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: ListTransactions :many
-- Retrieves all transactions from the database.
SELECT * FROM transactions ORDER BY created_at DESC;

-- name: GetTransaction :one
-- Retrieves a single transaction by ID.
SELECT * FROM transactions WHERE id = ?;

-- name: UpdateTransaction :exec
-- Updates a transaction by ID.
UPDATE transactions
SET amount = ?, currency = ?, category = ?, description = ?, mode = ?
WHERE id = ?;

-- name: DeleteTransaction :exec
-- Deletes a transaction by ID.
DELETE FROM transactions WHERE id = ?;