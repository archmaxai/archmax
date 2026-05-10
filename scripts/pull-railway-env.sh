#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_TARGET="$PROJECT_ROOT/.env.local"

RAILWAY_VARS=(
  MONGODB_URI
  REDIS_URL
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Interactively link a Railway service and pull variables into:
  .env.local              (root: in-place update of MONGODB_URI and REDIS_URL)

Pulled from Railway:
  MONGODB_URI, REDIS_URL

Options:
  --dry-run     Print the updated file without writing
  -h, --help    Show this help
EOF
}

DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *)         echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

command -v railway &>/dev/null || { echo "Error: Railway CLI not found. Install: npm i -g @railway/cli"; exit 1; }
[[ -f "$ROOT_TARGET" ]]        || { echo "Error: Target not found: $ROOT_TARGET"; exit 1; }

if [[ ! -t 0 ]]; then
  echo "Error: Interactive mode requires a terminal. Run from a shell, not a pipe."
  exit 1
fi
railway link
echo ""

BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

echo "Pulling variables from linked service..."
if ! kv=$(railway variables --kv 2>&1); then
  echo "Error: $kv"
  exit 1
fi

PULLED_FILE=$(mktemp)
trap 'rm -f "$PULLED_FILE"' EXIT

found=0
missing=()

for var in "${RAILWAY_VARS[@]}"; do
  val=$(echo "$kv" | grep "^${var}=" | head -1 | sed "s/^${var}=//" || true)
  if [[ -n "$val" ]]; then
    echo "${var}=${val}" >> "$PULLED_FILE"
    ((found++)) || true
    echo "  ✓ $var"
  else
    missing+=("$var")
    echo "  ✗ $var"
  fi
done

if [[ $found -eq 0 ]]; then
  echo ""
  echo "Error: None of the expected variables found. Available on this service:"
  echo "$kv" | cut -d'=' -f1 | sed 's/^/  /'
  exit 1
fi

_pulled_val() {
  grep "^${1}=" "$PULLED_FILE" | head -1 | sed "s/^${1}=//"
}

_is_pulled() {
  grep -q "^${1}=" "$PULLED_FILE"
}

update_env_in_place() {
  local target="$1"
  local written_file
  written_file=$(mktemp)

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^([A-Z_][A-Z_0-9]*)= ]]; then
      local k="${BASH_REMATCH[1]}"
      if _is_pulled "$k"; then
        echo "${k}=$(_pulled_val "$k")"
        echo "$k" >> "$written_file"
      else
        echo "$line"
      fi
    else
      echo "$line"
    fi
  done < "$target"

  local need_header=true
  for var in "${RAILWAY_VARS[@]}"; do
    if _is_pulled "$var" && ! grep -q "^${var}$" "$written_file"; then
      if $need_header; then
        echo ""
        echo "# Railway variables (pulled $(date +%Y-%m-%d), branch: $BRANCH)"
        need_header=false
      fi
      echo "${var}=$(_pulled_val "$var")"
    fi
  done

  rm -f "$written_file"
}

echo ""
if [[ "$DRY_RUN" == true ]]; then
  echo "--- .env.local ---"
  update_env_in_place "$ROOT_TARGET"
  echo "---"
else
  TMP_OUT=$(mktemp)
  update_env_in_place "$ROOT_TARGET" > "$TMP_OUT"
  mv "$TMP_OUT" "$ROOT_TARGET"
  echo "Updated .env.local ($found Railway variable(s))"
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Note: not found on this service: ${missing[*]}"
fi
