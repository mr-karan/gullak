package telegram

import (
	"context"
	"log/slog"

	db "github.com/mr-karan/expenseai/internal/db"
	llm "github.com/mr-karan/expenseai/internal/llm"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type Manager struct {
	log          *slog.Logger
	client       *tgbotapi.BotAPI
	allowedUsers map[string]bool
	llm          *llm.Manager
	db           *db.Manager
}

func New(botToken string, allowedUsers []string, llm *llm.Manager, db *db.Manager, verbose bool, log *slog.Logger) (*Manager, error) {
	bot, err := tgbotapi.NewBotAPI(botToken)
	if err != nil {
		return nil, err
	}

	if verbose {
		bot.Debug = true
	}

	// Initialize the allowed users map.
	allowedUsersMap := make(map[string]bool)
	for _, user := range allowedUsers {
		allowedUsersMap[user] = true
	}

	return &Manager{
		client:       bot,
		allowedUsers: allowedUsersMap,
		log:          log,
		llm:          llm,
		db:           db,
	}, nil
}

func (m *Manager) Start(ctx context.Context) error {
	go func() {
		updateConfig := tgbotapi.NewUpdate(0)
		updateConfig.Timeout = 30
		updates := m.client.GetUpdatesChan(updateConfig)

		m.log.Info("Telegram bot started polling updates", "bot_name", m.client.Self.UserName)
		for {
			select {
			case update := <-updates:
				if update.Message != nil && update.Message.IsCommand() {
					m.handleCommands(update.Message)
				}
			case <-ctx.Done():
				m.log.Info("Stopping Telegram bot updates")
				return
			}
		}
	}()

	return nil
}

func (m *Manager) handleCommands(message *tgbotapi.Message) {
	// Check if message is from allowed users.
	if !m.allowedUsers[message.From.UserName] {
		m.log.Warn("Unauthorized user", "user", message.From.UserName)
		m.client.Send(tgbotapi.NewMessage(message.Chat.ID, "You are not authorized to use this bot."))
		return
	}

	switch message.Command() {
	case "start":
		m.handleStart(message)
	case "track":
		m.handleTrack(message)
	default:
		m.handleUnknownCommand(message)
	}
}

func (m *Manager) handleStart(message *tgbotapi.Message) {
	msg := tgbotapi.NewMessage(message.Chat.ID, "Hello! I am a bot that can help you track your expenses. Use the /track command to start tracking your expenses.")
	m.client.Send(msg)
}

func (m *Manager) handleUnknownCommand(message *tgbotapi.Message) {
	msg := tgbotapi.NewMessage(message.Chat.ID, "Unknown command. Please use the /start command to get started.")
	m.client.Send(msg)
}

func (m *Manager) handleTrack(message *tgbotapi.Message) {
	m.log.Info("Received track command", "chat_id", message.Chat.ID, "message", message.Text)
	if len(message.CommandArguments()) == 0 {
		m.client.Send(tgbotapi.NewMessage(message.Chat.ID, "Please provide the expenses in the format: /track <amount> <description>"))
		return
	}

	// Parse the expenses.
	transactions, err := m.llm.Parse(message.CommandArguments())
	if err != nil {
		m.log.Error("Error parsing expenses", "error", err)
		m.client.Send(tgbotapi.NewMessage(message.Chat.ID, "Error parsing expenses. Please try again."))
		return
	}
	// Save to database.
	if err := m.db.Save(transactions); err != nil {
		m.log.Error("Error saving transactions", "error", err)
		m.client.Send(tgbotapi.NewMessage(message.Chat.ID, "Error saving transactions. Please try again."))
		return
	}

	m.client.Send(tgbotapi.NewMessage(message.Chat.ID, "Expenses saved successfully!"))
}
