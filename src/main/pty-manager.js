import pty from 'node-pty';
import { default as ws } from 'ws';
const { Server: WebSocketServer } = ws;
import { ipcMain } from 'electron';
import { readlink } from 'node:fs';
import { exec } from 'node:child_process';
import { type as osType } from 'node:os';

export class PtyManager {
  constructor(opts) {
    this.port = opts.port || 3000;
    this.renderer = null;
    this._closed = false;
    this.onclosed = () => {};
    this.onopened = () => {};
    this.onresized = () => {};
    this.ondisconnected = () => {};

    this._disableCWDtracking = false;
    this._nextTickUpdateTtyCWD = false;
    this._nextTickUpdateProcess = false;

    this._tick = setInterval(() => {
      if (this._nextTickUpdateTtyCWD && this._disableCWDtracking === false) {
        this._nextTickUpdateTtyCWD = false;
        this._getTtyCWD(this.tty).then(cwd => {
          if (this.tty._cwd === cwd) return;
          this.tty._cwd = cwd;
          if (this.renderer) {
            this.renderer.send("terminal_channel-" + this.port, "New cwd", cwd);
          }
        }).catch(e => {
          if (!this._closed) {
            console.log("Error while tracking TTY working directory: ", e);
            this._disableCWDtracking = true;
            try {
              this.renderer.send("terminal_channel-" + this.port, "Fallback cwd", opts.cwd || process.env.PWD);
            } catch (e) {
              // renderer closed
            }
          }
        });
      }

      if (this.renderer && this._nextTickUpdateProcess) {
        this._nextTickUpdateProcess = false;
        this._getTtyProcess(this.tty).then(proc => {
          if (this.tty._process === proc) return;
          this.tty._process = proc;
          if (this.renderer) {
            this.renderer.send("terminal_channel-" + this.port, "New process", proc);
          }
        }).catch(e => {
          if (!this._closed) {
            console.log("Error while retrieving TTY subprocess: ", e);
            try {
              this.renderer.send("terminal_channel-" + this.port, "New process", "");
            } catch (e) {
              // renderer closed
            }
          }
        });
      }
    }, 1000);

    this.tty = pty.spawn(
      opts.shell || "bash",
      (opts.params && opts.params.length > 0 ? opts.params : (process.platform === "win32" ? [] : ["--login"])),
      {
        name: (opts.env && opts.env.TERM) || "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: opts.cwd || process.env.PWD,
        env: opts.env || process.env,
      }
    );

    this.tty.onExit((code, signal) => {
      this._closed = true;
      this.onclosed(code, signal);
    });

    this.wss = new WebSocketServer({
      port: this.port,
      clientTracking: true,
      verifyClient: info => {
        if (this.wss.clients.size >= 1) {
          return false;
        } else {
          return true;
        }
      },
    });

    ipcMain.on("terminal_channel-" + this.port, (e, ...args) => {
      switch (args[0]) {
        case "Renderer startup":
          this.renderer = e.sender;
          if (!this._disableCWDtracking && this.tty._cwd) {
            this.renderer.send("terminal_channel-" + this.port, "New cwd", this.tty._cwd);
          }
          if (this._disableCWDtracking) {
            this.renderer.send("terminal_channel-" + this.port, "Fallback cwd", opts.cwd || process.env.PWD);
          }
          break;
        case "Resize":
          let cols = args[1];
          let rows = args[2];
          try {
            this.tty.resize(Number(cols), Number(rows));
          } catch (error) {
            // Keep going, it'll work anyways.
          }
          this.onresized(cols, rows);
          break;
        default:
          return;
      }
    });

    this.wss.on("connection", ws => {
      this.onopened(this.tty._pid);
      ws.on("close", (code, reason) => {
        this.ondisconnected(code, reason);
      });
      ws.on("message", msg => {
        this.tty.write(msg.toString());
      });
      this.tty.onData(data => {
        this._nextTickUpdateTtyCWD = true;
        this._nextTickUpdateProcess = true;
        try {
          ws.send(data);
        } catch (e) {
          // Websocket closed
        }
      });
    });
  }

  _getTtyCWD(tty) {
    return new Promise((resolve, reject) => {
      let pid = tty._pid;
      switch (osType()) {
        case "Linux":
          readlink(`/proc/${pid}/cwd`, (e, cwd) => {
            if (e !== null) {
              reject(e);
            } else {
              resolve(cwd);
            }
          });
          break;
        case "Darwin":
          exec(`lsof -a -d cwd -p ${pid} | tail -1 | awk '{ for (i=9; i<=NF; i++) printf "%s ", $i }'`, (e, cwd) => {
            if (e !== null) {
              reject(e);
            } else {
              resolve(cwd.trim());
            }
          });
          break;
        default:
          reject("Unsupported OS");
      }
    });
  }

  _getTtyProcess(tty) {
    return new Promise((resolve, reject) => {
      let pid = tty._pid;
      switch (osType()) {
        case "Linux":
        case "Darwin":
          exec(`ps -o comm --no-headers --sort=+pid -g ${pid} | tail -1`, (e, proc) => {
            if (e !== null) {
              reject(e);
            } else {
              resolve(proc.trim());
            }
          });
          break;
        default:
          reject("Unsupported OS");
      }
    });
  }

  close() {
    clearInterval(this._tick);
    this.tty.kill();
    this._closed = true;
  }

  destroy() {
    this.close();
    if (this.wss) {
      this.wss.close();
    }
  }
}
