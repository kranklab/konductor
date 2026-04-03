# Konductor

Claude Code Session Manager — manage multiple Claude Code terminal sessions from a single UI.

## Install

Download the latest build from the [`latest` release](../../releases/tag/latest), or use curl:

### Linux (AppImage)

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor-0.1.0.AppImage" -o konductor.AppImage
chmod +x konductor.AppImage
./konductor.AppImage
```

### Linux (deb)

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor_0.1.0_amd64.deb" -o konductor.deb
sudo dpkg -i konductor.deb
```

### macOS

```bash
curl -fSL "https://github.com/kranklab/conductor/releases/download/latest/konductor-0.1.0.dmg" -o konductor.dmg
open konductor.dmg
```

### Windows

Download the installer from the [latest release](../../releases/tag/latest):

`konductor-0.1.0-setup.exe`

> **Note:** Artifact filenames include the version number. If the version in `package.json` changes, update the URLs above accordingly — or just grab the file directly from the [release page](../../releases/tag/latest).

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
