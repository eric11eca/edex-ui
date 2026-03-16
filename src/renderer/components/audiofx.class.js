import { Howl, Howler } from 'howler';

class AudioManager {
    constructor() {
        let assetsPath = window.edex.app.getAssetsPath();
        // Use file:// URLs so Howler loads from disk, not via Vite HTTP server
        if (assetsPath.startsWith('/')) {
            assetsPath = 'file://' + assetsPath;
        } else {
            assetsPath = 'file:///' + assetsPath.replace(/\\/g, '/');
        }
        const audioDir = assetsPath + '/audio';
        const useHtml5Audio = !window.edex.app.isPackaged();
        const createHowl = (fileName, options = {}) => new Howl({
            src: [window.edex.path.join(audioDir, fileName)],
            html5: useHtml5Audio,
            ...options
        });

        if (window.settings.audio === true) {
            if(window.settings.disableFeedbackAudio === false) {
                this.stdout = createHowl("stdout.wav", { volume: 0.4 });
                this.stdin = createHowl("stdin.wav", { volume: 0.4 });
                this.folder = createHowl("folder.wav");
                this.granted = createHowl("granted.wav");
            }
            this.keyboard = createHowl("keyboard.wav");
            this.theme = createHowl("theme.wav");
            this.expand = createHowl("expand.wav");
            this.panels = createHowl("panels.wav");
            this.scan = createHowl("scan.wav");
            this.denied = createHowl("denied.wav");
            this.info = createHowl("info.wav");
            this.alarm = createHowl("alarm.wav");
            this.error = createHowl("error.wav");

            Howler.volume(window.settings.audioVolume);
        } else {
            Howler.volume(0.0);
        }

        // Return a proxy to avoid errors if sounds aren't loaded
        return new Proxy(this, {
            get: (target, sound) => {
                if (sound in target) {
                    return target[sound];
                } else {
                    return {
                        play: () => {return true;}
                    };
                }
            }
        });
    }
    destroy() {
        Howler.unload();
    }
}

export { AudioManager };
