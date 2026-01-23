.PHONY: all build test test-coverage test-short test-race lint fmt clean install dev

# Default target
all: lint test build

# Build the main binary
build:
	go build -o bin/signage ./cmd/signage

# Build all binaries including Lambda handlers
build-all: build
	GOOS=linux GOARCH=amd64 go build -o bin/linux-amd64/signage ./cmd/signage
	GOOS=linux GOARCH=arm64 go build -o bin/linux-arm64/signage ./cmd/signage
	GOOS=darwin GOARCH=amd64 go build -o bin/darwin-amd64/signage ./cmd/signage
	GOOS=darwin GOARCH=arm64 go build -o bin/darwin-arm64/signage ./cmd/signage
	GOOS=windows GOARCH=amd64 go build -o bin/windows-amd64/signage.exe ./cmd/signage

# Build Lambda handlers
build-lambda:
	GOOS=linux GOARCH=amd64 go build -o bin/lambda/compositor/bootstrap ./cmd/lambda/compositor
	GOOS=linux GOARCH=amd64 go build -o bin/lambda/connect/bootstrap ./cmd/lambda/connect
	GOOS=linux GOARCH=amd64 go build -o bin/lambda/disconnect/bootstrap ./cmd/lambda/disconnect

# Run all tests
test:
	go test ./...

# Run tests with verbose output
test-v:
	go test -v ./...

# Run tests with coverage
test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# Run short tests only (skip integration)
test-short:
	go test -short ./...

# Run tests with race detection
test-race:
	go test -race ./...

# Run linter
lint:
	@which golangci-lint > /dev/null || (echo "Installing golangci-lint..." && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
	golangci-lint run ./...

# Format code
fmt:
	go fmt ./...
	goimports -w .

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# Install dependencies
install:
	go mod download
	go mod tidy

# Development mode - run with hot reload (requires air)
dev:
	@which air > /dev/null || (echo "Installing air..." && go install github.com/cosmtrek/air@latest)
	air

# Run the application
run:
	go run ./cmd/signage

# Generate mocks (if needed)
mocks:
	@which mockgen > /dev/null || (echo "Installing mockgen..." && go install github.com/golang/mock/mockgen@latest)
	go generate ./...

# Check for vulnerabilities
vuln:
	@which govulncheck > /dev/null || (echo "Installing govulncheck..." && go install golang.org/x/vuln/cmd/govulncheck@latest)
	govulncheck ./...

# Show test count
count:
	@go test -v ./... 2>&1 | grep -c "=== RUN" || echo "0 tests"

# Help
help:
	@echo "Available targets:"
	@echo "  all           - lint, test, and build (default)"
	@echo "  build         - build the main binary"
	@echo "  build-all     - build for all platforms"
	@echo "  build-lambda  - build Lambda handlers"
	@echo "  test          - run all tests"
	@echo "  test-v        - run tests with verbose output"
	@echo "  test-coverage - run tests with coverage report"
	@echo "  test-short    - run short tests only"
	@echo "  test-race     - run tests with race detection"
	@echo "  lint          - run linter"
	@echo "  fmt           - format code"
	@echo "  clean         - remove build artifacts"
	@echo "  install       - download dependencies"
	@echo "  dev           - run with hot reload"
	@echo "  run           - run the application"
	@echo "  mocks         - generate mocks"
	@echo "  vuln          - check for vulnerabilities"
	@echo "  count         - show test count"
