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

        if (window.settings.audio === true) {
            if(window.settings.disableFeedbackAudio === false) {
                this.stdout = new Howl({
                    src: [window.edex.path.join(audioDir,"stdout.wav")],
                    volume: 0.4
                });
                this.stdin = new Howl({
                    src: [window.edex.path.join(audioDir,"stdin.wav")],
                    volume: 0.4
                });
                this.folder = new Howl({
                    src: [window.edex.path.join(audioDir,"folder.wav")]
                });
                this.granted = new Howl({
                    src: [window.edex.path.join(audioDir,"granted.wav")]
                });
            }
            this.keyboard = new Howl({
                src: [window.edex.path.join(audioDir,"keyboard.wav")]
            });
            this.theme = new Howl({
                src: [window.edex.path.join(audioDir,"theme.wav")]
            });
            this.expand = new Howl({
                src: [window.edex.path.join(audioDir,"expand.wav")]
            });
            this.panels = new Howl({
                src: [window.edex.path.join(audioDir,"panels.wav")]
            });
            this.scan = new Howl({
                src: [window.edex.path.join(audioDir,"scan.wav")]
            });
            this.denied = new Howl({
                src: [window.edex.path.join(audioDir,"denied.wav")]
            });
            this.info = new Howl({
                src: [window.edex.path.join(audioDir,"info.wav")]
            });
            this.alarm = new Howl({
                src: [window.edex.path.join(audioDir,"alarm.wav")]
            });
            this.error = new Howl({
                src: [window.edex.path.join(audioDir,"error.wav")]
            });

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
