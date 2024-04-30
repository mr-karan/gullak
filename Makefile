.PHONY: build run

BIN := bin/expenseai.bin

build:
	go build -o $(BIN) .

run: build
	./$(BIN)
