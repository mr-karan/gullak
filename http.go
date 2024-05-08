package main

import (
	"log/slog"
	"net/http"

	"github.com/labstack/echo/v4"
)

// Struct to parse input from HTTP request
type IngestRequest struct {
	Line string `json:"line"`
}

// HTTP handler for the index route
func (a *App) handleIndex(c echo.Context) error {
	return c.String(http.StatusOK, "Welcome to the expenseai API! Post to /ingest to submit expenses.")
}

// HTTP handler for the ingest endpoint
func (a *App) handleIngest(c echo.Context) error {
	var req IngestRequest
	if err := c.Bind(&req); err != nil {
		slog.Error("Error decoding request", "error", err)
		return c.String(http.StatusBadRequest, "Error decoding request")
	}

	transactions, err := a.parseExpenses(req.Line)
	if err != nil {
		slog.Error("Error parsing expenses", "error", err)
		return c.String(http.StatusBadRequest, "Error parsing expenses")
	}

	if err := a.saveTransactions(transactions); err != nil {
		slog.Error("Error saving transactions", "error", err)
		return c.String(http.StatusInternalServerError, "Error saving transactions")
	}

	return c.String(http.StatusOK, "Expenses saved successfully!")
}
