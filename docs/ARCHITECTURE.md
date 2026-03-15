# eDEX-UI Architecture

## Process Model

eDEX-UI uses a two-process Electron architecture plus a worker pool:

```
┌─────────────────────────────────────────────────────┐
│  MAIN PROCESS (src/_boot.js)                        │
│                                                     │
│  ┌──────────┐  ┌─────────────────────────────────┐  │
│  │ Terminal │  │ _multithread.js (cluster master)│  │
│  │ Server   │  │  ┌────────┐ ┌────────┐          │  │
│  │ ×5 PTYs  │  │  │Worker 1│ │Worker N│ (max 7)  │  │
│  │ ×5 WS    │  │  └────────┘ └────────┘          │  │
│  │ servers  │  └─────────────────────────────────┘  │
│  └──────────┘                                       │
└─────────────────────────┬───────────────────────────┘
                          │ IPC (ipcMain / ipcRenderer)
┌─────────────────────────▼───────────────────────────┐
│  RENDERER PROCESS (src/_renderer.js + ui.html)      │
│                                                     │
│  ┌──────────────┐  ┌────────┐  ┌─────────────────┐  │
│  │ Terminal     │  │ File   │  │ System Monitor  │  │
│  │ Client ×5    │  │ System │  │ Panels (9)      │  │
│  │ (xterm.js)   │  │ Panel  │  │                 │  │
│  └──────┬───────┘  └────────┘  └─────────────────┘  │
│         │ WebSocket (ws://)                         │
└─────────┼───────────────────────────────────────────┘
          │ localhost:3000-3004
    ┌─────▼──────┐
    │  PTY / TTY │  (node-pty wrapping bash/zsh/powershell)
    └────────────┘
```

## Startup Sequence

### Main Process (`_boot.js`)

1. Enforce single instance lock
2. Set GPU acceleration flags (`--ignore-gpu-blocklist`, `--enable-gpu-rasterization`, `--enable-video-decode`)
3. Initialize IPC `"log"` channel
4. Create/load `settings.json`, `shortcuts.json`, `lastWindowState.json`
5. Mirror bundled themes, keyboard layouts, fonts into userData on first run
6. Track version history in `versions_log.json`
7. On `app.ready`:
   a. Load settings, resolve shell path via `which`
   b. Get clean shell environment via `shell-env`, inject `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=eDEX-UI`
   c. Spawn main Terminal (role="server") on `settings.port` (default 3000)
   d. Load `_multithread.js` worker pool
   e. Create `BrowserWindow`, load `ui.html`
   f. Register IPC channels: `ttyspawn`, `getThemeOverride`, `setThemeOverride`, `getKbOverride`, `setKbOverride`
   g. Pre-allocate 4 extra terminal slots (ports `base+2` through `base+5`)

### Renderer Process (`_renderer.js`)

1. Disable `window.eval()`; install `_escapeHtml()`, `_purifyCSS()`, `_encodePathURI()`, `_delay()`
2. Load configs: `settings.json`, `shortcuts.json`, `lastWindowState.json`
3. IPC handshake: request `getThemeOverride` / `getKbOverride`
4. Call `_loadTheme()` — inject CSS variables and fonts
5. Instantiate `AudioManager`
6. Branch on `nointro`:
   - **Skip intro**: `initGraphicalErrorHandling()` → `initSystemInformationProxy()` → `waitForFonts()` → `initUI()`
   - **Show intro**: `displayLine()` (boot log) → `displayTitleScreen()` → `initUI()`
7. `initUI()`:
   a. Build DOM sections: `mod_column_left`, `main_shell`, `mod_column_right`
   b. Instantiate `Keyboard`
   c. Instantiate `FilesystemDisplay`
   d. Instantiate 9 monitor modules (500ms stagger fade-in):
      - Left: `Clock`, `Sysinfo`, `HardwareInspector`, `Cpuinfo`, `RAMwatcher`, `Toplist`
      - Right: `Netstat`, `LocationGlobe`, `Conninfo`
   e. Create Terminal tab 0 on `settings.port`
   f. Instantiate `FilesystemDisplay`, `UpdateChecker`
   g. Register keyboard shortcuts via `registerKeyboardShortcuts()`

## IPC Reference

### Main → Renderer

| Channel | Payload | Trigger |
|---------|---------|---------|
| `terminal_channel-{port}` | `["New cwd", path]` | CWD changed in PTY |
| `terminal_channel-{port}` | `["Fallback cwd", path]` | CWD tracking failed |
| `terminal_channel-{port}` | `["New process", name]` | Foreground process changed |
| `getThemeOverride` reply | `themeFilename \| null` | Renderer requested on startup |
| `getKbOverride` reply | `layoutFilename \| null` | Renderer requested on startup |
| `ttyspawn-reply` | `"SUCCESS: {port}"` or `"ERROR: ..."` | After tab spawn |
| `systeminformation-reply-{id}` | result object | After worker resolves |

### Renderer → Main

| Channel | Payload | Trigger |
|---------|---------|---------|
| `terminal_channel-{port}` | `"Renderer startup"` | Renderer ready |
| `terminal_channel-{port}` | `["Resize", cols, rows]` | Terminal resized (padded to 3 digits) |
| `ttyspawn` | `"true"` | User opens new tab |
| `setThemeOverride` | `themeFilename` | User changes theme |
| `setKbOverride` | `layoutFilename` | User changes keyboard layout |
| `getThemeOverride` | — | Renderer startup handshake |
| `getKbOverride` | — | Renderer startup handshake |
| `systeminformation-call` | `(type, id, ...args)` | `window.si.*()` called |
| `log` | `(level, message)` | Frontend logging |

## Multithreaded System Information

`_multithread.js` uses Node's `cluster` module:

- **Worker count**: `min(os.cpus().length - 1, 7)` (reserves 1 core for renderer, caps at 7)
- **Dispatch**: Round-robin across workers
- **Routing**: Requests keyed by `nanoid()`, stored in `queue{}` map until result arrives
- **Fallback**: If `args.length > 1` or no workers, executes directly in master process
- **Security**: Validates method name exists in `systeminformation` library before dispatch

```
window.si.processes()  →  ipc("systeminformation-call", "processes", id, arg)
                       →  master queues sender, dispatches to worker[lastID % N]
                       →  worker: si.processes(arg) → process.send({id, res})
                       →  master: queue[id].send("systeminformation-reply-" + id, res)
                       →  renderer: ipc.once resolves Promise
```

## Global State (Renderer)

| Variable | Type | Purpose |
|----------|------|---------|
| `window.settings` | Object | Loaded from `settings.json` |
| `window.shortcuts` | Array | Loaded from `shortcuts.json` |
| `window.theme` | Object | Active theme + `{r, g, b}` shortcuts |
| `window.si` | Proxy | Async wrapper for systeminformation IPC |
| `window.audioManager` | AudioManager | Sound effects |
| `window.mods` | Object | All monitor module instances |
| `window.term` | Object | Terminal instances keyed by tab index (0–4) |
| `window.currentTerm` | Number | Active tab index |
| `window.keyboard` | Keyboard | On-screen keyboard instance |
| `window.fsDisp` | FilesystemDisplay | Filesystem panel instance |
| `window.passwordMode` | String | `"true"` / `"false"` (string, not bool) |

## User Data Directory Layout

Platform paths:
- **Linux**: `~/.config/eDEX-UI/`
- **macOS**: `~/Library/Application Support/eDEX-UI/`
- **Windows**: `%APPDATA%\eDEX-UI\`

```
userData/
├── settings.json          # User preferences
├── shortcuts.json         # Keyboard shortcut definitions
├── lastWindowState.json   # { fullscreen: bool }
├── versions_log.json      # Version history
├── themes/                # User themes (mirrored from assets/themes/ on first run)
├── keyboards/             # User keyboard layouts (mirrored from assets/kb_layouts/)
└── fonts/                 # User custom fonts
```

## Security Model

- `window.eval()` disabled globally (line 2-4 of `_renderer.js`)
- `webSecurity: true`, `allowRunningInsecureContent: false` in BrowserWindow
- Context isolation: **disabled** (design choice — allows renderer to call Node APIs directly)
- Node integration: **enabled** in renderer (intentional for system access)
- CSP in `ui.html`: `default-src file: 'unsafe-inline'; img-src file: data:; media-src file:; connect-src ws: file:`
- XSS helpers: `_escapeHtml()` for HTML, `_purifyCSS()` (strips `<`) for CSS injection
- New window/navigation: blocked via `web-contents-created` handler, opens external links instead
- Proxy env vars (`http_proxy`, `https_proxy`) deleted on startup to prevent WebSocket issues

## Window Configuration

Key `BrowserWindow` options:
```javascript
{
    fullscreen: settings.forceFullscreen,   // true by default
    frame: settings.allowWindowed,          // false by default (no OS chrome)
    movable: settings.allowWindowed,
    resizable: true,
    backgroundColor: '#000000',
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,        // keeps monitors updating when unfocused
        enableRemoteModule: true,
        experimentalFeatures: settings.experimentalFeatures
    }
}
```

## Build Pipeline

```
src/  ──rsync──►  prebuild-src/  ──terser+cleancss+json-minify──►  prebuild-src/ (minified)
                                                                         │
                                                                    npm install --production
                                                                         │
                                                              electron-builder ──►  dist/
```

Minification exclusions (kept human-readable): theme JSONs, keyboard layout JSONs, `file-icons-match.js`, `grid.json`

Output formats: Linux=AppImage, macOS=DMG, Windows=NSIS
