#!/bin/bash
# Blocks dangerous bash commands that could cause data loss or system damage
# Exit code 2 = block operation (message shown to Claude via stderr)
# Exit code 0 = allow operation

set -euo pipefail

# Read command from stdin JSON
CMD=$(jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

if [[ -z "$CMD" ]]; then
  exit 0
fi

# Dangerous patterns to block
declare -a DANGEROUS_PATTERNS=(
  # Destructive file operations
  'rm\s+-rf\s+'
  'rm\s+-fr\s+'
  'rm\s+-r\s+-f'
  'rm\s+-f\s+-r'
  'rm\s+--force.*-r'
  'rm\s+-r.*--force'
  'sudo\s+rm'

  # Git destructive operations
  'git\s+reset\s+--hard'
  'git\s+clean\s+-fd'
  'git\s+push.*--force'
  'git\s+push.*-f\s'
  'git\s+push\s+-f$'
  'git\s+add\s+--force'
  'git\s+add\s+-f\s'
  'git\s+add\s+-[a-zA-Z]*f'

  # Database destructive operations
  'DROP\s+TABLE'
  'DROP\s+DATABASE'
  'TRUNCATE\s+TABLE'
  'DELETE\s+FROM.*WHERE\s+1\s*=\s*1'

  # System-level dangers
  'chmod\s+777'
  'chmod\s+-R\s+777'
  '>\s*/etc/'
  'mkfs\.'
  'dd\s+if='

  # Remote code execution risks
  'curl.*\|\s*sh'
  'curl.*\|\s*bash'
  'wget.*\|\s*sh'
  'wget.*\|\s*bash'

  # Environment destruction
  'unset\s+PATH'
  'export\s+PATH\s*='
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qEi "$pattern"; then
    echo "BLOCKED: Command matches dangerous pattern." >&2
    echo "Pattern: $pattern" >&2
    echo "Command: $CMD" >&2
    echo "" >&2
    echo "If you need to perform this operation, please ask the user to run it manually." >&2
    exit 2
  fi
done

exit 0
