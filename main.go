package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"github.com/sashabaranov/go-openai"
)

var (
	buildString = "unknwown"
)

const (
	DEFAULT_CURRENCY = "INR"
)

func main() {
	cfgPath := flag.String("config", "config.toml", "File path to the config file")
	flag.Parse()

	// Initialize the configuration.
	ko, err := initConfig(*cfgPath)
	if err != nil {
		slog.Error("Error initializing config", "error", err)
		os.Exit(1)
	}

	// Initialise logger.
	lgrOpts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}
	if ko.Bool("app.debug") {
		lgrOpts.Level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, lgrOpts)))

	// Initialize the OpenAI client.
	cfg := openai.DefaultConfig(ko.MustString("openai.token"))
	if ko.String("openai.base_url") != "" {
		cfg.BaseURL = ko.String("openai.base_url")
	}
	client := openai.NewClientWithConfig(cfg)

	// Initialize the database.
	db, err := initDB(ko.MustString("app.db_path"))
	if err != nil {
		slog.Error("Error initializing database", "error", err)
		os.Exit(1)
	}

	// Create a context that is cancelled on SIGTERM or SIGINT
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Start the app.
	app := &App{
		openaiClient: client,
		stmt:         db,
		model:        ko.MustString("openai.model"),
	}

	slog.Info("Starting the app", "version", buildString, "model", app.model, "endpoint", cfg.BaseURL)
	if ko.Bool("http.enabled") {
		slog.Info("HTTP mode enabled", "addr", ko.MustString("http.address"), "timeout", ko.MustDuration("http.timeout"))
		go func() {
			if err := app.initHTTP(ctx, ko.MustString("http.address"), ko.MustDuration("http.timeout")); err != nil {
				slog.Error("Error starting HTTP server", "error", err)
				os.Exit(1)
			}
		}()
	}

	// Initialize the Telegram bot.
	if ko.Bool("telegram.enabled") {
		slog.Info("telegram mode enabled")
		bot, err := tgbotapi.NewBotAPI(ko.MustString("telegram.token"))
		if err != nil {
			slog.Error("Error initializing bot", "error", err)
			os.Exit(1)
		}
		if ko.Bool("app.debug") {
			bot.Debug = true
		}

		// Initialize the bot client.
		app.botClient = bot

		if err := app.initTelegram(ctx); err != nil {
			slog.Error("Error starting telegram bot", "error", err)
			os.Exit(1)
		}
	}

	<-ctx.Done() // Wait for SIGINT or SIGTERM
	slog.Info("Shutting down!")
}
