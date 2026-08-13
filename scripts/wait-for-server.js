#!/usr/bin/env node
const http = require('node:http');
const port = Number(process.env.SERVER_PORT || '3000');
const host = process.env.SERVER_HOST || '127.0.0.1';
const maxAttempts = 120;
let attempt = 0;

function check() {
  attempt += 1;
  const req = http.request({ host, port, timeout: 1000 }, (res) => {
    res.destroy();
    console.log('[wait-for-server] server is up');
    process.exit(0);
  });
  req.on('error', () => {
    if (attempt >= maxAttempts) {
      console.error('[wait-for-server] timeout waiting for server');
      process.exit(1);
    }
    setTimeout(check, 1000);
  });
  req.end();
}

check();
