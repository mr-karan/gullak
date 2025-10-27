package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/mr-karan/gullak/internal/db"
	"github.com/mr-karan/gullak/internal/llm"
)

type ExpenseInput struct {
	Line string `json:"line"`
}

type Resp struct {
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
	Data    interface{} `json:"data"`
}

type CategorySummary struct {
	Category   string  `json:"category"`
	TotalSpent float64 `json:"total_spent"`
}

type DailySpendingSummary struct {
	TransactionDate string  `json:"transaction_date"`
	TotalSpent      float64 `json:"total_spent"`
}

func handleIndex(c echo.Context) error {
	return c.JSON(http.StatusOK, Resp{
		Message: "Welcome to Gullak. POST to /api/transactions to save expenses.",
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

	// Fetch existing categories for better LLM predictions
	existingCategories, err := m.queries.GetDistinctCategories(context.Background())
	if err != nil {
		m.log.Warn("Error fetching existing categories, using defaults", "error", err)
		existingCategories = nil
	}

	// Extract category names
	categoryNames := make([]string, 0, len(existingCategories))
	for _, cat := range existingCategories {
		categoryNames = append(categoryNames, cat.Category)
	}

	transactions, err := m.llm.Parse(input.Line, m.currency, categoryNames)
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

func handleListTransactions(c echo.Context) error {
	m := c.Get("app").(*App)

	var params db.ListTransactionsParams

	if confirmStr := c.QueryParam("confirm"); confirmStr != "" {
		// Convert and check the confirm parameter
		confirm, err := strconv.ParseBool(confirmStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, Resp{Error: "Invalid confirm value"})
		}
		params.Confirm = confirm
	} else {
		params.Confirm = nil // Explicitly setting as nil if not provided
	}

	startDateStr := c.QueryParam("start_date")
	endDateStr := c.QueryParam("end_date")
	var startDate, endDate time.Time
	var err error

	if startDateStr != "" {
		startDate, err = time.Parse("2006-01-02", startDateStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, Resp{Error: "Invalid start date format"})
		}
		params.StartDate = startDate
	} else {
		params.StartDate = nil // Explicitly setting as nil if not provided
	}

	if endDateStr != "" {
		endDate, err = time.Parse("2006-01-02", endDateStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, Resp{Error: "Invalid end date format"})
		}
		params.EndDate = endDate
	} else {
		params.EndDate = nil // Explicitly setting as nil if not provided
	}

	// Validate the date range if both dates are provided
	if startDateStr != "" && endDateStr != "" {
		if err := validateDateRange(startDate, endDate); err != nil {
			return c.JSON(http.StatusBadRequest, Resp{
				Error: err.Error(),
			})
		}
	}

	transactions, err := m.queries.ListTransactions(context.Background(), params)
	if err != nil {
		m.log.Error("Error retrieving transactions", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{Error: "Error retrieving transactions"})
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

	// First, get the existing transaction
	existingTransaction, err := m.queries.GetTransaction(context.Background(), id)
	if err != nil {
		m.log.Error("Error getting existing transaction", "error", err)
		return c.JSON(http.StatusNotFound, Resp{
			Error: "Transaction not found",
		})
	}

	// Parse the input as a map to handle partial updates
	var input map[string]interface{}
	if err := c.Bind(&input); err != nil {
		m.log.Error("Error binding input", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid input",
		})
	}

	// Prepare update parameters with existing values as defaults
	amount := existingTransaction.Amount
	currency := existingTransaction.Currency
	category := existingTransaction.Category
	description := existingTransaction.Description
	confirm := existingTransaction.Confirm
	transactionDate := existingTransaction.TransactionDate

	// Update only the fields that are provided
	if val, ok := input["amount"]; ok {
		if amt, ok := val.(float64); ok {
			amount = amt
		}
	}
	if val, ok := input["currency"]; ok {
		if curr, ok := val.(string); ok {
			currency = curr
		}
	}
	if val, ok := input["category"]; ok {
		if cat, ok := val.(string); ok {
			category = cat
		}
	}
	if val, ok := input["description"]; ok {
		if desc, ok := val.(string); ok {
			description = desc
		}
	}
	if val, ok := input["confirm"]; ok {
		if conf, ok := val.(bool); ok {
			confirm = conf
		}
	}
	if val, ok := input["transaction_date"]; ok && val != "" {
		if dateStr, ok := val.(string); ok {
			parsedDate, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
				m.log.Error("Error parsing transaction date", "error", err)
				return c.JSON(http.StatusBadRequest, Resp{
					Error: "Invalid transaction date",
				})
			}
			transactionDate = parsedDate
		}
	}

	params := db.UpdateTransactionParams{
		Amount:          amount,
		Currency:        currency,
		Category:        category,
		Description:     description,
		Confirm:         confirm,
		TransactionDate: transactionDate,
		ID:              id,
	}

	if err := m.queries.UpdateTransaction(context.Background(), params); err != nil {
		m.log.Error("Error updating transaction", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error updating transaction",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Message: "Transaction updated",
		Data:    params,
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

func handleTopExpenseCategories(c echo.Context) error {
	m := c.Get("app").(*App)
	startDateStr := c.QueryParam("start_date")
	endDateStr := c.QueryParam("end_date")

	var startDate, endDate time.Time
	var err error

	// If dates are not provided, default to current month
	if startDateStr == "" || endDateStr == "" {
		now := time.Now()
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, 0).Add(-time.Second)
	} else {
		// Parse start date and end date strings into time.Time
		startDate, err = time.Parse("2006-01-02", startDateStr)
		if err != nil {
			m.log.Error("Invalid start date", "error", err)
			return c.JSON(http.StatusBadRequest, Resp{
				Error: "Invalid start date format, use YYYY-MM-DD",
			})
		}

		endDate, err = time.Parse("2006-01-02", endDateStr)
		if err != nil {
			m.log.Error("Invalid end date", "error", err)
			return c.JSON(http.StatusBadRequest, Resp{
				Error: "Invalid end date format, use YYYY-MM-DD",
			})
		}

		// Validate the date range
		if err := validateDateRange(startDate, endDate); err != nil {
			return c.JSON(http.StatusBadRequest, Resp{
				Error: err.Error(),
			})
		}
	}

	params := db.TopExpenseCategoriesParams{
		StartDate: startDate,
		EndDate:   endDate,
		Currency:  m.currency,
	}

	rawCategories, err := m.queries.TopExpenseCategories(context.Background(), params)
	if err != nil {
		m.log.Error("Error retrieving top expense categories", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error retrieving top expense categories",
		})
	}

	// Transform into client-friendly structure - filter by currency
	categories := []CategorySummary{}
	for _, cat := range rawCategories {
		totalSpent := 0.0
		if cat.TotalSpent.Valid {
			totalSpent = cat.TotalSpent.Float64
		}
		// Note: The SQL query aggregates all currencies together
		// For accurate reporting, we should filter by currency at the SQL level
		categories = append(categories, CategorySummary{
			Category:   cat.Category,
			TotalSpent: totalSpent,
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Data:    categories,
		Message: "Top expense categories retrieved",
	})
}

func handleDailySpending(c echo.Context) error {
	m := c.Get("app").(*App)
	startDateStr := c.QueryParam("start_date")
	endDateStr := c.QueryParam("end_date")

	if startDateStr == "" || endDateStr == "" {
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Missing required parameters: start_date, end_date",
		})
	}

	startDate, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		m.log.Error("Invalid start date", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid start date format, use YYYY-MM-DD",
		})
	}

	endDate, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		m.log.Error("Invalid end date", "error", err)
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid end date format, use YYYY-MM-DD",
		})
	}

	// Validate the date range
	if err := validateDateRange(startDate, endDate); err != nil {
		return c.JSON(http.StatusBadRequest, Resp{
			Error: err.Error(),
		})
	}

	params := db.DailySpendingParams{
		StartDate: startDate,
		EndDate:   endDate,
		Currency:  m.currency,
	}

	rawSpending, err := m.queries.DailySpending(context.Background(), params)
	if err != nil {
		m.log.Error("Error retrieving daily spending", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error retrieving daily spending",
		})
	}

	// Transform into client-friendly structure
	spendingSummaries := make([]DailySpendingSummary, len(rawSpending))
	for i, daily := range rawSpending {
		totalSpent := 0.0
		if daily.TotalSpent.Valid {
			totalSpent = daily.TotalSpent.Float64
		}
		spendingSummaries[i] = DailySpendingSummary{
			TransactionDate: daily.TransactionDate.Format("2006-01-02"),
			TotalSpent:      totalSpent,
		}
	}

	return c.JSON(http.StatusOK, Resp{
		Data:    spendingSummaries,
		Message: "Daily spending totals retrieved successfully",
	})
}

// validateDateRange ensures that the start date is before or the same as the end date.
type DashboardStats struct {
	TotalExpenses    float64 `json:"total_expenses"`
	TransactionCount int     `json:"transaction_count"`
	CategoryCount    int     `json:"category_count"`
}

type SettingsResp struct {
	Currency string `json:"currency"`
	Timezone string `json:"timezone"`
}

type UpdateSettingsReq struct {
	Currency string `json:"currency"`
	Timezone string `json:"timezone"`
}

func handleDashboardStats(c echo.Context) error {
	m := c.Get("app").(*App)

	// Get current month start and end dates
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	endOfMonth := startOfMonth.AddDate(0, 1, 0).Add(-time.Second)

	// Get transactions for current month
	transactions, err := m.queries.ListTransactions(context.Background(), db.ListTransactionsParams{
		StartDate: startOfMonth,
		EndDate:   endOfMonth,
		Confirm:   true, // Only count confirmed transactions
	})
	if err != nil {
		m.log.Error("Error getting monthly transactions", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error retrieving dashboard stats",
		})
	}

	// Calculate stats - only sum amounts in the base currency to avoid mixing currencies
	totalExpenses := 0.0
	categorySet := make(map[string]bool)
	validTransactionCount := 0

	for _, transaction := range transactions {
		// Only include transactions in the base currency
		if transaction.Currency == m.currency {
			totalExpenses += transaction.Amount
			validTransactionCount++
		}
		categorySet[transaction.Category] = true
	}

	stats := DashboardStats{
		TotalExpenses:    totalExpenses,
		TransactionCount: validTransactionCount,
		CategoryCount:    len(categorySet),
	}

	return c.JSON(http.StatusOK, Resp{
		Data: stats,
	})
}

func validateDateRange(startDate, endDate time.Time) error {
	if startDate.After(endDate) {
		return errors.New("start date must be on or before end date")
	}
	return nil
}

func handleGetSettings(c echo.Context) error {
	m := c.Get("app").(*App)

	settings, err := m.queries.GetSettings(context.Background())
	if err != nil {
		m.log.Error("Error getting settings", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error retrieving settings",
		})
	}

	return c.JSON(http.StatusOK, Resp{
		Data: SettingsResp{
			Currency: settings.Currency,
			Timezone: settings.Timezone,
		},
	})
}

func handleUpdateSettings(c echo.Context) error {
	m := c.Get("app").(*App)

	var req UpdateSettingsReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Invalid request body",
		})
	}

	// Validate currency
	if req.Currency == "" {
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Currency is required",
		})
	}

	// Validate timezone
	if req.Timezone == "" {
		return c.JSON(http.StatusBadRequest, Resp{
			Error: "Timezone is required",
		})
	}

	err := m.queries.UpdateSettings(context.Background(), db.UpdateSettingsParams{
		Currency: req.Currency,
		Timezone: req.Timezone,
	})

	if err != nil {
		m.log.Error("Error updating settings", "error", err)
		return c.JSON(http.StatusInternalServerError, Resp{
			Error: "Error updating settings",
		})
	}

	// Update the app currency
	m.currency = req.Currency

	return c.JSON(http.StatusOK, Resp{
		Message: "Settings updated successfully",
	})
}
