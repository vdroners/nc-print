APP_ID ?= nc_print
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
CONTAINER ?= cloud_app
REMOTE := /var/www/html/custom_apps/$(APP_ID)

PHPUNIT := $(ROOT)vendor/bin/phpunit
PHPUNIT_DOCKER := docker run --rm -v "$(ROOT):/app" -w /app php:8.2-cli php vendor/bin/phpunit
COMPOSER_INSTALL_DOCKER := docker run --rm -v "$(ROOT):/app" -w /app composer:2 composer install --no-interaction

.PHONY: build test deploy gate-preflight phpunit run-phpunit

build:
	cd "$(ROOT)" && npm run build

test: phpunit
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

deploy: build
	@test -n "$$(docker ps -q -f name=$(CONTAINER))" || (echo "Container $(CONTAINER) not running" && exit 1)
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
	cd "$(ROOT)" && npm run test && echo ok > "$(ROOT).vitest-gate-stamp"
	cd "$(ROOT)" && npm run build
	@test -n "$$(docker ps -q -f name=$(CONTAINER))" || (echo "Container $(CONTAINER) not running — skip API gates" && exit 0)
	docker cp "$(ROOT).vitest-gate-stamp" $(CONTAINER):$(REMOTE)/.vitest-gate-stamp
	docker exec $(CONTAINER) php $(REMOTE)/tools/print-api-gates.php
