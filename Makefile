# ─────────────────────────────────────────────────────────────────────────────
# TAX ME — convenience targets
# ─────────────────────────────────────────────────────────────────────────────

.DEFAULT_GOAL := help
.PHONY: help env dev build up down logs ps shell-backend clean install

help:            ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Local development (no Docker) ─────────────────────────────────────────────

install:         ## Install all dependencies (Python + Node)
	pip install -r backend-python/requirements.txt
	npm install --prefix frontend

dev:             ## Run backend + frontend with hot-reload (local)
	npm run dev

# ── Docker — production ────────────────────────────────────────────────────────

build:           ## Build production Docker images
	docker compose build

up:              ## Start production stack in the background
	docker compose up -d

down:            ## Stop production stack
	docker compose down

logs:            ## Tail logs from all containers
	docker compose logs -f

ps:              ## Show running container status
	docker compose ps

shell-backend:   ## Open a shell inside the running backend container
	docker compose exec backend bash

# ── Docker — development ───────────────────────────────────────────────────────

dev-docker:      ## Start development stack with hot-reload volumes
	docker compose -f docker-compose.dev.yml up

dev-build:       ## Rebuild development images
	docker compose -f docker-compose.dev.yml build

# ── Utilities ──────────────────────────────────────────────────────────────────

env:             ## Create .env from .env.example (safe — won't overwrite)
	@test -f .env && echo ".env already exists." || (cp .env.example .env && echo ".env created — edit before running.")

clean:           ## Remove containers, volumes, and dangling images
	docker compose down -v --remove-orphans
	docker image prune -f
