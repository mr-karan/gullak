package main

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mr-karan/expenseai/internal/db"
	"github.com/mr-karan/expenseai/pkg/models"
)

//go:embed schema.sql
var ddl string

//go:embed pragmas.sql
var pragmas string

func initDB(path string) (*db.Queries, error) {
	conn, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("error opening database: %w", err)
	}

	if _, err = conn.Exec(ddl); err != nil {
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
func (a *App) Save(transactions models.Transactions) error {
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
			Description:     sql.NullString{String: item.Description, Valid: item.Description != ""},
			Mode:            item.Mode,
		}

		if err := a.queries.CreateTransaction(context.TODO(), arg); err != nil {
			return fmt.Errorf("error saving in db: %w", err)
		}
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
