#!/usr/bin/env bash
set -euo pipefail

REPO="kranklab/konductor"
APP_NAME="konductor"
INSTALL_DIR="$HOME/.local/bin"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DIR="$HOME/.local/share/applications"
APPIMAGE="$INSTALL_DIR/$APP_NAME.AppImage"

echo "Installing Konductor..."

# Create directories
mkdir -p "$INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"

# Download AppImage
echo "Downloading AppImage..."
curl -fSL "https://github.com/$REPO/releases/download/latest/$APP_NAME.AppImage" -o "$APPIMAGE"
chmod +x "$APPIMAGE"

# Download icon
echo "Downloading icon..."
curl -fSL "https://raw.githubusercontent.com/$REPO/main/resources/icon.png" -o "$ICON_DIR/$APP_NAME.png"

# Create desktop entry
cat > "$DESKTOP_DIR/$APP_NAME.desktop" << EOF
[Desktop Entry]
Name=Konductor
Comment=Claude Code Session Manager
Exec=$APPIMAGE --no-sandbox %U
Icon=$APP_NAME
Type=Application
Categories=Development;Utility;
Terminal=false
StartupWMClass=konductor
EOF

# Update desktop database if available
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo ""
echo "Konductor installed successfully!"
echo "  Binary: $APPIMAGE"
echo "  Desktop entry: $DESKTOP_DIR/$APP_NAME.desktop"
echo ""
echo "You can now launch Konductor from your application menu."
echo "To run from terminal: $APPIMAGE"
