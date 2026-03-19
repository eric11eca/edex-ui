import { TimeSeries, SmoothieChart } from 'smoothie';

class Cpuinfo {
    constructor(parentId, { store } = {}) {
        if (!parentId) throw "Missing parameters";

        this._store = store;
        this._unsubs = [];

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_cpuinfo">
        </div>`;
        this.container = document.getElementById("mod_cpuinfo");

        this.series = [];
        this.charts = [];
        this._initialized = false;

        // Initial CPU info to get core count - use store data if available, else fetch
        const initCpu = store ? store.get('systemData.cpu') : null;
        if (initCpu) {
            this._initCharts(initCpu);
        } else {
            // Fetch once for initial setup, then subscribe
            window.si.cpu().then(data => this._initCharts(data));
        }

        // Subscribe to store for ongoing updates
        if (store) {
            this._unsubs.push(store.on('systemData.currentLoad', (data) => {
                if (data && this._initialized) this._updateLoad(data);
            }));
            this._unsubs.push(store.on('systemData.cpuTemperature', (data) => {
                if (data && this._initialized) this._updateTemp(data);
            }));
            this._unsubs.push(store.on('systemData.cpu', (data) => {
                if (data && this._initialized) this._updateSpeed(data);
            }));
            this._unsubs.push(store.on('systemData.processes', (data) => {
                if (data && this._initialized) this._updateTasks(data);
            }));
        }
    }

    _initCharts(data) {
        if (this._initialized) return;
        this._initialized = true;

        let divide = Math.floor(data.cores/2);
        this.divide = divide;

        let cpuName = data.manufacturer+data.brand;
        cpuName = cpuName.substr(0, 30);

        let innercontainer = document.createElement("div");
        innercontainer.setAttribute("id", "mod_cpuinfo_innercontainer");
        innercontainer.innerHTML = `<h1>CPU USAGE<i>${cpuName}</i></h1>
            <div>
                <h1># <em>1</em> - <em>${divide}</em><br>
                <i id="mod_cpuinfo_usagecounter0">Avg. --%</i></h1>
                <canvas id="mod_cpuinfo_canvas_0" height="60"></canvas>
            </div>
            <div>
                <h1># <em>${divide+1}</em> - <em>${data.cores}</em><br>
                <i id="mod_cpuinfo_usagecounter1">Avg. --%</i></h1>
                <canvas id="mod_cpuinfo_canvas_1" height="60"></canvas>
            </div>
            <div>
                <div>
                    <h1>${(window.edex.platform === "win32") ? "CORES" : "TEMP"}<br>
                    <i id="mod_cpuinfo_temp">${(window.edex.platform === "win32") ? data.cores : "--°C"}</i></h1>
                </div>
                <div>
                    <h1>SPD<br>
                    <i id="mod_cpuinfo_speed_min">--GHz</i></h1>
                </div>
                <div>
                    <h1>MAX<br>
                    <i id="mod_cpuinfo_speed_max">--GHz</i></h1>
                </div>
                <div>
                    <h1>TASKS<br>
                    <i id="mod_cpuinfo_tasks">---</i></h1>
                </div>
            </div>`;
        this.container.append(innercontainer);

        const theme = this._store ? this._store.get('theme') : window.theme;
        const chartColor = `rgb(${theme.r},${theme.g},${theme.b})`;

        for (var i = 0; i < 2; i++) {
            this.charts.push(new SmoothieChart({
                limitFPS: 30,
                responsive: true,
                millisPerPixel: 50,
                grid:{
                    fillStyle:'transparent',
                    strokeStyle:'transparent',
                    verticalSections:0,
                    borderVisible:false
                },
                labels:{ disabled: true },
                yRangeFunction: () => { return {min:0,max:100}; }
            }));
        }

        for (var i = 0; i < data.cores; i++) {
            this.series.push(new TimeSeries());
            let serie = this.series[i];
            let options = { lineWidth: 1.7, strokeStyle: chartColor };
            if (i < divide) {
                this.charts[0].addTimeSeries(serie, options);
            } else {
                this.charts[1].addTimeSeries(serie, options);
            }
        }

        for (var i = 0; i < 2; i++) {
            this.charts[i].streamTo(document.getElementById(`mod_cpuinfo_canvas_${i}`), 500);
        }

        // If no store, use legacy polling
        if (!this._store) {
            this.loadUpdater = setInterval(() => { this.updateCPUload(); }, 500);
            if (window.edex.platform !== "win32") {
                this.tempUpdater = setInterval(() => { this.updateCPUtemp(); }, 2000);
            }
            this.speedUpdater = setInterval(() => { this.updateCPUspeed(); }, 1000);
            this.tasksUpdater = setInterval(() => { this.updateCPUtasks(); }, 5000);
            this.updateCPUload();
            if (window.edex.platform !== "win32") this.updateCPUtemp();
            this.updateCPUspeed();
            this.updateCPUtasks();
        }
    }

    _updateLoad(data) {
        let average = [[], []];
        if (!data.cpus) return;
        data.cpus.forEach((e, i) => {
            if (this.series[i]) {
                this.series[i].append(new Date().getTime(), e.load);
            }
            if (i < this.divide) {
                average[0].push(e.load);
            } else {
                average[1].push(e.load);
            }
        });
        average.forEach((stats, i) => {
            let avg = Math.round(stats.reduce((a, b) => a + b, 0)/stats.length);
            try {
                document.getElementById(`mod_cpuinfo_usagecounter${i}`).innerText = `Avg. ${avg}%`;
            } catch(e) {}
        });
    }

    _updateTemp(data) {
        try {
            const temp = Number.isFinite(data?.max) ? data.max : "--";
            document.getElementById("mod_cpuinfo_temp").innerText = `${temp}°C`;
        } catch(e) {}
    }

    _updateSpeed(data) {
        try {
            document.getElementById("mod_cpuinfo_speed_min").innerText = `${data.speed}GHz`;
            document.getElementById("mod_cpuinfo_speed_max").innerText = `${data.speedMax}GHz`;
        } catch(e) {}
    }

    _updateTasks(data) {
        try {
            document.getElementById("mod_cpuinfo_tasks").innerText = `${data.all}`;
        } catch(e) {}
    }

    // Legacy polling methods (used when no store)
    updateCPUload() {
        window.si.currentLoad().then(data => this._updateLoad(data));
    }
    updateCPUtemp() {
        window.si.cpuTemperature().then(data => this._updateTemp(data));
    }
    updateCPUspeed() {
        window.si.cpu().then(data => this._updateSpeed(data));
    }
    updateCPUtasks() {
        window.si.processes().then(data => this._updateTasks(data));
    }

    destroy() {
        if (this.loadUpdater) clearInterval(this.loadUpdater);
        if (this.tempUpdater) clearInterval(this.tempUpdater);
        if (this.speedUpdater) clearInterval(this.speedUpdater);
        if (this.tasksUpdater) clearInterval(this.tasksUpdater);
        if (this.charts) {
            this.charts.forEach(chart => chart.stop());
        }
        this._unsubs.forEach(fn => fn());
    }
}

export { Cpuinfo };
