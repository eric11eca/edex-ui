# Class Reference

All classes live in `src/classes/`. They are loaded as plain `<script>` tags in `ui.html` and instantiated in `_renderer.js`.

---

## Keyboard (`keyboard.class.js`, ~1291 lines)

Manages both the on-screen keyboard display and physical key input routing.

### Constructor Options

```javascript
new Keyboard({
    layout: "/path/to/layout.json",  // optional, defaults to settings
    parentId: "keyboard"             // DOM parent element ID
})
```

### On-Screen Key Structure

Each key renders as:
```html
<div class="keyboard_key" data-cmd="a" data-shift_cmd="A" data-ctrl_cmd="^A" ...>
  <h5>{altshift_name}</h5>
  <h4>{fn_name}</h4>
  <h3>{alt_name}</h3>
  <h2>{shift_name}</h2>
  <h1>{name}</h1>        <!-- primary label -->
</div>
```

### Modifier State

Tracked as `data-*` attributes on the keyboard container element:

| Attribute | Values | Meaning |
|-----------|--------|---------|
| `isShiftOn` | `"true"/"false"` | Shift held |
| `isCapsLckOn` | `"true"/"false"` | Caps Lock active |
| `isAltOn` | `"true"/"false"` | Alt/AltGr held |
| `isCtrlOn` | `"true"/"false"` | Ctrl held |
| `isFnOn` | `"true"/"false"` | Fn held |
| `passwordMode` | `"true"/"false"` | Hide visual feedback |

`window.passwordMode` (string) mirrors the container attribute — note this is a **string**, not a boolean.

### Key Command Selection Priority

When `pressKey()` fires, the command sent to the terminal is chosen by:

1. Shift + CapsLock → `shift_cmd`
2. CapsLock alone → `shift_cmd`
3. Ctrl → `ctrl_cmd`
4. Alt → `alt_cmd`
5. Alt + Shift → `altshift_cmd`
6. Fn → `fn_cmd`
7. Default → `cmd`

### Shortcut Dispatch

Before sending the key, checks shortcut categories in order:
`CtrlAltShift` → `CtrlAlt` → `CtrlShift` → `AltShift` → `Ctrl` → `Alt` → `Shift`

Matching shortcuts call `window.useAppShortcut(action)` or `window.term[].write/writelr(cmd)`.

### Hold / Repeat Behavior

- **Hold delay**: 400ms before first repeat
- **Repeat interval**: 70ms between repeats
- **Mouse leave**: clears hold timeout to prevent stuck keys

### Form Input Mode

When `this.linkedToTerm === false`, keypresses route to `document.activeElement`:
- Backspace: removes last character
- Arrows: adjust `selectionStart`/`selectionEnd`
- Other: appends to `value`, fires `input` and `change` events with `{detail: "keyboard"}`

### Dead Keys

11 dead key transformations, each mapping base characters to accented variants:
`addCircum`, `addTrema`, `addAcute`, `addGrave`, `addCaron`, `addBar`, `addBreve`, `addTilde`, `addMacron`, `addCedilla`, `addOverring`, `toGreek`, `addIotasub`

### Key Methods

| Method | Description |
|--------|-------------|
| `togglePasswordMode()` | Toggles password mode (hides typing feedback) |
| `keydownHandler(e)` | Physical keyboard event entry point (called from xterm) |
| `pressKey(cmd)` | Resolves and sends a key command |

---

## FilesystemDisplay (`filesystem.class.js`, ~743 lines)

Directory browser that follows the active terminal's CWD.

### Constructor

```javascript
new FilesystemDisplay()
// No options — reads window.settings, attaches to window.term[window.currentTerm]
```

### CWD Integration

```javascript
// Called on tab switch or terminal CWD change:
fsDisp.followTab()
// Attaches oncwdchange callback to window.term[window.currentTerm]
// Starts fs.watch() on new directory
// Detects "FALLBACK |-- " prefix → enters _noTracking mode
```

### File Object Schema

```javascript
{
    name: "filename.txt",
    path: "/full/path/filename.txt",
    type: "file" | "dir" | "symlink" | "disk" | "rom" | "usb"
         | "edex-theme" | "edex-themesDir" | "edex-kblayout"
         | "edex-kblayoutsDir" | "edex-settings" | "edex-shortcuts",
    category: "file" | "dir" | "symlink",
    hidden: true | false,            // name starts with "."
    lastAccessed: Date,
    size: number                     // bytes; 0 for dirs
}
```

### Sort Order

1. Directories first (category=dir → 0, symlink → 1, file → 2, other → 3)
2. Then alphabetical by name

Special entries prepended: "Show disks" (index 0), ".." Go up (index 1, unless at root).

### Click Behavior

| Modifier | Action |
|----------|--------|
| None | Execute type action (cd, openFile, themeChanger, etc.) |
| Ctrl | `electron.shell.openPath()` — open in system file manager |
| Shift | Insert quoted path into terminal |

### Type-Specific Click Actions

| Type | Default Action |
|------|---------------|
| `dir` | `cd "dirname"` |
| `..` (go up) | `cd ..` |
| Disk device | `cd "/mountpoint"` |
| `file` (text) | `openFile(index)` — modal text viewer |
| `file` (image/audio/video) | `openMedia(index)` — modal media viewer |
| `file` (PDF) | `openFile(index)` — modal PDF viewer |
| `edex-theme` | `window.themeChanger(name)` |
| `edex-themesDir` | `cd {themesDir}` |
| `edex-kblayout` | `window.remakeKeyboard(name)` |
| `edex-kblayoutsDir` | `cd {kblayoutsDir}` |
| `edex-settings` | `window.openSettings()` |
| `edex-shortcuts` | `window.openShortcutsHelp()` |

### Disk Usage

`reCalculateDiskUsage()` calls `window.si.fsSize()`, matches by mountpoint prefix, renders usage bar with percentage.

### Key Methods

| Method | Description |
|--------|-------------|
| `followTab()` | Attach to current terminal's CWD tracking |
| `readFS(path)` | Read and render directory |
| `readDevices()` | Read block devices (for "Show disks" view) |
| `render(fileList)` | Build and animate DOM for file list |
| `openFile(index)` | Open text/PDF in modal |
| `openMedia(index)` | Open image/audio/video in modal |
| `toggleListview()` | Toggle grid/list CSS class + persist |
| `toggleHidedotfiles()` | Toggle dotfile visibility + persist |

### File Icons

- Default: `fileIconsMatcher(name)` from `assets/misc/file-icons-match.js` → SVG from `assets/icons/file-icons.json`
- Custom SVG icons for: `edex-theme`, `edex-themesDir`, `edex-kblayout`, `edex-kblayoutsDir`, `edex-settings`
- Symbol icons for: disk (`💾`), ROM, USB, symlink, "go up", "show disks"

---

## Cpuinfo (`cpuinfo.class.js`, ~191 lines)

Real-time per-core CPU usage with Smoothie.js charts.

### Layout

```
CPU USAGE {manufacturer} {brand}
  # 1 - {divide}         Avg. XX%
  [smoothie chart — first half of cores]
  # {divide+1} - {cores} Avg. XX%
  [smoothie chart — second half of cores]
  TEMP  CORES  SPD      MAX     TASKS
  XX°C  N      X.XXGHz  X.XXGHz N
```

### Smoothie Configuration

- `millisPerPixel: 50` (~2.5s visible window)
- `limitFPS: 30`
- Y-axis: fixed 0–100
- Grid: transparent, no labels
- Line width: 1.7, color: theme RGB

### Update Intervals

| Data | Interval | systeminformation call |
|------|----------|----------------------|
| CPU load (per core) | 500ms | `currentLoad()` → `.cpus[].load` |
| CPU temperature | 2000ms (non-Windows) | `cpuTemperature()` → `.max` |
| CPU speed | 1000ms | `cpu()` → `.speed`, `.speedMax` |
| Task count | 5000ms | `processes()` → `.all` |

---

## Netstat (`netstat.class.js`, ~187 lines)

Network interface status, external IP, geolocation, and ping.

### Layout

```
NETWORK STATUS
{ONLINE|OFFLINE|UNKNOWN}
{IPv4 address}
PING {ms}ms
```

### Update Logic (every 2000ms)

1. Find active interface: uses `settings.iface` if set; else first external IPv4 with MAC address
2. On IP change: resets geolocation counter
3. Every 10 calls (after GeoIP DB loads): fetch `myexternalip.com/json`, run maxmind lookup
4. Ping `settings.pingAddr` (default `1.1.1.1`) on port 80 via TCP socket
5. Update DOM: ONLINE/OFFLINE, IPv4, ping time

### Ping Implementation

Uses `net.Socket()` with `process.hrtime()` for nanosecond-precision timing. Timeout: 1900ms. IPv4 only.

---

## Conninfo (`conninfo.class.js`, ~97 lines)

Real-time network traffic charts (upload/download).

### Layout

```
NETWORK TRAFFIC UP / DOWN, MB/S
{total up} / {total down}
[upload Smoothie chart]
[download Smoothie chart]
```

### Smoothie Configuration

- `millisPerPixel: 70` (~7s visible window)
- `limitFPS: 40`, `interpolation: 'linear'`
- Upload chart: `minValue = 0` (positive values)
- Download chart: `maxValue = 0` (negative values for mirrored display)
- Grid: theme color at 0.4 alpha, 5-second grid lines, 3 vertical sections
- Auto-scaling: both charts kept symmetric

### Update (every 1000ms)

Calls `window.si.networkStats(iface)`. Converts `tx_sec`/`rx_sec` from bytes/sec to MB/s (`÷ 125000`). Download is negated for downward chart rendering.

---

## Toplist (`toplist.class.js`, ~247 lines)

Top 5 processes by CPU+memory, and full sortable process list.

### Layout (inline)

```
TOP PROCESSES  PID | NAME | CPU | MEM
{pid}  {name}  {cpu}%  {mem}%
(5 rows)
```

### Top 5 Selection

Sort key: `(b.cpu - a.cpu) * 100 + b.mem - a.mem`. Takes first 5.

Thread aggregation (if `settings.excludeThreadsFromToplist`): keeps first occurrence by name, aggregates CPU/mem from duplicates.

### Full Process List Modal

Sortable columns: PID, Name, User, CPU, Memory, State, Started, Runtime.

Sort cycle: click → ascending → click → descending → click → default (CPU desc).

Runtime formatting: `DD:HH:MM:SS` from milliseconds.

Update interval while modal open: 1000ms.

---

## Modal (`modal.class.js`, ~200 lines)

Draggable popup windows.

### Constructor

```javascript
new Modal({
    type: "error" | "warning" | "info" | "custom",
    title: "Title Text",
    content: "HTML string",
    buttons: [{ label: "OK", callback: fn }],
    onclose: fn
})
```

### Behavior

- Draggable by title bar (cursor: move)
- Multiple modals stack by z-index (click to bring to front)
- augmented-ui corner clip borders styled from theme colors
- Error/warning use `--color_red`/`--color_yellow` CSS vars

---

## Clock (`clock.class.js`, ~47 lines)

Simple time display, updates every second via `setInterval`. Reads `settings.clockHours` for 12/24h format.

---

## AudioManager (`audiofx.class.js`, ~100 lines)

Manages sound effects via Howler.js. Named channels:

| Channel | Trigger |
|---------|---------|
| `stdout` | Terminal output received |
| `stdin` | Key pressed (physical or on-screen) |
| `granted` | Boot complete |
| `theme` | Title screen animation |
| `expand` | UI panel expand animation |
| `panels` | Individual panel fade-in |
| `folder` | Tab switch / directory navigation |
| `error` | Error modal shown |

Audio can be disabled via `settings.audio = false`. Volume: `settings.audioVolume` (0.0–1.0).

---

## FuzzyFinder (`fuzzyFinder.class.js`, ~136 lines)

Fuzzy filename search in current directory.

Instantiated via `window.useAppShortcut("FUZZY_SEARCH")` → `window.activeFuzzyFinder = new FuzzyFinder()`.

Opens a modal with a text input. Filters `window.fsDisp.cwd` file list by substring match on filename. Clicking a result navigates or opens the file.

---

## LocationGlobe (`locationGlobe.class.js`, ~300 lines)

WebGL globe showing geolocation of network connections.

- Uses maxmind + geolite2-redist for city-level IP lookup
- Renders on canvas with theme colors: `globe.base`, `globe.marker`, `globe.pin`, `globe.satellite`
- `addTemporaryConnectedMarker(ip)`: Called from terminal message listener when `experimentalGlobeFeatures` is enabled; places temporary blinking marker for detected IPs

---

## UpdateChecker (`updateChecker.class.js`)

Checks GitHub releases API for newer versions. Shown as a non-blocking info modal. Only runs once per session.

---

## DocReader (`docReader.class.js`)

PDF viewer using `pdfjs-dist`. Instantiated by `FilesystemDisplay.openFile()` when MIME type is `application/pdf`. Supports zoom in/out and page navigation.

---

## MediaPlayer (`mediaPlayer.class.js`)

Audio/video player with play/pause, scrubber, time display, and volume slider. Instantiated by `FilesystemDisplay.openMedia()`.
