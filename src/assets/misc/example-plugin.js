/**
 * Example eDEX-UI Plugin
 *
 * Copy this file to ~/.config/eDEX-UI/plugins/hello-world.js
 * (or your platform's equivalent userData/plugins/ directory)
 *
 * The plugin will appear as a panel in the left or right column.
 *
 * Requirements:
 *   - Must export a default class
 *   - Class must have a destroy() method
 *   - Static `id` property (unique DOM id)
 *   - Static `title` property (display name)
 *   - Static `column` property ('left' or 'right')
 */

// Note: MonitorPanel is available as a global base class in the plugin context.
// Plugins loaded via blob URL can't import from the app, so they implement
// the required interface directly.

export default class HelloWorldPlugin {
    static id = 'mod_hello_world';
    static title = 'Hello World';
    static column = 'left';

    constructor(parentId, { store } = {}) {
        this._store = store;
        this._unsubs = [];

        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", HelloWorldPlugin.id);
        this._element.innerHTML = `
            <div style="padding: 1vh; text-align: center;">
                <h1 style="font-family: var(--font_main); color: rgb(var(--color_r), var(--color_g), var(--color_b)); font-size: 1.5vh; margin: 0;">
                    HELLO WORLD
                </h1>
                <h2 style="font-family: var(--font_main_light); color: rgb(var(--color_r), var(--color_g), var(--color_b)); font-size: 1.2vh; opacity: 0.7; margin: 0.5vh 0 0 0;">
                    Plugin loaded successfully!
                </h2>
                <p id="hello_world_time" style="font-family: var(--font_mono); color: rgb(var(--color_r), var(--color_g), var(--color_b)); font-size: 1vh; margin: 1vh 0 0 0;">
                </p>
            </div>`;
        this.parent.append(this._element);

        this._timeEl = document.getElementById("hello_world_time");
        this._update();
        this._interval = setInterval(() => this._update(), 1000);
    }

    _update() {
        this._timeEl.textContent = `Plugin time: ${new Date().toLocaleTimeString()}`;
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
        this._unsubs.forEach(fn => fn());
    }
}
