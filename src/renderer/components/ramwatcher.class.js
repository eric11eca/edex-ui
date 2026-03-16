class RAMwatcher {
    constructor(parentId, { store } = {}) {
        if (!parentId) throw "Missing parameters";

        this._store = store;
        this._unsubs = [];

        this.parent = document.getElementById(parentId);
        let modExtContainer = document.createElement("div");
        let ramwatcherDOM = `<div id="mod_ramwatcher_inner">
                <h1>MEMORY<i id="mod_ramwatcher_info"></i></h1>
                <div id="mod_ramwatcher_pointmap">`;

        for (var i = 0; i < 440; i++) {
            ramwatcherDOM += `<div class="mod_ramwatcher_point free"></div>`;
        }

        ramwatcherDOM += `</div>
                <div id="mod_ramwatcher_swapcontainer">
                    <h1>SWAP</h1>
                    <progress id="mod_ramwatcher_swapbar" max="100" value="0"></progress>
                    <h3 id="mod_ramwatcher_swaptext">0.0 GiB</h3>
                </div>
        </div>`;

        modExtContainer.innerHTML = ramwatcherDOM;
        modExtContainer.setAttribute("id", "mod_ramwatcher");
        this.parent.append(modExtContainer);

        this.points = Array.from(document.querySelectorAll("div.mod_ramwatcher_point"));
        this.shuffleArray(this.points);

        // Cache element refs to avoid getElementById on every update
        this._infoEl = document.getElementById("mod_ramwatcher_info");
        this._swapBar = document.getElementById("mod_ramwatcher_swapbar");
        this._swapText = document.getElementById("mod_ramwatcher_swaptext");

        // Subscribe to store instead of polling
        if (store) {
            this._unsubs.push(store.on('systemData.mem', (data) => {
                if (data) this._updateFromData(data);
            }));
        } else {
            // Fallback: direct polling (legacy)
            this.infoUpdater = setInterval(() => { this.updateInfo(); }, 1500);
            this.updateInfo();
        }
    }
    updateInfo() {
        window.si.mem().then(data => {
            this._updateFromData(data);
        });
    }
    _updateFromData(data) {
        if (data.free+data.used !== data.total) return; // bad values

        let active = Math.round((440*data.active)/data.total);
        let available = Math.round((440*(data.available-data.free))/data.total);

        // Use className for faster reads/writes than setAttribute
        for (let i = 0; i < active; i++) {
            const p = this.points[i];
            if (p.className !== "mod_ramwatcher_point active") {
                p.className = "mod_ramwatcher_point active";
            }
        }
        for (let i = active; i < active + available; i++) {
            const p = this.points[i];
            if (p.className !== "mod_ramwatcher_point available") {
                p.className = "mod_ramwatcher_point available";
            }
        }
        for (let i = active + available; i < 440; i++) {
            const p = this.points[i];
            if (p.className !== "mod_ramwatcher_point free") {
                p.className = "mod_ramwatcher_point free";
            }
        }

        let totalGiB = Math.round((data.total/1073742000)*10)/10;
        let usedGiB = Math.round((data.active/1073742000)*10)/10;
        this._infoEl.textContent = `USING ${usedGiB} OUT OF ${totalGiB} GiB`;

        let usedSwap = Math.round((100*data.swapused)/data.swaptotal);
        this._swapBar.value = usedSwap || 0;

        let usedSwapGiB = Math.round((data.swapused/1073742000)*10)/10;
        this._swapText.textContent = `${usedSwapGiB} GiB`;
    }
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    destroy() {
        if (this.infoUpdater) clearInterval(this.infoUpdater);
        this._unsubs.forEach(fn => fn());
    }
}

export { RAMwatcher };
