class Netstat {
    constructor(parentId, { store } = {}) {
        if (!parentId) throw "Missing parameters";

        this._store = store;
        this._unsubs = [];
        this._processing = false;

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
        this.iface = null;
        this.failedAttempts = {};
        this.runsBeforeGeoIPUpdate = 0;
        this.ipinfo = null;

        // Init GeoIP backend in main process
        this._geoipReady = false;
        window.edex.geoip.init().then(success => {
            this._geoipReady = success;
        });

        if (store) {
            // Subscribe to coordinated scheduler's network interface data
            this._unsubs.push(store.on('systemData.networkInterfaces', (data) => {
                if (data) this._handleNetworkData(data);
            }));
            // Process any data that arrived before subscription
            const existing = store.get('systemData.networkInterfaces');
            if (existing) this._handleNetworkData(existing);
        } else {
            // Legacy: own polling
            this.updateInfo();
            this.infoUpdater = setInterval(() => {
                this.updateInfo();
            }, 2000);
        }
    }

    async _handleNetworkData(data) {
        if (this._processing) return;
        this._processing = true;

        try {
            let offline = false;

            let _net = data[0];
            let netID = 0;

            if (typeof window.settings.iface === "string") {
                while (_net.iface !== window.settings.iface) {
                    netID++;
                    if (data[netID]) {
                        _net = data[netID];
                    } else {
                        this.iface = null;
                        this.offline = true;
                        document.getElementById("mod_netstat_iname").innerText = "Interface: (offline)";
                        document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "OFFLINE";
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = "--.--.--.--";
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = "--ms";
                        window.settings.iface = false;
                        this._writeToStore();
                        return;
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
                        this._writeToStore();
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
                if (this.runsBeforeGeoIPUpdate === 0 && this._geoipReady) {
                    try {
                        const res = await window.edex.net.httpGet({
                            host: "myexternalip.com",
                            port: 443,
                            path: "/json",
                        });
                        const d = JSON.parse(res.body);
                        const geo = await window.edex.geoip.lookup(d.ip);
                        this.ipinfo = {
                            ip: d.ip,
                            geo: geo,
                        };

                        let ip = this.ipinfo.ip;
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = window._escapeHtml(ip);

                        this.runsBeforeGeoIPUpdate = 10;
                    } catch(e) {
                        this.failedAttempts[e] = (this.failedAttempts[e] || 0) + 1;
                        if (this.failedAttempts[e] > 2) return;
                        console.warn(e);
                        window.edex.log.send("note", "NetStat: Error parsing data from myexternalip.com");
                        window.edex.log.send("debug", `Error: ${e}`);
                    }
                } else if (this.runsBeforeGeoIPUpdate !== 0) {
                    this.runsBeforeGeoIPUpdate = this.runsBeforeGeoIPUpdate - 1;
                }

                try {
                    let p = await window.edex.net.tcpPing(window.settings.pingAddr || "1.1.1.1", 80, _net.ip4);
                    this.offline = false;
                    document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "ONLINE";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = Math.round(p)+"ms";
                } catch(e) {
                    offline = true;
                }

                this.offline = offline;
                if (offline) {
                    document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "OFFLINE";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = "--.--.--.--";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = "--ms";
                }
            }

            this._writeToStore();
        } finally {
            this._processing = false;
        }
    }

    _writeToStore() {
        if (!this._store) return;
        this._store.batch(() => {
            this._store.set('network.offline', this.offline);
            this._store.set('network.iface', this.iface);
            this._store.set('network.internalIPv4', this.internalIPv4);
            this._store.set('network.ipinfo', this.ipinfo);
        });
    }

    updateInfo() {
        window.si.networkInterfaces().then(data => this._handleNetworkData(data));
    }

    destroy() {
        if (this.infoUpdater) clearInterval(this.infoUpdater);
        this._unsubs.forEach(fn => fn());
    }
}

export { Netstat };
