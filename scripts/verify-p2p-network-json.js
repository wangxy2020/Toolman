#!/usr/bin/env node
const fs = require('node:fs');

const path = process.argv[2];
if (!path) {
  console.error('usage: verify-p2p-network-json.js <network.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
const xirsys = raw.xirsys;
const hasXirsys =
  xirsys &&
  typeof xirsys.ident === 'string' &&
  xirsys.ident &&
  typeof xirsys.secret === 'string' &&
  xirsys.secret &&
  typeof xirsys.channel === 'string' &&
  xirsys.channel;

const servers = raw.iceServers ?? (raw.stunServers ?? []).map((urls) => ({ urls }));

let stun = 0;
let turn = 0;
let turnWithCreds = 0;

for (const server of servers) {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  const isTurn = urls.some((u) => /^turn:/i.test(u) || /^turns:/i.test(u));
  if (isTurn) {
    turn += 1;
    if (server.username && server.credential) turnWithCreds += 1;
  } else {
    stun += 1;
  }
}

console.log(`file: ${path}`);
if (hasXirsys) {
  console.log(`xirsys: channel=${xirsys.channel} ident=${xirsys.ident}`);
}
console.log(
  `iceServers: ${servers.length} (${stun} STUN, ${turn} TURN, ${turnWithCreds} TURN with credentials)`,
);

if (hasXirsys) {
  console.log('OK: Xirsys config present — app will fetch ephemeral ICE credentials at startup');
  process.exit(0);
}

if (turn === 0) {
  console.error('FAIL: no TURN server configured');
  process.exit(1);
}
if (turnWithCreds === 0) {
  console.error('FAIL: TURN missing username/credential');
  process.exit(1);
}
console.log('OK: WAN readiness config valid');
