// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data (the only writable
// place of the sandbox): the events of the last download, when it happened,
// and the ids already seen (so a restart does not announce them again).
// Public data only: nothing personal, no secret.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

const VERSION = 1;

/**
 * @param {string} [directory] defaults to DATA_DIR or /data
 */
export function createStore(directory = process.env.DATA_DIR || '/data') {
  const file = join(directory, 'state.json');
  let state = {};
  let warned = false;
  // Nothing is written before the file was read: a stop while Gladys is
  // still unreachable must not replace the saved state with an empty one.
  let loaded = false;
  // One write at a time: two would share the temporary file.
  let writing = Promise.resolve();

  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.version === VERSION) {
          state = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}, starting afresh (${err.code ?? err.name})`);
        }
      } finally {
        loaded = true;
      }
    },
    get(key) {
      return state[key];
    },
    set(key, value) {
      if (value === undefined) {
        delete state[key];
      } else {
        state[key] = value;
      }
    },
    save() {
      if (!loaded) {
        return Promise.resolve();
      }
      writing = writing.then(() => write());
      return writing;
    },
  };

  async function write() {
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify({ version: VERSION, data: state }));
      await rename(`${file}.tmp`, file);
      warned = false;
    } catch (err) {
      if (!warned) {
        warned = true;
        logger.warn(
          `Could not write ${file} (${err.code ?? err.name}): a restart will download everything again`,
        );
      }
    }
  }
}
