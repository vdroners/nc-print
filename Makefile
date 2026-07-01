APP_ID ?= nc_print
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
CONTAINER ?= cloud_app
REMOTE := /var/www/html/custom_apps/$(APP_ID)

.PHONY: build test deploy gate-preflight phpunit

build:
	cd "$(ROOT)" && npm run build

test: phpunit
	cd "$(ROOT)" && npm run test

phpunit:
	@if [ -f "$(ROOT)vendor/bin/phpunit" ]; then \
		cd "$(ROOT)" && vendor/bin/phpunit; \
	else \
		echo "SKIP phpunit (run: composer install --dev)"; \
	fi

deploy: build
	@test -n "$$(docker ps -q -f name=$(CONTAINER))" || (echo "Container $(CONTAINER) not running" && exit 1)
	docker exec $(CONTAINER) mkdir -p $(REMOTE)
	for dir in appinfo css img js lib templates; do \
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
	@if [ -f "$(ROOT)vendor/bin/phpunit" ]; then cd "$(ROOT)" && vendor/bin/phpunit; fi
	cd "$(ROOT)" && npm run test
	cd "$(ROOT)" && npm run build
