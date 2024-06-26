package models

type Item struct {
	ID              int64   `json:"id"`
	CreatedAt       string  `json:"created_at"`
	TransactionDate string  `json:"transaction_date"`
	Currency        string  `json:"currency"`
	Amount          float64 `json:"amount"`
	Category        string  `json:"category"`
	Description     string  `json:"description"`
	Confirm         bool    `json:"confirm"`
	Location 		string	 `json:"location"`
}

type Transactions struct {
	Transactions []Item `json:"transactions"`
}
