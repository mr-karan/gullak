package main

import (
	"context"
	"embed"
	"flag"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/mr-karan/expenseai/internal/llm"
)

var (
	buildString = "unknwown"
)

//go:embed ui/dist/*
var content embed.FS

func main() {
	cfgPath := flag.String("config", "config.toml", "File path to the config file")
	flag.Parse()

	// Initialize the configuration.
	ko, err := initConfig(*cfgPath)
	if err != nil {
		slog.Error("Error initializing config", "error", err)
		os.Exit(1)
	}

	// Create a sub filesystem from the embedded files to directly access dist contents
	// We do this so that `ui/dist/` becomes the root directory for the file server.
	subFS, err := fs.Sub(content, "ui/dist")
	if err != nil {
		slog.Error("Failed to create sub filesystem", "error", err)
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
	db, err := initDB(ko.MustString("app.db_path"))
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

	logger.Info("Starting the app", "version", buildString, "addr", ko.MustString("http.address"), "timeout", ko.MustDuration("http.timeout"))

	app := initApp(
		ko.MustString("http.address"),
		ko.MustDuration("http.timeout"),
		subFS,
		db,
		llmMgr,
		logger,
	)
	if err := app.Start(ctx); err != nil {
		logger.Error("Error starting http server", "error", err)
		os.Exit(1)
	}

	<-ctx.Done() // Wait for SIGINT or SIGTERM
	slog.Info("Shutting down!")
}
