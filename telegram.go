package main

import (
	"log/slog"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

func (a *App) handleCommands(message *tgbotapi.Message) {
	switch message.Command() {
	case "start":
		a.handleStart(message)
	case "track":
		a.handleTrack(message)
	default:
		a.handleUnknownCommand(message)
	}
}

func (a *App) handleStart(message *tgbotapi.Message) {
	msg := tgbotapi.NewMessage(message.Chat.ID, "Hello! I am a bot that can help you track your expenses. Use the /track command to start tracking your expenses.")
	a.botClient.Send(msg)
}

func (a *App) handleUnknownCommand(message *tgbotapi.Message) {
	msg := tgbotapi.NewMessage(message.Chat.ID, "Unknown command. Please use the /start command to get started.")
	a.botClient.Send(msg)
}

func (a *App) handleTrack(message *tgbotapi.Message) {
	slog.Info("Received track command", "chat_id", message.Chat.ID, "message", message.Text)
	if len(message.CommandArguments()) == 0 {
		a.botClient.Send(tgbotapi.NewMessage(message.Chat.ID, "Please provide the expenses in the format: /track <amount> <description>"))
		return
	}

	transactions, err := a.parseExpenses(message.CommandArguments())
	if err != nil {
		slog.Error("Error parsing expenses", "error", err)
		a.botClient.Send(tgbotapi.NewMessage(message.Chat.ID, "Error parsing expenses. Please try again."))
		return
	}
	// Save to database.
	if err := a.saveTransactions(transactions); err != nil {
		slog.Error("Error saving transactions", "error", err)
		a.botClient.Send(tgbotapi.NewMessage(message.Chat.ID, "Error saving transactions. Please try again."))
		return
	}

	a.botClient.Send(tgbotapi.NewMessage(message.Chat.ID, "Expenses saved successfully!"))
}
