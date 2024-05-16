package db

import (
	"database/sql"
	"embed"
	"fmt"
	"time"

	"log/slog"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mr-karan/expenseai/pkg/models"
)

//go:embed schema.sql
var schema embed.FS

type Manager struct {
	log  *slog.Logger
	stmt *sql.Stmt
}

func New(path string, log *slog.Logger) (*Manager, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("error opening database: %v", err)
	}

	schemaFile, err := schema.ReadFile("schema.sql")
	if err != nil {
		return nil, fmt.Errorf("error reading schema file: %v", err)
	}

	_, err = db.Exec(string(schemaFile))
	if err != nil {
		return nil, fmt.Errorf("error creating tables: %v", err)
	}

	stmt, err := db.Prepare("INSERT INTO transactions (created_at, amount, currency, category, description, mode) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		return nil, fmt.Errorf("error preparing SQL statement: %v", err)
	}

	return &Manager{
		log:  log,
		stmt: stmt,
	}, nil
}

// saveTransactions saves the transactions to the database.
func (db *Manager) Save(transactions models.Transactions) error {
	for _, transaction := range transactions.Transactions {
		if transaction.Date == "" {
			transaction.Date = time.Now().Format("2006-01-02")
		} else {
			_, err := time.Parse("2006-01-02", transaction.Date)
			if err != nil {
				db.log.Warn("Invalid date format", "date", transaction.Date, "error", err, "description", transaction.Description)
				transaction.Date = time.Now().Format("2006-01-02")
			}
		}
		_, err := db.stmt.Exec(transaction.Date, transaction.Amount, transaction.Currency, transaction.Category, transaction.Description, transaction.Mode)
		if err != nil {
			return err
		}
	}
	return nil
}
