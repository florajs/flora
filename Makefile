BIN = ./node_modules/.bin
MOCHA = $(BIN)/_mocha
ISTANBUL = $(BIN)/istanbul
ESLINT = $(BIN)/eslint

BUILDDIR = build
TESTS = test
REPORTER = spec
TIMEOUT = 3000

install:
	@npm install

test:
	@NODE_ENV=test $(MOCHA) \
		--reporter $(REPORTER) \
		--timeout $(TIMEOUT) \
		$(TESTS) \

test-cov:
	@NODE_ENV=test $(ISTANBUL) cover \
		--preserve-comments \
		--dir $(BUILDDIR) \
		$(MOCHA) \
		-- -u exports \
		--reporter $(REPORTER) \
		--timeout $(TIMEOUT) \
		$(TESTS) \

lint:
	@NODE_ENV=test $(ESLINT) lib/

clean:
	@rm -rf $(BUILDDIR)

.PHONY: test
