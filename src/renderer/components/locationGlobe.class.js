import geodata from '@assets/misc/grid.json';
// encom-globe.js is a vendor script that sets window.ENCOM as a side effect
import '@assets/vendor/encom-globe.js';

class LocationGlobe {
    constructor(parentId, { store } = {}) {
        if (!parentId) throw "Missing parameters";

        this._store = store;
        this._unsubs = [];
        this.ENCOM = window.ENCOM;

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_globe">
            <div id="mod_globe_innercontainer">
                <h1>WORLD VIEW<i>GLOBAL NETWORK MAP</i></h1>
                <h2>ENDPOINT LAT/LON<i class="mod_globe_headerInfo">0.0000, 0.0000</i></h2>
                <div id="mod_globe_canvas_placeholder"></div>
                <h3>OFFLINE</h3>
            </div>
        </div>`;

        this.lastgeo = {};
        this.conns = [];
        this._geodata = geodata;

        const theme = store ? store.get('theme') : window.theme;
        const themeColor = `rgb(${theme.r},${theme.g},${theme.b})`;

        this._initTimeout = setTimeout(() => {
            let container = document.getElementById("mod_globe_innercontainer");
            let placeholder = document.getElementById("mod_globe_canvas_placeholder");

            this.globe = new this.ENCOM.Globe(placeholder.offsetWidth, placeholder.offsetHeight, {
                font: theme.cssvars.font_main,
                data: [],
                tiles: this._geodata.tiles,
                baseColor: theme.globe.base || themeColor,
                markerColor: theme.globe.marker || themeColor,
                pinColor: theme.globe.pin || themeColor,
                satelliteColor: theme.globe.satellite || themeColor,
                scale: 1.1,
                viewAngle: 0.630,
                dayLength: 1000 * 45,
                introLinesDuration: 2000,
                introLinesColor: theme.globe.marker || themeColor,
                maxPins: 300,
                maxMarkers: 100
            });

            placeholder.remove();
            container.append(this.globe.domElement);

            this._animate = () => {
                if (this.globe) {
                    this.globe.tick();
                }
                if (this._animate) {
                    setTimeout(() => {
                        try {
                            requestAnimationFrame(this._animate);
                        } catch(e) {
                            console.warn(e);
                        }
                    }, 1000 / 30);
                }
            };
            this.globe.init(theme.colors.light_black, () => {
                this._animate();
                window.audioManager.scan.play();
            });

            this.resizeHandler = () => {
                let canvas = document.querySelector("div#mod_globe canvas");
                this.globe.camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
                this.globe.camera.updateProjectionMatrix();
                this.globe.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
            };
            window.addEventListener("resize", this.resizeHandler);

            this.conns = [];
            this.addConn = async (ip) => {
                let geo = null;
                try {
                    geo = await window.edex.geoip.lookup(ip);
                } catch {
                    // do nothing
                }
                if (geo && geo.latitude && geo.longitude) {
                    const lat = Number(geo.latitude);
                    const lon = Number(geo.longitude);
                    this.conns.push({
                        ip,
                        pin: this.globe.addPin(lat, lon, "", 1.2),
                    });
                }
            };
            this.removeConn = ip => {
                let index = this.conns.findIndex(x => x.ip === ip);
                this.conns[index].pin.remove();
                this.conns.splice(index, 1);
            };

            let constellation = [];
            for(var i = 0; i< 2; i++){
                for(var j = 0; j< 3; j++){
                    constellation.push({
                        lat: 50 * i - 30 + 15 * Math.random(),
                        lon: 120 * j - 120 + 30 * i,
                        altitude: Math.random() * (1.7 - 1.3) + 1.3
                    });
                }
            }

            this.globe.addConstellation(constellation);
        }, 2000);

        if (store) {
            // Delayed subscription start (after globe init at 4s)
            this._intervalTimeout = setTimeout(() => {
                // Subscribe to network state for location updates
                this._unsubs.push(store.on('network.ipinfo', () => {
                    this.updateLoc();
                }));
                this._unsubs.push(store.on('network.offline', () => {
                    this.updateLoc();
                }));
                // Subscribe to connection data from coordinated scheduler
                this._unsubs.push(store.on('systemData.networkConnections', (conns) => {
                    if (conns) this._handleConnectionsData(conns);
                }));
                // Subscribe to IP detection events from terminal (experimentalGlobeFeatures)
                this._unsubs.push(store.on('_events.globeIp', (data) => {
                    if (data && data.ip && this.globe) {
                        this.addTemporaryConnectedMarker(data.ip);
                    }
                }));
                // Initial update
                this.updateLoc();
            }, 4000);
        } else {
            // Legacy: own polling intervals
            this._intervalTimeout = setTimeout(() => {
                this.updateLoc();
                this.locUpdater = setInterval(() => {
                    this.updateLoc();
                }, 1000);

                this.updateConns();
                this.connsUpdater = setInterval(() => {
                    this.updateConns();
                }, 3000);
            }, 4000);
        }
    }

    _isOffline() {
        if (this._store) return this._store.get('network.offline');
        return window.mods.netstat.offline;
    }

    _getIpinfo() {
        if (this._store) return this._store.get('network.ipinfo');
        return window.mods.netstat.ipinfo;
    }

    addRandomConnectedMarkers() {
        const randomLat = this.getRandomInRange(40, 90, 3);
        const randomLong = this.getRandomInRange(-180, 0, 3);
        this.globe.addMarker(randomLat, randomLong, '');
        this.globe.addMarker(randomLat - 20, randomLong + 150, '', true);
    }
    async addTemporaryConnectedMarker(ip) {
        let geo = await window.edex.geoip.lookup(ip);
        if (geo && geo.latitude && geo.longitude) {
            const lat = Number(geo.latitude);
            const lon = Number(geo.longitude);

            this.conns.push({
                ip,
                pin: this.globe.addPin(lat, lon, "", 1.2)
            });
            let mark = this.globe.addMarker(lat, lon, '', true);
            setTimeout(() => {
                mark.remove();
            }, 3000);
        }
    }
    removeMarkers() {
        this.globe.markers.forEach(marker => { marker.remove(); });
        this.globe.markers = [];
    }
    removePins() {
        this.globe.pins.forEach(pin => {
            pin.remove();
        });
        this.globe.pins = [];
    }
    getRandomInRange(from, to, fixed) {
        return (Math.random() * (to - from) + from).toFixed(fixed) * 1;
    }
    updateLoc() {
        if (!this.globe) return;
        if (this._isOffline()) {
            document.querySelector("div#mod_globe").setAttribute("class", "offline");
            document.querySelector("i.mod_globe_headerInfo").innerText = "(OFFLINE)";

            this.removePins();
            this.removeMarkers();
            this.conns = [];
            this.lastgeo = {
                latitude: 0,
                longitude: 0
            };
        } else {
            this.updateConOnlineConnection().then(() => {
                document.querySelector("div#mod_globe").setAttribute("class", "");
            }).catch(() => {
                document.querySelector("i.mod_globe_headerInfo").innerText = "UNKNOWN";
            });
        }
    }
    async updateConOnlineConnection() {
        const ipinfo = this._getIpinfo();
        if (!ipinfo || !ipinfo.geo) throw new Error("No IP info");
        let newgeo = ipinfo.geo;
        newgeo.latitude = Math.round(newgeo.latitude*10000)/10000;
        newgeo.longitude = Math.round(newgeo.longitude*10000)/10000;

        if (newgeo.latitude !== this.lastgeo.latitude || newgeo.longitude !== this.lastgeo.longitude) {

            document.querySelector("i.mod_globe_headerInfo").innerText = `${newgeo.latitude}, ${newgeo.longitude}`;
            this.removePins();
            this.removeMarkers();
            this.conns = [];

            this._locPin = this.globe.addPin(newgeo.latitude, newgeo.longitude, "", 1.2);
            this._locMarker = this.globe.addMarker(newgeo.latitude, newgeo.longitude, "", false, 1.2);
        }

        this.lastgeo = newgeo;
        document.querySelector("div#mod_globe").setAttribute("class", "");
    }

    _handleConnectionsData(conns) {
        if (!this.globe || this._isOffline()) return;

        let newconns = [];
        conns.forEach(conn => {
            let ip = conn.peeraddress;
            let state = conn.state;
            if (state === "ESTABLISHED" && ip !== "0.0.0.0" && ip !== "127.0.0.1" && ip !== "::") {
                newconns.push(ip);
            }
        });

        this.conns.forEach(conn => {
            if (newconns.indexOf(conn.ip) !== -1) {
                newconns.splice(newconns.indexOf(conn.ip), 1);
            } else {
                this.removeConn(conn.ip);
            }
        });

        newconns.forEach(ip => {
            this.addConn(ip);
        });
    }

    updateConns() {
        if (!this.globe || this._isOffline()) return false;
        window.si.networkConnections().then(conns => this._handleConnectionsData(conns));
    }
    destroy() {
        if (this._initTimeout) clearTimeout(this._initTimeout);
        if (this._intervalTimeout) clearTimeout(this._intervalTimeout);
        if (this.locUpdater) clearInterval(this.locUpdater);
        if (this.connsUpdater) clearInterval(this.connsUpdater);
        // Stop the animation loop
        this._animate = null;
        // Remove window resize listener
        if (this.resizeHandler) {
            window.removeEventListener("resize", this.resizeHandler);
            this.resizeHandler = null;
        }
        // Dispose Three.js resources
        if (this.globe && this.globe.renderer) {
            this.globe.renderer.dispose();
        }
        this._unsubs.forEach(fn => fn());
    }
}

export { LocationGlobe };
