# Terminal System

The `Terminal` class (`src/classes/terminal.class.js`) has two distinct roles selected by `opts.role`.

## Client Role (Renderer Process)

Wraps xterm.js and connects to the server over WebSocket.

### Construction

```javascript
new Terminal({
    role: "client",
    parentId: "terminal0",   // DOM element ID
    port: 3000,
    host: "127.0.0.1"        // optional, default 127.0.0.1
})
```

### xterm.js Configuration

Settings pulled from `window.theme.terminal` with fallbacks:

| Option | Source | Default |
|--------|--------|---------|
| `fontFamily` | `theme.terminal.fontFamily` | `"Fira Mono"` |
| `fontSize` | `theme.terminal.fontSize` or `settings.termFontSize` | `15` |
| `cursorStyle` | `theme.terminal.cursorStyle` | `"block"` |
| `cursorBlink` | `theme.terminal.cursorBlink` | `true` |
| `allowTransparency` | `theme.terminal.allowTransparency` | `false` |
| `fontWeight` | `theme.terminal.fontWeight` | `"normal"` |
| `letterSpacing` | `theme.terminal.letterSpacing` | `0` |
| `lineHeight` | `theme.terminal.lineHeight` | `1` |
| `scrollback` | — | `1500` |
| `bellStyle` | — | `"none"` |

**ANSI color palette**: Each of 16 ANSI colors is routed through the `colorify()` function. If `theme.colors` specifies an explicit value it is used; otherwise the theme's RGB base color is mixed in via the color filter.

### Addons (load order matters)

1. `FitAddon` — dynamic resizing
2. `WebglAddon` — GPU-accelerated canvas rendering
3. `LigaturesAddon` — font ligature support
4. `AttachAddon` — WebSocket bidirectional relay (loaded on WS open)

### Color Filter System

Defined in `theme.terminal.colorFilter` as an array of function-call strings:

```json
["grayscale()", "lighten(0.3)", "mix(0.5)"]
```

Supported functions:
- **No-arg**: `negate`, `grayscale`
- **Numeric arg**: `lighten`, `darken`, `saturate`, `desaturate`, `whiten`, `blacken`, `fade`, `opaquer`, `rotate`, `mix`

Applied via the `color` npm library sequentially. Validation and parsing is cached in `window.isTermFilterValidated`. Default fallback filter: `grayscale().mix(themeColor, 0.3)`.

### WebSocket Protocol

- URL: `ws://127.0.0.1:{port}`
- Single client enforced by server (`verifyClient` rejects if any client already connected)
- Raw binary/text: PTY output flows directly through `AttachAddon`
- Resize messages: sent via IPC (not WebSocket): `["Resize", "080", "024"]`

### Key Methods

| Method | Description |
|--------|-------------|
| `fit()` | Calculates cols/rows via FitAddon, applies GCD aspect-ratio fixes, calls `resize()` |
| `resize(cols, rows)` | Calls `xterm.resize()` then `_sendSizeToServer()` |
| `_sendSizeToServer()` | Sends `["Resize", paddedCols, paddedRows]` over IPC |
| `write(cmd)` | Sends string directly to WebSocket (no newline) |
| `writelr(cmd)` | Sends `cmd + "\r"` (executes as shell command) |
| `resendCWD()` | Re-triggers `oncwdchange` callback (used on tab switch) |
| `clipboard.copy()` | Copies xterm selection to system clipboard |
| `clipboard.paste()` | Reads system clipboard, sends to terminal via WebSocket |

### fit() Aspect Ratio Fixes

GCD-based hardcoded corrections applied after FitAddon calculates dimensions:

| Condition | Adjustment |
|-----------|-----------|
| `d === 100` | `cols += 3`, `rows += 1` |
| `d === 256` | `cols += 2` |
| `termFontSize < 15` | `rows -= 1` |

### IPC Listener: `terminal_channel-{port}`

Handles messages from server:

| Message | Action |
|---------|--------|
| `"New cwd"` + path | Updates `this.cwd`, calls `oncwdchange(path)` |
| `"Fallback cwd"` + path | Sets `this.cwd` prefixed with `"FALLBACK |-- "`, calls `oncwdchange` |
| `"New process"` + name | Calls `onprocesschange(name)` |

On construction, immediately sends `"Renderer startup"` to notify server.

### Message Side-Effects

On every WebSocket message received:
- **Audio**: Plays `window.audioManager.stdout.play()` if `passwordMode === "false"` and ≥30ms since last sound
- **Refit**: Refits terminal every 10 messages
- **Globe**: If `experimentalGlobeFeatures` enabled, regex-matches IPv4 addresses and calls `window.mods.globe.addTemporaryConnectedMarker(ip)`

### Callbacks

```javascript
term.oncwdchange = (path) => { /* path is new cwd or "FALLBACK |-- path" */ }
term.onprocesschange = (name) => { /* name of foreground process */ }
term.onclose = () => { /* WebSocket closed */ }
```

---

## Server Role (Main Process)

Manages the PTY and a WebSocket server.

### Construction

```javascript
new Terminal({
    role: "server",
    shell: "/bin/bash",
    params: "",              // shell args; defaults to ["--login"] on Unix, [] on Windows
    cwd: "/path/to/dir",
    env: { ...cleanEnv, TERM: "xterm-256color", ... },
    port: 3000
})
```

### PTY Spawn

```javascript
node-pty.spawn(shell, args, {
    name: env.TERM || "xterm-256color",
    cols: 80, rows: 24,
    cwd, env
})
```

### CWD Tracking

Runs on a 1-second tick interval. Only executes if `_nextTickUpdateTtyCWD` flag is set (set whenever PTY produces output).

**Linux**: `fs.readlink(/proc/{pid}/cwd)`

**macOS**: `lsof -a -d cwd -p {pid} | tail -1 | awk '{ for (i=9; i<=NF; i++) printf "%s ", $i }'`

**Other**: Unsupported — `_disableCWDtracking` set to true, fallback CWD sent once.

If CWD retrieval fails, `_disableCWDtracking = true` permanently, fallback CWD sent to renderer.

### Process Tracking

Same 1-second tick, separate flag `_nextTickUpdateProcess`.

**Linux / macOS**: `ps -o comm --no-headers --sort=+pid -g {pid} | tail -1`

Sends `"New process"` update to renderer when process name changes.

### WebSocket Server

- `ws.Server` on `localhost:{port}`
- `verifyClient`: Rejects if `wss.clients.size >= 1` (single client only)
- On PTY data: sets both update flags, forwards data to WebSocket client
- On WebSocket message: writes directly to PTY via `tty.write(msg)`
- On WebSocket close: calls `ondisconnected(code, reason)`

### IPC Listener: `terminal_channel-{port}`

| Message | Action |
|---------|--------|
| `"Renderer startup"` | Stores renderer IPC sender; sends initial CWD |
| `["Resize", cols, rows]` | Converts padded strings to numbers, calls `tty.resize()` |

### Callbacks

```javascript
term.onclosed = (code, signal) => { /* PTY exited */ }
term.onopened = (pid) => { /* WebSocket client connected */ }
term.onresized = (cols, rows) => { /* resize logged */ }
term.ondisconnected = (code, reason) => { /* WebSocket client disconnected */ }
```

### close()

Kills PTY process and sets `_closed = true`. Does not close WebSocket server (caller must call `term.wss.close()` for extra tabs).

---

## Tab Management

Tabs 1–4 use the `extraTtys` pool (4 slots initialized to `null`).

**Creating a tab** (`focusShellTab(N)` where N is 1-4 and slot is null):
1. Renderer sends `ipc.send("ttyspawn", "true")`
2. Main finds first null slot in `extraTtys`, allocates next available port
3. Spawns new Terminal server; inherits CWD from current main TTY (`tty.tty._cwd`)
4. Sends `"ttyspawn-reply"` with `"SUCCESS: {port}"`
5. Renderer creates new Terminal client on that port
6. Tab label updates from "EMPTY" to port number

**Closing a tab** (PTY exits):
1. `onclosed` fires in renderer
2. Clears `onprocesschange`, disposes xterm instance, deletes from `window.term`
3. Resets tab label to "EMPTY"
4. Focuses previous tab

**Switching tabs** (`focusShellTab(N)` where tab exists):
1. Updates `window.currentTerm`
2. Swaps `.active` CSS class on tab `<li>` and terminal `<pre>` elements
3. Calls `fit()` and `focus()` on new terminal
4. Calls `resendCWD()` to refresh filesystem panel

Maximum 5 terminals total (1 main + 4 extra).
