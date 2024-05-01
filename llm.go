package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/sashabaranov/go-openai"
	"github.com/sashabaranov/go-openai/jsonschema"
)

// Parse the message and extract the expenses.
func (a *App) parseExpenses(msg string) (Transactions, error) {
	slog.Debug("Parsing expenses", "message", msg)
	dialogue := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: "Categorize my expenses"},
		{Role: openai.ChatMessageRoleUser, Content: msg},
	}

	fnCategorizeExpenses := openai.FunctionDefinition{
		Name:        "categorize_expense",
		Description: "Categorize expenses from the given input",
		Parameters: jsonschema.Definition{
			Type: jsonschema.Object,
			Properties: map[string]jsonschema.Definition{
				"transactions": {
					Type:        jsonschema.Array,
					Description: "List of items purchased",
					Items: &jsonschema.Definition{
						Type: jsonschema.Object,
						Properties: map[string]jsonschema.Definition{
							"currency": {
								Type:        jsonschema.String,
								Description: "Currency of the amount (e.g. INR, USD, EUR). Default is INR unless specified otherwise",
							},
							"amount": {
								Type:        jsonschema.Number,
								Description: "Amount of the item",
							},
							"category": {
								Type:        jsonschema.String,
								Description: "One word category of the expense (e.g., food, travel, entertainment)",
							},
							"description": {
								Type:        jsonschema.String,
								Description: "Concise and short description of the item",
							},
							"mode": {
								Type:        jsonschema.String,
								Description: "Payment mode of the transaction (e.g., cash, card, upi, netbanking). Default is cash unless specified otherwise",
							},
						},
						Required: []string{"currency", "amount", "category", "description", "mode"},
					},
				},
			},
			Required: []string{"transactions"},
		},
	}

	t := openai.Tool{
		Type:     openai.ToolTypeFunction,
		Function: &fnCategorizeExpenses,
	}

	resp, err := a.openaiClient.CreateChatCompletion(context.TODO(),
		openai.ChatCompletionRequest{
			Model:    a.model,
			Messages: dialogue,
			Tools:    []openai.Tool{t},
		},
	)

	if err != nil || len(resp.Choices) != 1 {
		slog.Error("Completion error", "error", err, "choices", len(resp.Choices))
		return Transactions{}, fmt.Errorf("error completing the request")
	}

	var transactions Transactions

	for _, choice := range resp.Choices {
		for _, toolCall := range choice.Message.ToolCalls {
			if toolCall.Function.Name == fnCategorizeExpenses.Name {
				if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &transactions); err != nil {
					return Transactions{}, fmt.Errorf("error unmarshalling response: %s", err)
				}

				return transactions, nil
			}
		}
	}

	return Transactions{}, fmt.Errorf("error parsing the response")
}
