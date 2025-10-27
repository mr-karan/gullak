package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/mr-karan/gullak/pkg/models"

	"github.com/sashabaranov/go-openai"
	"github.com/sashabaranov/go-openai/jsonschema"
)

type Manager struct {
	log    *slog.Logger
	client *openai.Client
	model  string
}

// Prompt templates for different input types
type PromptConfig struct {
	InputType            string
	BaseInstructions     string
	SpecificInstructions string
}

// Common expense categories for consistent categorization
var commonCategories = []string{
	"food", "groceries", "dining", "restaurant", "lunch", "dinner", "snacks",
	"travel", "transport", "taxi", "uber", "bus", "train", "flight", "hotel",
	"entertainment", "movies", "games", "music", "books",
	"shopping", "clothes", "electronics", "household", "personal",
	"healthcare", "medical", "pharmacy", "doctor", "hospital",
	"utilities", "electricity", "water", "gas", "internet", "phone",
	"education", "courses", "books", "school", "tuition",
	"business", "work", "office", "supplies", "professional",
	"other", "miscellaneous", "general",
}

func New(token, baseURL, model string, timeout time.Duration, log *slog.Logger) (*Manager, error) {
	// Initialize the OpenAI client.
	cfg := openai.DefaultConfig(token)
	if baseURL != "" {
		cfg.BaseURL = baseURL
	}

	if timeout > 0 {
		cfg.HTTPClient = &http.Client{Timeout: timeout}
	} else {
		// Set a default timeout of 60 seconds for AI processing.
		cfg.HTTPClient = &http.Client{Timeout: 60 * time.Second}
	}

	client := openai.NewClientWithConfig(cfg)

	return &Manager{
		client: client,
		model:  model,
		log:    log,
	}, nil

}

// Parse the message and extract the expenses.
func (m *Manager) Parse(msg string, defaultCurrency string, existingCategories []string) (models.Transactions, error) {
	if msg == "" {
		return models.Transactions{}, errors.New("empty message")
	}

	m.log.Debug("Parsing expenses", "message", msg, "categories", len(existingCategories))
	systemPrompt := m.generateSystemPrompt("text", defaultCurrency, existingCategories)
	userPrompt := m.generateUserPrompt("text", msg)

	dialogue := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
		{Role: openai.ChatMessageRoleUser, Content: userPrompt},
	}

	resp, err := m.client.CreateChatCompletion(context.TODO(),
		openai.ChatCompletionRequest{
			Model:    m.model,
			Messages: dialogue,
			Tools:    []openai.Tool{m.getExpenseParsingTool(existingCategories)},
		},
	)

	if err != nil || len(resp.Choices) != 1 {
		m.log.Error("Completion error", "error", err, "choices", len(resp.Choices))
		return models.Transactions{}, fmt.Errorf("error completing the request")
	}

	var transactions models.Transactions

	for _, choice := range resp.Choices {
		for _, toolCall := range choice.Message.ToolCalls {
			if toolCall.Function.Name == "categorize_expenses" {
				if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &transactions); err != nil {
					return models.Transactions{}, fmt.Errorf("error unmarshalling response: %s", err)
				}
				return transactions, nil
			}
		}
	}

	if len(transactions.Transactions) == 0 {
		for _, choice := range resp.Choices {
			if choice.FinishReason == "stop" {
				return models.Transactions{}, &NoValidTransactionError{Message: choice.Message.Content}
			}
		}
	}

	return models.Transactions{}, fmt.Errorf("no valid transactions found in response")
}

// getExpenseParsingTool returns the function definition for expense parsing with improved schema
func (m *Manager) getExpenseParsingTool(existingCategories []string) openai.Tool {
	categoryDescription := "Expense category. IMPORTANT: Prefer using existing categories if relevant, only create new categories when necessary."
	if len(existingCategories) > 0 {
		categoryDescription = fmt.Sprintf("Expense category. MUST use one of these existing categories if applicable: %s. Only create a new category if none of these fit.", strings.Join(existingCategories, ", "))
	} else {
		categoryDescription = fmt.Sprintf("Expense category. Common categories include: %s. Use these as a guide or create appropriate categories.", m.formatCategories())
	}

	fnCategorizeExpenses := openai.FunctionDefinition{
		Name:        "categorize_expenses",
		Description: "Extract and categorize expense transactions from the input. Return all valid expenses found.",
		Parameters: jsonschema.Definition{
			Type: jsonschema.Object,
			Properties: map[string]jsonschema.Definition{
				"transactions": {
					Type:        jsonschema.Array,
					Description: "Array of all expense transactions found in the input",
					Items: &jsonschema.Definition{
						Type: jsonschema.Object,
						Properties: map[string]jsonschema.Definition{
							"transaction_date": {
								Type:        jsonschema.String,
								Description: "Transaction date in YYYY-MM-DD format. Use today's date if not specified in the input.",
							},
							"amount": {
								Type:        jsonschema.Number,
								Description: "Exact monetary amount of the expense. Include all fees, taxes, and charges.",
							},
							"currency": {
								Type:        jsonschema.String,
								Description: "Three-letter ISO currency code (USD, INR, EUR, GBP, etc.). IMPORTANT: Detect currency from context (symbols like $, ₹, €, £, or explicit mentions). Only use default currency if currency is completely unspecified.",
							},
							"category": {
								Type:        jsonschema.String,
								Description: categoryDescription,
							},
							"description": {
								Type:        jsonschema.String,
								Description: "Clear, concise description of what was purchased or the expense purpose. Include merchant name if available.",
							},
						},
						Required: []string{"transaction_date", "amount", "currency", "category", "description"},
					},
				},
			},
			Required: []string{"transactions"},
		},
	}

	return openai.Tool{
		Type:     openai.ToolTypeFunction,
		Function: &fnCategorizeExpenses,
	}
}

// parseToolResponse extracts transactions from tool call responses
func (m *Manager) parseToolResponse(choice openai.ChatCompletionChoice) (models.Transactions, error) {
	for _, toolCall := range choice.Message.ToolCalls {
		if toolCall.Function.Name == "categorize_expenses" {
			var transactions models.Transactions
			if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &transactions); err != nil {
				return models.Transactions{}, fmt.Errorf("error unmarshalling response: %w", err)
			}
			return transactions, nil
		}
	}

	// Check for stop reason with no valid transactions
	if choice.FinishReason == "stop" && choice.Message.Content != "" {
		return models.Transactions{}, &NoValidTransactionError{Message: choice.Message.Content}
	}

	return models.Transactions{}, fmt.Errorf("no valid transactions found in response")
}

// generateSystemPrompt creates a comprehensive system prompt for expense extraction
func (m *Manager) generateSystemPrompt(inputType string, defaultCurrency string, existingCategories []string) string {
	today := time.Now().Format("2006-01-02")
	if defaultCurrency == "" {
		defaultCurrency = "INR"
	}

	categoryGuidance := ""
	if len(existingCategories) > 0 {
		categoryGuidance = fmt.Sprintf(`
## Category Selection (CRITICAL):
You have access to the user's existing categories: %s

**Rules for categories:**
1. ALWAYS try to match one of the existing categories first
2. Use exact category names (case-sensitive matching preferred)
3. Only create a NEW category if none of the existing categories are relevant
4. When creating new categories, use lowercase, single-word names when possible
5. Be consistent - if user has "food", use "food" not "dining" or "restaurant"

Examples:
- If user has "groceries" and input is "bought vegetables", use "groceries"
- If user has "transport" and input is "uber ride", use "transport"
- If user has "food" and input is "lunch at restaurant", use "food"`, strings.Join(existingCategories, ", "))
	} else {
		categoryGuidance = fmt.Sprintf(`
## Category Selection:
Use common expense categories like: %s
- Use lowercase, descriptive category names
- Be consistent with similar expenses
- Prefer general categories over very specific ones`, m.formatCategories())
	}

	basePrompt := fmt.Sprintf(`You are an expert expense parser. Your task is to extract and categorize expense information from text input.

## Core Instructions:
1. Extract ALL expense transactions mentioned in the input
2. For each expense, identify: date, amount, currency, category, and description
3. Use today's date (%s) if no specific date is mentioned
4. Your default currency is %s, but DETECT actual currency from input
5. Be precise with amounts - include taxes, tips, and all fees
6. Return an error if no valid expense information is found
%s

## Currency Detection (IMPORTANT):
- ALWAYS detect currency from context first before using default
- Look for currency symbols: $ (USD), ₹ (INR), € (EUR), £ (GBP), ¥ (JPY/CNY)
- Look for explicit currency mentions: "dollars", "rupees", "euros", "pounds"
- Examples:
  * "spent $50" → USD (not %s!)
  * "paid €20" → EUR (not %s!)
  * "₹500 for groceries" → INR
  * "bought lunch for 15 pounds" → GBP
- Only use default currency (%s) if NO currency indicators are present

## Important Rules:
- Only extract actual expenses/purchases, not income or refunds
- Combine related items into single transactions when they form one purchase
- Use descriptive but concise descriptions
- If amounts include multiple items, create separate transactions
- Validate that extracted data makes logical sense
- Be conservative - only extract what's clearly an expense

## Text Input Formats Supported:
- Natural language: "spent $50 on lunch", "bought groceries for ₹500"
- Shorthand: "lunch 20", "uber 15 dollars", "coffee 5€"
- Multi-currency: "paid $100 for hotel and €50 for dinner"
- Dates: "yesterday spent 500", "on Monday bought 1000 worth of groceries"

## Output Format:
Use the provided function to return structured expense data.`, today, defaultCurrency, categoryGuidance, defaultCurrency, defaultCurrency, defaultCurrency)

	return basePrompt
}

// generateUserPrompt creates the user-facing prompt based on input type
func (m *Manager) generateUserPrompt(inputType string, content string) string {
	return fmt.Sprintf("Please extract all expenses from this text: %s", content)
}

// formatCategories returns a formatted string of common categories
func (m *Manager) formatCategories() string {
	return strings.Join(commonCategories, ", ")
}

type NoValidTransactionError struct {
	Message string
}

func (e *NoValidTransactionError) Error() string {
	return e.Message
}
