import { MonitorPanel } from './monitor-panel.js';

class Clock extends MonitorPanel {
    static id = 'mod_clock';
    static title = 'Clock';

    constructor(parentId, { store } = {}) {
        super(parentId, { store });

        const settings = store ? store.get('settings') : window.settings;
        this.twelveHours = (settings.clockHours === 12);

        if (this.twelveHours) {
            this._element.classList.add("mod_clock_twelve");
            this._ampmSpan = document.createElement("span");
            this._ampmSpan.textContent = "";
            this._clockText.appendChild(this._ampmSpan);
        }

        this._lastDigits = "";
        this.updateClock();
        this._setInterval(() => this.updateClock(), 1000);
    }

    _createDOM() {
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_clock");
        const h1 = document.createElement("h1");
        h1.setAttribute("id", "mod_clock_text");
        this._element.appendChild(h1);
        this.parent.append(this._element);

        this._clockText = h1;
        this._spans = [];
        for (let i = 0; i < 8; i++) {
            const el = (i === 2 || i === 5)
                ? document.createElement("em")
                : document.createElement("span");
            el.textContent = (i === 2 || i === 5) ? ":" : "?";
            h1.appendChild(el);
            this._spans.push(el);
        }
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

        if (digits !== this._lastDigits) {
            for (let i = 0; i < 8; i++) {
                if (!this._lastDigits || digits[i] !== this._lastDigits[i]) {
                    this._spans[i].textContent = digits[i];
                }
            }
            this._lastDigits = digits;
        }
    }
}

export { Clock };
