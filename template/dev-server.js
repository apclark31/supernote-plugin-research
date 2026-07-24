/**
 * Dev log server - receives debug logs from a plugin running on the Supernote.
 *
 * Usage:  node dev-server.js
 *
 * Logs print to terminal and save to ./logs/ directory.
 * Both devices must be on the same wifi.
 * No dependencies - Node built-ins only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const LOG_DIR = path.join(__dirname, 'logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '0.0.0.0';
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `plugin-log-${timestamp}.txt`;
      fs.writeFileSync(path.join(LOG_DIR, filename), body);

      console.log('\n' + '='.repeat(60));
      console.log(`LOG  ${new Date().toLocaleTimeString()}  ->  logs/${filename}`);
      console.log('='.repeat(60));
      console.log(body);
      console.log('='.repeat(60) + '\n');

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true, file: filename}));
    });
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/ping')) {
    // /ping doubles as a discovery/identity endpoint: the device (or a future
    // subnet sweep) can confirm this is the plugin log server.
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, service: 'sn-plugin-dev-server', port: PORT}));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const ip = getLocalIP();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nSupernote plugin dev log server`);
  console.log(`Listening on http://${ip}:${PORT}`);
  console.log(`\nPoint the plugin's debug log URL at:`);
  console.log(`  http://${ip}:${PORT}/log`);
  console.log(`(see the plugin's settings or config for where the URL lives)`);
  console.log(`\nWaiting for logs...\n`);
});
