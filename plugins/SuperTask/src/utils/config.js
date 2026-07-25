/**
 * Config management with persistent storage
 *
 * Load priority:
 *   1. RNFS JSON file -- /storage/emulated/0/MyStyle/SuperTask/supertask-config.json
 *   2. Bundled config.local.js -- build-time injection (dev only)
 *   3. Defaults
 *
 * First launch: if no config file exists, a template is generated automatically
 * with placeholder values. The user can then connect via USB and edit the file.
 *
 * Obfuscation: XOR + base64. Obfuscated values start with "xor1:" prefix.
 * Plain text sensitive values are detected on load and obfuscated back to disk
 * automatically, so USB-edited configs are secured on next launch.
 *
 * The config file lives in shared storage (MyStyle/SuperTask/) and persists
 * across plugin reinstalls.
 */

import RNFS from 'react-native-fs';
import {log, setDebugServerUrl} from './debug';
import {setFontScale} from './fontScale';

// Push derived values into consumers that can't import config (cycle-free
// direction: config -> debug/fontScale). Keeps the debug server URL and the
// accessibility text scale runtime-editable.
function withDerived(merged) {
  setDebugServerUrl(merged.debugServerUrl);
  setFontScale(merged.fontScale || 1);
  return merged;
}

// Bundled config (build-time, gitignored)
let bundledConfig = {};
try {
  const localConfig = require('../../config.local');
  bundledConfig = localConfig.default || localConfig;
} catch {
  // No config.local.js -- normal in production
}

const DEFAULT_CONFIG = {
  apiToken: '',
  debugServerUrl: '',
  defaultProjectId: null,
  defaultPriority: 1,
  enabledProjectIds: [],
  defaultTab: 'today',
  postCreateAction: 'prompt',
  debugMode: false,
  markAsTextFontSize: 32,
  // 'off', 'finger', or 'pen-lasso'. Controls the quick-add lasso gesture only;
  // long press and three-finger double tap are always active. Default 'off':
  // hold-then-drag resembles a paused scroll, so it is opt-in (session 34).
  lassoGestureInput: 'off',
  // Bezel swipe (F-021): 2+ fingers up from the bottom edge opens task home.
  // Opt-in while it re-proves itself on-device (session 34).
  bezelSwipeEnabled: false,
  // Three-finger double tap opens task home ANYWHERE on the canvas -- no
  // geometric constraint, so palm activity can mimic it (B-028). Opt-in
  // since session 34; was always-on from session 31 until B-028.
  threeFingerTapEnabled: false,
  // Show completed tasks inline on the Today tab (footer toggle, F-030)
  showDoneTasks: false,
  // Accessibility text scale: 1 / 1.15 / 1.3 (F-031)
  fontScale: 1,
};

// Fields that get obfuscated on disk
const SENSITIVE_KEYS = ['apiToken', 'debugServerUrl'];

const CONFIG_DIR = '/storage/emulated/0/MyStyle/SuperTask';
const CONFIG_FILE = CONFIG_DIR + '/supertask-config.json';

// Obfuscation key -- embedded in Hermes bytecode, not trivially readable
const OBF_KEY = 'sntask_v1_8f3a2c9d7e1b';
const OBF_PREFIX = 'xor1:';

const PLACEHOLDER_TOKEN = 'YOUR_TOKEN_HERE';

// In-memory cache (always holds decoded values)
let _runtimeConfig = null;
let _configSource = 'defaults'; // 'file' | 'bundled' | 'defaults'
let _templateGenerated = false;

/**
 * Check if a string is an obfuscated value
 */
function isObfuscated(value) {
  return typeof value === 'string' && value.startsWith(OBF_PREFIX);
}

/**
 * XOR a string against the key, return base64-encoded result.
 */
function xorEncode(str) {
  const chars = [];
  for (let i = 0; i < str.length; i++) {
    chars.push(str.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  }
  return btoa(String.fromCharCode(...chars));
}

/**
 * Decode a base64+XOR obfuscated string
 */
function xorDecode(encoded) {
  const bytes = atob(encoded);
  const chars = [];
  for (let i = 0; i < bytes.length; i++) {
    chars.push(bytes.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  }
  return String.fromCharCode(...chars);
}

/**
 * Obfuscate a string value. If encoding throws (btoa fails on any XOR'd char
 * code > 255, e.g. a smart-quote pasted into the config via USB), keep the
 * plain value rather than losing it -- a throw here used to silently discard
 * the ENTIRE saved config including the API token (B-026).
 */
function obfuscate(value) {
  if (!value) return value;
  try {
    return OBF_PREFIX + xorEncode(value);
  } catch (e) {
    log('Config', `Obfuscation failed (non-ASCII value?), keeping plain text: ${e.message}`);
    return value;
  }
}

/**
 * Deobfuscate a string value. Returns original if not obfuscated.
 */
function deobfuscate(value) {
  if (!value || !isObfuscated(value)) return value;
  try {
    return xorDecode(value.slice(OBF_PREFIX.length));
  } catch {
    return value;
  }
}

/**
 * Deobfuscate sensitive fields in a config object (for loading)
 */
function deobfuscateConfig(config) {
  const result = {...config};
  for (const key of SENSITIVE_KEYS) {
    if (result[key]) {
      result[key] = deobfuscate(result[key]);
    }
  }
  return result;
}

/**
 * Obfuscate sensitive fields in a config object (for saving)
 */
function obfuscateConfig(config) {
  const result = {...config};
  for (const key of SENSITIVE_KEYS) {
    if (result[key] && !isObfuscated(result[key])) {
      result[key] = obfuscate(result[key]);
    }
  }
  return result;
}

const CONFIG_TMP = CONFIG_FILE + '.tmp';

/**
 * Write the config file atomically: full temp file first, then swap in.
 * A process kill mid-write can no longer truncate the config (B-025).
 */
async function writeConfigFile(obj) {
  const dirExists = await RNFS.exists(CONFIG_DIR);
  if (!dirExists) {
    await RNFS.mkdir(CONFIG_DIR);
    log('Config', 'Created config directory');
  }
  const json = JSON.stringify(obj, null, 2);
  await RNFS.writeFile(CONFIG_TMP, json, 'utf8');
  try {
    await RNFS.unlink(CONFIG_FILE);
  } catch {}
  await RNFS.moveFile(CONFIG_TMP, CONFIG_FILE);
  return json.length;
}

/**
 * Generate a template config file on first launch.
 * Only runs if no config file exists. The template contains a placeholder
 * token so the user can find and edit the file via USB.
 */
async function generateTemplate() {
  try {
    const exists = await RNFS.exists(CONFIG_FILE);
    if (exists) return false;

    await writeConfigFile({apiToken: PLACEHOLDER_TOKEN});
    _templateGenerated = true;
    log('Config', `Generated template config at ${CONFIG_FILE}`);
    return true;
  } catch (e) {
    log('Config', `Template generation failed: ${e.message}`);
    return false;
  }
}

/**
 * Check if a sensitive value is real (not empty, not a placeholder)
 */
function isRealValue(value) {
  return value && value !== PLACEHOLDER_TOKEN && !value.includes('YOUR_');
}

/**
 * Read config from JSON file on device.
 * If plain text sensitive fields are found, obfuscates them back to disk.
 */
async function loadFromFile() {
  try {
    let readPath = CONFIG_FILE;
    const exists = await RNFS.exists(CONFIG_FILE);
    if (!exists) {
      // Crash recovery: if we died between writing the temp file and the
      // rename, the temp file holds the last complete config.
      if (await RNFS.exists(CONFIG_TMP)) {
        log('Config', 'Main config missing, recovering from temp file');
        readPath = CONFIG_TMP;
      } else {
        log('Config', 'Config file not found');
        return null;
      }
    }
    const json = await RNFS.readFile(readPath, 'utf8');
    const data = JSON.parse(json);
    if (data && typeof data === 'object') {
      // Check if any sensitive fields are plain text and need obfuscation.
      // This rewrite is best-effort: a failure here must never abort the
      // load itself (it used to bubble to the outer catch and drop the
      // whole config -- B-026).
      try {
        const hasPlainText = SENSITIVE_KEYS.some(
          k => data[k] && isRealValue(data[k]) && !isObfuscated(data[k]),
        );

        if (hasPlainText) {
          log('Config', 'Found plain text sensitive fields, obfuscating...');
          const obfuscated = obfuscateConfig(data);
          await writeConfigFile(obfuscated);
          log('Config', 'Config file updated with obfuscated values');
        }
      } catch (e) {
        log('Config', `Obfuscation rewrite failed (non-fatal): ${e.message}`);
      }

      const decoded = deobfuscateConfig(data);

      // Treat placeholder as empty
      if (decoded.apiToken === PLACEHOLDER_TOKEN) {
        decoded.apiToken = '';
      }

      const hadObfuscated = SENSITIVE_KEYS.some(k => data[k] && isObfuscated(data[k]));
      log('Config', `Loaded from file (${Object.keys(data).length} keys, obfuscated=${hadObfuscated})`);
      return decoded;
    }
  } catch (e) {
    log('Config', `File read failed: ${e.message}`);
  }
  return null;
}

/**
 * Write config to JSON file on device (obfuscates sensitive fields)
 */
let _saveChain = Promise.resolve(); // Serializes writes so concurrent saves can't interleave (B-025)

function saveToFile(config) {
  const run = _saveChain.then(async () => {
    try {
      const encoded = obfuscateConfig(config);
      const length = await writeConfigFile(encoded);
      log('Config', `Saved to file (${length} chars, sensitive fields obfuscated)`);
      return true;
    } catch (e) {
      log('Config', `File write failed: ${e.message}`);
      return false;
    }
  });
  _saveChain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Load config with priority: file > bundled > defaults.
 * On first launch, generates a template config file if none exists.
 */
let _loadPromise = null; // Dedup: concurrent first loads share one file read (B-025)

export async function loadConfig() {
  if (_runtimeConfig) {
    return withDerived({...DEFAULT_CONFIG, ...bundledConfig, ..._runtimeConfig});
  }
  if (_loadPromise) {
    return _loadPromise;
  }

  _loadPromise = (async () => {
    try {
      // First launch: generate template if no config file exists
      await generateTemplate();

      const fileConfig = await loadFromFile();
      if (fileConfig) {
        _configSource = 'file';
        _runtimeConfig = fileConfig;
        return withDerived({...DEFAULT_CONFIG, ...bundledConfig, ...fileConfig});
      }

      if (bundledConfig.apiToken) {
        _configSource = 'bundled';
      }
      return withDerived({...DEFAULT_CONFIG, ...bundledConfig});
    } finally {
      _loadPromise = null;
    }
  })();
  return _loadPromise;
}

/**
 * Synchronous config snapshot from the in-memory cache, or null if no
 * loadConfig() has completed yet this session. Lets screens initialize
 * state to saved values on their FIRST render (no post-mount snap) --
 * on any warm open the cache is already populated. Callers must still
 * loadConfig() async as the cold-start fallback.
 */
export function getCachedConfig() {
  if (!_runtimeConfig) return null;
  return {...DEFAULT_CONFIG, ...bundledConfig, ..._runtimeConfig};
}

/**
 * Whether a template was just generated this session (first launch)
 */
export function wasTemplateGenerated() {
  return _templateGenerated;
}

/**
 * Save config to runtime memory + persistent file
 */
export async function saveConfig(config) {
  _runtimeConfig = {..._runtimeConfig, ...config};

  const merged = withDerived({...DEFAULT_CONFIG, ...bundledConfig, ..._runtimeConfig});
  const saved = await saveToFile(merged);
  if (saved) {
    _configSource = 'file';
  }
  return saved;
}

/**
 * Get where the current config was loaded from
 */
export function getConfigSource() {
  return _configSource;
}

/**
 * Force reload from disk (ignores runtime cache)
 */
export async function reloadConfig() {
  _runtimeConfig = null;
  _configSource = 'defaults';
  return loadConfig();
}
