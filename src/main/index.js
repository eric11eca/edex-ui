import signale from 'signale';
import { app, BrowserWindow, dialog, shell, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import which from 'which';
import { PtyManager } from './pty-manager.js';
import { init as initIpcHandlers, cleanup as cleanupIpcHandlers } from './ipc-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.on("uncaughtException", e => {
  signale.fatal(e);
  dialog.showErrorBox("eDEX-UI crashed", e.message || "Cannot retrieve error message.");
  if (tty) {
    tty.close();
  }
  if (extraTtys) {
    Object.keys(extraTtys).forEach(key => {
      if (extraTtys[key] !== null) {
        extraTtys[key].close();
      }
    });
  }
  process.exit(1);
});

signale.start(`Starting eDEX-UI v${app.getVersion()}`);
signale.info(`With Node ${process.versions.node} and Electron ${process.versions.electron}`);
signale.info(`Renderer is Chrome ${process.versions.chrome}`);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  signale.fatal("Error: Another instance of eDEX is already running. Cannot proceed.");
  app.exit(1);
}

signale.time("Startup");

// @electron/remote removed - using preload bridge with contextIsolation: true

ipcMain.on("log", (e, type, content) => {
  signale[type](content);
});

let win, tty, extraTtys;

const settingsFile = path.join(app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(app.getPath("userData"), "lastWindowState.json");
const themesDir = path.join(app.getPath("userData"), "themes");
const kblayoutsDir = path.join(app.getPath("userData"), "keyboards");
const fontsDir = path.join(app.getPath("userData"), "fonts");

// Resolve paths to internal assets
// In dev mode, assets are in src/assets relative to project root.
// In production, they're in extraResources.
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.resolve(__dirname, '..', '..')  // dist-electron/main/ → project root
  : path.dirname(app.getAppPath());
const assetsBase = isDev
  ? path.join(projectRoot, 'src', 'assets')
  : path.join(process.resourcesPath, 'assets');
const innerThemesDir = path.join(assetsBase, "themes");
const innerKblayoutsDir = path.join(assetsBase, "kb_layouts");
const innerFontsDir = path.join(assetsBase, "fonts");

// Unset proxy env variables to avoid connection problems on the internal websockets
// See #222
if (process.env.http_proxy) delete process.env.http_proxy;
if (process.env.https_proxy) delete process.env.https_proxy;

// Bypass GPU acceleration blocklist
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-video-decode");

// Fix userData folder not setup on Windows
try {
  fs.mkdirSync(app.getPath("userData"));
  signale.info(`Created config dir at ${app.getPath("userData")}`);
} catch (e) {
  signale.info(`Base config dir is ${app.getPath("userData")}`);
}

// Create default settings file
if (!fs.existsSync(settingsFile)) {
  fs.writeFileSync(settingsFile, JSON.stringify({
    shell: (process.platform === "win32") ? "powershell.exe" : "bash",
    shellArgs: '',
    cwd: app.getPath("userData"),
    keyboard: "en-US",
    theme: "tron",
    termFontSize: 15,
    audio: true,
    audioVolume: 1.0,
    disableFeedbackAudio: false,
    clockHours: 24,
    pingAddr: "1.1.1.1",
    port: 3000,
    nointro: false,
    nocursor: false,
    forceFullscreen: true,
    allowWindowed: false,
    excludeThreadsFromToplist: true,
    hideDotfiles: false,
    fsListView: false,
    experimentalGlobeFeatures: false,
    experimentalFeatures: false,
  }, "", 4));
  signale.info(`Default settings written to ${settingsFile}`);
}

// Create default shortcuts file
if (!fs.existsSync(shortcutsFile)) {
  fs.writeFileSync(shortcutsFile, JSON.stringify([
    { type: "app", trigger: "Ctrl+Shift+C", action: "COPY", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+V", action: "PASTE", enabled: true },
    { type: "app", trigger: "Ctrl+Tab", action: "NEXT_TAB", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+Tab", action: "PREVIOUS_TAB", enabled: true },
    { type: "app", trigger: "Ctrl+X", action: "TAB_X", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+S", action: "SETTINGS", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+K", action: "SHORTCUTS", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+F", action: "FUZZY_SEARCH", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+L", action: "FS_LIST_VIEW", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+H", action: "FS_DOTFILES", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+P", action: "KB_PASSMODE", enabled: true },
    { type: "app", trigger: "Ctrl+Shift+I", action: "DEV_DEBUG", enabled: false },
    { type: "app", trigger: "Ctrl+Shift+F5", action: "DEV_RELOAD", enabled: true },
    { type: "shell", trigger: "Ctrl+Shift+Alt+Space", action: "neofetch", linebreak: true, enabled: false },
  ], "", 4));
  signale.info(`Default keymap written to ${shortcutsFile}`);
}

// Create default window state file
if (!fs.existsSync(lastWindowStateFile)) {
  fs.writeFileSync(lastWindowStateFile, JSON.stringify({
    useFullscreen: true,
  }, "", 4));
  signale.info(`Default last window state written to ${lastWindowStateFile}`);
}

// Copy default themes & keyboard layouts & fonts
signale.pending("Mirroring internal assets...");
for (const [target, source] of [[themesDir, innerThemesDir], [kblayoutsDir, innerKblayoutsDir], [fontsDir, innerFontsDir]]) {
  try { fs.mkdirSync(target); } catch (e) { /* Folder already exists */ }
  if (fs.existsSync(source)) {
    fs.readdirSync(source).forEach(file => {
      fs.writeFileSync(path.join(target, file), fs.readFileSync(path.join(source, file)));
    });
  }
}

// Version history logging
const versionHistoryPath = path.join(app.getPath("userData"), "versions_log.json");
let versionHistory = {};
try {
  versionHistory = JSON.parse(fs.readFileSync(versionHistoryPath, 'utf-8'));
} catch (e) { /* no version history yet */ }
const version = app.getVersion();
if (typeof versionHistory[version] === "undefined") {
  versionHistory[version] = {
    firstSeen: Date.now(),
    lastSeen: Date.now(),
  };
} else {
  versionHistory[version].lastSeen = Date.now();
}
fs.writeFileSync(versionHistoryPath, JSON.stringify(versionHistory, 0, 2), { encoding: "utf-8" });

function createWindow(settings) {
  signale.info("Creating window...");

  let display;
  if (!isNaN(settings.monitor)) {
    display = screen.getAllDisplays()[settings.monitor] || screen.getPrimaryDisplay();
  } else {
    display = screen.getPrimaryDisplay();
  }
  let { x, y, width, height } = display.bounds;
  width++; height++;

  // Resolve the renderer HTML path
  const htmlPath = isDev
    ? path.join(projectRoot, 'src', 'ui.html')
    : path.join(__dirname, '..', '..', 'dist', 'src', 'ui.html');

  win = new BrowserWindow({
    title: "eDEX-UI",
    x,
    y,
    width,
    height,
    show: false,
    resizable: true,
    movable: settings.allowWindowed || false,
    fullscreen: isDev ? false : (settings.forceFullscreen || false),
    autoHideMenuBar: true,
    frame: settings.allowWindowed || false,
    backgroundColor: '#000000',
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      backgroundThrottling: false,
      webSecurity: !isDev,
      nodeIntegration: false,
      sandbox: false, // preload needs Node.js APIs
      nodeIntegrationInSubFrames: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: settings.experimentalFeatures || false,
      preload: isDev
        ? path.join(projectRoot, 'src', 'main', 'preload.js')
        : path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    // In dev mode, Vite serves the HTML
    const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
    if (VITE_DEV_SERVER_URL) {
      // Vite root is src/, so ui.html is at /ui.html
      const url = VITE_DEV_SERVER_URL.endsWith('/')
        ? VITE_DEV_SERVER_URL + 'ui.html'
        : VITE_DEV_SERVER_URL + '/ui.html';
      signale.info(`Loading dev URL: ${url}`);
      win.loadURL(url);
    } else {
      win.loadFile(htmlPath);
    }
  } else {
    win.loadFile(htmlPath);
  }

  signale.complete("Frontend window created!");
  win.show();
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      if (level >= 2) { // warnings and errors
        signale.warn(`[Renderer] ${message}`);
      }
    });
    win.webContents.on('did-fail-load', (e, code, desc, url) => {
      signale.error(`[Renderer] Failed to load: ${url} (${code}: ${desc})`);
    });
  }
  if (!settings.allowWindowed) {
    win.setResizable(false);
  } else {
    try {
      const lastState = JSON.parse(fs.readFileSync(lastWindowStateFile, 'utf-8'));
      if (!lastState.useFullscreen) {
        win.setFullScreen(false);
      }
    } catch (e) { /* use default */ }
  }

  signale.watch("Waiting for frontend connection...");
}

app.on('ready', async () => {
  signale.pending(`Loading settings file...`);
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  } catch (e) {
    throw new Error("Failed to parse settings.json: " + e.message);
  }

  // Dev overrides: read .dev.json from project root for quick theme/settings testing
  const devConfigPath = path.join(projectRoot, '.dev.json');
  if (isDev && fs.existsSync(devConfigPath)) {
    try {
      const devOverrides = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'));
      Object.assign(settings, devOverrides);
      signale.info(`Dev overrides applied from .dev.json: ${Object.keys(devOverrides).join(', ')}`);
    } catch (e) {
      signale.warn(`Failed to parse .dev.json: ${e.message}`);
    }

    // Watch .dev.json for changes — auto-reload the renderer
    fs.watch(devConfigPath, { persistent: false }, (eventType) => {
      if (eventType === 'change' && win && !win.isDestroyed()) {
        signale.info('.dev.json changed — reloading renderer...');
        win.webContents.reloadIgnoringCache();
      }
    });
  }
  signale.pending(`Resolving shell path...`);
  settings.shell = await which(settings.shell).catch(e => { throw (e); });
  signale.info(`Shell found at ${settings.shell}`);
  signale.success(`Settings loaded!`);

  if (!fs.existsSync(settings.cwd)) {
    signale.warn(`Configured cwd "${settings.cwd}" does not exist, falling back to home directory`);
    settings.cwd = app.getPath("home");
  }

  // See #366
  let shellEnv;
  try {
    const shellEnvModule = await import('shell-env');
    const shellEnvFn = shellEnvModule.default || shellEnvModule.shellEnv || shellEnvModule;
    shellEnv = await shellEnvFn(settings.shell);
  } catch (e) {
    signale.warn("Could not load shell environment, using process.env");
    shellEnv = { ...process.env };
  }

  const cleanEnv = Object.assign({}, shellEnv, {
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "eDEX-UI",
    TERM_PROGRAM_VERSION: app.getVersion(),
  }, settings.env);

  signale.pending(`Creating new terminal process on port ${settings.port || '3000'}`);
  tty = new PtyManager({
    shell: settings.shell,
    params: settings.shellArgs || '',
    cwd: settings.cwd,
    env: cleanEnv,
    port: settings.port || 3000,
  });
  signale.success(`Terminal back-end initialized!`);
  tty.onclosed = (code, signal) => {
    tty.ondisconnected = () => {};
    signale.complete("Terminal exited", code, signal);
    app.quit();
  };
  tty.onopened = () => {
    signale.success("Connected to frontend!");
    signale.timeEnd("Startup");
  };
  tty.onresized = (cols, rows) => {
    signale.info("Resized TTY to ", cols, rows);
  };
  tty.ondisconnected = () => {
    signale.error("Lost connection to frontend");
    signale.watch("Waiting for frontend connection...");
  };

  // Support for multithreaded systeminformation calls
  signale.pending("Starting multithreaded calls controller...");
  await import('./multithread.js');

  createWindow(settings);

  // Initialize IPC handlers for the preload bridge
  initIpcHandlers({
    win,
    assetsBase,
    devConfigPath: isDev ? devConfigPath : null,
    settingsFile,
    shortcutsFile,
    lastWindowStateFile,
    themesDir,
    kblayoutsDir: path.join(app.getPath("userData"), "keyboards"),
    fontsDir,
  });

  // Support for more terminals (currently limited to 4 extra terms)
  extraTtys = {};
  let basePort = settings.port || 3000;
  basePort = Number(basePort) + 2;

  for (let i = 0; i < 4; i++) {
    extraTtys[basePort + i] = null;
  }

  ipcMain.on("ttyspawn", (e, arg) => {
    let port = null;
    Object.keys(extraTtys).forEach(key => {
      if (extraTtys[key] === null && port === null) {
        extraTtys[key] = {};
        port = key;
      }
    });

    if (port === null) {
      signale.error("TTY spawn denied (Reason: exceeded max TTYs number)");
      e.sender.send("ttyspawn-reply", "ERROR: max number of ttys reached");
    } else {
      signale.pending(`Creating new TTY process on port ${port}`);
      let term = new PtyManager({
        shell: settings.shell,
        params: settings.shellArgs || '',
        cwd: tty.tty._cwd || settings.cwd,
        env: cleanEnv,
        port: port,
      });
      signale.success(`New terminal back-end initialized at ${port}`);
      term.onclosed = (code, signal) => {
        term.ondisconnected = () => {};
        term.wss.close();
        signale.complete(`TTY exited at ${port}`, code, signal);
        extraTtys[term.port] = null;
        term = null;
      };
      term.onopened = pid => {
        signale.success(`TTY ${port} connected to frontend (process PID ${pid})`);
      };
      term.onresized = () => {};
      term.ondisconnected = () => {
        term.onclosed = () => {};
        term.close();
        term.wss.close();
        extraTtys[term.port] = null;
        term = null;
      };

      extraTtys[port] = term;
      e.sender.send("ttyspawn-reply", "SUCCESS: " + port);
    }
  });

  // Backend support for theme and keyboard hotswitch
  let themeOverride = null;
  let kbOverride = null;
  ipcMain.on("getThemeOverride", (e, arg) => {
    e.sender.send("getThemeOverride", themeOverride);
  });
  ipcMain.on("getKbOverride", (e, arg) => {
    e.sender.send("getKbOverride", kbOverride);
  });
  ipcMain.on("setThemeOverride", (e, arg) => {
    themeOverride = arg;
  });
  ipcMain.on("setKbOverride", (e, arg) => {
    kbOverride = arg;
  });
});

app.on('web-contents-created', (e, contents) => {
  // Prevent creating more than one window
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent loading something else than the UI
  contents.on('will-navigate', (e, url) => {
    if (url !== contents.getURL()) e.preventDefault();
  });
});

app.on('window-all-closed', () => {
  signale.info("All windows closed");
  app.quit();
});

app.on('before-quit', () => {
  cleanupIpcHandlers();
  tty.close();
  Object.keys(extraTtys).forEach(key => {
    if (extraTtys[key] !== null) {
      extraTtys[key].close();
    }
  });
  signale.complete("Shutting down...");
});
