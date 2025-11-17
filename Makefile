deps:
	npm install

dev:
	npm run dev

build:
	npm run build

lint:
	npm run format
	npm run lint



clean: ## Clean node_modules and build artifacts
	rm -rf node_modules
	rm -rf .next
	rm -rf dist



# Database commands
db-status: ## Check database connection status
	npx prisma db push --preview-feature || echo "Database not accessible"

# Migration management commands
migrate: ## Create and apply migration (usage: make migrate name=migration_name)
	@if [ -z "$(name)" ]; then echo "Usage: make migrate name=migration_name"; exit 1; fi
	npx prisma migrate dev --name $(name)

migrate-apply: ## Apply pending migrations to database
	npx prisma migrate deploy

migrate-create-only: ## Create migration file without applying (usage: make migrate-create-only name=migration_name)
	@if [ -z "$(name)" ]; then echo "Usage: make migrate-create-only name=migration_name"; exit 1; fi
	npx prisma migrate dev --create-only --name $(name)

db-reset:
	npx prisma migrate reset

generate: ## Generate Prisma client
	npx prisma generate