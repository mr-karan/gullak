# AGENTS.md

## Commands
- **Build**: `make build` (builds Go binary with embedded Vue UI)
- **Run**: `make run` or `make fresh` (builds and runs)
- **Test**: No tests currently implemented (`go test ./...` will show no tests)
- **Generate SQL**: `make gen-sql` (uses sqlc to generate Go code from SQL)
- **Format**: `gofmt -w .` (Go formatting)
- **UI Dev**: `cd ui && pnpm dev` (start Vue dev server with API proxy to Go server - ensure Go server is running on :3333)
- **UI Build**: `cd ui && pnpm build` (build Vue UI for embedding, includes TypeScript checking)
- **UI Install**: `cd ui && pnpm install` (install UI dependencies)

## Code Style
- **Go**: Follow effective Go guidelines; use sqlc for database queries; explicit error returns
- **Vue/TypeScript**: Use Vue 3 Composition API; TypeScript for type safety; DaisyUI for components
- **Naming**: snake_case for SQL/database fields; PascalCase for Go structs/types; camelCase for JS/TS
- **Imports**: Standard library first, then third-party, then local packages (Go); ES6 imports (Vue)
- **Error Handling**: Return errors explicitly in Go functions; try/catch in JS/Vue
- **Database**: SQLite with sqlc-generated queries; use prepared statements
- **Architecture**: Clean separation between handlers, store, and database layers
- **UI**: DaisyUI 5 components; Tailwind CSS for styling; responsive design