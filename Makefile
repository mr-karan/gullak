.PHONY: build run

BIN := bin/expenseai.bin

LAST_COMMIT := $(shell git rev-parse --short HEAD)
LAST_COMMIT_DATE := $(shell git show -s --format=%ci ${LAST_COMMIT})
VERSION := $(shell git describe --tags)
BUILDSTR := ${VERSION} (Commit: ${LAST_COMMIT_DATE} (${LAST_COMMIT}), Build: $(shell date +"%Y-%m-%d% %H:%M:%S %z"))

.PHONY: build-ui
build-ui:
	cd ui && yarn install && yarn build

.PHONY: build
build: build-ui
	CGO_ENABLED=1 go build -o ${BIN} -ldflags="-X 'main.buildString=${BUILDSTR}'" .

.PHONY: run
run: build ## Run binary.
	./${BIN}


.PHONY: clean
clean: ## Remove temporary files and the `bin` folder.
	rm -rf bin

.PHONY: fresh
fresh: build run

.PHONY: gen-sql
gen-sql: ## Generate SQL queries using sqlc.
	sqlc generate
