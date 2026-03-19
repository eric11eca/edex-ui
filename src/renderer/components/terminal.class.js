import { Terminal as XTerm } from 'xterm';
import { AttachAddon } from 'xterm-addon-attach';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import color from 'color';
import { TerminalMessage } from '../../shared/terminal-protocol.js';

class Terminal {
    constructor(opts) {
        if (!opts.parentId) throw "Missing options";

        this._store = opts.store || null;
        this.port = opts.port || 3000;
        this.cwd = "";
        this.oncwdchange = () => {};

        // Read theme/settings from store or window
        const theme = this._store ? this._store.get('theme') : window.theme;
        const settings = this._store ? this._store.get('settings') : window.settings;

        this._sendSizeToServer = () => {
            let cols = this.term.cols.toString();
            let rows = this.term.rows.toString();
            while (cols.length < 3) {
                cols = "0"+cols;
            }
            while (rows.length < 3) {
                rows = "0"+rows;
            }
            window.edex.terminal.sendResize(this.port, cols, rows);
        };

        // Support for custom color filters on the terminal - see #483
        let doCustomFilter = (window.isTermFilterValidated) ? true : false;

        // Parse & validate color filter
        if (window.isTermFilterValidated !== true && typeof theme.terminal.colorFilter === "object" && theme.terminal.colorFilter.length > 0) {
            doCustomFilter = theme.terminal.colorFilter.every((step, i, a) => {
                let func = step.slice(0, step.indexOf("("));

                switch(func) {
                    case "negate":
                    case "grayscale":
                        a[i] = {
                            func,
                            arg: []
                        };
                        return true;
                    case "lighten":
                    case "darken":
                    case "saturate":
                    case "desaturate":
                    case "whiten":
                    case "blacken":
                    case "fade":
                    case "opaquer":
                    case "rotate":
                    case "mix":
                        break;
                    default:
                        return false;
                }

                let arg = step.slice(step.indexOf("(")+1, step.indexOf(")"));

                if (typeof Number(arg) === "number") {
                    a[i] = {
                        func,
                        arg: [Number(arg)]
                    };
                    window.isTermFilterValidated = true;
                    return true;
                }

                return false;
            });
        }

        let colorify;
        if (doCustomFilter) {
            colorify = (base, target) => {
                let newColor = color(base);
                target = color(target);

                for (let i = 0; i < theme.terminal.colorFilter.length; i++) {
                    if (theme.terminal.colorFilter[i].func === "mix") {
                        newColor = newColor[theme.terminal.colorFilter[i].func](target, ...theme.terminal.colorFilter[i].arg);
                    } else {
                        newColor = newColor[theme.terminal.colorFilter[i].func](...theme.terminal.colorFilter[i].arg);
                    }
                }

                return newColor.hex();
            };
        } else {
            colorify = (base, target) => {
                return color(base).grayscale().mix(color(target), 0.3).hex();
            };
        }

        let themeColor = `rgb(${theme.r}, ${theme.g}, ${theme.b})`;

        this.term = new XTerm({
            cols: 80,
            rows: 24,
            cursorBlink: theme.terminal.cursorBlink || true,
            cursorStyle: theme.terminal.cursorStyle || "block",
            allowTransparency: theme.terminal.allowTransparency || false,
            fontFamily: theme.terminal.fontFamily || "Fira Mono",
            fontSize: theme.terminal.fontSize || settings.termFontSize || 15,
            fontWeight: theme.terminal.fontWeight || "normal",
            fontWeightBold: theme.terminal.fontWeightBold || "bold",
            letterSpacing: theme.terminal.letterSpacing || 0,
            lineHeight: theme.terminal.lineHeight || 1,
            scrollback: settings.scrollback || 10000,
            bellStyle: "none",
            theme: {
                foreground: theme.terminal.foreground,
                background: theme.terminal.background,
                cursor: theme.terminal.cursor,
                cursorAccent: theme.terminal.cursorAccent,
                selection: theme.terminal.selection,
                black: theme.colors.black || colorify("#2e3436", themeColor),
                red: theme.colors.red || colorify("#cc0000", themeColor),
                green: theme.colors.green || colorify("#4e9a06", themeColor),
                yellow: theme.colors.yellow || colorify("#c4a000", themeColor),
                blue: theme.colors.blue || colorify("#3465a4", themeColor),
                magenta: theme.colors.magenta || colorify("#75507b", themeColor),
                cyan: theme.colors.cyan || colorify("#06989a", themeColor),
                white: theme.colors.white || colorify("#d3d7cf", themeColor),
                brightBlack: theme.colors.brightBlack || colorify("#555753", themeColor),
                brightRed: theme.colors.brightRed || colorify("#ef2929", themeColor),
                brightGreen: theme.colors.brightGreen || colorify("#8ae234", themeColor),
                brightYellow: theme.colors.brightYellow || colorify("#fce94f", themeColor),
                brightBlue: theme.colors.brightBlue || colorify("#729fcf", themeColor),
                brightMagenta: theme.colors.brightMagenta || colorify("#ad7fa8", themeColor),
                brightCyan: theme.colors.brightCyan || colorify("#34e2e2", themeColor),
                brightWhite: theme.colors.brightWhite || colorify("#eeeeec", themeColor)
            }
        });
        let fitAddon = new FitAddon();
        this.term.loadAddon(fitAddon);
        this.term.open(document.getElementById(opts.parentId));
        try {
            this.term.loadAddon(new WebglAddon());
        } catch (error) {
            console.warn('WebGL terminal renderer disabled:', error);
        }

        // Search addon
        this._searchAddon = null;
        if (typeof this.term.onWriteParsed === 'function') {
            try {
                this._searchAddon = new SearchAddon();
                this.term.loadAddon(this._searchAddon);
            } catch (error) {
                this._searchAddon = null;
                console.warn('Terminal search disabled:', error);
            }
        } else {
            console.warn('Terminal search disabled: this xterm build does not expose onWriteParsed().');
        }

        // Clickable URLs
        this.term.loadAddon(new WebLinksAddon((event, uri) => {
            window.edex.shell.openExternal(uri);
        }));

        // Unicode 11 support (emoji, CJK, etc.)
        const unicode11 = new Unicode11Addon();
        this.term.loadAddon(unicode11);
        this.term.unicode.activeVersion = '11';

        // The ligatures addon still evaluates Node-only modules during import.
        // Skip it in the context-isolated renderer until the dependency stack is updated.
        const keydownHandler = opts.keydownHandler || (e => window.keyboard.keydownHandler(e));
        this.term.attachCustomKeyEventHandler(e => {
            keydownHandler(e);
            return true;
        });
        // Prevent soft-keyboard on touch devices #733
        document.querySelectorAll('.xterm-helper-textarea').forEach(textarea => textarea.setAttribute('readonly', 'readonly'));
        this.term.focus();

        window.edex.terminal.sendStartup(this.port);
        this._unsubTerminal = window.edex.terminal.onMessage(this.port, (...args) => {
            switch(args[0]) {
                case TerminalMessage.NEW_CWD:
                    this.cwd = args[1];
                    this.oncwdchange(this.cwd);
                    break;
                case TerminalMessage.FALLBACK_CWD:
                    this.cwd = "FALLBACK |-- "+args[1];
                    this.oncwdchange(this.cwd);
                    break;
                case TerminalMessage.NEW_PROCESS:
                    if (this.onprocesschange) {
                        this.onprocesschange(args[1]);
                    }
                    break;
                default:
                    return;
            }
        });
        this.resendCWD = () => {
            this.oncwdchange(this.cwd || null);
        };

        let sockHost = opts.host || "127.0.0.1";
        let sockPort = this.port;

        this.socket = new WebSocket("ws://"+sockHost+":"+sockPort);
        this.socket.onopen = () => {
            let attachAddon = new AttachAddon(this.socket);
            this.term.loadAddon(attachAddon);
            this.fit();
        };
        this.socket.onerror = e => {throw JSON.stringify(e)};
        this.socket.onclose = e => {
            if (this.onclose) {
                this.onclose(e);
            }
        };

        // Debounced refit: replace old 10-second throttle with 200ms debounce
        this._fitDebounceTimer = null;
        this._debouncedFit = () => {
            if (this._fitDebounceTimer) return;
            this._fitDebounceTimer = setTimeout(() => {
                this._fitDebounceTimer = null;
                this.fit();
            }, 200);
        };

        this.lastSoundFX = Date.now();
        this.socket.addEventListener("message", e => {
            let d = Date.now();

            if (d - this.lastSoundFX > 30) {
                let pm = this._store ? this._store.get('passwordMode') : window.passwordMode;
                if(pm == "false" || pm === false)
                    window.audioManager.stdout.play();
                this.lastSoundFX = d;
            }
            this._debouncedFit();

            // See #397
            if (!settings.experimentalGlobeFeatures) return;
            let ips = e.data.match(/((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g);
            if (ips !== null && ips.length >= 1) {
                ips = ips.filter((val, index, self) => { return self.indexOf(val) === index; });
                ips.forEach(ip => {
                    if (this._store) {
                        // Emit via store so globe can subscribe without direct coupling
                        this._store.set('_events.globeIp', { ip, time: d });
                    } else {
                        window.mods.globe.addTemporaryConnectedMarker(ip);
                    }
                });
            }
        });

        let parent = document.getElementById(opts.parentId);
        parent.addEventListener("wheel", e => {
            this.term.scrollLines(Math.round(e.deltaY/10));
        });
        this._lastTouchY = null;
        parent.addEventListener("touchstart", e => {
            this._lastTouchY = e.targetTouches[0].screenY;
        });
        parent.addEventListener("touchmove", e => {
            if (this._lastTouchY) {
                let y = e.changedTouches[0].screenY;
                let deltaY = y - this._lastTouchY;
                this._lastTouchY = y;
                this.term.scrollLines(-Math.round(deltaY/10));
            }
        });
        parent.addEventListener("touchend", e => {
            this._lastTouch = null;
        });
        parent.addEventListener("touchcancel", e => {
            this._lastTouch = null;
        });

        document.querySelector(".xterm-helper-textarea").addEventListener("keydown", e => {
            if (e.key === "F11" && settings.allowWindowed) {
                e.preventDefault();
                window.toggleFullScreen();
            }
        });

        this.fit = () => {
            this.lastRefit = Date.now();
            let {cols, rows} = fitAddon.proposeDimensions();

            // Apply custom fixes based on screen ratio, see #302
            let w = screen.width;
            let h = screen.height;
            let x = 1;
            let y = 0;

            function gcd(a, b) {
                return (b == 0) ? a : gcd(b, a%b);
            }
            let d = gcd(w, h);

            if (d === 100) { y = 1; x = 3;}
            if (d === 256) x = 2;

            if (settings.termFontSize < 15) y = y - 1;

            cols = cols+x;
            rows = rows+y;

            if (this.term.cols !== cols || this.term.rows !== rows) {
                this.resize(cols, rows);
            }
        };

        this.resize = (cols, rows) => {
            this.term.resize(cols, rows);
            this._sendSizeToServer();
        };

        this.write = cmd => {
            this.socket.send(cmd);
        };

        this.writelr = cmd => {
            this.socket.send(cmd+"\r");
        };

        this.clipboard = {
            copy: () => {
                if (!this.term.hasSelection()) return false;
                document.execCommand("copy");
                this.term.clearSelection();
                this.clipboard.didCopy = true;
            },
            paste: () => {
                this.write(window.edex.clipboard.readText());
                this.clipboard.didCopy = false;
            },
            didCopy: false
        };
    }

    findNext(query, opts) {
        if (this._searchAddon) this._searchAddon.findNext(query, opts);
    }

    findPrevious(query, opts) {
        if (this._searchAddon) this._searchAddon.findPrevious(query, opts);
    }

    destroy() {
        // Clear debounce timer
        if (this._fitDebounceTimer) {
            clearTimeout(this._fitDebounceTimer);
            this._fitDebounceTimer = null;
        }

        // Remove terminal message listener
        if (this._unsubTerminal) {
            this._unsubTerminal();
            this._unsubTerminal = null;
        }

        // Close WebSocket
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        // Dispose xterm instance (clears internal intervals and DOM)
        if (this.term) {
            this.term.dispose();
            this.term = null;
        }
    }
}

export { Terminal };
