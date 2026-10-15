// -----------------------------------------------------------------------------
// Small persistence under /data, the only writable path of the container:
//   - the Ariston NET token, so a restart does not log in again (the cloud
//     limits the requests of an account; a login is one more). Kept with a
//     hash of the account it belongs to, never with the username itself;
//   - the layout of each plant (which sensors it reported once), so a probe
//     missing from one reading does not change the device structure.
// Losing the file is harmless: the integration logs in and reads again.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'ariston-store' });
const FILE_NAME = 'ariston.json';

export class Store {
  constructor(directory = process.env.ARISTON_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.data = null;
    this.writing = Promise.resolve();
    // A read-only or full /data fails every write: said once.
    this.issues = createIssueLog(logger);
  }

  async load() {
    if (this.data) {
      return this.data;
    }
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      this.data = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      this.data = {};
    }
    return this.data;
  }

  async get(key) {
    return (await this.load())[key];
  }

  /** Sets one key and writes the file (atomic: temporary file + rename). */
  async set(key, value) {
    const data = await this.load();
    data[key] = value;
    const snapshot = JSON.stringify(data);
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        const temporary = `${this.path}.tmp`;
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await rename(temporary, this.path);
        this.issues.ok('write', `${this.path} written again`);
      } catch (err) {
        this.issues.fail('write', `Cannot write ${this.path}: ${err.message}`);
      }
    });
    return this.writing;
  }

  /** The token store the cloud client expects. */
  tokenStore() {
    return {
      load: async () => (await this.get('token')) ?? {},
      save: (token) => this.set('token', token),
    };
  }

  /** Resolves once every write requested so far is on disk. */
  flush() {
    return this.writing;
  }
}
