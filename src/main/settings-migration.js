/**
 * Settings Migration System
 *
 * Automatically upgrades settings.json from older schema versions to the current version.
 * Each migration function transforms the settings object from version N to N+1.
 *
 * When adding a new migration:
 * 1. Increment CURRENT_VERSION
 * 2. Add a migration function to the `migrations` map
 * 3. The migration receives the settings object and returns the updated object
 */

export const CURRENT_VERSION = 2;

/**
 * Migration functions: version N → N+1
 * Each function takes a settings object and returns the migrated settings.
 */
const migrations = {
    // v1 → v2: Add version field, scrollback setting, normalize boolean strings
    1: (settings) => {
        // Add configurable scrollback (was hardcoded 1500)
        if (settings.scrollback === undefined) {
            settings.scrollback = 10000;
        }

        // Normalize boolean-string values that may have been saved as strings
        const boolKeys = [
            'audio', 'nointro', 'nocursor', 'allowWindowed', 'keepGeometry',
            'excludeThreadsFromToplist', 'hideDotfiles', 'fsListView',
            'experimentalGlobeFeatures', 'experimentalFeatures', 'disableFeedbackAudio'
        ];
        for (const key of boolKeys) {
            if (settings[key] === 'true') settings[key] = true;
            if (settings[key] === 'false') settings[key] = false;
        }

        // Ensure numeric fields are numbers
        const numKeys = ['termFontSize', 'port', 'clockHours', 'monitor'];
        for (const key of numKeys) {
            if (typeof settings[key] === 'string') {
                settings[key] = Number(settings[key]);
            }
        }

        settings._version = 2;
        return settings;
    },
};

/**
 * Migrate settings from their current version to the latest version.
 * @param {object} settings - The settings object (may or may not have _version)
 * @returns {{ settings: object, migrated: boolean }} The migrated settings and whether any migration was applied
 */
export function migrateSettings(settings) {
    let version = settings._version || 1;
    let migrated = false;

    while (version < CURRENT_VERSION) {
        const migrateFn = migrations[version];
        if (!migrateFn) {
            console.warn(`No migration found for settings version ${version}`);
            break;
        }
        settings = migrateFn(settings);
        version = settings._version || version + 1;
        migrated = true;
    }

    // Ensure version is set
    if (!settings._version) {
        settings._version = CURRENT_VERSION;
        migrated = true;
    }

    return { settings, migrated };
}
