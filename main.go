package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/mr-karan/expenseai/internal/db"
	"github.com/mr-karan/expenseai/internal/http"
	"github.com/mr-karan/expenseai/internal/llm"
	tg "github.com/mr-karan/expenseai/internal/telegram"
)

var (
	buildString = "unknwown"
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
	logger := slog.New(slog.NewTextHandler(os.Stdout, lgrOpts))

	// Initialize the database.
	dbMgr, err := db.New(ko.MustString("app.db_path"), logger)
	if err != nil {
		logger.Error("Error initializing database", "error", err)
		os.Exit(1)
	}
	logger.Info("Successfully connected to the database and tables created", "path", ko.MustString("app.db_path"))

	// Initialize the OpenAI client.
	llmMgr, err := llm.New(ko.MustString("openai.token"), ko.String("openai.base_url"), ko.MustString("openai.model"), logger)
	if err != nil {
		logger.Error("Error initializing llm", "error", err)
		os.Exit(1)
	}
	logger.Info("Successfully initialized OpenAI client", "model", ko.MustString("openai.model"))

	// Create a context that is cancelled on SIGTERM or SIGINT
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	logger.Info("Starting the app", "version", buildString)

	// Initalise Telegram bot if enabled.
	if ko.Bool("telegram.enabled") {
		logger.Info("Telegram mode enabled")
		tgBot, err := tg.New(ko.MustString("telegram.token"), ko.Strings("telegram.allowed_users"), llmMgr, dbMgr, ko.Bool("telegram.debug"), logger)
		if err != nil {
			logger.Error("Error initializing telegram bot", "error", err)
			os.Exit(1)
		}
		if err := tgBot.Start(ctx); err != nil {
			logger.Error("Error starting telegram bot", "error", err)
			os.Exit(1)
		}
	}

	if ko.Bool("http.enabled") {
		logger.Info("HTTP mode enabled", "addr", ko.MustString("http.address"), "timeout", ko.MustDuration("http.timeout"))
		http := http.New(ko.MustString("http.address"), ko.MustDuration("http.timeout"), dbMgr, llmMgr, logger)
		if err := http.Start(ctx); err != nil {
			logger.Error("Error starting http server", "error", err)
			os.Exit(1)
		}
	}

	<-ctx.Done() // Wait for SIGINT or SIGTERM
	slog.Info("Shutting down!")
}
