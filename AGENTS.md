# eDEX-UI Codebase Guide

## Design Documents

Detailed reference docs live in `docs/`:

| File | Contents |
|------|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Process model, startup sequence, full IPC reference, multithread system, global state, security model, build pipeline |
| [`docs/TERMINAL.md`](docs/TERMINAL.md) | Terminal client/server split, xterm addons, CWD tracking per platform, resize protocol, tab management, color filter system |
| [`docs/THEMING.md`](docs/THEMING.md) | Full theme JSON schema, CSS variables, hot-switching, all 21 themes; full keyboard layout JSON schema, dead keys, all 19 layouts |
| [`docs/CLASSES.md`](docs/CLASSES.md) | Every class: constructor options, key methods, update intervals, data flows, Smoothie config |
| [`docs/SETTINGS.md`](docs/SETTINGS.md) | Complete settings.json schema, shortcuts.json schema, all app shortcut actions, default shortcuts |

---

## Project Overview

**eDEX-UI** is an archived (v2.2.8, Oct 2021) sci-fi terminal emulator + system monitor built with Electron. Cross-platform (Linux, macOS, Windows). Fullscreen by default with a cyberpunk aesthetic.

## Key Commands

```bash
# Development
npm install && cd src && npm install && cd ..
npm start                # Run in development (electron .)

# Building
npm run prebuild-linux   # or prebuild-osx / prebuild-win
npm run build-linux      # Packages to dist/
```

## Architecture

### Process Model

```
Electron Main (_boot.js)
├── Spawns 5 node-pty PTY processes (ports 3000-3004)
├── Runs WebSocket servers (one per terminal tab)
├── Manages config files in userData
├── Cluster workers (_multithread.js) for system info
└── IPC ↔ Renderer (_renderer.js)
        ├── xterm.js terminals (WebSocket clients)
        ├── System monitor panels
        └── Keyboard/theme/filesystem UI
```

### Entry Points

| File | Role |
|------|------|
| `src/_boot.js` | Electron main process; PTY spawning, config, IPC |
| `src/_renderer.js` | Renderer init; loads all classes, themes, shortcuts |
| `src/_multithread.js` | Worker pool for `systeminformation` calls |
| `src/ui.html` | DOM structure |

### Key Classes (`src/classes/`)

| Class | File | Purpose |
|-------|------|---------|
| `Terminal` | `terminal.class.js` | xterm.js wrapper (client) + node-pty manager (server) |
| `FilesystemDisplay` | `filesystem.class.js` | Directory browser, follows terminal CWD |
| `Keyboard` | `keyboard.class.js` | On-screen keyboard + physical key mapping |
| `Cpuinfo` | `cpuinfo.class.js` | Per-core CPU charts (Smoothie.js) |
| `Netstat` / `Conninfo` | `*.class.js` | Network interface + traffic monitoring |
| `LocationGlobe` | `globe.class.js` | GeoIP globe of connected IPs |
| `Modal` | `modal.class.js` | Draggable popups |
| `AudioManager` | `audio.class.js` | Sound effects via Howler.js |
| `FuzzyFinder` | `fuzzyfinder.class.js` | Fuzzy search current directory |

## Terminal Architecture

**Client side** (renderer): `Terminal` class wraps xterm.js with:
- `AttachAddon` — WebSocket data relay
- `FitAddon` — resize to container
- `WebglAddon` — GPU rendering
- `LigaturesAddon` — font ligatures

**Server side** (main): `Terminal` class manages:
- `node-pty` PTY spawning
- WebSocket server (localhost:3000–3004)
- CWD tracking (platform-specific: `/proc` on Linux, `lsof` on macOS)
- Process name detection

## Configuration System

Config stored in `electron.app.getPath("userData")` (~/.config/eDEX-UI/ on Linux):

| File | Contents |
|------|----------|
| `settings.json` | Shell, theme, keyboard, font size, audio, clock, ping addr, port |
| `shortcuts.json` | Keyboard shortcut definitions |
| `lastWindowState.json` | Fullscreen/windowed persistence |
| `themes/` | User custom themes |
| `keyboards/` | User custom keyboard layouts |
| `fonts/` | Downloaded custom fonts |

**Default settings** (from `_boot.js` lines 46-126): shell=bash, theme=tron, keyboard=en-US, termFontSize=15, audio=true, clockHours=24, pingAddr=1.1.1.1, port=3000.

## Theming

Themes are JSON files in `src/assets/themes/`. Structure:

```json
{
  "colors": { "r": 0, "g": 195, "b": 255 },
  "cssvars": { "font_main": "Fira Code", "font_main_light": "..." },
  "terminal": { "fontFamily": "...", "foreground": "#...", "background": "#...", "colorFilter": {} },
  "globe": { "base": "#...", "marker": "#..." },
  "injectCSS": "raw CSS string"
}
```

21+ built-in themes (tron, blade, navy, apollo, matrix, etc.). Hot-switchable via IPC without restart.

## Keyboard Shortcuts

Defined in `shortcuts.json`. Two types:
- `"app"` — registered as `electron.globalShortcut`; actions: COPY, PASTE, NEXT_TAB, TAB_1-5, SETTINGS, FUZZY_SEARCH, etc.
- `"shell"` — sends raw text to active terminal

Keyboard layouts (JSON) in `src/assets/kb_layouts/` define row/key structure with modifier variants.

## IPC Channels

| Direction | Channel | Purpose |
|-----------|---------|---------|
| Main→Renderer | `terminal_channel-${port}` | CWD/process change events |
| Main→Renderer | `getThemeOverride` / `getKbOverride` | Hotswitch theme/keyboard |
| Main→Renderer | `systeminformation-reply-${id}` | System info results |
| Renderer→Main | `terminal_channel-${port}` | Startup handshake, resize |
| Renderer→Main | `ttyspawn` | Spawn new terminal tab |
| Renderer→Main | `systeminformation-call` | Request system info (nanoid tracked) |
| Renderer→Main | `log` | Log to main process |

## Build System

1. `prebuild-${os}` script: copies `src/` → `prebuild-src/`, minifies JS (Terser) + CSS (CleanCSS) + JSON, runs `npm install --production`
2. `electron-builder` packages into `dist/`
   - Linux: AppImage (x64, ia32, arm64, armv7l)
   - macOS: DMG (x64)
   - Windows: NSIS installer (x64, ia32)

Minification skips: `grid.json`, `file-icons-match.js`, theme JSONs, keyboard JSONs.

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^12.1.0 | Desktop shell |
| `xterm` | 4.14.1 | Terminal emulator |
| `node-pty` | 0.10.1 | PTY spawning |
| `systeminformation` | 5.9.7 | System stats |
| `smoothie` | 1.35.0 | Real-time charts |
| `howler` | 2.2.3 | Audio |
| `ws` | 7.5.5 | WebSocket |
| `augmented-ui` | 1.1.2 | Sci-fi UI elements |
| `maxmind` | 4.3.2 | GeoIP (globe) |

## Conventions & Patterns

- **Security**: `eval()` disabled; `_escapeHtml()` / `_purifyCSS()` helpers; CSP in HTML
- **Node integration**: Enabled in renderer (design choice for system access); context isolation disabled
- **GPU acceleration**: Force-enabled via `app.commandLine.appendSwitch` calls
- **System info**: Always via `_multithread.js` worker pool (IPC proxy), never direct in renderer
- **File watching**: `fs.watch()` with 1-second debounce for filesystem panel
- **Audio**: Different sounds per interaction type; disabled globally via settings
- **Feature flags** in settings: `experimentalGlobeFeatures`, `experimentalFeatures`, `nointro`, `nocursor`
- **Startup sequence**: Panels fade in with 500ms stagger; boot log animation in terminal

## File Icons

Pre-matched in `src/assets/misc/file-icons-match.js`, SVGs in `src/assets/icons/file-icons.json`. The filesystem panel uses these for directory listings.

## Known Limitations

- CWD tracking unreliable on Windows (can't poll PTY CWD)
- Project is **archived** — no active maintenance
- Electron 12 (old; Node integration / context isolation patterns differ from modern Electron)
