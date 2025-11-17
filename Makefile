OPS_HOST ?= root@91.99.239.20

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

seed: ## Seed database with mock tools (usage: make seed limit=3 to limit number of apps)
	@if [ -z "$(limit)" ]; then \
		npx prisma db seed; \
	else \
		npx tsx prisma/seed.ts --limit=$(limit); \
	fi

clean-tools: ## Clean all tool data (apps, classes, methods)
	npx tsx scripts/clean-tools.ts

# Vector and metadata population
populate-vectors: ## Populate vectors for all entities (usage: make populate-vectors limit=5 to limit methods)
	@if [ -z "$(limit)" ]; then \
		npm run populate-vectors -- --all; \
	else \
		npm run populate-vectors -- --all --limit $(limit); \
	fi

regenerate-metadata: ## Regenerate metadata for all entities (usage: make regenerate-metadata)
	npm run regenerate-metadata -- --all

# Database lock management
release-lock: ## Release stuck Prisma migration advisory locks
	npx tsx scripts/release-migration-lock.ts

# SSH and database operations
ssh: ## SSH into the ops server
	ssh $(OPS_HOST)

db-psql: ## Connect to PostgreSQL via SSH
	ssh $(OPS_HOST) "psql -U postgres -d emma_demo"

db-check-locks: ## Check for advisory locks on the database
	ssh $(OPS_HOST) "psql -U postgres -d emma_demo -c \"SELECT pid, locktype, objid, mode, granted FROM pg_locks WHERE locktype = 'advisory' AND objid = 72707369;\""

db-release-locks: ## Release all advisory locks on the database
	ssh $(OPS_HOST) "psql -U postgres -d emma_demo -c \"SELECT pg_advisory_unlock_all();\""