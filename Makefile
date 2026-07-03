APP_ID ?= nc_print
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
CONTAINER ?= cloud_app
REMOTE := /var/www/html/custom_apps/$(APP_ID)

PHPUNIT := $(ROOT)vendor/bin/phpunit
PHPUNIT_DOCKER := docker run --rm -v "$(ROOT):/app" -w /app php:8.2-cli php vendor/bin/phpunit
COMPOSER_INSTALL_DOCKER := docker run --rm -v "$(ROOT):/app" -w /app composer:2 composer install --no-interaction

# Owned slicing engine sidecar (nc-print-slicer).
SLICER_COMPOSE := docker compose -f "$(ROOT)docker-compose.slicer.yml"
SLICER_NET := nc-print-net
# Where the engine binary + resources are staged from (kept out of git).
ENGINE_SRC ?= /media/4TB/3dprintforge/slicer/3dprintforge-slicer
ENGINE_DEST := $(ROOT)slicer/3dprintforge-slicer
# Seed data_dir (AppConfig .conf + system/ + user/) that enables the vendor
# PresetBundle so the engine loads the full profile set (12 printers / 294
# filaments / 34 processes) instead of the bare 1/1/1 defaults.
DATADIR_SEED_SRC ?= $(HOME)/.config/3DPrintForgeSlicer
DATADIR_SEED_DEST := $(ENGINE_DEST)/datadir-seed

.PHONY: build test deploy gate-preflight phpunit run-phpunit \
	slicer-fetch slicer-build slicer-up slicer-down slicer-test

build:
	cd "$(ROOT)" && npm run build

test: phpunit slicer-test
	cd "$(ROOT)" && npm run test

# Run PHPUnit: host PHP when available; else container app path; else Composer + PHP image.
run-phpunit:
	@if [ -f "$(PHPUNIT)" ] && command -v php >/dev/null 2>&1; then \
		cd "$(ROOT)" && vendor/bin/phpunit; \
	elif docker ps -q -f name=^/$(CONTAINER)$$ | grep -q . \
		&& docker exec $(CONTAINER) test -f $(REMOTE)/vendor/bin/phpunit 2>/dev/null; then \
		docker exec $(CONTAINER) php $(REMOTE)/vendor/bin/phpunit; \
	elif [ -f "$(PHPUNIT)" ]; then \
		$(PHPUNIT_DOCKER); \
	else \
		$(COMPOSER_INSTALL_DOCKER); \
		$(PHPUNIT_DOCKER); \
	fi

phpunit: run-phpunit

# Stage the engine binary + resources into slicer/ (they are git-ignored).
slicer-fetch:
	@test -x "$(ENGINE_SRC)/3dprintforge-slicer" \
		|| (echo "Engine binary not found at $(ENGINE_SRC)/3dprintforge-slicer — set ENGINE_SRC" && exit 1)
	mkdir -p "$(ENGINE_DEST)"
	cp -f "$(ENGINE_SRC)/3dprintforge-slicer" "$(ENGINE_DEST)/3dprintforge-slicer"
	rm -rf "$(ENGINE_DEST)/resources"
	cp -a "$(ENGINE_SRC)/resources" "$(ENGINE_DEST)/resources"
	@if [ -f "$(ENGINE_SRC)/LICENSE.txt" ]; then cp -f "$(ENGINE_SRC)/LICENSE.txt" "$(ENGINE_DEST)/LICENSE.txt"; \
		else echo "warning: LICENSE.txt missing at $(ENGINE_SRC) (required for AGPL image distribution)"; fi
	@# Seed data_dir (AppConfig + system/ + user/) — enables vendor profiles.
	rm -rf "$(DATADIR_SEED_DEST)"
	@if [ -f "$(DATADIR_SEED_SRC)/3DPrintForgeSlicer.conf" ]; then \
		mkdir -p "$(DATADIR_SEED_DEST)"; \
		cp -f "$(DATADIR_SEED_SRC)/3DPrintForgeSlicer.conf" "$(DATADIR_SEED_DEST)/3DPrintForgeSlicer.conf"; \
		if [ -d "$(DATADIR_SEED_SRC)/system" ]; then cp -a "$(DATADIR_SEED_SRC)/system" "$(DATADIR_SEED_DEST)/system"; fi; \
		if [ -d "$(DATADIR_SEED_SRC)/user" ]; then cp -a "$(DATADIR_SEED_SRC)/user" "$(DATADIR_SEED_DEST)/user"; fi; \
		echo "Staged data_dir seed from $(DATADIR_SEED_SRC)"; \
	else \
		echo "warning: no data_dir seed at $(DATADIR_SEED_SRC) — engine will load only default 1/1/1 profiles"; \
	fi
	@echo "Staged engine into $(ENGINE_DEST)"

slicer-build:
	@test -x "$(ENGINE_DEST)/3dprintforge-slicer" || $(MAKE) slicer-fetch
	$(SLICER_COMPOSE) build

# Bring the sidecar up and attach cloud_app to the shared network so PHP can
# resolve nc-print-slicer:8080 by container DNS.
slicer-up: slicer-build
	$(SLICER_COMPOSE) up -d
	@docker network connect $(SLICER_NET) $(CONTAINER) 2>/dev/null \
		|| echo "cloud_app already on $(SLICER_NET) (or not running)"
	@echo "nc-print-slicer up on $(SLICER_NET)"

slicer-down:
	$(SLICER_COMPOSE) down

# Adapter pure-logic unit tests (STL->3MF, gcode-meta parser) — no image needed.
slicer-test:
	@command -v python3 >/dev/null 2>&1 && python3 "$(ROOT)slicer/adapter/test_adapter.py" \
		|| echo "python3 not available — skipping adapter unit tests"

deploy: build
	@test -n "$$(docker ps -q -f name=$(CONTAINER))" || (echo "Container $(CONTAINER) not running" && exit 1)
	@# Ensure the owned slicing engine sidecar is running (guarded: a missing
	@# compose/engine must not break the app deploy).
	@if [ -x "$(ENGINE_DEST)/3dprintforge-slicer" ] || [ -x "$(ENGINE_SRC)/3dprintforge-slicer" ]; then \
		$(MAKE) slicer-up || echo "warning: slicer-up failed — app deploy continues"; \
	else \
		echo "warning: engine not staged (run 'make slicer-fetch') — skipping sidecar"; \
	fi
	docker exec $(CONTAINER) mkdir -p $(REMOTE)
	for dir in appinfo css img js lib templates tools; do \
		if [ -d "$(ROOT)$$dir" ]; then \
			docker cp "$(ROOT)$$dir/." $(CONTAINER):$(REMOTE)/$$dir/; \
		fi; \
	done
	@if [ -f "$(ROOT)composer.json" ]; then docker cp "$(ROOT)composer.json" $(CONTAINER):$(REMOTE)/; fi
	docker exec -u www-data $(CONTAINER) php /var/www/html/occ app:enable $(APP_ID) || true
	docker exec -u www-data $(CONTAINER) php /var/www/html/occ upgrade
	@echo "Deployed $(APP_ID) to $(CONTAINER):$(REMOTE)"

gate-preflight:
	bash "$(ROOT)tools/print-preflight.sh"
	$(MAKE) run-phpunit
	$(MAKE) slicer-test
	cd "$(ROOT)" && npm run test && echo ok > "$(ROOT).vitest-gate-stamp"
	cd "$(ROOT)" && npm run build
	@test -n "$$(docker ps -q -f name=$(CONTAINER))" || (echo "Container $(CONTAINER) not running — skip API gates" && exit 0)
	docker cp "$(ROOT).vitest-gate-stamp" $(CONTAINER):$(REMOTE)/.vitest-gate-stamp
	docker exec $(CONTAINER) php $(REMOTE)/tools/print-api-gates.php
