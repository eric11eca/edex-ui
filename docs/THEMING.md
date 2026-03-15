# Themes and Keyboard Layouts

## Theme System

### File Locations

- **Bundled**: `src/assets/themes/*.json` (21 themes, copied to userData on first run)
- **User**: `{userData}/themes/*.json` (editable; survives app updates)
- **Active theme**: selected by `settings.theme` (filename without `.json`)

### Full Theme Schema

```jsonc
{
  // Base RGB color — used as CSS variables --color_r/g/b for dynamic rgba() expressions
  "colors": {
    "r": 0,              // 0-255
    "g": 195,            // 0-255
    "b": 255,            // 0-255
    "black": "#000000",          // Pure black
    "light_black": "#0D0D0F",    // Panel background
    "grey": "#1C1C1E",           // Grid line color

    // Optional: explicit ANSI 16-color palette (overrides colorFilter mixing)
    "red": "#FF0000",
    "green": "#00FF00",
    "yellow": "#FFFF00",
    "blue": "#0000FF",
    "magenta": "#FF00FF",
    "cyan": "#00FFFF",
    "white": "#FFFFFF",
    "lightBlack": "#555555",
    "lightRed": "#FF5555",
    "lightGreen": "#55FF55",
    "lightYellow": "#FFFF55",
    "lightBlue": "#5555FF",
    "lightMagenta": "#FF55FF",
    "lightCyan": "#55FFFF",
    "lightWhite": "#FFFFFF"
  },

  // Font families — loaded as WOFF2 from {userData}/fonts/ or system fonts
  "cssvars": {
    "font_main": "United Sans Medium",
    "font_main_light": "United Sans Light"
  },

  // xterm.js terminal configuration
  "terminal": {
    "fontFamily": "Fira Mono",
    "cursorStyle": "block",           // "block" | "underline" | "bar"
    "cursorBlink": true,
    "allowTransparency": false,
    "fontWeight": "normal",
    "fontWeightBold": "bold",
    "letterSpacing": 0,
    "lineHeight": 1,
    "foreground": "#00C3FF",          // hex or rgba()
    "background": "#000000",
    "cursor": "#00C3FF",
    "cursorAccent": "#000000",
    "selection": "rgba(0, 195, 255, 0.3)",

    // Color filter pipeline — applied to ANSI colors not explicitly set in colors.*
    // Each entry is "functionName(arg)" or "functionName()"
    // Supported: negate, grayscale, lighten(n), darken(n), saturate(n),
    //            desaturate(n), whiten(n), blacken(n), fade(n), opaquer(n),
    //            rotate(n), mix(n)
    "colorFilter": ["grayscale()", "mix(0.3)"]
  },

  // Globe visualization colors
  "globe": {
    "base": "#0D0D0F",
    "marker": "#00C3FF",
    "pin": "#00C3FF",
    "satellite": "#00C3FF"
  },

  // Raw CSS injected into <head> — useful for overriding anything in the UI
  // Sanitized via _purifyCSS() (strips < characters)
  "injectCSS": ""
}
```

### CSS Variables Injected by Themes

When `_loadTheme()` runs, these CSS variables are set on `:root`:

| Variable | Source |
|----------|--------|
| `--color_r` | `theme.colors.r` |
| `--color_g` | `theme.colors.g` |
| `--color_b` | `theme.colors.b` |
| `--color_black` | `theme.colors.black` |
| `--color_light_black` | `theme.colors.light_black` |
| `--color_grey` | `theme.colors.grey` |
| `--color_red` | `theme.colors.red` (for error modals) |
| `--color_yellow` | `theme.colors.yellow` (for warning modals) |
| `--font_main` | `theme.cssvars.font_main` |
| `--font_main_light` | `theme.cssvars.font_main_light` |
| `--font_mono` | `theme.terminal.fontFamily` |

Additionally, `window.theme` is set to the theme object plus shorthand `theme.r`, `theme.g`, `theme.b`.

### Hot-Switching Themes

1. User selects theme in Settings modal
2. `window.themeChanger(filename)` calls `ipc.send("setThemeOverride", filename)` then reloads
3. On next load, renderer requests `getThemeOverride` — main responds with filename
4. `_loadTheme()` loads the override theme instead of `settings.theme`

This avoids writing to `settings.json` for temporary previews. To persist: save settings and restart.

### Available Themes (21)

| Theme | Description |
|-------|-------------|
| `tron` | Default — cyan on black |
| `tron-colorfilter` | Tron with custom color filter |
| `tron-disrupted` | Tron variant |
| `tron-fulltype` | Tron with full typeface |
| `tron-notype` | Tron without typeface labels |
| `tron-typeleft` | Tron with left-aligned type |
| `blade` | Dark blue/teal |
| `navy` | Navy blue |
| `navy-disrupted` | Navy variant |
| `navy-notype` | Navy without typeface |
| `apollo` | Orange/amber |
| `apollo-notype` | Apollo without typeface |
| `matrix` | Green on black |
| `chalkboard` | White on dark grey |
| `chalkboard-ligatures` | Chalkboard with ligatures |
| `chalkboard-notype` | Chalkboard without typeface |
| `cyborg` | Red/dark |
| `cyborg-focus` | Cyborg variant |
| `interstellar` | Purple/space |
| `nord` | Nord color palette (explicit 16-color palette) |
| `red` | Red accent |

---

## Keyboard Layout System

### File Locations

- **Bundled**: `src/assets/kb_layouts/*.json` (19 layouts)
- **User**: `{userData}/keyboards/*.json`
- **Active**: selected by `settings.keyboard` (filename without `.json`)

### Full Layout Schema

```jsonc
{
  // 5 rows named: row_numbers, row_1, row_2, row_3, row_space
  // Each row is an array of key objects

  "row_numbers": [
    {
      "name": "ESC",             // Display label (normal state)
      "cmd": "~~~CTRLSEQ1~~~",   // Character/sequence sent to PTY

      // Optional modifier variants:
      "shift_name": "~",         // Display label when Shift held
      "shift_cmd": "~",          // Sent when Shift held
      "ctrl_cmd": "",            // Sent when Ctrl held
      "alt_cmd": "",             // Sent when Alt held (AltGr on some layouts)
      "alt_name": "",            // Display label when Alt held
      "fn_name": "F1",           // Display label when Fn held
      "fn_cmd": "~~~CTRLSEQ1~~~OP"  // Sent when Fn held (F1 key)
    }
  ],
  "row_1": [ /* ... */ ],
  "row_2": [ /* ... */ ],
  "row_3": [ /* ... */ ],
  "row_space": [ /* ... */ ]   // Contains Ctrl, Fn, Space, AltGr, arrows
}
```

### Control Sequence Placeholders

Placeholders in `cmd` strings are replaced at runtime:

| Placeholder | Replacement | Meaning |
|-------------|-------------|---------|
| `~~~CTRLSEQ1~~~` | ESC (`\x1b`) | Escape character |
| `~~~CTRLSEQ2~~~` | DEL (`\x7f`) | Delete |
| `~~~CTRLSEQ{N}~~~` | `ctrlseq[N]` | Nth entry in control sequence array |

### Special Commands (Modifier Keys)

These `cmd` values trigger modifier state changes rather than sending characters:

| Command Value | Effect |
|--------------|--------|
| `"ESCAPED\|-- SHIFT: LEFT"` | Toggle left Shift on/off |
| `"ESCAPED\|-- SHIFT: RIGHT"` | Toggle right Shift on/off |
| `"ESCAPED\|-- CTRL: LEFT"` | Toggle left Ctrl on/off |
| `"ESCAPED\|-- CTRL: RIGHT"` | Toggle right Ctrl on/off |
| `"ESCAPED\|-- ALT: RIGHT"` | Toggle AltGr on/off |
| `"ESCAPED\|-- FN: ON"` | Toggle Fn on/off |
| `"ESCAPED\|-- CAPSLCK: ON"` | Toggle Caps Lock on/off |
| `"ESCAPED\|-- CAPSLCK: OFF"` | (same toggle) |

### Dead Key Commands

These activate a "next key transformation" mode:

| Command | Transformation Applied |
|---------|----------------------|
| `"ESCAPED\|-- DEAD: CIRCUM"` | Add circumflex (â, ê, ...) |
| `"ESCAPED\|-- DEAD: TREMA"` | Add diaeresis (ä, ë, ...) |
| `"ESCAPED\|-- DEAD: ACUTE"` | Add acute accent (á, é, ...) |
| `"ESCAPED\|-- DEAD: GRAVE"` | Add grave accent (à, è, ...) |
| `"ESCAPED\|-- DEAD: CARON"` | Add caron (č, š, ...) |
| `"ESCAPED\|-- DEAD: BAR"` | Add stroke/bar (ł, ø, ...) |
| `"ESCAPED\|-- DEAD: BREVE"` | Add breve (ă, ě, ...) |
| `"ESCAPED\|-- DEAD: TILDE"` | Add tilde (ã, ñ, ...) |
| `"ESCAPED\|-- DEAD: MACRON"` | Add macron (ā, ē, ...) |
| `"ESCAPED\|-- DEAD: CEDILLA"` | Add cedilla (ç, ş, ...) |
| `"ESCAPED\|-- DEAD: OVERRING"` | Add overring (å, ů, ...) |
| `"ESCAPED\|-- DEAD: GREEK"` | Convert to Greek letter |
| `"ESCAPED\|-- DEAD: IOTASUB"` | Add iota subscript |

### Arrow Key Icons

Keys with `name: "ESCAPED|-- ICON: ARROW_UP"` etc. render SVG arrow icons instead of text. Variants: `ARROW_UP`, `ARROW_DOWN`, `ARROW_LEFT`, `ARROW_RIGHT`.

### Physical Key Mapping

The keyboard class maps physical `KeyboardEvent.code` values to layout keys:
- Looks up the key's `cmd` or `shift_cmd` attribute in the on-screen keyboard DOM
- Special codes (`ShiftLeft`, `ControlLeft`, `AltRight`, etc.) mapped to modifier escape commands
- Arrow codes mapped to ANSI escape sequences directly

### Available Layouts (19)

`da-DK`, `de-DE`, `en-COLEMAK`, `en-DVORAK`, `en-GB`, `en-NORMAN`, `en-US`, `en-WORKMAN`, `es-ES`, `es-LAT`, `fr-BEPO`, `fr-FR`, `hu-HU`, `it-IT`, `nl-BE`, `pt-BR`, `sv-SE`, `tr-TR-F`, `tr-TR-Q`

### Hot-Switching Keyboard

```javascript
window.remakeKeyboard(layoutFilename)
// Clears keyboard DOM, creates new Keyboard(), sends setKbOverride IPC
```
