class Clock {
    constructor(parentId, { store } = {}) {
        if (!parentId) throw "Missing parameters";

        const settings = store ? store.get('settings') : window.settings;
        this.twelveHours = (settings.clockHours === 12);

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_clock" class="${(this.twelveHours) ? "mod_clock_twelve" : ""}">
            <h1 id="mod_clock_text"></h1>
        </div>`;

        // Build clock spans once and cache references
        const clockEl = document.getElementById("mod_clock_text");
        this._spans = [];
        // HH:MM:SS = 8 characters, each gets a span or em
        for (let i = 0; i < 8; i++) {
            const el = (i === 2 || i === 5)
                ? document.createElement("em")
                : document.createElement("span");
            el.textContent = (i === 2 || i === 5) ? ":" : "?";
            clockEl.appendChild(el);
            this._spans.push(el);
        }
        if (this.twelveHours) {
            this._ampmSpan = document.createElement("span");
            this._ampmSpan.textContent = "";
            clockEl.appendChild(this._ampmSpan);
        }

        this._lastDigits = "";

        this.updateClock();
        this.updater = setInterval(() => {
            this.updateClock();
        }, 1000);
    }
    updateClock() {
        let time = new Date();
        let h = time.getHours();
        let m = time.getMinutes();
        let s = time.getSeconds();

        if (this.twelveHours) {
            const ampm = (h >= 12) ? "PM" : "AM";
            if (h > 12) h = h - 12;
            if (h === 0) h = 12;
            if (this._ampmSpan.textContent !== ampm) {
                this._ampmSpan.textContent = ampm;
            }
        }

        const digits = `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;

        // Only update spans whose character changed
        if (digits !== this._lastDigits) {
            for (let i = 0; i < 8; i++) {
                if (!this._lastDigits || digits[i] !== this._lastDigits[i]) {
                    this._spans[i].textContent = digits[i];
                }
            }
            this._lastDigits = digits;
        }
    }
    destroy() {
        if (this.updater) clearInterval(this.updater);
    }
}

export { Clock };
