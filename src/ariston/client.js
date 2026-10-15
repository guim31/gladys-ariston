// -----------------------------------------------------------------------------
// Client of the Ariston NET cloud (remotethermo), the API of the Ariston NET
// and Chaffoteaux apps. Undocumented: the endpoints and payloads follow the
// `ariston` Python library by fustom (MIT), used by the Home Assistant
// integration, and its maintenance fork by mauropriori.
//
// What the cloud taught those projects, applied here:
//   - since May 2024 it answers 429 "Requests are blocked for N seconds" to a
//     client that asks too often: every request goes through ONE queue, one
//     second apart at least, and a 429 pauses the whole account until the
//     block ends (no retry storm, no request while blocked);
//   - an expired token is answered with HTTP 405: log in again, once;
//   - a 5xx is not retried at once (it only adds load); the next poll will;
//   - a 404 means "nothing here" (a gateway without that report).
//
// The token is kept under /data (tokenStore) so a restart does not log in
// again: fewer logins, fewer chances to be blocked. Never logged, nor the
// password; the paths logged in debug carry the gateway id only.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'ariston-cloud' });

export const API_URL = 'https://www.ariston-net.remotethermo.com/api/v2/';
// The user agent of the official app, as the reference library sends it: the
// cloud has been seen to treat unknown clients more harshly.
export const USER_AGENT = 'RestSharp/106.11.7.0';

const BLOCKED_RE = /blocked for (\d+) seconds/i;
const DEFAULT_BLOCK_SECONDS = 60;
const BLOCK_MARGIN_SECONDS = 2;

/** Why a request failed, for the caller to choose what to say. */
export const ERROR_KIND = {
  AUTH: 'auth', // credentials refused
  RATE_LIMIT: 'rate_limit', // 429, the account is blocked for a while
  NETWORK: 'network', // no answer (DNS, timeout, connection refused)
  HTTP: 'http', // any other refusal (5xx...)
};

export class AristonError extends Error {
  /**
   * @param {string} kind one of ERROR_KIND
   * @param {string} message
   * @param {{ status?: number, retryAfterSeconds?: number }} [details]
   */
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'AristonError';
    this.kind = kind;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

/** Seconds a 429 asks to wait: Retry-After, else the body's "blocked for N seconds". */
export function parseBlockSeconds(retryAfter, body) {
  const header = Number(retryAfter);
  if (retryAfter !== null && retryAfter !== undefined && Number.isFinite(header) && header >= 0) {
    return Math.ceil(header);
  }
  const match = BLOCKED_RE.exec(typeof body === 'string' ? body : '');
  return match ? Number(match[1]) : DEFAULT_BLOCK_SECONDS;
}

/** Which account a stored token belongs to, without storing the username itself. */
export function accountKey(username) {
  return createHash('sha256').update(username.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export class AristonClient {
  /**
   * @param {object} options
   * @param {string} options.username
   * @param {string} options.password
   * @param {typeof fetch} [options.fetch]
   * @param {{ load(): Promise<object>, save(data: object): Promise<void> }} [options.tokenStore]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   * @param {number} [options.spacingMs] minimum gap between two requests
   * @param {number} [options.timeoutMs]
   * @param {string} [options.baseUrl]
   */
  constructor({
    username,
    password,
    fetch = globalThis.fetch,
    tokenStore = null,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    spacingMs = 1000,
    timeoutMs = 30000,
    baseUrl = API_URL,
  }) {
    this.username = username;
    this.password = password;
    this.fetch = fetch;
    this.tokenStore = tokenStore;
    this.now = now;
    this.sleep = sleep;
    this.spacingMs = spacingMs;
    this.timeoutMs = timeoutMs;
    this.baseUrl = baseUrl;
    this.account = accountKey(username);
    this.token = null;
    this.tokenLoaded = false;
    this.loggingIn = null;
    this.queue = Promise.resolve();
    this.lastRequestAt = -Infinity;
    this.blockedUntil = 0;
  }

  /** Seconds left before the cloud accepts requests again (0: not blocked). */
  blockedForSeconds() {
    return Math.max(0, Math.ceil((this.blockedUntil - this.now()) / 1000));
  }

  // --- Account ---------------------------------------------------------------

  /**
   * Logs in and keeps the token. Concurrent callers share one login.
   * @throws AristonError (AUTH on refused credentials)
   */
  login() {
    if (!this.loggingIn) {
      this.loggingIn = this.loginNow().finally(() => {
        this.loggingIn = null;
      });
    }
    return this.loggingIn;
  }

  async loginNow() {
    const answer = await this.send('POST', 'accounts/login', {
      body: { usr: this.username, pwd: this.password },
      auth: false,
    });
    if (!answer || typeof answer.token !== 'string' || answer.token === '') {
      throw new AristonError(ERROR_KIND.AUTH, 'Ariston NET refused the login');
    }
    this.token = answer.token;
    await this.tokenStore?.save({ account: this.account, token: this.token });
    return true;
  }

  /** Plants of the account: boilers and heat pumps (remote), water heaters (velis). */
  async listPlants() {
    const remote = await this.get('remote/plants');
    const velis = await this.get('velis/plants');
    return [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(velis) ? velis : [])];
  }

  // --- Boilers and heat pumps (Galevo system) -------------------------------

  /** What the plant has: zones, hot water, heat pump... */
  async getPlantFeatures(gw) {
    return (await this.get(`remote/plants/${encodeURIComponent(gw)}/features`)) ?? {};
  }

  /**
   * Reads the data items of a plant (plant properties, then each zone's).
   * @param {string} gw
   * @param {object} features from getPlantFeatures
   * @param {string[]} plantItems ids read on zone 0
   * @param {string[]} zoneItems ids read on every zone
   * @param {string} culture e.g. "fr-FR"
   */
  async getPlantData(gw, features, plantItems, zoneItems, culture = 'en-US') {
    const zones = (features.zones ?? []).map((zone) => zone.num);
    const items = [
      ...plantItems.map((id) => ({ id, zn: 0 })),
      ...zones.flatMap((zn) => zoneItems.map((id) => ({ id, zn }))),
    ];
    const answer = await this.post(`remote/dataItems/${encodeURIComponent(gw)}/get?umsys=si`, {
      useCache: false,
      items,
      features,
      culture,
    });
    return answer ?? { items: [] };
  }

  /** Writes one data item (a setpoint, a mode), the previous value along as the app does. */
  async setPlantItem(gw, features, { id, zone, value, prevValue }) {
    await this.post(`remote/dataItems/${encodeURIComponent(gw)}/set?umsys=si`, {
      items: [{ id, prevValue, value, zone }],
      features,
    });
  }

  /** Last month's consumption report, in kWh. */
  async getEnergyAccount(gw) {
    return (await this.get(`remote/reports/${encodeURIComponent(gw)}/energyAccount`)) ?? {};
  }

  /** Faults the appliance reports (all of them, blocking or not). */
  async getBusErrors(gw, culture = 'en-US') {
    const answer = await this.get(
      `busErrors?gatewayId=${encodeURIComponent(gw)}&blockingOnly=False&culture=${culture}`,
    );
    return Array.isArray(answer) ? answer : [];
  }

  // --- Water heaters (Velis system) -----------------------------------------

  /** State of a water heater; `plantData` depends on its family (medPlantData...). */
  async getWaterHeaterData(plantData, gw) {
    return (await this.get(`velis/${plantData}/${encodeURIComponent(gw)}`)) ?? {};
  }

  /** Settings of a water heater: the maximum setpoint lives there. */
  async getWaterHeaterSettings(plantData, gw) {
    return (await this.get(`velis/${plantData}/${encodeURIComponent(gw)}/plantSettings`)) ?? {};
  }

  /** POST velis/<plantData>/<gw>/<action> with the body the app sends. */
  async setWaterHeater(plantData, gw, action, body) {
    await this.post(`velis/${plantData}/${encodeURIComponent(gw)}/${action}`, body);
  }

  // --- Transport -------------------------------------------------------------

  get(path) {
    return this.authed('GET', path);
  }

  post(path, body) {
    return this.authed('POST', path, body);
  }

  async authed(method, path, body) {
    await this.ensureToken();
    try {
      return await this.send(method, path, { body });
    } catch (err) {
      if (err.kind !== ERROR_KIND.AUTH || !err.expired) {
        throw err;
      }
      // Expired token: log in again (unless a parallel request already
      // did), then retry once.
      if (!this.token || this.token === err.token) {
        logger.debug('Token expired, logging in again');
        await this.login();
      }
      return this.send(method, path, { body });
    }
  }

  /** A token for the next request: the stored one first, else a login (shared). */
  ensureToken() {
    if (this.token) {
      return Promise.resolve();
    }
    if (!this.tokenLoaded && this.tokenStore) {
      this.tokenLoaded = this.tokenStore
        .load()
        .catch(() => ({}))
        .then((stored) => {
          if (
            stored?.account === this.account &&
            typeof stored.token === 'string' &&
            stored.token
          ) {
            this.token = stored.token;
          }
        });
    }
    return Promise.resolve(this.tokenLoaded).then(() => (this.token ? undefined : this.login()));
  }

  /** One request through the queue. Resolves the JSON answer, or null. */
  send(method, path, { body, auth = true } = {}) {
    const run = this.queue.then(() => this.sendNow(method, path, body, auth));
    // The queue survives a failed request.
    this.queue = run.catch(() => {});
    return run;
  }

  async sendNow(method, path, body, auth) {
    const blocked = this.blockedForSeconds();
    if (blocked > 0) {
      throw new AristonError(
        ERROR_KIND.RATE_LIMIT,
        `Ariston NET blocks requests for ${blocked} more seconds`,
        { status: 429, retryAfterSeconds: blocked },
      );
    }
    const wait = this.lastRequestAt + this.spacingMs - this.now();
    if (wait > 0) {
      await this.sleep(wait);
    }
    const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const sentToken = auth ? this.token : null;
    if (sentToken) {
      headers['ar.authToken'] = sentToken;
    }
    logger.debug(`${method} ${path}`);
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new AristonError(
        ERROR_KIND.NETWORK,
        `Ariston NET unreachable (${err.cause?.code ?? err.name ?? 'error'})`,
      );
    } finally {
      this.lastRequestAt = this.now();
    }
    const text = await response.text().catch(() => '');
    if (response.status === 429) {
      const seconds = parseBlockSeconds(response.headers?.get?.('retry-after'), text);
      this.blockedUntil = this.now() + (seconds + BLOCK_MARGIN_SECONDS) * 1000;
      throw new AristonError(
        ERROR_KIND.RATE_LIMIT,
        `Ariston NET blocks requests for ${seconds} seconds`,
        { status: 429, retryAfterSeconds: seconds },
      );
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      if (!auth || [401, 403, 405].includes(response.status)) {
        // Login refused, or a token the cloud no longer accepts (405).
        const error = new AristonError(
          ERROR_KIND.AUTH,
          auth
            ? `Ariston NET refused the token (HTTP ${response.status})`
            : `Ariston NET refused the login (HTTP ${response.status})`,
          { status: response.status },
        );
        if (response.status >= 500) {
          error.kind = ERROR_KIND.HTTP;
        }
        error.expired = auth;
        error.token = sentToken;
        if (auth && this.token === sentToken) {
          this.token = null;
        }
        throw error;
      }
      throw new AristonError(ERROR_KIND.HTTP, `Ariston NET answered HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (text === '') {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new AristonError(ERROR_KIND.HTTP, 'Ariston NET answered something that is not JSON', {
        status: response.status,
      });
    }
  }
}
