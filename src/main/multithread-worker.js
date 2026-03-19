// Worker process for systeminformation calls
// This file runs as a separate cluster worker process
// It must use require() because cluster workers run as separate Node.js processes
const path = require('node:path');

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

function loadSystemInformation() {
  const candidates = [process.cwd(), path.resolve(__dirname, '..', '..')];
  for (const base of candidates) {
    try {
      return require(require.resolve('systeminformation', { paths: [base] }));
    } catch {
      // Keep trying.
    }
  }
  return require('systeminformation');
}

const si = loadSystemInformation();

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
    console.warn(`systeminformation.${type} failed in worker, using fallback data: ${error?.message || error}`);
  }

  return cloneFallback(fallback);
}

function serializeError(error) {
  if (!error) {
    return { message: 'Unknown error' };
  }
  return {
    code: error.code,
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
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

function send(payload) {
  if (typeof process.send === 'function') {
    process.send(JSON.stringify(payload));
  }
}

console.log("Multithread worker started at " + process.pid);

process.on("message", async msg => {
  msg = JSON.parse(msg);
  const args = Array.isArray(msg.args) ? msg.args : (typeof msg.arg === 'undefined' ? [] : [msg.arg]);

  try {
    const res = await invokeSystemInformation(msg.type, args);
    send({
      id: msg.id,
      type: msg.type,
      res,
    });
  } catch (error) {
    send({
      id: msg.id,
      type: msg.type,
      error: serializeError(error),
    });
  }
});
