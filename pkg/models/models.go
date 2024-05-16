package models

type Item struct {
	Date        string  `json:"date"`
	Currency    string  `json:"currency"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Mode        string  `json:"mode"`
}

type Transactions struct {
	Transactions []Item `json:"transactions"`
}
