package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/mr-karan/expenseai/internal/db"
	"github.com/mr-karan/expenseai/internal/llm"
)

// TODO: Fix the API response to return the correct status codes and messages with content types.

type Manager struct {
	srv  *echo.Echo
	log  *slog.Logger
	addr string
	llm  *llm.Manager
	db   *db.Manager
}

func New(addr string, timeout time.Duration, dbMgr *db.Manager, llmMgr *llm.Manager, log *slog.Logger) *Manager {
	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.Logger())
	e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
		Timeout: timeout,
	}))

	// Register handlers.
	e.GET("/", handleIndex)
	e.POST("/ingest", handleIngest)

	return &Manager{
		srv:  e,
		log:  log,
		addr: addr,
		db:   dbMgr,
		llm:  llmMgr,
	}
}

func handleIndex(c echo.Context) error {
	return c.String(http.StatusOK, "Welcome to the expenseai API! Post to /ingest to submit expenses.")
}

func handleIngest(c echo.Context) error {
	m := c.Get("app").(*Manager)
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		m.log.Error("Error reading request body", "error", err)
		return c.String(http.StatusBadRequest, "Error reading request body")
	}

	line := string(body)

	transactions, err := m.llm.Parse(line)
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

	return c.JSON(http.StatusOK, "Expenses saved successfully!")
}

func (m *Manager) Start(ctx context.Context) error {
	// Register app (*Manager) to be injected into all HTTP handlers.
	m.srv.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set("app", m)
			return next(c)
		}
	})

	// Start server in a goroutine to allow for graceful shutdown.
	go func() {
		if err := m.srv.Start(m.addr); err != http.ErrServerClosed {
			m.srv.Logger.Fatalf("Shutting down the server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server with a timeout
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := m.srv.Shutdown(shutdownCtx); err != nil {
		m.srv.Logger.Fatalf("Error shutting down server: %v", err)
	}

	return nil
}
