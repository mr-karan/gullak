package main

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/mr-karan/expenseai/internal/llm"
)

type ExpenseInput struct {
	Line string `json:"line"`
}

func handleIndex(c echo.Context) error {
	return c.String(http.StatusOK, "Welcome to the expenseai API! Post to /ingest to submit expenses.")
}

func handleIngest(c echo.Context) error {
	m := c.Get("app").(*App)
	var input ExpenseInput
	if err := c.Bind(&input); err != nil {
		m.log.Error("Error binding input", "error", err)
		return c.JSON(http.StatusBadRequest, "Invalid input")
	}

	if input.Line == "" {
		m.log.Error("Empty input", "error", errors.New("empty input"))
		return c.JSON(http.StatusBadRequest, "Empty input")
	}

	transactions, err := m.llm.Parse(input.Line)
	if err != nil {
		var noTxErr *llm.NoValidTransactionError
		if errors.As(err, &noTxErr) {
			m.log.Error("No valid transactions found", "error", noTxErr)
			return c.String(http.StatusBadRequest, noTxErr.Error())
		}
		m.log.Error("Error parsing expenses", "error", err)
		return c.JSON(http.StatusBadRequest, fmt.Sprintf("Error parsing expenses: %s", err.Error()))
	}

	if err := m.db.Save(transactions); err != nil {
		m.log.Error("Error saving transactions", "error", err)
		return c.String(http.StatusInternalServerError, "Error saving transactions")
	}

	fmt.Println("saved", transactions)

	return c.JSON(http.StatusOK, "Expenses saved successfully!")
}
