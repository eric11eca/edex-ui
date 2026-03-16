import mime from 'mime-types';
import { Modal } from './modal.class.js';
import { DocReader } from './docReader.class.js';
import { MediaPlayer } from './mediaPlayer.class.js';
import fileIconsMatcher from '@assets/misc/file-icons-match.js';
import fileIcons from '@assets/icons/file-icons.json';

const settingsDir = window.edex.config.getSettingsDir();
const themesDir = window.edex.config.getThemesDir();
const keyboardsDir = window.edex.config.getKeyboardsDir();

class FilesystemDisplay {
    constructor(opts) {
        if (!opts.parentId) throw "Missing options";

        this._store = opts.store || null;
        this._callbacks = opts.callbacks || {};
        this._unsubs = [];
        this.cwd = [];
        this.cwd_path = null;
        const theme = this._store ? this._store.get('theme') : window.theme;
        this.iconcolor = `rgb(${theme.r}, ${theme.g}, ${theme.b})`;
        this._formatBytes = (a,b) => {if(0==a)return"0 Bytes";var c=1024,d=b||2,e=["Bytes","KB","MB","GB","TB","PB","EB","ZB","YB"],f=Math.floor(Math.log(a)/Math.log(c));return parseFloat((a/Math.pow(c,f)).toFixed(d))+" "+e[f]};
        this.fileIconsMatcher = fileIconsMatcher;
        this.icons = fileIcons;
        this.edexIcons = {
            theme: {
                width: 24,
                height: 24,
                svg: '<path d="M 17.9994,3.99805L 17.9994,2.99805C 17.9994,2.44604 17.5514,1.99805 16.9994,1.99805L 4.9994,1.99805C 4.4474,1.99805 3.9994,2.44604 3.9994,2.99805L 3.9994,6.99805C 3.9994,7.55005 4.4474,7.99805 4.9994,7.99805L 16.9994,7.99805C 17.5514,7.99805 17.9994,7.55005 17.9994,6.99805L 17.9994,5.99805L 18.9994,5.99805L 18.9994,9.99805L 8.9994,9.99805L 8.9994,20.998C 8.9994,21.55 9.4474,21.998 9.9994,21.998L 11.9994,21.998C 12.5514,21.998 12.9994,21.55 12.9994,20.998L 12.9994,11.998L 20.9994,11.998L 20.9994,3.99805L 17.9994,3.99805 Z"/>'
            },
            themesDir: {
                width: 24,
                height: 24,
                svg: `<path d="m9.9994 3.9981h-6c-1.105 0-1.99 0.896-1.99 2l-0.01 12c0 1.104 0.895 2 2 2h16c1.104 0 2-0.896 2-2v-9.9999c0-1.104-0.896-2-2-2h-8l-1.9996-2z" stroke-width=".2"/><path stroke-linejoin="round" d="m18.8 9.3628v-0.43111c0-0.23797-0.19314-0.43111-0.43111-0.43111h-5.173c-0.23797 0-0.43111 0.19313-0.43111 0.43111v1.7244c0 0.23797 0.19314 0.43111 0.43111 0.43111h5.1733c0.23797 0 0.43111-0.19314 0.43111-0.43111v-0.43111h0.43111v1.7244h-4.3111v4.7422c0 0.23797 0.19314 0.43111 0.43111 0.43111h0.86221c0.23797 0 0.43111-0.19314 0.43111-0.43111v-3.879h3.449v-3.4492z" stroke-width=".086221" fill="${theme.colors.light_black}"/>`
            },
            kblayout: {
                width: 24,
                height: 24,
                svg: '<path d="M 18.9994,9.99807L 16.9994,9.99807L 16.9994,7.99807L 18.9994,7.99807M 18.9994,12.9981L 16.9994,12.9981L 16.9994,10.9981L 18.9994,10.9981M 15.9994,9.99807L 13.9994,9.99807L 13.9994,7.99807L 15.9994,7.99807M 15.9994,12.9981L 13.9994,12.9981L 13.9994,10.9981L 15.9994,10.9981M 15.9994,16.9981L 7.99941,16.9981L 7.99941,14.9981L 15.9994,14.9981M 6.99941,9.99807L 4.99941,9.99807L 4.99941,7.99807L 6.99941,7.99807M 6.99941,12.9981L 4.99941,12.9981L 4.99941,10.9981L 6.99941,10.9981M 7.99941,10.9981L 9.99941,10.9981L 9.99941,12.9981L 7.99941,12.9981M 7.99941,7.99807L 9.99941,7.99807L 9.99941,9.99807L 7.99941,9.99807M 10.9994,10.9981L 12.9994,10.9981L 12.9994,12.9981L 10.9994,12.9981M 10.9994,7.99807L 12.9994,7.99807L 12.9994,9.99807L 10.9994,9.99807M 19.9994,4.99807L 3.99941,4.99807C 2.89441,4.99807 2.0094,5.89406 2.0094,6.99807L 1.99941,16.9981C 1.99941,18.1021 2.89441,18.9981 3.99941,18.9981L 19.9994,18.9981C 21.1034,18.9981 21.9994,18.1021 21.9994,16.9981L 21.9994,6.99807C 21.9994,5.89406 21.1034,4.99807 19.9994,4.99807 Z"/>'
            },
            kblayoutsDir: {
                width: 24,
                height: 24,
                svg: `<path d="m9.9994 3.9981h-6c-1.105 0-1.99 0.896-1.99 2l-0.01 12c0 1.104 0.895 2 2 2h16c1.104 0 2-0.896 2-2v-9.9999c0-1.104-0.896-2-2-2h-8l-1.9996-2z" stroke-width=".2"/><path stroke-linejoin="round" d="m17.48 11.949h-1.14v-1.14h1.14m0 2.8499h-1.14v-1.14h1.14m-1.7099-0.56999h-1.14v-1.14h1.14m0 2.8499h-1.14v-1.14h1.14m0 3.4199h-4.56v-1.14h4.56m-5.13-2.85h-1.1399v-1.14h1.14m0 2.8499h-1.1399v-1.14h1.14m0.56998 0h1.14v1.14h-1.14m0-2.8499h1.14v1.14h-1.14m1.7099 0.56999h1.14v1.14h-1.14m0-2.8499h1.14v1.14h-1.14m5.13-2.8494h-9.1199c-0.62982 0-1.1343 0.51069-1.1343 1.14l-0.0057 5.6998c0 0.62925 0.51013 1.14 1.14 1.14h9.1196c0.62925 0 1.14-0.5107 1.14-1.14v-5.6998c0-0.62926-0.5107-1.14-1.14-1.14z" stroke-width="0.114" fill="${theme.colors.light_black}"/>`
            },
            settings: {
                width: 24,
                height: 24,
                svg: '<path d="M 11.9994,15.498C 10.0664,15.498 8.49939,13.931 8.49939,11.998C 8.49939,10.0651 10.0664,8.49805 11.9994,8.49805C 13.9324,8.49805 15.4994,10.0651 15.4994,11.998C 15.4994,13.931 13.9324,15.498 11.9994,15.498 Z M 19.4284,12.9741C 19.4704,12.6531 19.4984,12.329 19.4984,11.998C 19.4984,11.6671 19.4704,11.343 19.4284,11.022L 21.5414,9.36804C 21.7294,9.21606 21.7844,8.94604 21.6594,8.73004L 19.6594,5.26605C 19.5354,5.05005 19.2734,4.96204 19.0474,5.04907L 16.5584,6.05206C 16.0424,5.65607 15.4774,5.32104 14.8684,5.06903L 14.4934,2.41907C 14.4554,2.18103 14.2484,1.99805 13.9994,1.99805L 9.99939,1.99805C 9.74939,1.99805 9.5434,2.18103 9.5054,2.41907L 9.1304,5.06805C 8.52039,5.32104 7.95538,5.65607 7.43939,6.05206L 4.95139,5.04907C 4.7254,4.96204 4.46338,5.05005 4.33939,5.26605L 2.33939,8.73004C 2.21439,8.94604 2.26938,9.21606 2.4574,9.36804L 4.5694,11.022C 4.5274,11.342 4.49939,11.6671 4.49939,11.998C 4.49939,12.329 4.5274,12.6541 4.5694,12.9741L 2.4574,14.6271C 2.26938,14.78 2.21439,15.05 2.33939,15.2661L 4.33939,18.73C 4.46338,18.946 4.7254,19.0341 4.95139,18.947L 7.4404,17.944C 7.95639,18.34 8.52139,18.675 9.1304,18.9271L 9.5054,21.577C 9.5434,21.8151 9.74939,21.998 9.99939,21.998L 13.9994,21.998C 14.2484,21.998 14.4554,21.8151 14.4934,21.577L 14.8684,18.9271C 15.4764,18.6741 16.0414,18.34 16.5574,17.9431L 19.0474,18.947C 19.2734,19.0341 19.5354,18.946 19.6594,18.73L 21.6594,15.2661C 21.7844,15.05 21.7294,14.78 21.5414,14.6271L 19.4284,12.9741 Z"/>'
            }
        };

        const container = document.getElementById(opts.parentId);
        container.innerHTML = `
            <h3 class="title"><p>FILESYSTEM</p><p id="fs_disp_title_dir"></p></h3>
            <div id="fs_disp_container">
            </div>
            <div id="fs_space_bar">
                <h1>EXIT DISPLAY</h1>
                <h3>Calculating available space...</h3><progress value="100" max="100"></progress>
            </div>`;
        this.filesContainer = document.getElementById("fs_disp_container");
        this.space_bar = {
            text: document.querySelector("#fs_space_bar > h3"),
            bar: document.querySelector("#fs_space_bar > progress")
        };
        // Cache DOM refs
        this._titleDir = document.getElementById("fs_disp_title_dir");
        this._titleLabel = document.querySelector("section#filesystem > h3.title > p:first-of-type");
        this._spaceBar = document.getElementById("fs_space_bar");

        this.fsBlock = {};
        this.dirpath = "";
        this.failed = false;
        this._noTracking = false;
        this._runNextTick = false;
        this._reading = false;
        this._isDiskView = false;

        // Event delegation: single click handler for all file entries
        this.filesContainer.addEventListener("click", (e) => {
            const entry = e.target.closest("[data-idx]");
            if (!entry) return;
            const idx = parseInt(entry.dataset.idx, 10);
            this._handleEntryClick(idx);
        });

        // Space bar click for disk view exit (only active in disk view)
        this._spaceBar.addEventListener("click", () => {
            if (!this._isDiskView) return;
            this.render(this.cwd);
        });

        this._timer = setInterval(() => {
            if (this._runNextTick === true) {
                this._runNextTick = false;
                this.readFS(this.dirpath);
            }
        }, 1000);

        // Filesystem operations via the preload bridge
        this._asyncFs = {
            readdir: (dir) => window.edex.fs.readdir(dir),
            lstat: (filePath) => window.edex.fs.lstat(filePath),
        };

        this.setFailedState = () => {
            this.failed = true;
            container.innerHTML = `
            <h3 class="title"><p>FILESYSTEM</p><p id="fs_disp_title_dir">EXECUTION FAILED</p></h3>
            <h2 id="fs_disp_error">CANNOT ACCESS CURRENT WORKING DIRECTORY</h2>`;
        };

        this._attachCwdListener = (num) => {
            if (!window.term || !window.term[num]) return;
            window.term[num].oncwdchange = cwd => {
                if (this._noTracking) return false;

                if (cwd && cwd !== this.cwd_path && window.currentTerm === num) {
                    this.cwd_path = cwd;
                    if (this._fsWatcher) {
                        this._fsWatcher.close();
                    }
                    if (cwd.startsWith("FALLBACK |-- ")) {
                        this.readFS(cwd.slice(13));
                        this._noTracking = true;
                    } else {
                        this.readFS(cwd);
                        this.watchFS(cwd);
                    }
                }
            };
        };

        this.followTab = () => {
            if (this._noTracking) return false;
            let num = window.currentTerm;
            this._attachCwdListener(num);
        };
        this.followTab();

        // Subscribe to active terminal changes via store
        if (this._store) {
            this._unsubs.push(this._store.on('activeTerminal', () => {
                this.followTab();
            }));
        }

        this.watchFS = dir => {
            if (this._fsWatcher) {
                this._fsWatcher.close();
            }
            this._fsWatcher = window.edex.fs.watch(dir, (eventType, filename) => {
                if (eventType != "change") {
                    this._runNextTick = true;
                }
            });
        };

        this.toggleHidedotfiles = () => {
            if (window.settings.hideDotfiles) {
                container.classList.remove("hideDotfiles");
                window.settings.hideDotfiles = false;
            } else {
                container.classList.add("hideDotfiles");
                window.settings.hideDotfiles = true;
            }
        };

        this.toggleListview = () => {
            if (window.settings.fsListView) {
                container.classList.remove("list-view");
                window.settings.fsListView = false;
            } else {
                container.classList.add("list-view");
                window.settings.fsListView = true;
            }
        };

        this.readFS = async dir => {
            if (this.failed === true || this._reading) return false;
            this._reading = true;

            this._titleDir.textContent = this.dirpath;
            this.filesContainer.className = "";
            this.filesContainer.textContent = "";
            if (this._noTracking) {
                this._titleLabel.textContent = "FILESYSTEM - TRACKING FAILED, RUNNING DETACHED FROM TTY";
            }

            if (window.edex.platform === "win32" && dir.endsWith(":")) dir = dir+"\\";
            let tcwd = dir;
            let content = await this._asyncFs.readdir(tcwd).catch(err => {
                console.warn(err);
                if (this._noTracking === true && this.dirpath) {
                    this.setFailedState();
                    setTimeout(() => {
                        this.readFS(this.dirpath);
                    }, 1000);
                } else {
                    this.setFailedState();
                }
            });

            this.reCalculateDiskUsage(tcwd);

            this.cwd = [];

            await new Promise((resolve, reject) => {
                if (content.length === 0) resolve();

                content.forEach(async (file, i) => {
                    let fstat = await this._asyncFs.lstat(window.edex.path.join(tcwd, file)).catch(e => {
                        if (!e.message.includes("EPERM") && !e.message.includes("EBUSY")) {
                            reject();
                        }
                    });

                    let e = {
                        name: window._escapeHtml(file),
                        path: window.edex.path.resolve(tcwd, file),
                        type: "other",
                        category: "other",
                        hidden: false
                    };

                    if (typeof fstat !== "undefined") {
                        e.lastAccessed = fstat.mtime;

                        if (fstat.isDirectory) {
                            e.category = "dir";
                            e.type = "dir";
                        }
                        if (e.category === "dir" && tcwd === settingsDir && file === "themes") e.type="edex-themesDir";
                        if (e.category === "dir" && tcwd === settingsDir && file === "keyboards") e.type = "edex-kblayoutsDir";

                        if (fstat.isSymbolicLink) {
                            e.category = "symlink";
                            e.type = "symlink";
                        }

                        if (fstat.isFile) {
                            e.category = "file";
                            e.type = "file";
                            e.size = fstat.size;
                        }
                    } else {
                        e.type = "system";
                        e.hidden = true;
                    }

                    if (e.category === "file" && tcwd === themesDir && file.endsWith(".json")) e.type = "edex-theme";
                    if (e.category === "file" && tcwd === keyboardsDir && file.endsWith(".json")) e.type = "edex-kblayout";
                    if (e.category === "file" && tcwd === settingsDir && file === "settings.json") e.type = "edex-settings";
                    if (e.category === "file" && tcwd === settingsDir && file === "shortcuts.json") e.type = "edex-shortcuts";

                    if (file.startsWith(".")) e.hidden = true;

                    this.cwd.push(e);
                    if (i === content.length-1) resolve();
                });
            }).catch(() => { this.setFailedState(); });

            if (this.failed) return false;

            let ordering = {
                dir: 0,
                symlink: 1,
                file: 2,
                other: 3
            };

            this.cwd.sort((a, b) => {
                return (ordering[a.category] - ordering[b.category] || a.name.localeCompare(b.name));
            });

            this.cwd.splice(0, 0, {
                name: "Show disks",
                type: "showDisks"
            });

            if (tcwd !== "/" && /^[A-Z]:\\$/i.test(tcwd) === false) {
                this.cwd.splice(1, 0, {
                    name: "Go up",
                    type: "up"
                });
            }

            this.dirpath = tcwd;
            this.render(this.cwd);
            this._reading = false;
        };

        this.readDevices = async () => {
            if (this.failed === true) return false;

            let blocks = await window.si.blockDevices();
            let devices = [];
            for (const block of blocks) {
                if (await window.edex.fs.exists(block.mount)) {
                    let type = (block.type === "rom") ? "rom" : "disk";
                    if (block.removable && block.type !== "rom") {
                        type = "usb";
                    }

                    devices.push({
                        name: (block.label !== "") ? `${block.label} (${block.name})` : `${block.mount} (${block.name})`,
                        type,
                        path: block.mount
                    });
                }
            }

            this.render(devices, true);
        };

        this.render = async (originBlockList, isDiskView) => {
            let blockList = JSON.parse(JSON.stringify(originBlockList));

            if (this.failed === true) return false;

            this._isDiskView = !!isDiskView;
            // Store the current render data for event delegation click handler
            this._renderData = blockList;
            if (isDiskView) {
                this._titleDir.textContent = "Showing available block devices";
                this.filesContainer.className = "disks";
            } else {
                this._titleDir.textContent = this.dirpath;
                this.filesContainer.className = "";
            }
            if (this._noTracking) {
                this._titleLabel.textContent = "FILESYSTEM - TRACKING FAILED, RUNNING DETACHED FROM TTY";
            }

            // Build DOM via DocumentFragment (no innerHTML)
            const frag = document.createDocumentFragment();
            const settings = this._store ? this._store.get('settings') : window.settings;

            blockList.forEach((e, blockIndex) => {
                // Resolve icon and display type
                let icon = "";
                let type = "";
                switch(e.type) {
                    case "showDisks":
                        icon = this.icons.showDisks;
                        type = "--";
                        e.category = "showDisks";
                        break;
                    case "up":
                        icon = this.icons.up;
                        type = "--";
                        e.category = "up";
                        break;
                    case "symlink":
                        icon = this.icons.symlink;
                        break;
                    case "disk":
                        icon = this.icons.disk;
                        break;
                    case "rom":
                        icon = this.icons.rom;
                        break;
                    case "usb":
                        icon = this.icons.usb;
                        break;
                    case "edex-theme":
                        icon = this.edexIcons.theme;
                        type = "eDEX-UI theme";
                        break;
                    case "edex-kblayout":
                        icon = this.edexIcons.kblayout;
                        type = "eDEX-UI keyboard layout";
                        break;
                    case "edex-settings":
                    case "edex-shortcuts":
                        icon = this.edexIcons.settings;
                        type = "eDEX-UI config file";
                        break;
                    case "system":
                        icon = this.edexIcons.settings;
                        break;
                    case "edex-themesDir":
                        icon = this.edexIcons.themesDir;
                        type = "eDEX-UI themes folder";
                        break;
                    case "edex-kblayoutsDir":
                        icon = this.edexIcons.kblayoutsDir;
                        type = "eDEX-UI keyboards folder";
                        break;
                    default:
                        let iconName = this.fileIconsMatcher(e.name);
                        icon = this.icons[iconName];
                        if (typeof icon === "undefined") {
                            if (e.type === "file") icon = this.icons.file;
                            if (e.type === "dir") {
                                icon = this.icons.dir;
                                type = "folder";
                            }
                            if (typeof icon === "undefined") icon = this.icons.other;
                        } else if (e.category !== "dir") {
                            type = iconName.replace("icon-", "");
                        } else {
                            type = "special folder";
                        }
                        break;
                }

                if (type === "") type = e.type;
                e.type = type;

                if (e.type === 'video' || e.type === 'audio' || e.type === 'image') {
                    this.cwd[blockIndex].type = e.type;
                }

                if (typeof e.size === "number") {
                    e.size = this._formatBytes(e.size);
                } else {
                    e.size = "--";
                }
                if (typeof e.lastAccessed === "number") {
                    e.lastAccessed = new Date(e.lastAccessed).toLocaleString();
                } else {
                    e.lastAccessed = "--";
                }

                // Create DOM node instead of HTML string
                const div = document.createElement("div");
                div.className = `fs_disp_${e.type}${e.hidden ? " hidden" : ""}`;
                div.dataset.idx = blockIndex;

                // Use CSS animation-delay for stagger instead of JS loop
                const isVisible = !settings.hideDotfiles || !e.hidden;
                if (isVisible) {
                    div.style.animationDelay = `${blockIndex * 30}ms`;
                }

                // SVG icon (must use innerHTML for SVG content)
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", `0 0 ${icon.width} ${icon.height}`);
                svg.setAttribute("fill", this.iconcolor);
                svg.innerHTML = icon.svg;
                div.appendChild(svg);

                const h3 = document.createElement("h3");
                h3.textContent = e.name;
                div.appendChild(h3);

                const h4type = document.createElement("h4");
                h4type.textContent = type;
                div.appendChild(h4type);

                const h4size = document.createElement("h4");
                h4size.textContent = e.size;
                div.appendChild(h4size);

                const h4date = document.createElement("h4");
                h4date.textContent = e.lastAccessed;
                div.appendChild(h4date);

                frag.appendChild(div);
            });

            // Single DOM write: clear and insert fragment
            this.filesContainer.textContent = "";
            this.filesContainer.appendChild(frag);

            // Play stagger sound effect
            const cb = this._callbacks;
            const playSound = cb.playFolderSound || (() => window.audioManager.folder.play());
            let visibleCount = 0;
            for (let i = 0; i < this.filesContainer.children.length; i++) {
                const child = this.filesContainer.children[i];
                if (!settings.hideDotfiles || !child.classList.contains("hidden")) {
                    visibleCount++;
                }
            }
            // Play sound effects with stagger (non-blocking)
            if (visibleCount > 0) {
                let played = 0;
                const playNext = () => {
                    if (played < visibleCount) {
                        playSound();
                        played++;
                        setTimeout(playNext, 30);
                    }
                };
                playNext();
            }
        };

        this.reCalculateDiskUsage = async diskPath => {
            this.fsBlock = null;
            this.space_bar.text.innerHTML = "Calculating available space...";
            this.space_bar.bar.removeAttribute("value");

            // Use store data if available, else fetch directly
            const cachedFsSize = this._store ? this._store.get('systemData.fsSize') : null;
            if (cachedFsSize) {
                cachedFsSize.forEach(fsBlock => {
                    if (diskPath.startsWith(fsBlock.mount)) {
                        this.fsBlock = fsBlock;
                    }
                });
                this.renderDiskUsage(this.fsBlock);
            } else {
                window.si.fsSize().catch(() => {
                    this.space_bar.text.innerHTML = "Could not calculate mountpoint usage.";
                    this.space_bar.bar.value = 100;
                }).then(d => {
                    d.forEach(fsBlock => {
                        if (diskPath.startsWith(fsBlock.mount)) {
                            this.fsBlock = fsBlock;
                        }
                    });
                    this.renderDiskUsage(this.fsBlock);
                });
            }
        };

        this.renderDiskUsage = async fsBlock => {
            if (!this._spaceBar || this._isDiskView || fsBlock === null) return;

            let splitter = (window.edex.platform === "win32") ? "\\" : "/";
            let displayMount = (fsBlock.mount.length < 18) ? fsBlock.mount : "..."+splitter+fsBlock.mount.split(splitter).pop();

            if (!isNaN(fsBlock.use)) {
                this.space_bar.text.innerHTML = `Mount <strong>${displayMount}</strong> used <strong>${Math.round(fsBlock.use)}%</strong>`;
                this.space_bar.bar.value = Math.round(fsBlock.use);
            } else if (!isNaN((fsBlock.size / fsBlock.used) * 100)) {
                let usage = Math.round((fsBlock.size / fsBlock.used) * 100);

                this.space_bar.text.innerHTML = `Mount <strong>${displayMount}</strong> used <strong>${usage}%</strong>`;
                this.space_bar.bar.value = usage;
            } else {
                this.space_bar.text.innerHTML = "Could not calculate mountpoint usage.";
                this.space_bar.bar.value = 100;
            }
        };

        if (window.performance.navigation.type === 0) {
            this.readFS(window.term[window.currentTerm].cwd || window.settings.cwd);
        }

        this.openFile = (name, filePath, type) => {
            let block;

            if (typeof name === "number") {
                block = this.cwd[name];
                name = block.name;
            }

            block.path = block.path.replace(/\\/g, "/");

            let filetype = mime.lookup(name.split(".")[name.split(".").length - 1]);
            switch (filetype) {
                case "application/pdf":
                    let html = `<div>
                        <div class="pdf_options">
                            <button class="zoom_in">
                                <svg viewBox="0 0 ${this.icons["zoom-in"].width} ${this.icons["zoom-in"].height}" fill="${this.iconcolor}">
                                    ${this.icons["zoom-in"].svg}
                                </svg>
                            </button>
                            <button class="zoom_out">
                                <svg viewBox="0 0 ${this.icons["zoom-out"].width} ${this.icons["zoom-out"].height}" fill="${this.iconcolor}">
                                    ${this.icons["zoom-out"].svg}
                                </svg>
                            </button>
                            <button class="previous_page">
                                <svg viewBox="0 0 ${this.icons["backwards"].width} ${this.icons["backwards"].height}" fill="${this.iconcolor}">
                                    ${this.icons["backwards"].svg}
                                </svg>
                            </button>
                            <span>Page: <span class="page_num"/></span><span>/</span> <span class="page_count"></span></span>
                            <button class="next_page">
                                <svg viewBox="0 0 ${this.icons["forwards"].width} ${this.icons["forwards"].height}" fill="${this.iconcolor}">
                                    ${this.icons["forwards"].svg}
                                </svg>
                            </button>
                        </div>
                        <div class="pdf_container fsDisp_mediaDisp">
                            <canvas class="pdf_canvas" />
                        </div>
                    </div>`;
                    const newModal = new Modal(
                        {
                            type: "custom",
                            title: window._escapeHtml(name),
                            html: html
                        }
                    );
                    new DocReader(
                        {
                            modalId: newModal.id,
                            path: block.path
                        }
                    );
                    break;
                default:
                    if (mime.charset(filetype) === "UTF-8") {
                        window.edex.fs.readFile(block.path, 'utf-8').then(data => {
                            window.keyboard.detach();
                            new Modal(
                                {
                                    type: "custom",
                                    title: window._escapeHtml(name),
                                    html: `<textarea id="fileEdit" rows="40" cols="150" spellcheck="false">${data}</textarea><p id="fedit-status"></p>`,
                                    buttons: [
                                        {label:"Save to Disk",action:`window.writeFile('${block.path}')`}
                                    ]
                                }, () => {
                                    window.keyboard.attach();
                                    window.term[window.currentTerm].term.focus();
                                }
                            );
                        }).catch(err => {
                            new Modal({
                                type: "info",
                                title: "Failed to load file: " + block.path,
                                html: String(err)
                            });
                            console.log(err);
                        });
                   break;
                }
            }
        };

        this.openMedia = (name, mediaPath, type) => {
            let block, html;

            if (typeof name === "number") {
                block = this.cwd[name];
                name = block.name;
            }

            block.path = block.path.replace(/\\/g, "/");

            switch (type || block.type) {
                case "image":
                    html = `<img class="fsDisp_mediaDisp" src="${window._encodePathURI(mediaPath || block.path)}" ondragstart="return false;">`;
                    break;
                case "audio":
                    html = `<div>
                                <div class="media_container" data-fullscreen="false">
                                    <audio class="media fsDisp_mediaDisp" preload="auto">
                                        <source src="${window._encodePathURI(mediaPath || block.path)}">
                                        Unsupported audio format!
                                    </audio>
                                    <div class="media_controls" data-state="hidden">
                                        <div class="playpause media_button" data-state="play">
                                            <svg viewBox="0 0 ${this.icons["play"].width} ${this.icons["play"].height}" fill="${this.iconcolor}">
                                                ${this.icons["play"].svg}
                                            </svg>
                                        </div>
                                        <div class="progress_container">
                                            <div class="progress">
                                                <span class="progress_bar"></span>
                                            </div>
                                        </div>
                                        <div class="media_time">00:00:00</div>
                                        <div class="volume_icon">
                                            <svg viewBox="0 0 ${this.icons["volume"].width} ${this.icons["volume"].height}" fill="${this.iconcolor}">
                                                ${this.icons["volume"].svg}
                                            </svg>
                                        </div>
                                        <div class="volume">
                                            <div class="volume_bkg"></div>
                                            <div class="volume_bar"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                    break;
                case "video":
                    html = `<div>
                                <div class="media_container" data-fullscreen="false">
                                    <video class="media fsDisp_mediaDisp" preload="auto">
                                        <source src="${window._encodePathURI(mediaPath || block.path)}">
                                        Unsupported video format!
                                    </video>
                                    <div class="media_controls" data-state="hidden">
                                        <div class="playpause media_button" data-state="play">
                                            <svg viewBox="0 0 ${this.icons["play"].width} ${this.icons["play"].height}" fill="${this.iconcolor}">
                                                ${this.icons["play"].svg}
                                            </svg>
                                        </div>
                                        <div class="progress_container">
                                            <div class="progress">
                                                <span class="progress_bar"></span>
                                            </div>
                                        </div>
                                        <div class="media_time">00:00:00</div>
                                        <div class="volume_icon">
                                            <svg viewBox="0 0 ${this.icons["volume"].width} ${this.icons["volume"].height}" fill="${this.iconcolor}">
                                                ${this.icons["volume"].svg}
                                            </svg>
                                        </div>
                                        <div class="volume">
                                            <div class="volume_bkg"></div>
                                            <div class="volume_bar"></div>
                                        </div>
                                        <div class="fs media_button" data-state="go-fullscreen">
                                            <svg viewBox="0 0 ${this.icons["fullscreen"].width} ${this.icons["fullscreen"].height}" fill="${this.iconcolor}">
                                                ${this.icons["fullscreen"].svg}
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                    break;
                default:
                    throw new Error("fsDisp media displayer: unknown type " + (type || block.type));
            }

            const newModal = new Modal({
                type: "custom",
                title: window._escapeHtml(name),
                html
            });
            if (block.type === "audio" || block.type === "video") {
                new MediaPlayer({
                    modalId: newModal.id,
                    path: block.path,
                    type: block.type
                });
            }
        };
    }
    _handleEntryClick(idx) {
        // Use renderData for disk view, cwd for file view
        const entry = this._isDiskView ? (this._renderData && this._renderData[idx]) : this.cwd[idx];
        if (!entry) return;

        const cb = this._callbacks;
        const getActiveTerm = cb.getActiveTerm || (() => window.term[window.currentTerm]);
        const getKeyboardDataset = cb.getKeyboardDataset || (() => window.keyboard.container.dataset);

        const kbData = getKeyboardDataset();
        const origType = entry.type;

        // Check modifier keys (Ctrl/Shift on the on-screen keyboard)
        const hasModifier = origType !== "showDisks" && origType !== "up"
            && origType !== "edex-theme" && origType !== "edex-kblayout"
            && origType !== "edex-settings" && origType !== "edex-shortcuts";

        if (hasModifier && kbData.isCtrlOn === "true") {
            window.edex.shell.openPath(entry.path);
            window.edex.window.minimize();
            return;
        }
        if (hasModifier && kbData.isShiftOn === "true") {
            getActiveTerm().write('"' + entry.path + '"');
            return;
        }

        // Determine original entry type (before render() may have changed it to display type)
        const cat = entry.category;
        const eType = entry.type;

        // Handle special edex types
        if (eType === "edex-theme" || eType === "eDEX-UI theme") {
            const name = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name;
            (cb.themeChanger || window.themeChanger)(name);
            return;
        }
        if (eType === "edex-kblayout" || eType === "eDEX-UI keyboard layout") {
            const name = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name;
            (cb.remakeKeyboard || window.remakeKeyboard)(name);
            return;
        }
        if (eType === "edex-settings" || eType === "eDEX-UI config file") {
            if (entry.name === "settings.json") {
                (cb.openSettings || window.openSettings)();
            } else {
                (cb.openShortcutsHelp || window.openShortcutsHelp)();
            }
            return;
        }
        if (eType === "edex-shortcuts") {
            (cb.openShortcutsHelp || window.openShortcutsHelp)();
            return;
        }
        if (eType === "showDisks" || cat === "showDisks") {
            this.readDevices();
            return;
        }
        if (eType === "video" || eType === "audio" || eType === "image") {
            this.openMedia(idx);
            return;
        }
        if (eType === "system") {
            return;
        }

        // Navigation entries
        if (cat === "up" || eType === "up" || eType === "--") {
            if (entry.name === "Go up") {
                if (!this._noTracking) {
                    getActiveTerm().writelr('cd ..');
                } else {
                    this.readFS(window.edex.path.resolve(this.dirpath, ".."));
                }
                return;
            }
        }

        // Directory navigation
        if (cat === "dir" || eType === "folder" || eType === "special folder"
            || eType === "eDEX-UI themes folder" || eType === "eDEX-UI keyboards folder") {
            if (!this._noTracking) {
                getActiveTerm().writelr('cd "' + entry.name + '"');
            } else {
                this.readFS(entry.path);
            }
            return;
        }

        // Disk/device navigation
        if (eType === "disk" || eType === "rom" || eType === "usb") {
            if (!this._noTracking) {
                if (window.edex.platform === "win32") {
                    getActiveTerm().writelr(entry.path.replace(/\\/g, ''));
                } else {
                    getActiveTerm().writelr('cd "' + entry.path.replace(/\\/g, '') + '"');
                }
            } else {
                this.readFS(entry.path.replace(/\\/g, ''));
            }
            return;
        }

        // File types
        if (cat === "file") {
            this.openFile(idx);
            return;
        }

        // Default: write path to terminal
        getActiveTerm().write('"' + entry.path + '"');
    }

    destroy() {
        if (this._timer) clearInterval(this._timer);
        if (this._fsWatcher) this._fsWatcher.close();
        this._unsubs.forEach(fn => fn());
    }
}

export { FilesystemDisplay };
