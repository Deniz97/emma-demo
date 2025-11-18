OPS_HOST ?= root@91.99.239.20
APP_NAME ?= emma-demo
DEPLOY_DIR ?= /root/emma-demo
DOCKER_PORT ?= 3000

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

clean-vectors: ## Clean all vector data (app_data, class_data, method_data)
	@echo "Cleaning vector data..."
	@npx prisma db execute --stdin <<< "TRUNCATE TABLE app_data CASCADE; TRUNCATE TABLE class_data CASCADE; TRUNCATE TABLE method_data CASCADE;"
	@echo "✓ Vector data cleaned"

clean-prompts: ## Clean all default prompts
	@echo "Cleaning default prompts..."
	@npx prisma db execute --stdin <<< "TRUNCATE TABLE default_prompts CASCADE;"
	@echo "✓ Default prompts cleaned"

clean-all-data: ## Clean all data (tools, vectors, prompts, chats)
	@echo "⚠️  This will delete ALL data from the database"
	@echo "Cleaning all data..."
	@npx prisma db execute --stdin <<< "TRUNCATE TABLE app_data, class_data, method_data, default_prompts, chat_messages, chats, users, methods, classes, apps, categories CASCADE;"
	@echo "✓ All data cleaned"

# Vector and metadata population
populate-vectors: ## Populate vectors for entities without vectors (usage: make populate-vectors limit=10 for total limit)
	@if [ -z "$(limit)" ]; then \
		npm run populate-vectors -- --all; \
	else \
		npm run populate-vectors -- --all --limit $(limit); \
	fi

regenerate-metadata: ## Regenerate metadata for all entities (usage: make regenerate-metadata)
	npm run regenerate-metadata -- --all

# Default prompts
generate-prompts: ## Generate default prompts (usage: make generate-prompts limit=10)
	@if [ -z "$(limit)" ]; then \
		npx tsx scripts/generate-default-prompts.ts --limit 10; \
	else \
		npx tsx scripts/generate-default-prompts.ts --limit $(limit); \
	fi

test-prompts: ## Test default prompts (usage: make test-prompts [limit=N] [id=ID] [csv=yes] [csvfile=name.csv])
	@CMD="npx tsx scripts/test-default-prompts.ts"; \
	if [ -n "$(id)" ]; then \
		CMD="$$CMD --prompt-id $(id)"; \
	fi; \
	if [ -n "$(limit)" ]; then \
		CMD="$$CMD --limit $(limit)"; \
	fi; \
	if [ "$(csv)" = "yes" ]; then \
		if [ -n "$(csvfile)" ]; then \
			CMD="$$CMD --csv $(csvfile)"; \
		else \
			CMD="$$CMD --csv"; \
		fi; \
	fi; \
	echo "Running: $$CMD"; \
	eval $$CMD

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

# Docker deployment commands
deploy-build: ## Build Docker image on remote host
	@echo "Building Docker image on $(OPS_HOST)..."
	ssh $(OPS_HOST) "cd $(DEPLOY_DIR) && export \$$(grep -v '^#' .env | xargs) && git pull https://\$$GITHUB_PAT@github.com/Deniz97/emma-demo.git && docker build --build-arg DATABASE_URL=\"\$$DATABASE_URL\" -t $(APP_NAME) ."

deploy-run: ## Stop old container and run new one
	@echo "Deploying container on $(OPS_HOST)..."
	ssh $(OPS_HOST) "docker stop $(APP_NAME) 2>/dev/null || true && docker rm $(APP_NAME) 2>/dev/null || true && docker run -d --name $(APP_NAME) --restart unless-stopped -p $(DOCKER_PORT):3000 --env-file $(DEPLOY_DIR)/.env $(APP_NAME)"
	@echo "✓ Deployed on http://$(shell echo $(OPS_HOST) | cut -d@ -f2):$(DOCKER_PORT)"

deploy: ## Full deploy: build and run
	@$(MAKE) deploy-build
	@$(MAKE) deploy-run

deploy-logs: ## View container logs
	ssh $(OPS_HOST) "docker logs -f $(APP_NAME)"

deploy-shell: ## SSH into the deployment host
	ssh $(OPS_HOST)

deploy-status: ## Check deployment status
	@echo "Checking deployment status on $(OPS_HOST)..."
	ssh $(OPS_HOST) "docker ps -a | grep $(APP_NAME) || echo 'Container not found'"

deploy-restart: ## Restart the container
	ssh $(OPS_HOST) "docker restart $(APP_NAME)"

deploy-stop: ## Stop the container
	ssh $(OPS_HOST) "docker stop $(APP_NAME)"

deploy-env: ## Copy .env.prod to .env on server
	@if [ ! -f .env.prod ]; then \
		echo "Error: .env.prod file not found in current directory"; \
		exit 1; \
	fi
	@echo "Copying .env.prod to $(OPS_HOST):$(DEPLOY_DIR)/.env..."
	scp .env.prod $(OPS_HOST):$(DEPLOY_DIR)/.env
	@echo "✓ Environment file updated on server"