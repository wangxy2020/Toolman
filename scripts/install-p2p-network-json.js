#!/usr/bin/env node
const fs = require('node:fs');

const [templatePath, destPath, turnUrl, turnUser, turnCred] = process.argv.slice(2);

if (!templatePath || !destPath || !turnUrl || !turnUser || !turnCred) {
  console.error('usage: install-p2p-network-json.js <template> <dest> <turnUrl> <user> <cred>');
  process.exit(1);
}

const raw = fs.readFileSync(templatePath, 'utf8');
const config = JSON.parse(raw);
const turnUrls = turnUrl.includes(',')
  ? turnUrl.split(',').map((item) => item.trim())
  : [turnUrl.trim()];

const isTurnUrl = (url) => /^turn:/i.test(url) || /^turns:/i.test(url);
const isStunUrl = (url) => /^stun:/i.test(url) || /^stuns:/i.test(url);

const existing = config.iceServers ?? [];
const nonTurn = existing.filter((server) => {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return !urls.some(isTurnUrl);
});

config.iceServers = [
  ...(nonTurn.length > 0 ? nonTurn : [{ urls: 'stun:stun.l.google.com:19302' }]),
  { urls: turnUrls, username: turnUser, credential: turnCred },
];

config.stunServers = config.iceServers
  .flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]))
  .filter(isStunUrl);

fs.mkdirSync(require('node:path').dirname(destPath), { recursive: true });
fs.writeFileSync(destPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log('Wrote', destPath);
console.log('iceServers:', config.iceServers.length, '(STUN + TURN with credentials)');
