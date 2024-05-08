package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	_ "github.com/mattn/go-sqlite3"
	"github.com/sashabaranov/go-openai"
)

type App struct {
	openaiClient *openai.Client
	botClient    *tgbotapi.BotAPI
	stmt         *sql.Stmt
	model        string
}

func (a *App) initHTTP(ctx context.Context, addr string, timeout time.Duration) error {
	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.Logger())
	e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
		Timeout: timeout,
	}))

	// Register handlers.
	e.GET("/", a.handleIndex)
	e.POST("/ingest", a.handleIngest)

	// Start server in a goroutine to allow for graceful shutdown.
	go func() {
		if err := e.Start(addr); err != http.ErrServerClosed {
			e.Logger.Fatalf("Shutting down the server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server with a timeout
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		e.Logger.Fatalf("Error shutting down server: %v", err)
	}

	return nil
}

func (a *App) initTelegram(ctx context.Context) error {
	updateConfig := tgbotapi.NewUpdate(0)
	updateConfig.Timeout = 30

	updates := a.botClient.GetUpdatesChan(updateConfig)

	slog.Info("Telegram bot started polling updates", "bot_name", a.botClient.Self.UserName)
	for {
		select {
		case update := <-updates:
			if update.Message != nil {
				if update.Message.IsCommand() {
					a.handleCommands(update.Message)
				}
			}
		case <-ctx.Done():
			slog.Info("Stopping Telegram bot updates")
			return nil
		}
	}
}
