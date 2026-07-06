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
import {log} from './debug';

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
  defaultScreen: 'task-home',
  debugMode: false,
  markAsTextFontSize: 32,
  lassoGestureInput: 'finger', // 'off', 'finger', or 'pen-lasso'
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
 * Obfuscate a string value
 */
function obfuscate(value) {
  if (!value) return value;
  return OBF_PREFIX + xorEncode(value);
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

/**
 * Generate a template config file on first launch.
 * Only runs if no config file exists. The template contains a placeholder
 * token so the user can find and edit the file via USB.
 */
async function generateTemplate() {
  try {
    const exists = await RNFS.exists(CONFIG_FILE);
    if (exists) return false;

    const dirExists = await RNFS.exists(CONFIG_DIR);
    if (!dirExists) {
      await RNFS.mkdir(CONFIG_DIR);
      log('Config', 'Created config directory');
    }

    const template = {
      apiToken: PLACEHOLDER_TOKEN,
    };
    const json = JSON.stringify(template, null, 2);
    await RNFS.writeFile(CONFIG_FILE, json, 'utf8');
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
    const exists = await RNFS.exists(CONFIG_FILE);
    if (!exists) {
      log('Config', 'Config file not found');
      return null;
    }
    const json = await RNFS.readFile(CONFIG_FILE, 'utf8');
    const data = JSON.parse(json);
    if (data && typeof data === 'object') {
      // Check if any sensitive fields are plain text and need obfuscation
      const hasPlainText = SENSITIVE_KEYS.some(
        k => data[k] && isRealValue(data[k]) && !isObfuscated(data[k]),
      );

      if (hasPlainText) {
        log('Config', 'Found plain text sensitive fields, obfuscating...');
        const obfuscated = obfuscateConfig(data);
        const updatedJson = JSON.stringify(obfuscated, null, 2);
        await RNFS.writeFile(CONFIG_FILE, updatedJson, 'utf8');
        log('Config', 'Config file updated with obfuscated values');
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
async function saveToFile(config) {
  try {
    const dirExists = await RNFS.exists(CONFIG_DIR);
    if (!dirExists) {
      await RNFS.mkdir(CONFIG_DIR);
      log('Config', 'Created config directory');
    }

    const encoded = obfuscateConfig(config);
    const json = JSON.stringify(encoded, null, 2);
    await RNFS.writeFile(CONFIG_FILE, json, 'utf8');
    log('Config', `Saved to file (${json.length} chars, sensitive fields obfuscated)`);
    return true;
  } catch (e) {
    log('Config', `File write failed: ${e.message}`);
    return false;
  }
}

/**
 * Load config with priority: file > bundled > defaults.
 * On first launch, generates a template config file if none exists.
 */
export async function loadConfig() {
  if (_runtimeConfig) {
    return {...DEFAULT_CONFIG, ...bundledConfig, ..._runtimeConfig};
  }

  // First launch: generate template if no config file exists
  await generateTemplate();

  const fileConfig = await loadFromFile();
  if (fileConfig) {
    _configSource = 'file';
    _runtimeConfig = fileConfig;
    return {...DEFAULT_CONFIG, ...bundledConfig, ...fileConfig};
  }

  if (bundledConfig.apiToken) {
    _configSource = 'bundled';
  }
  return {...DEFAULT_CONFIG, ...bundledConfig};
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

  const merged = {...DEFAULT_CONFIG, ...bundledConfig, ..._runtimeConfig};
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
