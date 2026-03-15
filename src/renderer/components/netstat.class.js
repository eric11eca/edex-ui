import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import geolite2 from 'geolite2-redist';
import maxmind from 'maxmind';
import remote from '@electron/remote';
import { ipcRenderer } from 'electron';

class Netstat {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_netstat">
            <div id="mod_netstat_inner">
                <h1>NETWORK STATUS<i id="mod_netstat_iname"></i></h1>
                <div id="mod_netstat_innercontainer">
                    <div>
                        <h1>STATE</h1>
                        <h2>UNKNOWN</h2>
                    </div>
                    <div>
                        <h1>IPv4</h1>
                        <h2>--.--.--.--</h2>
                    </div>
                    <div>
                        <h1>PING</h1>
                        <h2>--ms</h2>
                    </div>
                </div>
            </div>
        </div>`;

        this.offline = false;
        this.lastconn = {finished: false};
        this.iface = null;
        this.failedAttempts = {};
        this.runsBeforeGeoIPUpdate = 0;

        this._httpsAgent = new https.Agent({
            keepAlive: false,
            maxSockets: 10
        });

        this.updateInfo();
        this.infoUpdater = setInterval(() => {
            this.updateInfo();
        }, 2000);

        // Init GeoIP integrated backend
        this.geoLookup = {
            get: () => null
        };
        geolite2.downloadDbs(path.join(remote.app.getPath("userData"), "geoIPcache")).then(() => {
           geolite2.open('GeoLite2-City', dbPath => {
                return maxmind.open(dbPath);
            }).catch(e => {throw e}).then(lookup => {
                this.geoLookup = lookup;
                this.lastconn.finished = true;
            });
        });
    }
    updateInfo() {
        window.si.networkInterfaces().then(async data => {
            let offline = false;

            let _net = data[0];
            let netID = 0;

            if (typeof window.settings.iface === "string") {
                while (_net.iface !== window.settings.iface) {
                    netID++;
                    if (data[netID]) {
                        _net = data[netID];
                    } else {
                        window.settings.iface = false;
                        return false;
                    }
                }
            } else {
                while (_net.operstate !== "up" || _net.internal === true || _net.ip4 === "" || _net.mac === "") {
                    netID++;
                    if (data[netID]) {
                        _net = data[netID];
                    } else {
                        this.iface = null;
                        document.getElementById("mod_netstat_iname").innerText = "Interface: (offline)";

                        this.offline = true;
                        document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "OFFLINE";
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = "--.--.--.--";
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = "--ms";
                        break;
                    }
                }
            }

            if (_net.ip4 !== this.internalIPv4) this.runsBeforeGeoIPUpdate = 0;

            this.iface = _net.iface;
            this.internalIPv4 = _net.ip4;
            document.getElementById("mod_netstat_iname").innerText = "Interface: "+_net.iface;

            if (_net.ip4 === "127.0.0.1") {
                offline = true;
            } else {
                if (this.runsBeforeGeoIPUpdate === 0 && this.lastconn.finished) {
                    this.lastconn = https.get({host: "myexternalip.com", port: 443, path: "/json", localAddress: _net.ip4, agent: this._httpsAgent}, res => {
                        let rawData = "";
                        res.on("data", chunk => {
                            rawData += chunk;
                        });
                        res.on("end", () => {
                            try {
                                let d = JSON.parse(rawData);
                                this.ipinfo = {
                                    ip: d.ip,
                                    geo: this.geoLookup.get(d.ip).location
                                };

                                let ip = this.ipinfo.ip;
                                document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = window._escapeHtml(ip);

                                this.runsBeforeGeoIPUpdate = 10;
                            } catch(e) {
                                this.failedAttempts[e] = (this.failedAttempts[e] || 0) + 1;
                                if (this.failedAttempts[e] > 2) return false;
                                console.warn(e);
                                console.info(rawData.toString());
                                ipcRenderer.send("log", "note", "NetStat: Error parsing data from myexternalip.com");
                                ipcRenderer.send("log", "debug", `Error: ${e}`);
                            }
                        });
                    }).on("error", e => {
                        // Drop it
                    });
                } else if (this.runsBeforeGeoIPUpdate !== 0) {
                    this.runsBeforeGeoIPUpdate = this.runsBeforeGeoIPUpdate - 1;
                }

                let p = await this.ping(window.settings.pingAddr || "1.1.1.1", 80, _net.ip4).catch(() => { offline = true; });

                this.offline = offline;
                if (offline) {
                    document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "OFFLINE";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = "--.--.--.--";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = "--ms";
                } else {
                    document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "ONLINE";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = Math.round(p)+"ms";
                }
            }
        });
    }
    ping(target, port, local) {
        return new Promise((resolve, reject) => {
            let s = new net.Socket();
            let start = process.hrtime();

            s.connect({
                port,
                host: target,
                localAddress: local,
                family: 4
            }, () => {
                let time_arr = process.hrtime(start);
                let time = (time_arr[0] * 1e9 + time_arr[1]) / 1e6;
                resolve(time);
                s.destroy();
            });
            s.on('error', e => {
                s.destroy();
                reject(e);
            });
            s.setTimeout(1900, function() {
                s.destroy();
                reject(new Error("Socket timeout"));
            });
        });
    }
}

export { Netstat };
