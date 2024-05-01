package main

import (
	"database/sql"
	"embed"
	"fmt"
	"time"

	"log/slog"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed schema.sql
var schema embed.FS

func initDB(dbPath string) (*sql.Stmt, error) {
	db, err := sql.Open("sqlite3", dbPath)
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

	slog.Info("Successfully connected to the database and tables created")
	return stmt, nil
}

// saveTransactions saves the transactions to the database.
func (a *App) saveTransactions(transactions Transactions) error {
	for _, transaction := range transactions.Transactions {
		_, err := a.stmt.Exec(time.Now(), transaction.Amount, transaction.Currency, transaction.Category, transaction.Description, transaction.Mode)
		if err != nil {
			return err
		}
	}
	return nil
}
