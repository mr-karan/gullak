package main

import (
	"flag"
	"log/slog"
	"os"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/sashabaranov/go-openai"
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

	// Initialize the Telegram bot.
	bot, err := tgbotapi.NewBotAPI(ko.MustString("telegram.token"))
	if err != nil {
		slog.Error("Error initializing bot", "error", err)
		os.Exit(1)
	}
	if ko.Bool("app.debug") {
		bot.Debug = true
	}

	// Initialize the database.
	db, err := initDB(ko.MustString("app.db_path"))
	if err != nil {
		slog.Error("Error initializing database", "error", err)
		os.Exit(1)
	}

	// Start the app.
	app := &App{
		openaiClient: client,
		botClient:    bot,
		stmt:         db,
		model:        ko.MustString("openai.model"),
	}

	slog.Info("Starting the app", "model", app.model, "endpoint", cfg.BaseURL)
	app.Start()
}
