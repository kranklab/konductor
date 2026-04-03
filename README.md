# Konductor

Claude Code Session Manager — manage multiple Claude Code terminal sessions from a single UI.

## Install

Download the latest build from the [`latest` release](../../releases/tag/latest), or use curl:

### Linux (AppImage)

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor.AppImage" -o konductor.AppImage
chmod +x konductor.AppImage
./konductor.AppImage
```

### Linux (deb)

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor.deb" -o konductor.deb
sudo dpkg -i konductor.deb
```

### macOS

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor.dmg" -o konductor.dmg
open konductor.dmg
```

### Windows

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor-setup.exe" -o konductor-setup.exe
```

## Development

### Setup

```bash
npm install
```

### Run

```bash
npm run dev
```

### Build

```bash
# Linux
npm run build:linux

# macOS
npm run build:mac

# Windows
npm run build:win
```
