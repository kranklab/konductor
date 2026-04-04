#!/bin/bash
# Konductor session state tracker
# Called by Claude Code hooks to report busy/idle status and session summary.
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

SUMMARY=""

case "$EVENT" in
  UserPromptSubmit)
    STATE="working"
    TOOL=""
    ;;
  Stop)
    STATE="waiting"
    TOOL=""
    # Generate summary from Claude's first response in the transcript.
    # The first assistant message typically summarizes the task
    # (e.g. "I'll add dark mode support to the settings page").
    # Only extract if we haven't already written a summary for this session.
    EXISTING_SUMMARY=""
    if [ -f "$STATE_FILE" ]; then
      EXISTING_SUMMARY=$(jq -r '.summary // empty' "$STATE_FILE" 2>/dev/null || true)
    fi
    if [ -z "$EXISTING_SUMMARY" ]; then
      TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')
      if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
        # Extract first assistant message text, take first sentence, cap at 200 chars
        # JSONL uses top-level .type for role, and .message.content[] for API blocks
        SUMMARY=$(jq -r 'select(.type == "assistant") | .message.content | if type == "array" then map(select(.type == "text") | .text) | join(" ") else empty end' "$TRANSCRIPT" \
          | head -n 1 \
          | sed 's/\. .*/\./' \
          | head -c 200 \
          | sed 's/[[:space:]]*$//')
      fi
    fi
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
  --arg summary "$SUMMARY" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{state: $state, tool: $tool, event: $event, session_id: $session, summary: $summary, timestamp: $ts}' \
  > "$STATE_FILE"
