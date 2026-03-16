import { ipcMain, app, shell, screen, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';

// Will be set by init()
let win = null;
let assetsBase = null;
let devConfigPath = null;
let settingsFile = null;
let shortcutsFile = null;
let lastWindowStateFile = null;
let themesDir = null;
let kblayoutsDir = null;
let fontsDir = null;

// GeoIP state
let geoLookup = null;

// fs.watch state
const watchers = new Map();

// Theme/keyboard override state
let themeOverride = null;
let kbOverride = null;

export function init(options) {
  win = options.win;
  assetsBase = options.assetsBase;
  devConfigPath = options.devConfigPath || null;
  settingsFile = options.settingsFile;
  shortcutsFile = options.shortcutsFile;
  lastWindowStateFile = options.lastWindowStateFile;
  themesDir = options.themesDir;
  kblayoutsDir = options.kblayoutsDir;
  fontsDir = options.fontsDir;

  registerAppHandlers();
  registerWindowHandlers();
  registerConfigHandlers();
  registerFsHandlers();
  registerHotswitchHandlers();
  registerShellHandlers();
  registerNetHandlers();
  registerGeoipHandlers();
  registerShortcutHandlers();
  // Forward window events to renderer
  win.on('resize', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('window:resized');
    }
  });
  win.on('leave-full-screen', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('window:leave-full-screen');
    }
  });
}

export function setWin(w) {
  win = w;
}

// --- App handlers ---
function registerAppHandlers() {
  ipcMain.on('app:getVersion', (e) => {
    e.returnValue = app.getVersion();
  });
  ipcMain.on('app:getPath', (e, name) => {
    const allowed = ['userData', 'home', 'temp', 'desktop', 'documents', 'downloads'];
    if (allowed.includes(name)) {
      e.returnValue = app.getPath(name);
    } else {
      e.returnValue = '';
    }
  });
  ipcMain.on('app:getAssetsPath', (e) => {
    e.returnValue = assetsBase;
  });
  ipcMain.on('app:getProcessArgv', (e) => {
    e.returnValue = process.argv;
  });
  ipcMain.on('app:isPackaged', (e) => {
    e.returnValue = app.isPackaged;
  });
  ipcMain.handle('app:getDisplayCount', () => {
    return screen.getAllDisplays().length;
  });
  ipcMain.on('app:focus', () => {
    app.focus();
  });
  ipcMain.on('app:quit', () => {
    app.quit();
  });
  ipcMain.on('app:relaunch', () => {
    app.relaunch();
    app.quit();
  });
}

// --- Window handlers ---
function registerWindowHandlers() {
  ipcMain.on('window:minimize', () => {
    if (win) win.minimize();
  });
  ipcMain.on('window:isFullScreen', (e) => {
    e.returnValue = win ? win.isFullScreen() : false;
  });
  ipcMain.on('window:setFullScreen', (e, flag) => {
    if (win) win.setFullScreen(flag);
  });
  ipcMain.on('window:getSize', (e) => {
    e.returnValue = win ? win.getSize() : [0, 0];
  });
  ipcMain.on('window:setSize', (e, w, h) => {
    if (win) win.setSize(w, h);
  });
  ipcMain.on('window:unmaximize', () => {
    if (win) win.unmaximize();
  });
  ipcMain.on('window:isMaximized', (e) => {
    e.returnValue = win ? win.isMaximized() : false;
  });
  ipcMain.on('window:toggleDevTools', () => {
    if (win) win.webContents.toggleDevTools();
  });
}

// --- Config handlers ---
function registerConfigHandlers() {
  ipcMain.handle('config:readSettings', () => {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    // Merge dev overrides in dev mode
    if (devConfigPath && fs.existsSync(devConfigPath)) {
      try {
        Object.assign(settings, JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')));
      } catch (e) { /* ignore parse errors */ }
    }
    // Validate cwd exists, fall back to home directory
    if (settings.cwd && !fs.existsSync(settings.cwd)) {
      settings.cwd = app.getPath('home');
    }
    return settings;
  });
  ipcMain.handle('config:readShortcuts', () => {
    return JSON.parse(fs.readFileSync(shortcutsFile, 'utf-8'));
  });
  ipcMain.handle('config:readWindowState', () => {
    return JSON.parse(fs.readFileSync(lastWindowStateFile, 'utf-8'));
  });
  ipcMain.handle('config:readTheme', (e, name) => {
    // Sanitize name to prevent path traversal
    const safeName = path.basename(name).replace(/[^a-zA-Z0-9_\-\.]/g, '');
    const themePath = path.join(themesDir, safeName + '.json');
    return JSON.parse(fs.readFileSync(themePath, 'utf-8'));
  });
  ipcMain.handle('config:readKeyboardLayout', (e, name) => {
    const safeName = path.basename(name).replace(/[^a-zA-Z0-9_\-\.]/g, '');
    const layoutPath = path.join(kblayoutsDir, safeName + '.json');
    return JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
  });
  ipcMain.handle('config:readBootLog', () => {
    return fs.readFileSync(path.join(assetsBase, 'misc', 'boot_log.txt'), 'utf-8');
  });
  ipcMain.handle('config:writeSettings', (e, data) => {
    fs.writeFileSync(settingsFile, JSON.stringify(data, '', 4));
  });
  ipcMain.handle('config:writeWindowState', (e, data) => {
    fs.writeFileSync(lastWindowStateFile, JSON.stringify(data, '', 4));
  });
  ipcMain.handle('config:writeFile', (e, filePath, content) => {
    // Validate path is within userData for safety
    const userData = app.getPath('userData');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(userData) && !resolved.startsWith(app.getPath('home'))) {
      throw new Error('Write access denied: path outside allowed directories');
    }
    fs.writeFileSync(resolved, content, 'utf-8');
  });
  ipcMain.handle('config:listThemes', () => {
    return fs.readdirSync(themesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  });
  ipcMain.handle('config:listKeyboards', () => {
    return fs.readdirSync(kblayoutsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  });
}

// --- Filesystem handlers ---
function registerFsHandlers() {
  ipcMain.handle('fs:readdir', (e, dir) => {
    return fs.promises.readdir(dir);
  });
  ipcMain.handle('fs:lstat', async (e, filePath) => {
    const stat = await fs.promises.lstat(filePath);
    return {
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymbolicLink: stat.isSymbolicLink(),
      mtime: stat.mtime.getTime(),
      size: stat.size,
    };
  });
  ipcMain.handle('fs:readFile', (e, filePath, encoding) => {
    return fs.promises.readFile(filePath, encoding || 'utf-8');
  });
  ipcMain.handle('fs:exists', (e, filePath) => {
    return fs.existsSync(filePath);
  });

  // fs.watch bridging
  ipcMain.on('fs:watchStart', (e, watchId, dir) => {
    try {
      const watcher = fs.watch(dir, (eventType, filename) => {
        if (e.sender && !e.sender.isDestroyed()) {
          e.sender.send(`fs:watchEvent-${watchId}`, eventType, filename);
        }
      });
      watchers.set(watchId, watcher);
    } catch (err) {
      // Directory might not exist
      console.error('fs:watchStart error:', err.message);
    }
  });
  ipcMain.on('fs:watchStop', (e, watchId) => {
    const watcher = watchers.get(watchId);
    if (watcher) {
      watcher.close();
      watchers.delete(watchId);
    }
  });
}

// --- Hotswitch handlers ---
function registerHotswitchHandlers() {
  ipcMain.handle('hotswitch:getThemeOverride', () => themeOverride);
  ipcMain.handle('hotswitch:getKbOverride', () => kbOverride);
  ipcMain.on('hotswitch:setThemeOverride', (e, name) => {
    themeOverride = name;
  });
  ipcMain.on('hotswitch:setKbOverride', (e, name) => {
    kbOverride = name;
  });
}

// --- Shell handlers ---
function registerShellHandlers() {
  ipcMain.handle('shell:openExternal', (e, url) => {
    // Validate URL protocol
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return shell.openExternal(url);
    }
    throw new Error('Only http/https URLs allowed for openExternal');
  });
  ipcMain.handle('shell:openPath', (e, filePath) => {
    return shell.openPath(filePath);
  });
}

// --- Network handlers ---
function registerNetHandlers() {
  ipcMain.handle('net:httpGet', (e, options) => {
    return new Promise((resolve, reject) => {
      const req = https.get(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: rawData });
        });
      });
      req.on('error', (err) => {
        reject(err.message);
      });
      req.setTimeout(5000, () => {
        req.destroy();
        reject('Request timeout');
      });
    });
  });

  ipcMain.handle('net:tcpPing', (e, host, port, localAddress) => {
    return new Promise((resolve, reject) => {
      const s = new net.Socket();
      const start = process.hrtime();

      s.connect({ port, host, localAddress, family: 4 }, () => {
        const timeArr = process.hrtime(start);
        const time = (timeArr[0] * 1e9 + timeArr[1]) / 1e6;
        resolve(time);
        s.destroy();
      });
      s.on('error', (err) => {
        s.destroy();
        reject(err.message);
      });
      s.setTimeout(1900, () => {
        s.destroy();
        reject('Socket timeout');
      });
    });
  });
}

// --- GeoIP handlers ---
function registerGeoipHandlers() {
  ipcMain.handle('geoip:init', async () => {
    try {
      const geolite2 = (await import('geolite2-redist')).default;
      const maxmind = (await import('maxmind')).default;
      const cacheDir = path.join(app.getPath('userData'), 'geoIPcache');
      await geolite2.downloadDbs(cacheDir);
      geoLookup = await geolite2.open('GeoLite2-City', (dbPath) => maxmind.open(dbPath));
      return true;
    } catch (err) {
      console.error('GeoIP init error:', err);
      return false;
    }
  });

  ipcMain.handle('geoip:lookup', (e, ip) => {
    if (!geoLookup) return null;
    try {
      const result = geoLookup.get(ip);
      if (result && result.location) {
        return {
          latitude: result.location.latitude,
          longitude: result.location.longitude,
        };
      }
      return null;
    } catch {
      return null;
    }
  });
}

// --- Keyboard Shortcuts handlers ---
function registerShortcutHandlers() {
  ipcMain.on('shortcuts:registerAll', (e, shortcuts) => {
    globalShortcut.unregisterAll();
    shortcuts.forEach(cut => {
      if (!cut.enabled) return;

      if (cut.type === 'app') {
        if (cut.action === 'TAB_X') {
          for (let i = 1; i <= 5; i++) {
            const trigger = cut.trigger.replace('X', i);
            globalShortcut.register(trigger, () => {
              if (win && !win.isDestroyed()) {
                win.webContents.send('shortcut:triggered', `TAB_${i}`);
              }
            });
          }
        } else {
          globalShortcut.register(cut.trigger, () => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('shortcut:triggered', cut.action);
            }
          });
        }
      } else if (cut.type === 'shell') {
        globalShortcut.register(cut.trigger, () => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('shortcut:triggered', {
              type: 'shell',
              action: cut.action,
              linebreak: cut.linebreak,
            });
          }
        });
      }
    });
  });

  ipcMain.on('shortcuts:unregisterAll', () => {
    globalShortcut.unregisterAll();
  });
}

// Cleanup on app quit
export function cleanup() {
  watchers.forEach((watcher) => watcher.close());
  watchers.clear();
  globalShortcut.unregisterAll();
}
