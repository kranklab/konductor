#!/usr/bin/env bash
# Environment setup for Konductor development
# Sourced by .envrc in the project root

# Load nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  source "$NVM_DIR/nvm.sh"
  nvm use 2>/dev/null
fi
