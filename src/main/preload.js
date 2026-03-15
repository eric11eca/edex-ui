const { contextBridge, ipcRenderer, clipboard, webFrame } = require('electron');
const path = require('node:path');
const os = require('node:os');

// Cache synchronous values at preload time
const platform = os.platform();
const electronVersion = process.versions.electron;

contextBridge.exposeInMainWorld('edex', {
  // --- Platform Info (synchronous, cached) ---
  platform,
  electronVersion,

  // --- Path utilities (synchronous, safe string manipulation) ---
  path: {
    join: (...segments) => path.join(...segments),
    resolve: (...segments) => path.resolve(...segments),
    basename: (p, ext) => path.basename(p, ext),
    dirname: (p) => path.dirname(p),
    sep: path.sep,
  },

  // --- App Info & Control ---
  app: {
    getVersion: () => ipcRenderer.sendSync('app:getVersion'),
    getPath: (name) => ipcRenderer.sendSync('app:getPath', name),
    getAssetsPath: () => ipcRenderer.sendSync('app:getAssetsPath'),
    getProcessArgv: () => ipcRenderer.sendSync('app:getProcessArgv'),
    isPackaged: () => ipcRenderer.sendSync('app:isPackaged'),
    getDisplayCount: () => ipcRenderer.invoke('app:getDisplayCount'),
    focus: () => ipcRenderer.send('app:focus'),
    quit: () => ipcRenderer.send('app:quit'),
    relaunch: () => ipcRenderer.send('app:relaunch'),
  },

  // --- Window Control ---
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    isFullScreen: () => ipcRenderer.sendSync('window:isFullScreen'),
    setFullScreen: (flag) => ipcRenderer.send('window:setFullScreen', flag),
    getSize: () => ipcRenderer.sendSync('window:getSize'),
    setSize: (w, h) => ipcRenderer.send('window:setSize', w, h),
    unmaximize: () => ipcRenderer.send('window:unmaximize'),
    isMaximized: () => ipcRenderer.sendSync('window:isMaximized'),
    toggleDevTools: () => ipcRenderer.send('window:toggleDevTools'),
    onResize: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('window:resized', handler);
      return () => ipcRenderer.removeListener('window:resized', handler);
    },
    onLeaveFullScreen: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('window:leave-full-screen', handler);
      return () => ipcRenderer.removeListener('window:leave-full-screen', handler);
    },
  },

  // --- Terminal IPC ---
  terminal: {
    sendStartup: (port) => ipcRenderer.send(`terminal_channel-${port}`, 'Renderer startup'),
    sendResize: (port, cols, rows) => ipcRenderer.send(`terminal_channel-${port}`, 'Resize', cols, rows),
    onMessage: (port, callback) => {
      const handler = (e, ...args) => callback(...args);
      ipcRenderer.on(`terminal_channel-${port}`, handler);
      return () => ipcRenderer.removeListener(`terminal_channel-${port}`, handler);
    },
    spawn: () => {
      return new Promise((resolve) => {
        ipcRenderer.send('ttyspawn', 'true');
        ipcRenderer.once('ttyspawn-reply', (e, reply) => {
          if (reply.startsWith('ERROR')) {
            resolve({ error: reply });
          } else if (reply.startsWith('SUCCESS')) {
            resolve({ port: Number(reply.substr(9)) });
          }
        });
      });
    },
  },

  // --- System Information (proxied through multithread workers) ---
  // Uses the existing systeminformation-call/reply IPC pattern from multithread.js
  si: new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'then' || prop === 'toJSON' || typeof prop === 'symbol') return undefined;
      return (...args) => {
        return new Promise((resolve) => {
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          ipcRenderer.once('systeminformation-reply-' + id, (e, res) => {
            resolve(res);
          });
          ipcRenderer.send('systeminformation-call', prop, id, ...args);
        });
      };
    },
  }),

  // --- Logging ---
  log: {
    send: (type, content) => ipcRenderer.send('log', type, content),
  },

  // --- Config (settings, themes, keyboards, fonts) ---
  config: {
    getSettingsDir: () => ipcRenderer.sendSync('app:getPath', 'userData'),
    getThemesDir: () => path.join(ipcRenderer.sendSync('app:getPath', 'userData'), 'themes'),
    getKeyboardsDir: () => path.join(ipcRenderer.sendSync('app:getPath', 'userData'), 'keyboards'),
    getFontsDir: () => path.join(ipcRenderer.sendSync('app:getPath', 'userData'), 'fonts'),
    readSettings: () => ipcRenderer.invoke('config:readSettings'),
    readShortcuts: () => ipcRenderer.invoke('config:readShortcuts'),
    readWindowState: () => ipcRenderer.invoke('config:readWindowState'),
    readTheme: (name) => ipcRenderer.invoke('config:readTheme', name),
    readKeyboardLayout: (name) => ipcRenderer.invoke('config:readKeyboardLayout', name),
    readBootLog: () => ipcRenderer.invoke('config:readBootLog'),
    writeSettings: (data) => ipcRenderer.invoke('config:writeSettings', data),
    writeWindowState: (data) => ipcRenderer.invoke('config:writeWindowState', data),
    writeFile: (filePath, content) => ipcRenderer.invoke('config:writeFile', filePath, content),
    listThemes: () => ipcRenderer.invoke('config:listThemes'),
    listKeyboards: () => ipcRenderer.invoke('config:listKeyboards'),
  },

  // --- Filesystem ---
  fs: {
    readdir: (dir) => ipcRenderer.invoke('fs:readdir', dir),
    lstat: (filePath) => ipcRenderer.invoke('fs:lstat', filePath),
    readFile: (filePath, encoding) => ipcRenderer.invoke('fs:readFile', filePath, encoding),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    watch: (dir, callback) => {
      const watchId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const handler = (e, eventType, filename) => callback(eventType, filename);
      ipcRenderer.on(`fs:watchEvent-${watchId}`, handler);
      ipcRenderer.send('fs:watchStart', watchId, dir);
      return {
        close: () => {
          ipcRenderer.removeListener(`fs:watchEvent-${watchId}`, handler);
          ipcRenderer.send('fs:watchStop', watchId);
        },
      };
    },
  },

  // --- Theme/Keyboard Hotswitch ---
  hotswitch: {
    getThemeOverride: () => ipcRenderer.invoke('hotswitch:getThemeOverride'),
    setThemeOverride: (name) => ipcRenderer.send('hotswitch:setThemeOverride', name),
    getKbOverride: () => ipcRenderer.invoke('hotswitch:getKbOverride'),
    setKbOverride: (name) => ipcRenderer.send('hotswitch:setKbOverride', name),
  },

  // --- Clipboard ---
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(text),
  },

  // --- Shell ---
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  },

  // --- Networking (replaces https/net in renderer) ---
  net: {
    httpGet: (options) => ipcRenderer.invoke('net:httpGet', options),
    tcpPing: (host, port, localAddress) => ipcRenderer.invoke('net:tcpPing', host, port, localAddress),
  },

  // --- GeoIP (replaces geolite2/maxmind in renderer) ---
  geoip: {
    init: () => ipcRenderer.invoke('geoip:init'),
    lookup: (ip) => ipcRenderer.invoke('geoip:lookup', ip),
  },

  // --- Keyboard Shortcuts (replaces remote.globalShortcut) ---
  shortcuts: {
    registerAll: (shortcuts) => ipcRenderer.send('shortcuts:registerAll', shortcuts),
    unregisterAll: () => ipcRenderer.send('shortcuts:unregisterAll'),
    onTriggered: (callback) => {
      const handler = (e, action) => callback(action);
      ipcRenderer.on('shortcut:triggered', handler);
      return () => ipcRenderer.removeListener('shortcut:triggered', handler);
    },
  },

  // --- OS utilities ---
  os: {
    uptime: () => os.uptime(),
    platform: () => platform,
  },

  // --- Visual Zoom ---
  setZoomLimits: (min, max) => webFrame.setVisualZoomLevelLimits(min, max),
});
