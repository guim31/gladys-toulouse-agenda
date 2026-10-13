// -----------------------------------------------------------------------------
// Wiring between the Gladys SDK and the catalog: the handlers, the periodic
// download, the scene events. Takes the SDK client as a parameter so the tests
// drive it with the SDK's fake Gladys.
//
// A provider integration has no device: nothing here depends on onPoll. The
// download runs on the container's own timer, every few hours (the agenda
// changes a few times a day at most).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, refreshMs } from './config.js';
import { Catalog } from './catalog.js';
import { createStore } from './store.js';
import { ImageCache } from './images.js';
import { ProblemLog } from './problems.js';
import { truncate } from './text.js';
import { REPORT_TEXT, SOURCE_NAMES, allLanguages, pick } from './i18n.js';
import { SCENE_ACTION_KEYS, TRIGGERS, newEventData, outingsSummary } from './scenes.js';
import { OUTINGS_WIDGET, outingsContent } from './widgets.js';

const logger = createLogger({ name: 'app' });

export const ACTIONS = { REFRESH_NOW: 'refresh_now' };

/** After a failed download, try again sooner than the normal period. */
export const RETRY_MS = 15 * 60 * 1000;
/** "Refresh now" waits this long, then answers that the download goes on. */
const ACTION_WAIT_MS = 50_000;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps] test seams
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {ReturnType<typeof createStore>} [deps.store]
 * @param {Record<string, Function>} [deps.fetchers] the sources' download functions
 * @param {boolean} [deps.timers] false: no periodic download (tests)
 * @param {string} [deps.userAgent]
 * @param {number} [deps.actionWaitMs]
 */
export function registerHandlers(gladys, deps = {}) {
  const now = deps.now ?? Date.now;
  const store = deps.store ?? createStore();
  const useTimers = deps.timers !== false;
  const actionWaitMs = deps.actionWaitMs ?? ACTION_WAIT_MS;
  let config = normalizeConfig();
  let timer = null;
  let stopped = false;
  let loaded = null;
  let pending = Promise.resolve();
  const problems = new ProblemLog(logger);
  const announced = new WeakSet();

  const catalog = new Catalog({
    store,
    getConfig: () => config,
    now,
    fetchImpl: deps.fetchImpl,
    userAgent: deps.userAgent,
    fetchers: deps.fetchers,
  });
  const images = new ImageCache({ fetchImpl: deps.fetchImpl, userAgent: deps.userAgent });

  const refreshWidget = () => gladys.requestWidgetRefresh(OUTINGS_WIDGET);

  async function setStatus(ok) {
    try {
      if (ok) {
        await gladys.setConnectionStatus(true);
      } else {
        await gladys.setConnectionStatus(
          false,
          allLanguages((language) => pick(REPORT_TEXT, language).status),
        );
      }
    } catch (err) {
      logger.debug(`Could not report the connection status: ${err.message}`);
    }
  }

  async function announce(entries) {
    let failed = 0;
    for (const entry of entries) {
      try {
        await gladys.publishSceneEvent(
          TRIGGERS.NEW_EVENT,
          newEventData(entry, config.language, now()),
        );
      } catch (err) {
        // One refused event does not cost the others.
        failed += 1;
        problems.fail('announce', `Could not send a new event to the scenes: ${err.message}`);
      }
    }
    if (failed === 0) {
      problems.recover('announce', 'New events reach the scenes again');
    }
    if (entries.length > failed) {
      logger.info(
        `${entries.length - failed} new event(s) matching the watched words sent to the scenes`,
      );
    }
  }

  /**
   * One download: logs, scene events, status, widget. Resolves with the
   * report (or the error), never rejects.
   */
  async function download() {
    try {
      const report = await catalog.refresh();
      for (const source of Object.keys(SOURCE_NAMES)) {
        if (report.errors[source]) {
          problems.fail(source, `${SOURCE_NAMES[source]} unavailable: ${report.errors[source]}`);
        } else {
          problems.recover(source, `${SOURCE_NAMES[source]} reachable again`);
        }
      }
      problems.recover('download', 'Download works again');
      // Two callers (the timer and the action) can share one download:
      // its new events reach the scenes once.
      if (!announced.has(report)) {
        announced.add(report);
        await announce(report.announced);
      }
      await setStatus(true);
      refreshWidget();
      return { report };
    } catch (err) {
      problems.fail('download', `Download failed: ${err.message}`, 'error');
      await setStatus(false);
      refreshWidget();
      return { error: err };
    }
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (!useTimers || stopped) {
      return;
    }
    timer = setTimeout(
      () => {
        pending = download().then((result) => {
          schedule(result.error ? RETRY_MS : refreshMs(config));
          return result;
        });
      },
      Math.max(0, delay),
    );
    timer.unref?.();
  }

  /** Downloads now when the last download is too old, then plans the next one. */
  function resume() {
    const age = catalog.fetchedAt === null ? Infinity : now() - catalog.fetchedAt;
    if (age >= refreshMs(config)) {
      pending = download().then((result) => {
        schedule(result.error ? RETRY_MS : refreshMs(config));
        return result;
      });
    } else {
      schedule(refreshMs(config) - age);
    }
  }

  gladys.on('connected', async () => {
    loaded ??= store.load().then(() => catalog.load());
    await loaded;
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      // The SDK keeps the configuration it read when authenticating: better
      // than the defaults, which would forget the watched words and radius.
      logger.error(`Could not read the configuration: ${err.message}`);
      if (gladys.config && typeof gladys.config === 'object') {
        config = normalizeConfig(gladys.config);
      }
    }
    catalog.rebuild();
    if (catalog.ready) {
      await setStatus(true);
    }
    refreshWidget();
    resume();
  });

  gladys.on('disconnected', () => clearTimeout(timer));

  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('Configuration updated');
    if (previous.radius_km !== config.radius_km) {
      // A new area: download it now (its events are taken note of silently).
      clearTimeout(timer);
      pending = download().then((result) => {
        schedule(result.error ? RETRY_MS : refreshMs(config));
        return result;
      });
      return;
    }
    if (previous.excluded_words !== config.excluded_words) {
      catalog.rebuild();
      refreshWidget();
    }
    if (previous.refresh_hours !== config.refresh_hours) {
      clearTimeout(timer);
      resume();
    }
  });

  gladys.onAction(ACTIONS.REFRESH_NOW, async () => {
    let wait;
    const late = new Promise((resolve) => {
      wait = setTimeout(() => resolve(null), actionWaitMs);
    });
    const running = download();
    const result = await Promise.race([running, late]);
    clearTimeout(wait);
    if (result === null) {
      return allLanguages((language) => pick(REPORT_TEXT, language).started);
    }
    if (useTimers && !stopped) {
      schedule(result.error ? RETRY_MS : refreshMs(config));
    }
    return allLanguages((language) => reportText(result, language));
  });

  gladys.onSceneAction(SCENE_ACTION_KEYS.OUTINGS_SUMMARY, async (fields) =>
    outingsSummary({ catalog, language: config.language, now: now() }, fields),
  );

  gladys.onWidgetGet(OUTINGS_WIDGET, async ({ settings, language }) =>
    outingsContent(catalog, { settings, language, now: now() }),
  );

  gladys.onWidgetGetImage(async (key) => {
    const url = catalog.thumbnailFor(key);
    if (!url) {
      throw new Error('Unknown picture');
    }
    return images.get(url);
  });

  return {
    catalog,
    /** Resolves once the download in progress is over (tests). */
    idle: async () => {
      await pending;
      await catalog.running;
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await store.save();
    },
  };
}

/** The message under the "Refresh now" button. */
function reportText(result, language) {
  const text = pick(REPORT_TEXT, language);
  if (result.error) {
    return text.failed(result.error.message);
  }
  const { report } = result;
  const parts = [text.done(report.total)];
  for (const [source, error] of Object.entries(report.errors)) {
    parts.push(text.sourceFailed(SOURCE_NAMES[source], error));
  }
  const watched = Object.entries(report.watched);
  parts.push(
    watched.length === 0
      ? text.noWatched
      : text.watched(watched.map(([word, count]) => `${word} ${count}`).join(', ')),
  );
  return truncate(parts.join(' '), 400);
}
