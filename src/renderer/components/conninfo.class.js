import { TimeSeries, SmoothieChart } from 'smoothie';
import prettyBytes from 'pretty-bytes';

class Conninfo {
    constructor(parentId, { store } = {}) {
        if (!parentId) throw "Missing parameters";

        this._store = store;
        this._unsubs = [];

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_conninfo">
            <div id="mod_conninfo_innercontainer">
                <h1>NETWORK TRAFFIC<i>UP / DOWN, MB/S</i></h1>
                <h2>TOTAL<i>0B OUT, 0B IN</i></h2>
                <canvas id="mod_conninfo_canvas_top"></canvas>
                <canvas id="mod_conninfo_canvas_bottom"></canvas>
                <h3>OFFLINE</h3>
            </div>
        </div>`;

        this.current = document.querySelector("#mod_conninfo_innercontainer > h1 > i");
        this.total = document.querySelector("#mod_conninfo_innercontainer > h2 > i");
        this._pb = prettyBytes;

        const theme = store ? store.get('theme') : window.theme;
        let chartOptions = [{
            limitFPS: 40,
            responsive: true,
            millisPerPixel: 70,
            interpolation: 'linear',
            grid:{
                millisPerLine: 5000,
                fillStyle:'transparent',
                strokeStyle:`rgba(${theme.r},${theme.g},${theme.b},0.4)`,
                verticalSections:3,
                borderVisible:false
            },
            labels:{
                fontSize: 10,
                fillStyle: `rgb(${theme.r},${theme.g},${theme.b})`,
                precision: 2
            }
        }];
        chartOptions.push(Object.assign({}, chartOptions[0]));
        chartOptions[0].minValue = 0;
        chartOptions[1].maxValue = 0;

        this.series = [new TimeSeries(), new TimeSeries()];
        this.charts = [new SmoothieChart(chartOptions[0]), new SmoothieChart(chartOptions[1])];

        const lineColor = `rgb(${theme.r},${theme.g},${theme.b})`;
        this.charts[0].addTimeSeries(this.series[0], {lineWidth:1.7,strokeStyle:lineColor});
        this.charts[1].addTimeSeries(this.series[1], {lineWidth:1.7,strokeStyle:lineColor});

        this.charts[0].streamTo(document.getElementById("mod_conninfo_canvas_top"), 1000);
        this.charts[1].streamTo(document.getElementById("mod_conninfo_canvas_bottom"), 1000);

        if (store) {
            // Subscribe to network stats from coordinated scheduler
            this._unsubs.push(store.on('systemData.networkStats', (data) => {
                if (data) this._updateTraffic(data);
            }));
            // React to offline state changes
            this._unsubs.push(store.on('network.offline', (offline) => {
                if (offline) this._setOffline();
            }));
        } else {
            // Legacy: own polling
            this.updateInfo();
            this.infoUpdater = setInterval(() => {
                this.updateInfo();
            }, 1000);
        }
    }

    _isOffline() {
        if (this._store) {
            return this._store.get('network.offline') || this._store.get('network.iface') === null;
        }
        return window.mods.netstat.offline || window.mods.netstat.iface === null;
    }

    _setOffline() {
        let time = new Date().getTime();
        this.series[0].append(time, 0);
        this.series[1].append(time, 0);
        document.querySelector("div#mod_conninfo").setAttribute("class", "offline");
    }

    _updateTraffic(data) {
        if (this._isOffline() || !data || !data[0]) {
            this._setOffline();
            return;
        }

        document.querySelector("div#mod_conninfo").setAttribute("class", "");
        let time = new Date().getTime();

        let max0 = this.series[0].maxValue;
        let max1 = -this.series[1].minValue;
        if (max0 > max1) {
            this.series[1].minValue = -max0;
        } else if (max1 > max0) {
            this.series[0].maxValue = max1;
        }

        this.series[0].append(time, data[0].tx_sec/125000);
        this.series[1].append(time, -data[0].rx_sec/125000);

        this.total.innerText = `${this._pb(data[0].tx_bytes)} OUT, ${this._pb(data[0].rx_bytes)} IN`.toUpperCase();
        this.current.innerText = "UP " + parseFloat(data[0].tx_sec/125000).toFixed(2) + " DOWN " + parseFloat(data[0].rx_sec/125000).toFixed(2);
    }

    updateInfo() {
        if (this._isOffline()) {
            this._setOffline();
            return;
        }
        const iface = this._store ? this._store.get('network.iface') : window.mods.netstat.iface;
        document.querySelector("div#mod_conninfo").setAttribute("class", "");
        window.si.networkStats(iface).then(data => this._updateTraffic(data));
    }

    destroy() {
        if (this.infoUpdater) clearInterval(this.infoUpdater);
        if (this.charts) {
            this.charts.forEach(chart => chart.stop());
        }
        this._unsubs.forEach(fn => fn());
    }
}

export { Conninfo };
