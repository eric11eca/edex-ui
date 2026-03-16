import { MonitorPanel } from './monitor-panel.js';

class HardwareInspector extends MonitorPanel {
    static id = 'mod_hardwareInspector';
    static title = 'Hardware Inspector';

    _createDOM() {
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_hardwareInspector");
        this._element.innerHTML = `<div id="mod_hardwareInspector_inner">
            <div>
                <h1>MANUFACTURER</h1>
                <h2 id="mod_hardwareInspector_manufacturer" >NONE</h2>
            </div>
            <div>
                <h1>MODEL</h1>
                <h2 id="mod_hardwareInspector_model" >NONE</h2>
            </div>
            <div>
                <h1>CHASSIS</h1>
                <h2 id="mod_hardwareInspector_chassis" >NONE</h2>
            </div>
        </div>`;
        this.parent.append(this._element);

        this._mfgEl = document.getElementById("mod_hardwareInspector_manufacturer");
        this._modelEl = document.getElementById("mod_hardwareInspector_model");
        this._chassisEl = document.getElementById("mod_hardwareInspector_chassis");
    }

    _subscribe() {
        this._unsubs.push(this._store.on('systemData.system', () => this._updateFromStore()));
        this._unsubs.push(this._store.on('systemData.chassis', () => this._updateFromStore()));
    }

    _startPolling() {
        this.updateInfo();
        this._setInterval(() => { this.updateInfo(); }, 20000);
    }

    _updateFromStore() {
        const d = this._store.get('systemData.system');
        const e = this._store.get('systemData.chassis');
        if (!d || !e) return;
        this._mfgEl.textContent = this._trimDataString(d.manufacturer);
        this._modelEl.textContent = this._trimDataString(d.model, d.manufacturer, e.type);
        this._chassisEl.textContent = e.type;
    }

    updateInfo() {
        window.si.system().then(d => {
            window.si.chassis().then(e => {
                this._mfgEl.textContent = this._trimDataString(d.manufacturer);
                this._modelEl.textContent = this._trimDataString(d.model, d.manufacturer, e.type);
                this._chassisEl.textContent = e.type;
            });
        });
    }

    _trimDataString(str, ...filters) {
        return str.trim().split(" ").filter(word => {
            if (typeof filters !== "object") return true;
            return !filters.includes(word);
        }).slice(0, 2).join(" ");
    }
}

export { HardwareInspector };
