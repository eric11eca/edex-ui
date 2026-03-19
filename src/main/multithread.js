import cluster from 'node:cluster';
import { cpus } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app, ipcMain } from 'electron';
import { default as signale } from 'signale';
import { default as si } from 'systeminformation';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Also, leave a core available for the renderer process
const osCPUs = cpus().length - 1;
// See #904
const numCPUs = Math.max(1, (osCPUs > 7) ? 7 : osCPUs);

const FALLBACKS = {
  battery: { hasBattery: false, isCharging: false, acConnected: false, percent: 0 },
  blockDevices: [],
  chassis: { manufacturer: '', type: '' },
  cpu: { manufacturer: '', brand: 'Unknown CPU', cores: 2, speed: 0, speedMax: 0 },
  cpuTemperature: { main: null, cores: [], max: null },
  currentLoad: { currentLoad: 0, currentLoadUser: 0, currentLoadSystem: 0, cpus: [{ load: 0 }, { load: 0 }] },
  fsSize: [],
  mem: { total: 1, free: 1, used: 0, active: 0, available: 1, swaptotal: 0, swapused: 0, swapfree: 0 },
  networkConnections: [],
  networkInterfaces: [{ iface: 'lo', operstate: 'down', internal: true, ip4: '', mac: '' }],
  networkStats: [{ tx_sec: 0, rx_sec: 0, tx_bytes: 0, rx_bytes: 0 }],
  processes: { all: 0, list: [] },
  system: { manufacturer: '', model: '' },
};

const warnedFallbacks = new Set();

// Worker file: in dev mode, __dirname is dist-electron/main/ but source is src/main/
const isDev = !app.isPackaged;
let workerPath = join(__dirname, 'multithread-worker.js');
if (!existsSync(workerPath) && isDev) {
  workerPath = resolve(__dirname, '..', '..', 'src', 'main', 'multithread-worker.js');
}

cluster.setupPrimary({
  exec: workerPath,
});

let workers = [];
cluster.on("fork", worker => {
  workers.push(worker.id);
});
cluster.on("exit", (worker, code, signal) => {
  workers = workers.filter(id => id !== worker.id);
  signale.warn(`Systeminformation worker ${worker.process?.pid || worker.id} exited (${code ?? 'null'}${signal ? `, ${signal}` : ''})`);
});

for (let i = 0; i < numCPUs; i++) {
  cluster.fork();
}

signale.success("Multithreaded controller ready");

let lastID = -1;

function cloneFallback(value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneFallback(item));
  }
  if (value && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

function getFallback(type, error) {
  const fallback = FALLBACKS[type];
  if (typeof fallback === 'undefined') {
    return undefined;
  }

  const warnKey = `${type}:${error?.code || error?.name || 'unknown'}`;
  if (!warnedFallbacks.has(warnKey)) {
    warnedFallbacks.add(warnKey);
    signale.warn(`systeminformation.${type} failed, using fallback data: ${error?.message || error}`);
  }

  return cloneFallback(fallback);
}

async function invokeSystemInformation(type, args = []) {
  try {
    return await si[type](...args);
  } catch (error) {
    const fallback = getFallback(type, error);
    if (typeof fallback !== 'undefined') {
      return fallback;
    }
    throw error;
  }
}

function replyToSender(sender, id, payload) {
  if (!sender || sender.isDestroyed()) {
    return;
  }
  sender.send(`systeminformation-reply-${id}`, payload);
}

function dispatch(type, id, args) {
  const liveWorkers = workers.filter(workerId => Boolean(cluster.workers[workerId]));
  workers = liveWorkers;
  if (liveWorkers.length === 0) {
    return false;
  }

  lastID = (lastID + 1) % liveWorkers.length;
  const worker = cluster.workers[liveWorkers[lastID]];
  if (!worker) {
    return false;
  }

  worker.send(JSON.stringify({
    id,
    type,
    args,
  }));
  return true;
}

async function handleDirectInvocation(sender, type, id, args) {
  try {
    const res = await invokeSystemInformation(type, args);
    replyToSender(sender, id, res);
  } catch (error) {
    signale.error(`systeminformation.${type} failed without fallback`, error);
    replyToSender(sender, id, null);
  }
}

const queue = new Map();
ipcMain.on("systeminformation-call", (e, type, id, ...args) => {
  if (!si[type]) {
    signale.warn("Illegal request for systeminformation");
    return;
  }

  if (args.length > 1 || workers.length <= 0) {
    handleDirectInvocation(e.sender, type, id, args);
  } else {
    queue.set(id, e.sender);
    if (!dispatch(type, id, args)) {
      queue.delete(id);
      handleDirectInvocation(e.sender, type, id, args);
    }
  }
});

cluster.on("message", (worker, msg) => {
  msg = JSON.parse(msg);
  const sender = queue.get(msg.id);
  queue.delete(msg.id);
  if (!sender || sender.isDestroyed()) {
    return;
  }

  if (msg.error) {
    const fallback = getFallback(msg.type, msg.error);
    if (typeof fallback !== 'undefined') {
      replyToSender(sender, msg.id, fallback);
      return;
    }
    signale.error(`systeminformation.${msg.type} worker failed`, msg.error);
    replyToSender(sender, msg.id, null);
    return;
  }

  try {
    replyToSender(sender, msg.id, msg.res);
  } catch (e) {
    // Window has been closed, ignore.
  }
});
