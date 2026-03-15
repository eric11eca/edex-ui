import { Modal } from './modal.class.js';

class UpdateChecker {
    constructor() {
        let current = window.edex.app.getVersion();

        this._failed = false;
        this._willfail = false;
        this._fail = e => {
            this._failed = true;
            window.edex.log.send("note", "UpdateChecker: Could not fetch latest release from GitHub's API.");
            window.edex.log.send("debug", `Error: ${e}`);
        };

        window.edex.net.httpGet({
            protocol: "https:",
            host: "api.github.com",
            path: "/repos/GitSquared/edex-ui/releases/latest",
            headers: {
                "User-Agent": "eDEX-UI UpdateChecker"
            }
        }).then(res => {
            if (res.statusCode === 404) {
                this._fail("Got 404 (Not Found) response from server");
                return;
            }
            if (res.statusCode !== 200) {
                this._fail(res.body);
                return;
            }

            try {
                let release = JSON.parse(res.body);
                if (release.tag_name.slice(1) === current) {
                    window.edex.log.send("info", "UpdateChecker: Running latest version.");
                } else if (Number(release.tag_name.slice(1).replace(/\./g, "")) < Number(current.replace("-pre", "").replace(/\./g, ""))) {
                    window.edex.log.send("info", "UpdateChecker: Running an unreleased, development version.");
                } else {
                    new Modal({
                        type: "info",
                        title: "New version available",
                        message: `eDEX-UI <strong>${release.tag_name}</strong> is now available.<br/>Head over to <a href="#" onclick="window.edex.shell.openExternal('${release.html_url}')">github.com</a> to download the latest version.`
                    });
                    window.edex.log.send("info", `UpdateChecker: New version ${release.tag_name} available.`);
                }
            } catch(e) {
                this._fail(e);
            }
        }).catch(e => {
            this._fail(e);
        });
    }
    destroy() {
        // One-shot HTTP request; no persistent resources
    }
}

export { UpdateChecker };
