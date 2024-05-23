package db

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"log/slog"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mr-karan/expenseai/pkg/models"
)

//go:embed schema.sql
var ddl string

type Manager struct {
	log     *slog.Logger
	queries *Queries
}

// New initializes a new database manager.
func Init(path string, log *slog.Logger) (*Manager, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("error opening database: %w", err)
	}

	if _, err = db.Exec(ddl); err != nil {
		return nil, fmt.Errorf("error creating tables: %v", err)
	}

	return &Manager{
		log:     log,
		queries: New(db), // Utilize sqlc generated Queries
	}, nil
}

// SaveTransactions saves the transactions to the database using the generated CreateTransaction method.
func (m *Manager) Save(transactions models.Transactions) error {
	for _, transaction := range transactions.Transactions {
		var createdAt time.Time
		var err error

		if transaction.Date == "" {
			createdAt = time.Now()
		} else {
			createdAt, err = time.Parse("2006-01-02", transaction.Date)
			if err != nil {
				m.log.Warn("Invalid date format", "date", transaction.Date, "error", err, "description", transaction.Description)
				createdAt = time.Now()
			}
		}

		arg := CreateTransactionParams{
			CreatedAt:   createdAt,
			Amount:      transaction.Amount,
			Currency:    transaction.Currency,
			Category:    transaction.Category,
			Description: sql.NullString{String: transaction.Description, Valid: transaction.Description != ""},
			Mode:        transaction.Mode,
		}

		err = m.queries.CreateTransaction(context.TODO(), arg)
		if err != nil {
			return err
		}
	}
	return nil
}
