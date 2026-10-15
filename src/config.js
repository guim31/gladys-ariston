// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with a number typed as a string.
// -----------------------------------------------------------------------------

/** The languages every user-facing text exists in (the Gladys interface's). */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * Refresh paces offered to the user, in minutes. Three minutes is the pace
 * the Home Assistant integration settled on after Ariston started answering
 * 429 "Requests are blocked for 66 seconds" (May 2024): no faster.
 */
export const REFRESH_CHOICES = ['3', '5', '10', '15', '30'];

// Defaults: they MUST stay equal to the `default` values of the manifest
// (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  language: 'fr',
  refresh_minutes: '5',
  faults: true,
  energy: false,
};

/**
 * Merge the user config with the defaults, with the right types.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language;
  const refresh = REFRESH_CHOICES.includes(String(raw.refresh_minutes))
    ? String(raw.refresh_minutes)
    : DEFAULT_CONFIG.refresh_minutes;
  return {
    username: typeof raw.username === 'string' ? raw.username.trim() : '',
    password: typeof raw.password === 'string' ? raw.password : '',
    language,
    refresh_minutes: refresh,
    faults: toBoolean(raw.faults, DEFAULT_CONFIG.faults),
    energy: toBoolean(raw.energy, DEFAULT_CONFIG.energy),
  };
}

/** True once the account is filled in. */
export function isConfigured(config) {
  return config.username !== '' && config.password !== '';
}

/** Milliseconds between two reads of the devices' states. */
export function refreshMs(config) {
  return Number(config.refresh_minutes) * 60 * 1000;
}

function toBoolean(value, fallback) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return fallback;
}
