#!/usr/bin/env bash
# Runs tests with coverage across all packages and merges results.
# Output: coverage/coverage-summary.json, coverage/coverage-final.json
#
# Usage:
#   ./scripts/test-coverage.sh          # Run all packages
#   ./scripts/test-coverage.sh apps/api # Run single package

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Clean and create directories for coverage collection
rm -rf .nyc_output coverage
mkdir -p .nyc_output coverage

# Packages to test
if [ -n "$1" ]; then
  PACKAGES=("$1")
else
  PACKAGES=(
    "apps/api"
    "apps/web"
    "apps/worker"
    "packages/backend-shared"
    "packages/database"
    "packages/shared-types"
  )
fi

echo "Running tests with coverage..."

failures=0

for pkg in "${PACKAGES[@]}"; do
  if [ -f "$pkg/vitest.config.ts" ]; then
    echo ""
    echo "=== Testing $pkg ==="

    # Clean stale package coverage to prevent merging outdated data
    rm -rf "$pkg/coverage"

    # Run vitest with coverage in each package directory
    # Track failures but continue to collect coverage from all packages
    (cd "$pkg" && npx vitest run --coverage) || failures=1

    # Copy coverage-final.json to temp directory with unique name
    pkg_name=$(echo "$pkg" | tr '/' '-')
    if [ -f "$pkg/coverage/coverage-final.json" ]; then
      cp "$pkg/coverage/coverage-final.json" ".nyc_output/$pkg_name.json"
      echo "Collected coverage from $pkg"
    fi
  fi
done

echo ""
echo "Merging coverage reports..."

# Use nyc to merge all coverage files
npx nyc merge .nyc_output coverage/coverage-final.json

# Generate summary using nyc report
npx nyc report --reporter=json-summary --temp-dir=coverage --report-dir=coverage 2>/dev/null || {
  # Fallback: create minimal summary if nyc report fails
  echo '{"total":{"lines":{"total":0,"covered":0,"pct":0},"statements":{"total":0,"covered":0,"pct":0},"functions":{"total":0,"covered":0,"pct":0},"branches":{"total":0,"covered":0,"pct":0}}}' > coverage/coverage-summary.json
}

echo ""
echo "Coverage reports generated in coverage/"
ls -la coverage/*.json 2>/dev/null || echo "No JSON files found"

exit $failures
