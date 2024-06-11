package main

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mr-karan/gullak/internal/db"
	"github.com/mr-karan/gullak/pkg/models"
)

const (
	DEFAULT_CURRENCY = "INR"
)

//go:embed pragmas.sql
var pragmas string

func createTableSQL(currency string) string {
	return fmt.Sprintf(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME NOT NULL DEFAULT (datetime('now')),
            transaction_date DATE NOT NULL,
            currency TEXT NOT NULL DEFAULT '%s',
            amount FLOAT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            confirm BOOLEAN NOT NULL DEFAULT false
        );
    `, currency)
}

func initDB(path string, currency string) (*db.Queries, error) {
	conn, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("error opening database: %w", err)
	}

	if currency == "" {
		currency = DEFAULT_CURRENCY
	}

	// Create the table if it doesn't exist.
	if _, err = conn.Exec(createTableSQL(currency)); err != nil {
		return nil, fmt.Errorf("error creating tables: %w", err)
	}

	// PRAGMA statements aren't recognised by sqlc:https://github.com/sqlc-dev/sqlc/issues/3237.
	if _, err = conn.Exec(pragmas); err != nil {
		return nil, fmt.Errorf("error running PRAGMA statements: %w", err)
	}

	queries := db.New(conn)

	return queries, nil
}

// SaveTransactions saves the transactions to the database using the generated CreateTransaction method.
func (a *App) Save(transactions models.Transactions) ([]db.Transaction, error) {
	var savedTransactions []db.Transaction

	for _, item := range transactions.Transactions {
		var transactDate time.Time
		var err error

		if item.TransactionDate == "" {
			transactDate = time.Now()
		} else {
			transactDate, err = time.Parse("2006-01-02", item.TransactionDate)
			if err != nil {
				a.log.Warn("Invalid date format", "date", item.TransactionDate, "error", err, "description", item.Description)
				transactDate = time.Now()
			}
		}

		arg := db.CreateTransactionParams{
			CreatedAt:       time.Now(),
			TransactionDate: transactDate,
			Amount:          item.Amount,
			Currency:        item.Currency,
			Category:        item.Category,
			Description:     item.Description,
		}

		savedTx, err := a.queries.CreateTransaction(context.TODO(), arg)
		if err != nil {
			return nil, fmt.Errorf("error saving in db: %w", err)
		}
		savedTransactions = append(savedTransactions, savedTx...)
	}
	return savedTransactions, nil
}

// Get retrieves a single transaction by ID.
func (a *App) Get(id int64) (models.Item, error) {
	transaction, err := a.queries.GetTransaction(context.TODO(), id)
	if err != nil {
		return models.Item{}, fmt.Errorf("error getting transaction: %w", err)
	}

	return models.Item{
		CreatedAt:       transaction.CreatedAt.Format(time.RFC3339),
		TransactionDate: transaction.TransactionDate.Format("2006-01-02"),
		Currency:        transaction.Currency,
		Amount:          transaction.Amount,
		Category:        transaction.Category,
		Description:     transaction.Description,
		Confirm:         transaction.Confirm,
	}, nil
}

// Update updates a transaction in the database.
func (a *App) Update(id int64, transaction models.Item) error {
	arg := db.UpdateTransactionParams{
		Amount:      transaction.Amount,
		Currency:    transaction.Currency,
		Category:    transaction.Category,
		Description: transaction.Description,
		Confirm:     transaction.Confirm,
		ID:          id,
	}

	if err := a.queries.UpdateTransaction(context.TODO(), arg); err != nil {
		return fmt.Errorf("error updating transaction: %w", err)
	}

	return nil
}

// Useful to check if the PRAGMA statements are working as expected.
// func checkPragma(conn *sql.DB, pragmaName string) (string, error) {
// 	query := fmt.Sprintf("PRAGMA %s;", pragmaName)
// 	var result string
// 	row := conn.QueryRow(query)
// 	err := row.Scan(&result)
// 	if err != nil {
// 		return "", fmt.Errorf("error checking PRAGMA %s: %w", pragmaName, err)
// 	}
// 	return result, nil
// }
