#!/bin/bash
# Konductor session state tracker
# Called by Claude Code hooks to report busy/idle status.
# Writes JSON state to $KONDUCTOR_STATE_DIR/<session_id>.json
# so the host Electron app can watch for changes.

set -euo pipefail

STATE_DIR="${KONDUCTOR_STATE_DIR:-/tmp/konductor-state}"
mkdir -p "$STATE_DIR"

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

[ -z "$EVENT" ] || [ -z "$SESSION_ID" ] && exit 0

STATE_FILE="$STATE_DIR/$SESSION_ID.json"

case "$EVENT" in
  UserPromptSubmit)
    STATE="working"
    TOOL=""
    ;;
  Stop)
    STATE="waiting"
    TOOL=""
    ;;
  *)
    exit 0
    ;;
esac

jq -n \
  --arg state "$STATE" \
  --arg tool "$TOOL" \
  --arg event "$EVENT" \
  --arg session "$SESSION_ID" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{state: $state, tool: $tool, event: $event, session_id: $session, timestamp: $ts}' \
  > "$STATE_FILE"
