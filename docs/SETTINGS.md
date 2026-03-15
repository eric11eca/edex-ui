# Settings Reference

## settings.json

Full schema with types, defaults, and descriptions.

```jsonc
{
  // Shell & PTY
  "shell": "bash",                    // Shell executable (absolute path or name resolved by `which`)
                                      // Windows default: "powershell.exe"
  "shellArgs": "",                    // Extra args passed to shell (string, space-separated)
  "cwd": "{userData}",                // Initial working directory for terminal
  "env": {},                          // Extra environment variables merged into shell env

  // Appearance
  "keyboard": "en-US",                // Keyboard layout filename (without .json)
  "theme": "tron",                    // Theme filename (without .json)
  "termFontSize": 15,                 // Terminal font size in points

  // Audio
  "audio": true,                      // Enable/disable all sound effects
  "audioVolume": 1.0,                 // Master volume (0.0 – 1.0)
  "disableFeedbackAudio": false,      // Disable stdin/stdout sounds specifically

  // Clock
  "clockHours": 24,                   // 12 or 24 hour format

  // Network
  "pingAddr": "1.1.1.1",             // Address to ping for latency measurement (port 80 TCP)
  "iface": null,                      // Force specific network interface (null = auto-detect)

  // Window
  "port": 3000,                       // Base WebSocket port (tabs use port+2 through port+5)
  "monitor": null,                    // Display index (null = primary)
  "forceFullscreen": true,            // Launch fullscreen
  "allowWindowed": false,             // Allow windowed mode (shows OS frame, enables resize)
  "keepGeometry": false,              // Maintain 16:9 aspect ratio when windowed

  // UI Behavior
  "nointro": false,                   // Skip boot animation
  "nocursor": false,                  // Hide mouse cursor
  "hideDotfiles": false,              // Hide dotfiles in filesystem panel
  "fsListView": false,                // Filesystem panel: list view (true) or grid view (false)
  "excludeThreadsFromToplist": true,  // Aggregate threads under parent process in top list

  // Experimental
  "experimentalGlobeFeatures": false, // Auto-detect IPs in terminal output → globe markers
  "experimentalFeatures": false,      // Enable experimental Electron features

  // Username override (optional)
  "username": null                    // Override detected username in UI greeting
}
```

## shortcuts.json

Array of shortcut objects:

```jsonc
[
  {
    "type": "app",                    // "app" = Electron globalShortcut | "shell" = send text to terminal
    "trigger": "Ctrl+Shift+C",        // Accelerator string (Electron format)
    "action": "COPY",                 // Action identifier (see app actions below) or shell command text
    "enabled": true,
    "linebreak": false                // Shell type only: append \r after command
  }
]
```

### App Shortcut Actions

| Action | Effect |
|--------|--------|
| `COPY` | Copy terminal selection to clipboard |
| `PASTE` | Paste clipboard into terminal |
| `NEXT_TAB` | Cycle forward through tabs (0→1→...→4→0) |
| `PREVIOUS_TAB` | Cycle backward through tabs |
| `TAB_1` – `TAB_5` | Focus specific tab (1-indexed in shortcuts, 0-indexed internally) |
| `TAB_X` | Registers all TAB_1 through TAB_5 with modifier variants |
| `SETTINGS` | Open settings modal |
| `SHORTCUTS` | Open shortcuts help modal |
| `FUZZY_SEARCH` | Open fuzzy finder modal |
| `FS_LIST_VIEW` | Toggle filesystem list/grid view |
| `FS_DOTFILES` | Toggle dotfile visibility |
| `KB_PASSMODE` | Toggle keyboard password mode |
| `DEV_DEBUG` | Toggle Electron DevTools |
| `DEV_RELOAD` | Reload renderer process |

### Default Shortcuts

| Trigger | Type | Action |
|---------|------|--------|
| Ctrl+Shift+C | app | COPY |
| Ctrl+Shift+V | app | PASTE |
| Ctrl+Shift+Right | app | NEXT_TAB |
| Ctrl+Shift+Left | app | PREVIOUS_TAB |
| Ctrl+Shift+Alt+1–5 | app | TAB_X |
| Ctrl+Shift+S | app | SETTINGS |
| Ctrl+Shift+K | app | SHORTCUTS |
| Ctrl+Shift+F | app | FUZZY_SEARCH |
| Ctrl+Shift+L | app | FS_LIST_VIEW |
| Ctrl+Shift+H | app | FS_DOTFILES |
| Ctrl+Shift+P | app | KB_PASSMODE |
| Ctrl+Shift+D | app | DEV_DEBUG |
| Ctrl+Shift+R | app | DEV_RELOAD |
| Ctrl+Shift+Alt+Space | shell | `neofetch` (disabled by default) |

### Shortcut Registration

Shortcuts are registered via `electron.remote.globalShortcut` in `registerKeyboardShortcuts()`.

- Re-registered on window focus
- Unregistered on window blur (prevents conflicts with other apps)
- Registration happens in renderer — requires `@electron/remote` module

## Environment Variables Injected into Shell

These are always merged into the shell environment regardless of `settings.env`:

| Variable | Value |
|----------|-------|
| `TERM` | `xterm-256color` |
| `COLORTERM` | `truecolor` |
| `TERM_PROGRAM` | `eDEX-UI` |
| `TERM_PROGRAM_VERSION` | App version (e.g., `2.2.8`) |

User-defined `settings.env` values are merged after these and can override them.

Proxy variables (`http_proxy`, `https_proxy`) are explicitly deleted from the environment to prevent WebSocket connection issues.
