package main

type Item struct {
	Currency    string  `json:"currency"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
}

type Transactions struct {
	Transactions []Item `json:"transactions"`
}
