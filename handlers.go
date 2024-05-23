package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/mr-karan/expenseai/internal/db"
	"github.com/mr-karan/expenseai/internal/llm"
	"github.com/mr-karan/expenseai/pkg/models"
)

type ExpenseInput struct {
	Line    string `json:"line"`
	Confirm bool   `json:"confirm"`
}

type Resp struct {
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
	Data    interface{} `json:"data"`
}

func handleIndex(c echo.Context) error {
	return c.JSON(http.StatusOK, Resp{
		Message: "Welcome to ExpenseAI. POST to /api/transactions to save expenses.",
	})
}

func handleCreateTransaction(c echo.Context) error {
	m := c.Get("app").(*App)
	var input ExpenseInput
	if err := c.Bind(&input); err != nil {
		m.log.Error("Error binding input", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Error saving expenses",
		})
	}

	if input.Line == "" {
		m.log.Error("Empty input", "error", errors.New("empty input"))
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Empty input",
		})
	}

	transactions, err := m.llm.Parse(input.Line)
	if err != nil {
		var noTxErr *llm.NoValidTransactionError
		if errors.As(err, &noTxErr) {
			m.log.Error("No valid transactions found", "error", noTxErr)
			return c.JSON(http.StatusBadRequest, Resp{
				Error: noTxErr.Error(),
			})
		}
		m.log.Error("Error parsing expenses", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Error parsing expenses",
		})
	}

	// If confirm is false, the user has not yet confirmed the transactions.
	// Don't save the transactions yet.
	if !input.Confirm {
		return c.JSON(http.StatusOK, Resp{
			Message: "Expenses parsed successfully. Please confirm to save.",
			Data:    transactions,
		})
	}

	if err := m.Save(transactions); err != nil {
		m.log.Error("Error saving transactions", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error saving transactions",
		})
	}

	// TODO: Add RETURNING * and return the expenses saved.
	return c.JSON(http.StatusOK, Resp{
		Message: "Expenses saved",
	})
}

func handleConfirmTransactions(c echo.Context) error {
	m := c.Get("app").(*App)
	var transactions models.Transactions
	if err := c.Bind(&transactions); err != nil {
		m.log.Error("Error binding input", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid input",
		})
	}

	if len(transactions.Transactions) == 0 {
		m.log.Error("Empty transactions", "error", errors.New("empty transactions"))
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Empty transactions",
		})
	}

	if err := m.Save(transactions); err != nil {
		m.log.Error("Error saving transactions", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error saving transactions",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Message: "Transactions saved",
		Data:    transactions,
	})
}

func handleListTransactions(c echo.Context) error {
	m := c.Get("app").(*App)

	transactions, err := m.queries.ListTransactions(context.Background())
	if err != nil {
		m.log.Error("Error retrieving transactions", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error retrieving transactions",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Data:    transactions,
		Message: "Transactions retrieved",
	})
}

func handleGetTransaction(c echo.Context) error {
	m := c.Get("app").(*App)
	idStr := c.Param("id")

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		m.log.Error("Invalid transaction ID", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid transaction ID",
		})
	}

	transaction, err := m.queries.GetTransaction(context.Background(), id)
	if err != nil {
		m.log.Error("Error retrieving transaction", "error", err)
		return c.JSON(http.StatusNotFound, Resp{
			Error: "Transaction not found",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Data:    transaction,
		Message: "Transaction retrieved",
	})
}

func handleUpdateTransaction(c echo.Context) error {
	m := c.Get("app").(*App)
	idStr := c.Param("id")

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		m.log.Error("Invalid transaction ID", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid transaction ID",
		})
	}

	var input db.UpdateTransactionParams
	if err := c.Bind(&input); err != nil {
		m.log.Error("Error binding input", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid input",
		})
	}

	input.ID = id

	if err := m.queries.UpdateTransaction(context.Background(), input); err != nil {
		m.log.Error("Error updating transaction", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error updating transaction",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Message: "Transaction updated",
	})
}

func handleDeleteTransaction(c echo.Context) error {
	m := c.Get("app").(*App)
	idStr := c.Param("id")

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		m.log.Error("Invalid transaction ID", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid transaction ID",
		})
	}

	if err := m.queries.DeleteTransaction(context.Background(), id); err != nil {
		m.log.Error("Error deleting transaction", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error deleting transaction",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Message: "Transaction deleted",
	})
}
