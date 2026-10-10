# One command to run Synth Lab:  make
# Installs dependencies the first time, then starts the dev server at http://localhost:5173

.DEFAULT_GOAL := run
PORT ?= 5173

.PHONY: run install check test e2e clean

run: node_modules/.package-installed
	npm run dev -- --port $(PORT) --open

node_modules/.package-installed: package.json package-lock.json
	npm install
	@touch $@

install: node_modules/.package-installed

check: node_modules/.package-installed
	npm run check

test: node_modules/.package-installed
	npm test

e2e: node_modules/.package-installed
	npx playwright install chromium firefox webkit
	npm run e2e

clean:
	rm -rf node_modules dist test-results playwright-report
