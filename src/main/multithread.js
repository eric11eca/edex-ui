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
const numCPUs = (osCPUs > 7) ? 7 : osCPUs;

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

for (let i = 0; i < numCPUs; i++) {
  cluster.fork();
}

signale.success("Multithreaded controller ready");

let lastID = 0;

function dispatch(type, id, arg) {
  let selectedID = lastID + 1;
  if (selectedID > numCPUs - 1) selectedID = 0;

  cluster.workers[workers[selectedID]].send(JSON.stringify({
    id,
    type,
    arg,
  }));

  lastID = selectedID;
}

let queue = {};
ipcMain.on("systeminformation-call", (e, type, id, ...args) => {
  if (!si[type]) {
    signale.warn("Illegal request for systeminformation");
    return;
  }

  if (args.length > 1 || workers.length <= 0) {
    si[type](...args).then(res => {
      if (e.sender) {
        e.sender.send("systeminformation-reply-" + id, res);
      }
    });
  } else {
    queue[id] = e.sender;
    dispatch(type, id, args[0]);
  }
});

cluster.on("message", (worker, msg) => {
  msg = JSON.parse(msg);
  try {
    if (!queue[msg.id].isDestroyed()) {
      queue[msg.id].send("systeminformation-reply-" + msg.id, msg.res);
      delete queue[msg.id];
    }
  } catch (e) {
    // Window has been closed, ignore.
  }
});
