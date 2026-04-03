# Konductor

Claude Code Session Manager — manage multiple Claude Code terminal sessions from a single UI.

## Install

One-line install — downloads the AppImage, installs it to `~/.local/bin`, and adds a desktop entry:

```bash
curl -fSL https://raw.githubusercontent.com/kranklab/konductor/main/install.sh | bash
```

Or manually download from the [`latest` release](../../releases/tag/latest):

```bash
curl -fSL "https://github.com/kranklab/konductor/releases/download/latest/konductor.AppImage" -o konductor.AppImage
chmod +x konductor.AppImage
./konductor.AppImage
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
