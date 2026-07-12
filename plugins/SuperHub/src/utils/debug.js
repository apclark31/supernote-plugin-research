let debugServerUrl = null;
const logs = [];
let listener = null;

try {
  const config = require('../../config.local');
  debugServerUrl = (config.default || config).debugServerUrl;
} catch (e) {}

function addLog(tag, message) {
  const ts = new Date().toISOString().slice(11, 23);
  const entry = `[${ts}] ${tag}: ${message}`;
  logs.push(entry);
  if (listener) listener(logs);
}

function log(tag, message) {
  addLog(tag, typeof message === 'string' ? message : JSON.stringify(message));
}

function getLogs() {
  return logs;
}

function setListener(fn) {
  listener = fn;
}

async function uploadLogs() {
  if (!debugServerUrl) {
    addLog('debug', 'No debugServerUrl configured');
    return false;
  }
  try {
    const body = logs.join('\n');
    await fetch(debugServerUrl, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body,
    });
    addLog('debug', 'Logs uploaded');
    return true;
  } catch (e) {
    addLog('debug', `Upload failed: ${e.message}`);
    return false;
  }
}

module.exports = {log, getLogs, setListener, uploadLogs};
