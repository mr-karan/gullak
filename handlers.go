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
	Line string `json:"line"`
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

	savedTransactions, err := m.Save(transactions)
	if err != nil {
		m.log.Error("Error saving transactions", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error saving transactions",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Message: "Expenses saved",
		Data:    savedTransactions,
	})
}

func handleConfirmTransaction(c echo.Context) error {
	m := c.Get("app").(*App)
	var transaction models.Item
	if err := c.Bind(&transaction); err != nil {
		m.log.Error("Error binding input", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid input",
		})
	}

	if transaction == (models.Item{}) {
		m.log.Error("Empty transaction", "error", errors.New("empty transaction"))
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Empty transaction",
		})
	}

	// Retrieve the transaction from the database
	existingTransaction, err := m.Get(transaction.ID)
	if err != nil {
		m.log.Error("Error getting transaction", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error getting transaction",
		})
	}

	// Update the fields of the existing transaction with the incoming data
	existingTransaction.Amount = transaction.Amount
	existingTransaction.Currency = transaction.Currency
	existingTransaction.Category = transaction.Category
	existingTransaction.Description = transaction.Description
	existingTransaction.Mode = transaction.Mode
	existingTransaction.Confirm = true

	// Update the transaction in the database
	if err := m.Update(transaction.ID, existingTransaction); err != nil {
		m.log.Error("Error updating transaction", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error updating transaction",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Message: "Transaction updated and confirmed",
		Data:    existingTransaction,
	})
}

func handleListTransactions(c echo.Context) error {
	m := c.Get("app").(*App)

	confirmStr := c.QueryParam("confirm")

	var transactions []db.Transaction
	var err error

	switch confirmStr {
	case "false":
		transactions, err = m.queries.ListTransactionsByConfirm(context.Background(), false)
	case "true":
		transactions, err = m.queries.ListTransactionsByConfirm(context.Background(), true)
	default:
		transactions, err = m.queries.ListTransactions(context.Background())
	}

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
