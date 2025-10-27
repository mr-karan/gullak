package main

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/knadh/koanf/parsers/toml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/mr-karan/gullak/internal/db"
	"github.com/mr-karan/gullak/internal/llm"
)

func initConfig(cfgPath string) (*koanf.Koanf, error) {
	k := koanf.New(".")
	if err := k.Load(file.Provider(cfgPath), toml.Parser()); err != nil {
		return nil, fmt.Errorf("error loading config: %v", err)
	}

	k.Load(env.Provider("GULLAK_", ".", func(s string) string {
		return strings.Replace(strings.ToLower(
			strings.TrimPrefix(s, "GULLAK_")), "_", ".", -1)
	}), nil)

	return k, nil
}

type App struct {
	srv      *echo.Echo
	log      *slog.Logger
	addr     string
	llm      *llm.Manager
	queries  *db.Queries
	currency string
}

func initApp(addr string, timeout time.Duration, static fs.FS, queries *db.Queries, llmMgr *llm.Manager, log *slog.Logger, currency string) *App {
	e := echo.New()
	e.HideBanner = true

	// e.Use(middleware.Logger()) -> Too noisy for now.
	e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
		Timeout: timeout,
	}))

	// Register handlers.

	e.GET("/api", handleIndex)                                               // Simple welcome message or API status
	e.POST("/api/transactions", handleCreateTransaction)                     // Creates a new transaction
	e.GET("/api/transactions", handleListTransactions)                       // Lists all transactions, with optional filters
	e.GET("/api/transactions/:id", handleGetTransaction)                     // Retrieves a specific transaction by ID
	e.PUT("/api/transactions/:id", handleUpdateTransaction)                  // Updates a specific transaction by ID
	e.DELETE("/api/transactions/:id", handleDeleteTransaction)               // Deletes a specific transaction by ID
	e.GET("/api/dashboard/stats", handleDashboardStats)                      // Retrieves dashboard statistics
	e.GET("/api/reports/top-expense-categories", handleTopExpenseCategories) // Retrieves top expense categories
	e.GET("/api/reports/daily-spending", handleDailySpending)                // Retrieves spending for a specific day
	e.GET("/api/settings", handleGetSettings)                                // Retrieves user settings
	e.PUT("/api/settings", handleUpdateSettings)                             // Updates user settings

	// Middleware to serve the static files.
	e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		Root:       "/",
		Index:      "index.html",
		HTML5:      true, // This kicks in client side routing.
		Filesystem: http.FS(static),
	}))

	return &App{
		srv:      e,
		log:      log,
		addr:     addr,
		queries:  queries,
		llm:      llmMgr,
		currency: currency,
	}
}

func (m *App) Start(ctx context.Context) error {
	// Register app (*App) to be injected into all HTTP handlers.
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
