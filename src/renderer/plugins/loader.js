/**
 * Plugin Loader
 *
 * Discovers and loads user plugins from the userData/plugins/ directory.
 * Each plugin is a .js file that exports a default class extending MonitorPanel.
 *
 * Plugin file format:
 *   // my-plugin.js
 *   export default class MyPlugin extends MonitorPanel {
 *     static id = 'my_plugin';       // unique DOM id
 *     static title = 'My Plugin';     // display name
 *     static column = 'left';         // 'left' or 'right' column placement
 *
 *     _createDOM() { ... }
 *     _subscribe() { ... }
 *   }
 *
 * Plugins are loaded after built-in panels and receive the same store instance.
 */

import { MonitorPanel } from '../components/monitor-panel.js';

/**
 * Load all user plugins from userData/plugins/
 * @param {import('../store/index.js').EdexStore} store
 * @returns {Promise<Object<string, MonitorPanel>>} map of plugin id → instance
 */
export async function loadPlugins(store) {
    const loaded = {};

    let pluginNames;
    try {
        pluginNames = await window.edex.plugins.list();
    } catch (e) {
        console.warn('Plugin loader: could not list plugins', e);
        return loaded;
    }

    if (!pluginNames || pluginNames.length === 0) return loaded;

    for (const name of pluginNames) {
        try {
            const source = await window.edex.plugins.read(name);
            const plugin = await loadPluginFromSource(name, source, store);
            if (plugin) {
                loaded[plugin.constructor.id || name] = plugin;
                console.log(`Plugin loaded: ${name}`);
            }
        } catch (e) {
            console.warn(`Plugin loader: failed to load "${name}"`, e);
        }
    }

    return loaded;
}

/**
 * Load a single plugin from source code
 */
async function loadPluginFromSource(name, source, store) {
    // Create a blob URL so the browser can import it as a module
    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    try {
        const mod = await import(/* @vite-ignore */ url);
        const PluginClass = mod.default;

        if (!PluginClass || typeof PluginClass !== 'function') {
            console.warn(`Plugin "${name}": no default export class found`);
            return null;
        }

        // Validate it extends MonitorPanel (duck-type check)
        if (typeof PluginClass.prototype.destroy !== 'function') {
            console.warn(`Plugin "${name}": default export must extend MonitorPanel`);
            return null;
        }

        const column = PluginClass.column || 'left';
        const parentId = column === 'right' ? 'mod_column_right' : 'mod_column_left';

        const instance = new PluginClass(parentId, { store });
        return instance;
    } finally {
        URL.revokeObjectURL(url);
    }
}
