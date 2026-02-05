#!/usr/bin/env bash
# Runs tests with coverage across all packages and merges results.
# Output: coverage/coverage-summary.json, coverage/coverage-final.json
#
# Usage:
#   ./scripts/test-coverage.sh          # Run all packages
#   ./scripts/test-coverage.sh apps/api # Run single package

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Comma-separated list of test variants to include in coverage.
# Examples:
#   COVERAGE_VARIANTS=unit pnpm test:coverage
#   COVERAGE_VARIANTS=unit,integration,e2e pnpm test:coverage
: "${COVERAGE_VARIANTS:=unit,integration}"

IFS=',' read -r -a VARIANTS <<<"$COVERAGE_VARIANTS"

# Ensure workspace packages are built so apps import up-to-date dist outputs.
# (apps depend on packages/* via workspace:^ which resolve to each package's dist entrypoints.)
pnpm -r --filter "./packages/**" build

# Clean and create directories for coverage collection
MERGED_NYC_DIR=".nyc_output_merged"
rm -rf .nyc_output "$MERGED_NYC_DIR" coverage
mkdir -p .nyc_output "$MERGED_NYC_DIR" coverage

# Packages to test
if [ "${1-}" != "" ]; then
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

run_vitest_with_coverage() {
  local pkg="$1"
  local variant="$2"
  local config_path="$3"

  local pkg_name
  pkg_name=$(echo "$pkg" | tr '/' '-')
  local reports_dir="coverage-$variant"

  echo ""
  echo "=== Testing $pkg ($variant) ==="

  # Clean stale package coverage to prevent merging outdated data.
  rm -rf "$pkg/$reports_dir"

  # Run vitest with coverage in each package directory
  # Track failures but continue to collect coverage from all packages
  if [ -n "$config_path" ]; then
    (cd "$pkg" && npx vitest run --config "$config_path" --coverage --coverage.reportsDirectory "$reports_dir") || failures=1
  else
    (cd "$pkg" && npx vitest run --config vitest.config.ts --coverage --coverage.reportsDirectory "$reports_dir") || failures=1
  fi

  # Copy coverage-final.json to temp directory with unique name
  if [ -f "$pkg/$reports_dir/coverage-final.json" ]; then
    cp "$pkg/$reports_dir/coverage-final.json" ".nyc_output/$pkg_name.$variant.json"
    echo "Collected coverage from $pkg ($variant)"
  fi
}

for pkg in "${PACKAGES[@]}"; do
  for variant in "${VARIANTS[@]}"; do
    case "$variant" in
    unit)
      if [ -f "$pkg/vitest.config.ts" ]; then
        run_vitest_with_coverage "$pkg" "unit" ""
      fi
      ;;
    integration)
      if [ -f "$pkg/vitest-integration.config.ts" ]; then
        run_vitest_with_coverage "$pkg" "integration" "vitest-integration.config.ts"
      fi
      ;;
    e2e)
      if [ -f "$pkg/vitest-e2e.config.ts" ]; then
        run_vitest_with_coverage "$pkg" "e2e" "vitest-e2e.config.ts"
      fi
      ;;
    *)
      echo "Unknown COVERAGE_VARIANTS entry: '$variant'"
      failures=1
      ;;
    esac
  done
done

echo ""
echo "Merging coverage reports..."

# Use nyc to merge all coverage files into a dedicated temp dir (avoid report dir collisions)
npx nyc merge .nyc_output "$MERGED_NYC_DIR/coverage-final.json"
cp "$MERGED_NYC_DIR/coverage-final.json" coverage/coverage-final.json

# Generate summary using nyc report
npx nyc report --reporter=json-summary --temp-dir="$MERGED_NYC_DIR" --report-dir=coverage 2>/dev/null || {
  # Fallback: create minimal summary if nyc report fails
  echo '{"total":{"lines":{"total":0,"covered":0,"pct":0},"statements":{"total":0,"covered":0,"pct":0},"functions":{"total":0,"covered":0,"pct":0},"branches":{"total":0,"covered":0,"pct":0}}}' > coverage/coverage-summary.json
}

echo ""
echo "Coverage reports generated in coverage/"
ls -la coverage/*.json 2>/dev/null || echo "No JSON files found"

exit $failures
