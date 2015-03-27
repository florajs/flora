BIN = ./node_modules/.bin
MOCHA = $(BIN)/_mocha
ISTANBUL = $(BIN)/istanbul
ESLINT = $(BIN)/eslint
JSDOC = $(BIN)/jsdoc

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
		--report clover \
		--report html \
		--preserve-comments \
		--dir $(BUILDDIR) \
		$(MOCHA) \
		-- -u exports \
		--reporter $(REPORTER) \
		--timeout $(TIMEOUT) \
		$(TESTS) \

lint:
	@NODE_ENV=test $(ESLINT) lib/

doc:
	@NODE_ENV=test $(JSDOC) \
		--configure ./jsdoc-conf.json \
		--destination $(BUILDDIR)/docs

clean:
	@rm -rf $(BUILDDIR)

.PHONY: test
