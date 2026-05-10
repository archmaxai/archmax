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
  --dry-run         Print the updated file with secret values masked
  --show-secrets    With --dry-run, print raw values instead of masking
                    (off by default; use only when you explicitly need
                    the unredacted output for local debugging)
  -h, --help        Show this help
EOF
}

DRY_RUN=false
SHOW_SECRETS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=true; shift ;;
    --show-secrets) SHOW_SECRETS=true; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ "$SHOW_SECRETS" == true && "$DRY_RUN" != true ]]; then
  echo "Error: --show-secrets only applies to --dry-run output."
  exit 1
fi

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

mask_secrets() {
  # Replace every value half of `KEY=VALUE` lines with a fixed
  # placeholder so dry-run output never echoes a real password,
  # connection URI, or token to stdout / terminal scrollback /
  # CI log capture. Lines without `=` (comments, blanks) pass
  # through unchanged.
  awk -F= '
    /^[A-Z_][A-Z_0-9]*=/ { printf "%s=********\n", $1; next }
    { print }
  '
}

echo ""
if [[ "$DRY_RUN" == true ]]; then
  echo "--- .env.local (dry-run preview) ---"
  if [[ "$SHOW_SECRETS" == true ]]; then
    echo "# WARNING: --show-secrets is enabled; raw values are printed below."
    update_env_in_place "$ROOT_TARGET"
  else
    echo "# Values are masked. Re-run with --show-secrets to see them."
    update_env_in_place "$ROOT_TARGET" | mask_secrets
  fi
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
