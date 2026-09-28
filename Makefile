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

.PHONY: build test deploy gate-preflight phpunit run-phpunit ship \
	bump-patch bump-minor \
	slicer-fetch slicer-build slicer-up slicer-down slicer-test \
	appstore appstore-sign

build:
	cd "$(ROOT)" && npm run build

# Version bump: edits info.xml, package.json, package-lock.json (both fields),
# the README badge, and inserts a dated CHANGELOG stub. DATE defaults to today
# but can be pinned (DATE=2026-07-05) for reproducibility.
DATE ?= $(shell date +%F)
bump-patch:
	@$(MAKE) --no-print-directory _bump PART=patch
bump-minor:
	@$(MAKE) --no-print-directory _bump PART=minor

_bump:
	@cur=$$(grep -oE '<version>[0-9]+\.[0-9]+\.[0-9]+</version>' "$(ROOT)appinfo/info.xml" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'); \
	test -n "$$cur" || (echo "could not read current version from info.xml" && exit 1); \
	maj=$$(echo $$cur | cut -d. -f1); min=$$(echo $$cur | cut -d. -f2); pat=$$(echo $$cur | cut -d. -f3); \
	if [ "$(PART)" = "minor" ]; then min=$$((min+1)); pat=0; else pat=$$((pat+1)); fi; \
	next="$$maj.$$min.$$pat"; \
	sed -i "s#<version>$$cur</version>#<version>$$next</version>#" "$(ROOT)appinfo/info.xml"; \
	sed -i "s#\"version\": \"$$cur\"#\"version\": \"$$next\"#" "$(ROOT)package.json"; \
	sed -i "0,/\"version\": \"$$cur\"/s##\"version\": \"$$next\"#" "$(ROOT)package-lock.json"; \
	sed -i "0,/\"version\": \"$$cur\"/s##\"version\": \"$$next\"#" "$(ROOT)package-lock.json"; \
	sed -i "s#\*\*Version $$cur\*\*#**Version $$next**#" "$(ROOT)README.md"; \
	if ! grep -q "^## \[$$next\]" "$(ROOT)CHANGELOG.md"; then \
		awk -v v="$$next" -v d="$(DATE)" 'BEGIN{done=0} /^## \[/ && !done {print "## [" v "] - " d "\n"; done=1} {print}' \
			"$(ROOT)CHANGELOG.md" > "$(ROOT)CHANGELOG.md.tmp" && mv "$(ROOT)CHANGELOG.md.tmp" "$(ROOT)CHANGELOG.md"; \
	fi; \
	echo "Bumped $$cur -> $$next (CHANGELOG dated $(DATE)); fill in the CHANGELOG stub."

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
			docker exec $(CONTAINER) rm -rf $(REMOTE)/$$dir; \
			docker cp "$(ROOT)$$dir/." $(CONTAINER):$(REMOTE)/$$dir/; \
		fi; \
	done
	@# Ownership: docker cp lands as root; the app must be www-data readable.
	@docker exec $(CONTAINER) chown -R www-data:www-data $(REMOTE) 2>/dev/null || true
	@if [ -f "$(ROOT)composer.json" ]; then docker cp "$(ROOT)composer.json" $(CONTAINER):$(REMOTE)/; fi
	docker exec -u www-data $(CONTAINER) php /var/www/html/occ app:enable $(APP_ID) || true
	docker exec -u www-data $(CONTAINER) php /var/www/html/occ upgrade
	@# Flush PHP opcache so newly added routes/classes are seen without a manual
	@# restart. opcache_reset only clears the CLI worker; when a route/class was
	@# ADDED (not just edited), pass RESTART=1 to bounce php-fpm workers too.
	@docker exec -u www-data $(CONTAINER) php -r 'function_exists("opcache_reset") && @opcache_reset();' 2>/dev/null || true
	@if [ "$(RESTART)" = "1" ]; then \
		echo "RESTART=1 -> restarting $(CONTAINER) to flush php-fpm opcache"; \
		docker restart $(CONTAINER) >/dev/null && sleep 8; \
	fi
	@echo "Deployed $(APP_ID) to $(CONTAINER):$(REMOTE)"

# One-shot ship: build the frontend, (re)build+up the sidecar, deploy into the
# container (stale-clean + opcache flush), then run the full gate. Pass RESTART=1
# to bounce php-fpm when a route/class was added this change.
ship: build slicer-up deploy gate-preflight
	@echo "ship complete: build + slicer-up + deploy + gate-preflight all green"

gate-preflight:
	bash "$(ROOT)tools/print-preflight.sh"
	$(MAKE) run-phpunit
	$(MAKE) slicer-test
	cd "$(ROOT)" && npm run test && echo ok > "$(ROOT).vitest-gate-stamp"
	cd "$(ROOT)" && npm run build
	@test -n "$$(docker ps -q -f name=$(CONTAINER))" || (echo "Container $(CONTAINER) not running — skip API gates" && exit 0)
	docker cp "$(ROOT).vitest-gate-stamp" $(CONTAINER):$(REMOTE)/.vitest-gate-stamp
	docker exec $(CONTAINER) php $(REMOTE)/tools/print-api-gates.php

VERSION := $(shell grep -oE '<version>[0-9]+\.[0-9]+\.[0-9]+</version>' "$(ROOT)appinfo/info.xml" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
STAGING := /tmp/$(APP_ID)-$(VERSION)
TARBALL := /tmp/$(APP_ID)-$(VERSION).tar.gz

# Self-contained App Store tarball (built assets + composer vendor; slicer engine excluded).
# appstore-sign copies scripts/file_from_env.php into the staging root (not via rsync).
appstore: build
	rm -rf "$(STAGING)"
	mkdir -p "$(STAGING)"
	rsync -a --delete \
		--exclude node_modules --exclude tests --exclude .git \
		--exclude .github --exclude tools --exclude scripts --exclude src \
		--exclude slicer --exclude integrations --exclude .phpunit.cache \
		--exclude 'docs/3D Printing' --exclude 'docs/*.stl' --exclude 'docs/*.STL' \
		--exclude 'docs/*.3MF' --exclude 'docs/*.3mf' \
		--exclude '*.map' --exclude .vitest-gate-stamp \
		--exclude .cursor --exclude .vscode --exclude .idea \
		"$(ROOT)" "$(STAGING)/"
	@if command -v composer >/dev/null 2>&1; then \
		cd "$(STAGING)" && composer install --no-dev --no-interaction --optimize-autoloader; \
	else \
		echo "composer not on PATH — running in the composer:2 container"; \
		docker run --rm -v "$(STAGING):/app" -w /app composer:2 \
			composer install --no-dev --no-interaction --optimize-autoloader; \
	fi
	rm -rf "$(STAGING)/node_modules"
	tar -czf "$(TARBALL)" -C /tmp "$(APP_ID)-$(VERSION)"
	@echo "Release tarball: $(TARBALL)"

appstore-sign: appstore
	@test -n "$(NC_OCC)" || (echo "Set NC_OCC to your occ binary path" && exit 1)
	@test -n "$$APP_PRIVATE_KEY" || (echo "Set APP_PRIVATE_KEY to private key file path" && exit 1)
	@test -n "$$APP_PUBLIC_CRT" || (echo "Set APP_PUBLIC_CRT to certificate file path" && exit 1)
	cp "$(ROOT)scripts/file_from_env.php" "$(STAGING)/file_from_env.php"
	php "$(NC_OCC)" integrity:sign-app \
		--privateKey="file://$(STAGING)/file_from_env.php" \
		--certificate="file://$(STAGING)/file_from_env.php" \
		$(APP_ID)
	APP_PRIVATE_KEY="$$APP_PRIVATE_KEY" APP_PUBLIC_CRT="$$APP_PUBLIC_CRT" \
	php "$(NC_OCC)" integrity:check-app $(APP_ID)
	tar -czf "$(TARBALL)" -C /tmp "$(APP_ID)-$(VERSION)"
	@echo "Signed tarball: $(TARBALL)"
