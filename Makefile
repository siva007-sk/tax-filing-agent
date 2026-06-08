# ─────────────────────────────────────────────────────────────────────────────
# TAX ME — convenience targets
# ─────────────────────────────────────────────────────────────────────────────

.DEFAULT_GOAL := help
.PHONY: help env dev build up down logs ps shell-backend clean install deploy-info

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

up:              ## Start production stack — HTTPS on port 443, HTTP redirects to HTTPS
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

deploy-info:     ## Print the EC2 deploy steps
	@echo ""
	@echo "  1. Push this repo to GitHub (git push)"
	@echo "  2. Launch EC2 (Ubuntu 22.04, t3.small, SG: 22/80/443 open)"
	@echo "  3. Allocate an Elastic IP and associate it with the instance"
	@echo "  4. SSH in:  ssh -i <key.pem> ubuntu@<elastic-ip>"
	@echo "  5. Run:     bash <(curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy.sh) <repo-clone-url>"
	@echo "  6. Edit:    sudo nano /opt/tax-agent/.env  (set LLM_URL etc.)"
	@echo "  7. Start:   cd /opt/tax-agent && sudo make build && sudo make up"
	@echo "  8. Open:    https://<elastic-ip>  (accept the self-signed cert warning)"
	@echo ""
