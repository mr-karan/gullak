-- name: CreateTransaction :many
-- Inserts a new transaction into the database.
INSERT INTO transactions (created_at, transaction_date, amount, currency, category, description, mode, confirm)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: ListTransactions :many
-- Retrieves all transactions from the database. Confirm value is either true or false.
SELECT * FROM transactions ORDER BY created_at DESC;

-- name: ListTransactionsByConfirm :many
-- Retrieves all transactions from the database. Confirm value is either true or false.
SELECT * FROM transactions WHERE confirm=? ORDER BY created_at DESC;

-- name: GetTransaction :one
-- Retrieves a single transaction by ID.
SELECT * FROM transactions WHERE id = ?;

-- name: UpdateTransaction :exec
-- Updates a transaction by ID.
UPDATE transactions
SET amount = ?, currency = ?, category = ?, description = ?, mode = ?, confirm = ?, transaction_date = ?
WHERE id = ?;

-- name: DeleteTransaction :exec
-- Deletes a transaction by ID.
DELETE FROM transactions WHERE id = ?;