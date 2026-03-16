// eDEX-UI Renderer Entry Point (ES Module)
// All Node.js/Electron access goes through window.edex (preload bridge)

// CSS imports
import 'augmented-ui/augmented.css';
import '../renderer/styles/main.css';
import '../renderer/styles/modal.css';
import '../renderer/styles/boot_screen.css';
import '../renderer/styles/media_player.css';
import '../renderer/styles/main_shell.css';
import '../renderer/styles/filesystem.css';
import '../renderer/styles/keyboard.css';
import '../renderer/styles/mod_column.css';
import '../renderer/styles/mod_clock.css';
import '../renderer/styles/mod_sysinfo.css';
import '../renderer/styles/mod_hardwareInspector.css';
import '../renderer/styles/mod_cpuinfo.css';
import '../renderer/styles/mod_netstat.css';
import '../renderer/styles/mod_conninfo.css';
import '../renderer/styles/mod_globe.css';
import '../renderer/styles/mod_ramwatcher.css';
import '../renderer/styles/mod_toplist.css';
import '../renderer/styles/mod_fuzzyFinder.css';
import '../renderer/styles/mod_processlist.css';
import '../renderer/styles/extra_ratios.css';

// Component imports
import { Modal } from './components/modal.class.js';
import { Terminal } from './components/terminal.class.js';
import { DocReader } from './components/docReader.class.js';
import { MediaPlayer } from './components/mediaPlayer.class.js';
import { FilesystemDisplay } from './components/filesystem.class.js';
import { Keyboard } from './components/keyboard.class.js';
import { UpdateChecker } from './components/updateChecker.class.js';
import { Clock } from './components/clock.class.js';
import { Sysinfo } from './components/sysinfo.class.js';
import { HardwareInspector } from './components/hardwareInspector.class.js';
import { Cpuinfo } from './components/cpuinfo.class.js';
import { Netstat } from './components/netstat.class.js';
import { Conninfo } from './components/conninfo.class.js';
import { LocationGlobe } from './components/locationGlobe.class.js';
import { RAMwatcher } from './components/ramwatcher.class.js';
import { Toplist } from './components/toplist.class.js';
import { FuzzyFinder } from './components/fuzzyFinder.class.js';
import { AudioManager } from './components/audiofx.class.js';
import { EdexStore } from './store/index.js';
import { SystemMonitorScheduler } from './store/system-monitor.js';

// Modal is still needed on window for modal button action strings
window.Modal = Modal;

// Security helpers
window._escapeHtml = text => {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => {return map[m];});
};
window._encodePathURI = uri => {
    return encodeURI(uri).replace(/#/g, "%23");
};
window._purifyCSS = str => {
    if (typeof str === "undefined") return "";
    if (typeof str !== "string") {
        str = str.toString();
    }
    return str.replace(/[<]/g, "");
};
window._delay = ms => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

// Initiate basic error handling
window.onerror = (msg, errPath, line, col, error) => {
    document.getElementById("boot_screen").innerHTML += `${error} :  ${msg}<br/>==> at ${errPath}  ${line}:${col}`;
};

// Cache directory paths from preload (synchronous)
const settingsDir = window.edex.config.getSettingsDir();
const fontsDir = window.edex.config.getFontsDir();
const settingsFile = window.edex.path.join(settingsDir, "settings.json");
const shortcutsFile = window.edex.path.join(settingsDir, "shortcuts.json");
const lastWindowStateFile = window.edex.path.join(settingsDir, "lastWindowState.json");

// Load config via preload bridge (synchronous sendSync under the hood)
window.settings = await window.edex.config.readSettings();
window.shortcuts = await window.edex.config.readShortcuts();
window.lastWindowState = await window.edex.config.readWindowState();

// Load CLI parameters
const processArgv = window.edex.app.getProcessArgv();
window.settings.nointroOverride = processArgv.includes("--nointro");
window.settings.nocursorOverride = processArgv.includes("--nocursor");

// Retrieve theme override (hotswitch)
const themeOverride = await window.edex.hotswitch.getThemeOverride();
if (themeOverride !== null) {
    window.settings.theme = themeOverride;
    window.settings.nointroOverride = true;
}
// Theme is loaded after store creation (see below) since _loadTheme writes to store

// Same for keyboard override
const kbOverride = await window.edex.hotswitch.getKbOverride();
if (kbOverride !== null) {
    window.settings.keyboard = kbOverride;
    window.settings.nointroOverride = true;
}

// Initialize centralized state store
const store = new EdexStore({
    settings: window.settings,
    shortcuts: window.shortcuts,
    lastWindowState: window.lastWindowState,
    theme: null, // set by _loadTheme below
    network: { offline: true, iface: null, internalIPv4: null, ipinfo: null },
    systemData: {},
    terminals: {},
    activeTerminal: 0,
    passwordMode: false,
});

// SI proxy: wrap preload's query function in a Proxy for ergonomic si.method() calls.
// Proxy can't cross contextBridge, so we create it here in the renderer context.
const siProxy = new Proxy({}, {
    get: (target, prop) => {
        if (prop === 'then' || prop === 'toJSON' || typeof prop === 'symbol') return undefined;
        return (...args) => window.edex.si.query(prop, ...args);
    },
});
window.si = siProxy;

// Start coordinated system monitor scheduler
const scheduler = new SystemMonitorScheduler(store, siProxy);

// Load UI theme
window._loadTheme = theme => {
    if (document.querySelector("style.theming")) {
        document.querySelector("style.theming").remove();
    }

    // Load fonts — use file:// URLs so fonts load correctly when served via Vite dev server
    const fontPath = (name) => {
        const p = fontsDir + '/' + name.toLowerCase().replace(/ /g, '_') + '.woff2';
        // On all platforms, ensure file:// prefix for local font loading
        if (p.startsWith('/')) return 'file://' + p;
        return 'file:///' + p.replace(/\\/g, '/'); // Windows
    };
    let mainFont = new FontFace(theme.cssvars.font_main, `url("${fontPath(theme.cssvars.font_main).replace(/\\/g, '/')}")`);
    let lightFont = new FontFace(theme.cssvars.font_main_light, `url("${fontPath(theme.cssvars.font_main_light).replace(/\\/g, '/')}")`);
    let termFont = new FontFace(theme.terminal.fontFamily, `url("${fontPath(theme.terminal.fontFamily).replace(/\\/g, '/')}")`);

    document.fonts.add(mainFont);
    document.fonts.add(lightFont);
    document.fonts.add(termFont);
    window.__themeFontLoad = Promise.race([
        Promise.allSettled([
            mainFont.load(),
            lightFont.load(),
            termFont.load(),
        ]),
        new Promise(resolve => {
            setTimeout(resolve, 3000);
        }),
    ]);

    document.querySelector("head").insertAdjacentHTML('beforeend', `<style class="theming">
    :root {
        --font_main: "${window._purifyCSS(theme.cssvars.font_main)}";
        --font_main_light: "${window._purifyCSS(theme.cssvars.font_main_light)}";
        --font_mono: "${window._purifyCSS(theme.terminal.fontFamily)}";
        --color_r: ${window._purifyCSS(theme.colors.r)};
        --color_g: ${window._purifyCSS(theme.colors.g)};
        --color_b: ${window._purifyCSS(theme.colors.b)};
        --color_black: ${window._purifyCSS(theme.colors.black)};
        --color_light_black: ${window._purifyCSS(theme.colors.light_black)};
        --color_grey: ${window._purifyCSS(theme.colors.grey)};
        --color_red: ${window._purifyCSS(theme.colors.red) || "red"};
        --color_yellow: ${window._purifyCSS(theme.colors.yellow) || "yellow"};
    }
    body {
        font-family: var(--font_main), sans-serif;
        cursor: ${(window.settings.nocursorOverride || window.settings.nocursor) ? "none" : "default"} !important;
    }
    * {
   	   ${(window.settings.nocursorOverride || window.settings.nocursor) ? "cursor: none !important;" : ""}
	}
    ${window._purifyCSS(theme.injectCSS || "")}
    </style>`);

    window.theme = theme;
    window.theme.r = theme.colors.r;
    window.theme.g = theme.colors.g;
    window.theme.b = theme.colors.b;
    store.set('theme', window.theme);
};

// Now load the initial theme (deferred from config loading above because _loadTheme writes to store)
window._loadTheme(await window.edex.config.readTheme(window.settings.theme));

function initGraphicalErrorHandling() {
    window.edexErrorsModals = [];
    window.onerror = (msg, errPath, line, col, error) => {
        let errorModal = new Modal({
            type: "error",
            title: error,
            message: `${msg}<br/>        at ${errPath}  ${line}:${col}`
        });
        window.edexErrorsModals.push(errorModal);
        window.edex.log.send("error", `${error}: ${msg}`);
        window.edex.log.send("debug", `at ${errPath} ${line}:${col}`);
    };
}

function waitForFonts() {
    const domReady = document.readyState === "complete"
        ? Promise.resolve()
        : new Promise(resolve => {
            window.addEventListener("load", resolve, { once: true });
        });
    const fontReady = window.__themeFontLoad || Promise.resolve();

    return Promise.all([domReady, fontReady]).then(() => undefined);
}

// Init audio
window.audioManager = new AudioManager();

// See #223
window.edex.app.focus();

let i = 0;
let bootLogCache = null;
if (window.settings.nointro || window.settings.nointroOverride) {
    initGraphicalErrorHandling();
    document.getElementById("boot_screen").remove();
    document.body.setAttribute("class", "");
    waitForFonts().then(initUI);
} else {
    displayLine();
}

// Startup boot log
async function displayLine() {
    let bootScreen = document.getElementById("boot_screen");
    if (!bootLogCache) {
        bootLogCache = (await window.edex.config.readBootLog()).split('\n');
    }
    let log = bootLogCache;

    async function isArchUser() {
        return window.edex.platform === "linux"
                && (await window.edex.fs.exists("/etc/os-release"))
                && (await window.edex.fs.readFile("/etc/os-release", "utf-8")).includes("arch");
    }

    if (typeof log[i] === "undefined") {
        setTimeout(displayTitleScreen, 300);
        return;
    }

    if (log[i] === "Boot Complete") {
        window.audioManager.granted.play();
    } else {
        window.audioManager.stdout.play();
    }
    bootScreen.innerHTML += log[i]+"<br/>";
    i++;

    switch(true) {
        case i === 2:
            bootScreen.innerHTML += `eDEX-UI Kernel version ${window.edex.app.getVersion()} boot at ${Date().toString()}; root:xnu-1699.22.73~1/RELEASE_X86_64`;
        case i === 4:
            setTimeout(displayLine, 500);
            break;
        case i > 4 && i < 25:
            setTimeout(displayLine, 30);
            break;
        case i === 25:
            setTimeout(displayLine, 400);
            break;
        case i === 42:
            setTimeout(displayLine, 300);
            break;
        case i > 42 && i < 82:
            setTimeout(displayLine, 25);
            break;
        case i === 83:
            if (await isArchUser())
                bootScreen.innerHTML += "btw i use arch<br/>";
            setTimeout(displayLine, 25);
            break;
        case i >= log.length-2 && i < log.length:
            setTimeout(displayLine, 300);
            break;
        default:
            setTimeout(displayLine, Math.pow(1 - (i/1000), 3)*25);
    }
}

async function displayTitleScreen() {
    let bootScreen = document.getElementById("boot_screen");
    if (bootScreen === null) {
        bootScreen = document.createElement("section");
        bootScreen.setAttribute("id", "boot_screen");
        bootScreen.setAttribute("style", "z-index: 9999999");
        document.body.appendChild(bootScreen);
    }
    bootScreen.innerHTML = "";
    window.audioManager.theme.play();

    await window._delay(400);
    document.body.setAttribute("class", "");
    bootScreen.setAttribute("class", "center");
    bootScreen.innerHTML = "<h1>eDEX-UI</h1>";
    let title = document.querySelector("section > h1");

    await window._delay(200);
    document.body.setAttribute("class", "solidBackground");

    await window._delay(100);
    title.setAttribute("style", `background-color: rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});border-bottom: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await window._delay(300);
    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await window._delay(100);
    title.setAttribute("style", "");
    title.setAttribute("class", "glitch");

    await window._delay(500);
    document.body.setAttribute("class", "");
    title.setAttribute("class", "");
    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await window._delay(1000);
    if (window.term) {
        bootScreen.remove();
        return true;
    }
    initGraphicalErrorHandling();
    waitForFonts().then(() => {
        bootScreen.remove();
        initUI();
    });
}

async function getDisplayName() {
    let user = window.settings.username || null;
    if (user) return user;
    try {
        const usernameModule = await import('username');
        const getUserName = usernameModule.default || usernameModule;
        user = await getUserName();
    } catch (e) {}
    return user;
}

async function initUI() {
    // Use insertAdjacentHTML instead of innerHTML += to avoid destroying existing DOM
    // (innerHTML += re-parses the entire body, which crashes Chrome's renderer with augmented-ui)
    document.body.insertAdjacentHTML('beforeend', `<section class="mod_column" id="mod_column_left">
        <h3 class="title"><p>PANEL</p><p>SYSTEM</p></h3>
    </section>
    <section id="main_shell" style="height:0%;width:0%;opacity:0;margin-bottom:30vh;" augmented-ui="bl-clip tr-clip exe">
        <h3 class="title" style="opacity:0;"><p>TERMINAL</p><p>MAIN SHELL</p></h3>
        <h1 id="main_shell_greeting"></h1>
    </section>
    <section class="mod_column" id="mod_column_right">
        <h3 class="title"><p>PANEL</p><p>NETWORK</p></h3>
    </section>`);

    await window._delay(10);
    window.audioManager.expand.play();
    document.getElementById("main_shell").setAttribute("style", "height:0%;margin-bottom:30vh;");

    await window._delay(500);
    document.getElementById("main_shell").setAttribute("style", "margin-bottom: 30vh;");
    document.querySelector("#main_shell > h3.title").setAttribute("style", "");

    await window._delay(700);
    document.getElementById("main_shell").setAttribute("style", "opacity: 0;");
    document.body.insertAdjacentHTML('beforeend', `
    <section id="filesystem" style="width: 0px;" class="${window.settings.hideDotfiles ? "hideDotfiles" : ""} ${window.settings.fsListView ? "list-view" : ""}">
    </section>
    <section id="keyboard" style="opacity:0;">
    </section>`);

    // Load keyboard layout via preload bridge
    const kbLayout = await window.edex.config.readKeyboardLayout(window.settings.keyboard);
    window.keyboard = new Keyboard({
        layout: kbLayout,
        container: "keyboard",
        store
    });

    await window._delay(10);
    document.getElementById("main_shell").setAttribute("style", "");

    await window._delay(270);
    let greeter = document.getElementById("main_shell_greeting");
    getDisplayName().then(user => {
        if (user) {
            greeter.innerHTML += `Welcome back, <em>${user}</em>`;
        } else {
            greeter.innerHTML += "Welcome back";
        }
    });
    greeter.setAttribute("style", "opacity: 1;");
    document.getElementById("filesystem").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("class", "animation_state_1");
    window.audioManager.keyboard.play();

    await window._delay(100);
    document.getElementById("keyboard").setAttribute("class", "animation_state_1 animation_state_2");

    await window._delay(1000);
    greeter.setAttribute("style", "opacity: 0;");

    await window._delay(100);
    document.getElementById("keyboard").setAttribute("class", "");

    await window._delay(400);
    greeter.remove();

    // Start the system monitor scheduler (coordinated SI polling)
    scheduler.start();

    // Initialize modules
    window.mods = {};
    window.mods.clock = new Clock("mod_column_left", { store });
    window.mods.sysinfo = new Sysinfo("mod_column_left", { store });
    window.mods.hardwareInspector = new HardwareInspector("mod_column_left", { store });
    window.mods.cpuinfo = new Cpuinfo("mod_column_left", { store });
    window.mods.ramwatcher = new RAMwatcher("mod_column_left", { store });
    window.mods.toplist = new Toplist("mod_column_left", { store });
    window.mods.netstat = new Netstat("mod_column_right", { store });
    window.mods.globe = new LocationGlobe("mod_column_right", { store });
    window.mods.conninfo = new Conninfo("mod_column_right", { store });

    // Fade-in animations
    document.querySelectorAll(".mod_column").forEach(e => {
        e.setAttribute("class", "mod_column activated");
    });
    let idx = 0;
    let left = document.querySelectorAll("#mod_column_left > div");
    let right = document.querySelectorAll("#mod_column_right > div");
    let x = setInterval(() => {
        if (!left[idx] && !right[idx]) {
            clearInterval(x);
        } else {
            window.audioManager.panels.play();
            if (left[idx]) left[idx].setAttribute("style", "animation-play-state: running;");
            if (right[idx]) right[idx].setAttribute("style", "animation-play-state: running;");
            idx++;
        }
    }, 500);

    await window._delay(100);

    // Initialize the terminal
    let shellContainer = document.getElementById("main_shell");
    shellContainer.insertAdjacentHTML('beforeend', `
        <ul id="main_shell_tabs">
            <li id="shell_tab0" class="active"><p>MAIN SHELL</p></li>
            <li id="shell_tab1"><p>EMPTY</p></li>
            <li id="shell_tab2"><p>EMPTY</p></li>
            <li id="shell_tab3"><p>EMPTY</p></li>
            <li id="shell_tab4"><p>EMPTY</p></li>
        </ul>
        <div id="main_shell_innercontainer">
            <pre id="terminal0" class="active"></pre>
            <pre id="terminal1"></pre>
            <pre id="terminal2"></pre>
            <pre id="terminal3"></pre>
            <pre id="terminal4"></pre>
        </div>`);

    // Event delegation for shell tabs (replaces inline onclick)
    document.getElementById("main_shell_tabs").addEventListener("click", (e) => {
        const tab = e.target.closest("li");
        if (!tab) return;
        const num = parseInt(tab.id.replace("shell_tab", ""), 10);
        window.focusShellTab(num);
    });

    window.term = {
        0: new Terminal({
            parentId: "terminal0",
            port: window.settings.port || 3000,
            store
        })
    };
    window.currentTerm = 0;
    window.term[0].onprocesschange = p => {
        document.getElementById("shell_tab0").innerHTML = `<p>MAIN - ${p}</p>`;
    };
    window.onmouseup = e => {
        if (window.keyboard.linkedToTerm) window.term[window.currentTerm].term.focus();
    };
    window.term[0].term.writeln("\x1b[1m"+`Welcome to eDEX-UI v${window.edex.app.getVersion()} - Electron v${window.edex.electronVersion}`+"\x1b[0m");

    await window._delay(100);
    window.fsDisp = new FilesystemDisplay({
        parentId: "filesystem",
        store,
        callbacks: {
            getActiveTerm: () => window.term[window.currentTerm],
            getKeyboardDataset: () => window.keyboard.container.dataset,
            themeChanger: (name) => window.themeChanger(name),
            remakeKeyboard: (name) => window.remakeKeyboard(name),
            openSettings: () => window.openSettings(),
            openShortcutsHelp: () => window.openShortcutsHelp(),
            playFolderSound: () => window.audioManager.folder.play(),
        }
    });

    await window._delay(200);
    document.getElementById("filesystem").setAttribute("style", "opacity: 1;");
    if (window.performance.navigation.type === 1) {
        window.term[window.currentTerm].resendCWD();
    }

    await window._delay(200);
    window.updateCheck = new UpdateChecker();
}

// Cleanup all active modules before reload/theme switch
function destroyAll() {
    if (window.term) {
        Object.keys(window.term).forEach(key => {
            if (window.term[key] && typeof window.term[key].destroy === 'function') {
                window.term[key].destroy();
            }
        });
    }
    if (window.mods) {
        Object.keys(window.mods).forEach(key => {
            if (window.mods[key] && typeof window.mods[key].destroy === 'function') {
                window.mods[key].destroy();
            }
        });
    }
    if (window.fsDisp && typeof window.fsDisp.destroy === 'function') window.fsDisp.destroy();
    if (window.keyboard && typeof window.keyboard.destroy === 'function') window.keyboard.destroy();
    if (window.audioManager && typeof window.audioManager.destroy === 'function') window.audioManager.destroy();
    scheduler.destroy();
    Modal.destroyAll();
}
window.destroyAll = destroyAll;

window.themeChanger = theme => {
    window.edex.hotswitch.setThemeOverride(theme);
    setTimeout(() => {
        destroyAll();
        window.location.reload(true);
    }, 100);
};

window.remakeKeyboard = async (layout) => {
    document.getElementById("keyboard").innerHTML = "";
    const kbLayout = await window.edex.config.readKeyboardLayout(layout);
    window.keyboard = new Keyboard({
        layout: kbLayout,
        container: "keyboard",
        store
    });
    window.edex.hotswitch.setKbOverride(layout);
};

window.focusShellTab = number => {
    window.audioManager.folder.play();

    if (number !== window.currentTerm && window.term[number]) {
        window.currentTerm = number;
        store.set('activeTerminal', number);
        document.querySelectorAll(`ul#main_shell_tabs > li:not(:nth-child(${number+1}))`).forEach(e => {
            e.setAttribute("class", "");
        });
        document.getElementById("shell_tab"+number).setAttribute("class", "active");
        document.querySelectorAll(`div#main_shell_innercontainer > pre:not(:nth-child(${number+1}))`).forEach(e => {
            e.setAttribute("class", "");
        });
        document.getElementById("terminal"+number).setAttribute("class", "active");
        window.term[number].fit();
        window.term[number].term.focus();
        window.term[number].resendCWD();
        window.fsDisp.followTab();
    } else if (number > 0 && number <= 4 && window.term[number] !== null && typeof window.term[number] !== "object") {
        window.term[number] = null;
        document.getElementById("shell_tab"+number).innerHTML = "<p>LOADING...</p>";

        window.edex.terminal.spawn().then(result => {
            if (result.error) {
                document.getElementById("shell_tab"+number).innerHTML = "<p>ERROR</p>";
            } else {
                let port = result.port;
                window.term[number] = new Terminal({
                    parentId: "terminal"+number,
                    port,
                    store
                });
                window.term[number].onclose = e => {
                    delete window.term[number].onprocesschange;
                    document.getElementById("shell_tab"+number).innerHTML = "<p>EMPTY</p>";
                    document.getElementById("terminal"+number).innerHTML = "";
                    window.term[number].term.dispose();
                    delete window.term[number];
                    window.useAppShortcut("PREVIOUS_TAB");
                };
                window.term[number].onprocesschange = p => {
                    document.getElementById("shell_tab"+number).innerHTML = `<p>#${number+1} - ${p}</p>`;
                };
                document.getElementById("shell_tab"+number).innerHTML = `<p>::${port}</p>`;
                setTimeout(() => {
                    window.focusShellTab(number);
                }, 500);
            }
        });
    }
};

// Settings editor
window.openSettings = async () => {
    if (document.getElementById("settingsEditor")) return;

    let keyboards = "", themes = "", monitors = "", ifaces = "";
    const kbList = await window.edex.config.listKeyboards();
    kbList.forEach(kb => {
        if (kb === window.settings.keyboard) return;
        keyboards += `<option>${kb}</option>`;
    });
    const thList = await window.edex.config.listThemes();
    thList.forEach(th => {
        if (th === window.settings.theme) return;
        themes += `<option>${th}</option>`;
    });
    const displayCount = await window.edex.app.getDisplayCount();
    for (let i = 0; i < displayCount; i++) {
        if (i !== window.settings.monitor) monitors += `<option>${i}</option>`;
    }
    let nets = await window.si.networkInterfaces();
    const currentIface = store.get('network.iface');
    nets.forEach(net => {
        if (net.iface !== currentIface) ifaces += `<option>${net.iface}</option>`;
    });

    window.keyboard.detach();

    new Modal({
        type: "custom",
        title: `Settings <i>(v${window.edex.app.getVersion()})</i>`,
        html: `<table id="settingsEditor">
                    <tr><th>Key</th><th>Description</th><th>Value</th></tr>
                    <tr><td>shell</td><td>The program to run as a terminal emulator</td><td><input type="text" id="settingsEditor-shell" value="${window.settings.shell}"></td></tr>
                    <tr><td>shellArgs</td><td>Arguments to pass to the shell</td><td><input type="text" id="settingsEditor-shellArgs" value="${window.settings.shellArgs || ''}"></td></tr>
                    <tr><td>cwd</td><td>Working Directory to start in</td><td><input type="text" id="settingsEditor-cwd" value="${window.settings.cwd}"></td></tr>
                    <tr><td>env</td><td>Custom shell environment override</td><td><input type="text" id="settingsEditor-env" value="${window.settings.env}"></td></tr>
                    <tr><td>username</td><td>Custom username to display at boot</td><td><input type="text" id="settingsEditor-username" value="${window.settings.username}"></td></tr>
                    <tr><td>keyboard</td><td>On-screen keyboard layout code</td><td><select id="settingsEditor-keyboard"><option>${window.settings.keyboard}</option>${keyboards}</select></td></tr>
                    <tr><td>theme</td><td>Name of the theme to load</td><td><select id="settingsEditor-theme"><option>${window.settings.theme}</option>${themes}</select></td></tr>
                    <tr><td>termFontSize</td><td>Size of the terminal text in pixels</td><td><input type="number" id="settingsEditor-termFontSize" value="${window.settings.termFontSize}"></td></tr>
                    <tr><td>audio</td><td>Activate audio sound effects</td><td><select id="settingsEditor-audio"><option>${window.settings.audio}</option><option>${!window.settings.audio}</option></select></td></tr>
                    <tr><td>audioVolume</td><td>Set default volume (0.0 - 1.0)</td><td><input type="number" id="settingsEditor-audioVolume" value="${window.settings.audioVolume || '1.0'}"></td></tr>
                    <tr><td>disableFeedbackAudio</td><td>Disable recurring feedback sound FX</td><td><select id="settingsEditor-disableFeedbackAudio"><option>${window.settings.disableFeedbackAudio}</option><option>${!window.settings.disableFeedbackAudio}</option></select></td></tr>
                    <tr><td>port</td><td>Local port for UI-shell connection</td><td><input type="number" id="settingsEditor-port" value="${window.settings.port}"></td></tr>
                    <tr><td>pingAddr</td><td>IPv4 address to test connectivity</td><td><input type="text" id="settingsEditor-pingAddr" value="${window.settings.pingAddr || "1.1.1.1"}"></td></tr>
                    <tr><td>clockHours</td><td>Clock format (12/24 hours)</td><td><select id="settingsEditor-clockHours"><option>${(window.settings.clockHours === 12) ? "12" : "24"}</option><option>${(window.settings.clockHours === 12) ? "24" : "12"}</option></select></td></tr>
                    <tr><td>monitor</td><td>Which monitor to spawn UI in</td><td><select id="settingsEditor-monitor">${(typeof window.settings.monitor !== "undefined") ? "<option>"+window.settings.monitor+"</option>" : ""}${monitors}</select></td></tr>
                    <tr><td>nointro</td><td>Skip the intro boot log</td><td><select id="settingsEditor-nointro"><option>${window.settings.nointro}</option><option>${!window.settings.nointro}</option></select></td></tr>
                    <tr><td>nocursor</td><td>Hide the mouse cursor</td><td><select id="settingsEditor-nocursor"><option>${window.settings.nocursor}</option><option>${!window.settings.nocursor}</option></select></td></tr>
                    <tr><td>iface</td><td>Override network monitoring interface</td><td><select id="settingsEditor-iface"><option>${currentIface}</option>${ifaces}</select></td></tr>
                    <tr><td>allowWindowed</td><td>Allow F11 for windowed mode</td><td><select id="settingsEditor-allowWindowed"><option>${window.settings.allowWindowed}</option><option>${!window.settings.allowWindowed}</option></select></td></tr>
                    <tr><td>keepGeometry</td><td>Keep 16:9 ratio in windowed mode</td><td><select id="settingsEditor-keepGeometry"><option>${(window.settings.keepGeometry === false) ? 'false' : 'true'}</option><option>${(window.settings.keepGeometry === false) ? 'true' : 'false'}</option></select></td></tr>
                    <tr><td>excludeThreadsFromToplist</td><td>Display threads in top processes</td><td><select id="settingsEditor-excludeThreadsFromToplist"><option>${window.settings.excludeThreadsFromToplist}</option><option>${!window.settings.excludeThreadsFromToplist}</option></select></td></tr>
                    <tr><td>hideDotfiles</td><td>Hide dotfiles in file display</td><td><select id="settingsEditor-hideDotfiles"><option>${window.settings.hideDotfiles}</option><option>${!window.settings.hideDotfiles}</option></select></td></tr>
                    <tr><td>fsListView</td><td>Show files in list view</td><td><select id="settingsEditor-fsListView"><option>${window.settings.fsListView}</option><option>${!window.settings.fsListView}</option></select></td></tr>
                    <tr><td>experimentalGlobeFeatures</td><td>Toggle experimental globe features</td><td><select id="settingsEditor-experimentalGlobeFeatures"><option>${window.settings.experimentalGlobeFeatures}</option><option>${!window.settings.experimentalGlobeFeatures}</option></select></td></tr>
                    <tr><td>experimentalFeatures</td><td>Toggle Chrome experimental features</td><td><select id="settingsEditor-experimentalFeatures"><option>${window.settings.experimentalFeatures}</option><option>${!window.settings.experimentalFeatures}</option></select></td></tr>
                </table>
                <h6 id="settingsEditorStatus">Loaded values from memory</h6>
                <br>`,
        buttons: [
            {label: "Open in External Editor", action:`window.edex.shell.openPath('${settingsFile}');window.edex.window.minimize();`},
            {label: "Save to Disk", action: "window.writeSettingsFile()"},
            {label: "Reload UI", action: "window.location.reload(true);"},
            {label: "Restart eDEX", action: "window.edex.app.relaunch();"}
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });
};

window.writeFile = (filePath) => {
    window.edex.config.writeFile(filePath, document.getElementById("fileEdit").value).then(() => {
        document.getElementById("fedit-status").innerHTML = "<i>File saved.</i>";
    });
};

window.writeSettingsFile = () => {
    window.settings = {
        shell: document.getElementById("settingsEditor-shell").value,
        shellArgs: document.getElementById("settingsEditor-shellArgs").value,
        cwd: document.getElementById("settingsEditor-cwd").value,
        env: document.getElementById("settingsEditor-env").value,
        username: document.getElementById("settingsEditor-username").value,
        keyboard: document.getElementById("settingsEditor-keyboard").value,
        theme: document.getElementById("settingsEditor-theme").value,
        termFontSize: Number(document.getElementById("settingsEditor-termFontSize").value),
        audio: (document.getElementById("settingsEditor-audio").value === "true"),
        audioVolume: Number(document.getElementById("settingsEditor-audioVolume").value),
        disableFeedbackAudio: (document.getElementById("settingsEditor-disableFeedbackAudio").value === "true"),
        pingAddr: document.getElementById("settingsEditor-pingAddr").value,
        clockHours: Number(document.getElementById("settingsEditor-clockHours").value),
        port: Number(document.getElementById("settingsEditor-port").value),
        monitor: Number(document.getElementById("settingsEditor-monitor").value),
        nointro: (document.getElementById("settingsEditor-nointro").value === "true"),
        nocursor: (document.getElementById("settingsEditor-nocursor").value === "true"),
        iface: document.getElementById("settingsEditor-iface").value,
        allowWindowed: (document.getElementById("settingsEditor-allowWindowed").value === "true"),
        forceFullscreen: window.settings.forceFullscreen,
        keepGeometry: (document.getElementById("settingsEditor-keepGeometry").value === "true"),
        excludeThreadsFromToplist: (document.getElementById("settingsEditor-excludeThreadsFromToplist").value === "true"),
        hideDotfiles: (document.getElementById("settingsEditor-hideDotfiles").value === "true"),
        fsListView: (document.getElementById("settingsEditor-fsListView").value === "true"),
        experimentalGlobeFeatures: (document.getElementById("settingsEditor-experimentalGlobeFeatures").value === "true"),
        experimentalFeatures: (document.getElementById("settingsEditor-experimentalFeatures").value === "true")
    };

    Object.keys(window.settings).forEach(key => {
        if (window.settings[key] === "undefined") {
            delete window.settings[key];
        }
    });

    window.edex.config.writeSettings(window.settings);
    document.getElementById("settingsEditorStatus").innerText = "New values written to settings.json file at "+new Date().toTimeString();
};

window.toggleFullScreen = () => {
    let useFullscreen = !window.edex.window.isFullScreen();
    window.edex.window.setFullScreen(useFullscreen);
    window.lastWindowState["useFullscreen"] = useFullscreen;
    window.edex.config.writeWindowState(window.lastWindowState);
};

// Display available keyboard shortcuts
window.openShortcutsHelp = () => {
    if (document.getElementById("settingsEditor")) return;

    const shortcutsDefinition = {
        "COPY": "Copy selected buffer from the terminal.",
        "PASTE": "Paste system clipboard to the terminal.",
        "NEXT_TAB": "Switch to the next opened terminal tab.",
        "PREVIOUS_TAB": "Switch to the previous opened terminal tab.",
        "TAB_X": "Switch to terminal tab <strong>X</strong>.",
        "SETTINGS": "Open the settings editor.",
        "SHORTCUTS": "List and edit keyboard shortcuts.",
        "FUZZY_SEARCH": "Search for entries in the current working directory.",
        "TERMINAL_SEARCH": "Search text in the active terminal scrollback.",
        "FS_LIST_VIEW": "Toggle list/grid view in file browser.",
        "FS_DOTFILES": "Toggle hidden files in file browser.",
        "KB_PASSMODE": "Toggle on-screen keyboard password mode.",
        "DEV_DEBUG": "Open Chromium Dev Tools.",
        "DEV_RELOAD": "Trigger front-end hot reload."
    };

    let appList = "";
    window.shortcuts.filter(e => e.type === "app").forEach(cut => {
        let action = (cut.action.startsWith("TAB_")) ? "TAB_X" : cut.action;
        appList += `<tr><td>${(cut.enabled) ? 'YES' : 'NO'}</td><td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td><td>${shortcutsDefinition[action]}</td></tr>`;
    });

    let customList = "";
    window.shortcuts.filter(e => e.type === "shell").forEach(cut => {
        customList += `<tr><td>${(cut.enabled) ? 'YES' : 'NO'}</td><td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td><td><input disabled type="text" placeholder="Run terminal command..." value="${cut.action}"><input disabled type="checkbox" name="shortcutsHelpNew_Enter" ${(cut.linebreak) ? 'checked' : ''}><label for="shortcutsHelpNew_Enter">Enter</label></td></tr>`;
    });

    window.keyboard.detach();
    new Modal({
        type: "custom",
        title: `Available Keyboard Shortcuts <i>(v${window.edex.app.getVersion()})</i>`,
        html: `<h5>Using either the on-screen or a physical keyboard:</h5>
                <details open id="shortcutsHelpAccordeon1">
                    <summary>Emulator shortcuts</summary>
                    <table class="shortcutsHelp"><tr><th>Enabled</th><th>Trigger</th><th>Action</th></tr>${appList}</table>
                </details><br>
                <details id="shortcutsHelpAccordeon2">
                    <summary>Custom command shortcuts</summary>
                    <table class="shortcutsHelp"><tr><th>Enabled</th><th>Trigger</th><th>Command</th><tr>${customList}</table>
                </details><br>`,
        buttons: [
            {label: "Open Shortcuts File", action:`window.edex.shell.openPath('${shortcutsFile}');window.edex.window.minimize();`},
            {label: "Reload UI", action: "window.location.reload(true);"},
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });

    let wrap1 = document.getElementById('shortcutsHelpAccordeon1');
    let wrap2 = document.getElementById('shortcutsHelpAccordeon2');
    wrap1.addEventListener('toggle', e => { wrap2.open = !wrap1.open; });
    wrap2.addEventListener('toggle', e => { wrap1.open = !wrap2.open; });
};

// Terminal search bar
function toggleTerminalSearch() {
    let searchBar = document.getElementById("terminal_search_bar");
    if (searchBar) {
        searchBar.remove();
        window.term[window.currentTerm].term.focus();
        return;
    }
    const bar = document.createElement("div");
    bar.id = "terminal_search_bar";
    bar.innerHTML = `<input type="text" placeholder="Search terminal..." spellcheck="false">
        <button id="tsearch_prev">&uarr;</button>
        <button id="tsearch_next">&darr;</button>
        <button id="tsearch_close">&times;</button>`;
    bar.style.cssText = "position:absolute;top:0;right:2vh;z-index:999;display:flex;gap:4px;padding:4px 8px;background:rgba(var(--color_r),var(--color_g),var(--color_b),0.15);border:1px solid rgb(var(--color_r),var(--color_g),var(--color_b));";
    const input = bar.querySelector("input");
    input.style.cssText = "background:transparent;border:1px solid rgba(var(--color_r),var(--color_g),var(--color_b),0.3);color:rgb(var(--color_r),var(--color_g),var(--color_b));font-family:var(--font_main);font-size:1.2vh;padding:2px 6px;outline:none;width:20vh;";
    bar.querySelectorAll("button").forEach(btn => {
        btn.style.cssText = "background:transparent;border:1px solid rgba(var(--color_r),var(--color_g),var(--color_b),0.3);color:rgb(var(--color_r),var(--color_g),var(--color_b));cursor:pointer;font-size:1.2vh;padding:2px 6px;";
    });
    document.getElementById("main_shell").appendChild(bar);
    input.focus();

    const doSearch = (dir) => {
        const q = input.value;
        if (!q) return;
        const term = window.term[window.currentTerm];
        if (dir === "prev") term.findPrevious(q, { regex: false, caseSensitive: false });
        else term.findNext(q, { regex: false, caseSensitive: false });
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            doSearch(e.shiftKey ? "prev" : "next");
            e.preventDefault();
        }
        if (e.key === "Escape") {
            bar.remove();
            window.term[window.currentTerm].term.focus();
        }
        e.stopPropagation();
    });
    bar.querySelector("#tsearch_next").addEventListener("click", () => doSearch("next"));
    bar.querySelector("#tsearch_prev").addEventListener("click", () => doSearch("prev"));
    bar.querySelector("#tsearch_close").addEventListener("click", () => {
        bar.remove();
        window.term[window.currentTerm].term.focus();
    });
}

window.useAppShortcut = action => {
    // Handle shell shortcuts (objects from main process)
    if (typeof action === 'object' && action.type === 'shell') {
        let fn = action.linebreak ? "writelr" : "write";
        window.term[window.currentTerm][fn](action.action);
        return true;
    }
    switch(action) {
        case "COPY":
            window.term[window.currentTerm].clipboard.copy();
            return true;
        case "PASTE":
            window.term[window.currentTerm].clipboard.paste();
            return true;
        case "NEXT_TAB":
                if (window.term[window.currentTerm+1]) {
                    window.focusShellTab(window.currentTerm+1);
                } else if (window.term[window.currentTerm+2]) {
                    window.focusShellTab(window.currentTerm+2);
                } else if (window.term[window.currentTerm+3]) {
                    window.focusShellTab(window.currentTerm+3);
                } else if (window.term[window.currentTerm+4]) {
                    window.focusShellTab(window.currentTerm+4);
                } else {
                    window.focusShellTab(0);
                }
            return true;
        case "PREVIOUS_TAB":
                let idx = window.currentTerm || 4;
                if (window.term[idx] && idx !== window.currentTerm) {
                    window.focusShellTab(idx);
                } else if (window.term[idx-1]) {
                    window.focusShellTab(idx-1);
                } else if (window.term[idx-2]) {
                    window.focusShellTab(idx-2);
                } else if (window.term[idx-3]) {
                    window.focusShellTab(idx-3);
                } else if (window.term[idx-4]) {
                    window.focusShellTab(idx-4);
                }
            return true;
        case "TAB_1": window.focusShellTab(0); return true;
        case "TAB_2": window.focusShellTab(1); return true;
        case "TAB_3": window.focusShellTab(2); return true;
        case "TAB_4": window.focusShellTab(3); return true;
        case "TAB_5": window.focusShellTab(4); return true;
        case "SETTINGS": window.openSettings(); return true;
        case "SHORTCUTS": window.openShortcutsHelp(); return true;
        case "FUZZY_SEARCH": window.activeFuzzyFinder = new FuzzyFinder(); return true;
        case "TERMINAL_SEARCH": toggleTerminalSearch(); return true;
        case "FS_LIST_VIEW": window.fsDisp.toggleListview(); return true;
        case "FS_DOTFILES": window.fsDisp.toggleHidedotfiles(); return true;
        case "KB_PASSMODE": window.keyboard.togglePasswordMode(); return true;
        case "DEV_DEBUG": window.edex.window.toggleDevTools(); return true;
        case "DEV_RELOAD": destroyAll(); window.location.reload(true); return true;
        default:
            console.warn(`Unknown "${action}" app shortcut action`);
            return false;
    }
};

// Global keyboard shortcuts - now managed by main process
window.registerKeyboardShortcuts = () => {
    window.edex.shortcuts.registerAll(window.shortcuts);
};
window.registerKeyboardShortcuts();

// Listen for shortcut triggers from main process
window.edex.shortcuts.onTriggered(action => {
    window.useAppShortcut(action);
});

// See #361
window.addEventListener("focus", () => {
    window.registerKeyboardShortcuts();
});
window.addEventListener("blur", () => {
    window.edex.shortcuts.unregisterAll();
});

// Prevent showing menu, exiting fullscreen or app with keyboard shortcuts
document.addEventListener("keydown", e => {
    if (e.key === "Alt") e.preventDefault();
    if (e.code.startsWith("Alt") && e.ctrlKey && e.shiftKey) e.preventDefault();
    if (e.key === "F11" && !window.settings.allowWindowed) e.preventDefault();
    if (e.code === "KeyD" && e.ctrlKey) e.preventDefault();
    if (e.code === "KeyA" && e.ctrlKey) e.preventDefault();
});

// Fix #265
window.addEventListener("keyup", e => {
    if (window.edex.platform === "win32" && e.key === "F4" && e.altKey === true) {
        window.edex.app.quit();
    }
});

// Fix double-tap zoom on touchscreens
window.edex.setZoomLimits(1, 1);

// Resize terminal with window
window.onresize = () => {
    if (typeof window.currentTerm !== "undefined") {
        if (typeof window.term[window.currentTerm] !== "undefined") {
            window.term[window.currentTerm].fit();
        }
    }
};

// See #413 - Keep 16:9 geometry in windowed mode
window.resizeTimeout = null;
window.edex.window.onResize(() => {
    if (window.settings.keepGeometry === false) return;
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        if (window.edex.window.isFullScreen()) return false;
        if (window.edex.window.isMaximized()) {
            window.edex.window.unmaximize();
            window.edex.window.setFullScreen(true);
            return false;
        }
        let size = window.edex.window.getSize();
        if (size[0] >= size[1]) {
            window.edex.window.setSize(size[0], parseInt(size[0] * 9 / 16));
        } else {
            window.edex.window.setSize(size[1], parseInt(size[1] * 9 / 16));
        }
    }, 100);
});

window.edex.window.onLeaveFullScreen(() => {
    window.edex.window.setSize(960, 540);
});
