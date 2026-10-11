// Project Zombie: one small server for Render. It serves the game from /public and relays the
// online layer (lobby, parties, matches, voice-chat signalling) over a WebSocket at /ws.
// No dependencies: `node server.js` is all it needs.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, ROOT = path.resolve(process.env.PZ_PUBLIC || path.join(__dirname, 'public'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok ' + clients.size); return; }
  const file = path.join(ROOT, path.normalize(p)); if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': /\.(html|js)$/.test(file) ? 'no-cache' : 'public, max-age=86400' }); res.end(data);
  });
});

// ----- rooms: every player keeps one small "presence" object per room; everyone else in the room is told when it changes -----
const clients = new Set(), rooms = new Map();          // room name -> Map(client -> presence)
const NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
function sendTo(c, obj) { if (!c.dead) frame(c.sock, JSON.stringify(obj)); }
function leave(c, name) { const r = rooms.get(name); if (!r || !r.has(c)) return; r.delete(c); c.rooms.delete(name); for (const o of r.keys()) sendTo(o, { t: 'bye', room: name, peer: c.peer }); if (!r.size) rooms.delete(name); }
function onMessage(c, text) {
  if (text.length > 16384) return; let m; try { m = JSON.parse(text); } catch (e) { return; }
  const now = Date.now(); if (now - c.win > 1000) { c.win = now; c.n = 0; } if (++c.n > 120) return;      // flood guard
  const name = typeof m.room === 'string' ? m.room : ''; if (!NAME.test(name)) return;
  if (m.t === 'join') { if (c.rooms.size >= 24) return; let r = rooms.get(name); if (!r) rooms.set(name, r = new Map()); if (!r.has(c)) { r.set(c, null); c.rooms.add(name); }
    sendTo(c, { t: 'snap', room: name, peers: [...r].filter(([o, pr]) => o !== c && pr).map(([o, pr]) => ({ peer: o.peer, by: o.uid, pr })) }); }
  else if (m.t === 'leave') leave(c, name);
  else if (m.t === 'p') { const r = rooms.get(name); if (!r || !r.has(c) || !m.pr || typeof m.pr !== 'object') return; if (JSON.stringify(m.pr).length > 8192) return; r.set(c, m.pr); for (const o of r.keys()) if (o !== c) sendTo(o, { t: 'p', room: name, peer: c.peer, by: c.uid, pr: m.pr }); }
}

// ----- a minimal WebSocket implementation (text frames, ping/pong, close) -----
function frame(sock, text, op) { const b = Buffer.from(text), n = b.length; let h; if (n < 126) h = Buffer.from([0x80 | (op || 1), n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | (op || 1); h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x80 | (op || 1); h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); } try { sock.write(Buffer.concat([h, b])); } catch (e) {} }
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']; if (!key || !/^\/ws(\?|$)/.test(req.url || '')) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  sock.setNoDelay(true);
  const uid = String(new URL(req.url, 'http://x').searchParams.get('uid') || '').replace(/[^\w-]/g, '').slice(0, 40) || 'u' + crypto.randomBytes(5).toString('hex');
  const c = { sock, uid, peer: 'p' + crypto.randomBytes(8).toString('hex'), rooms: new Set(), dead: false, alive: true, win: 0, n: 0 }; clients.add(c);
  sendTo(c, { t: 'hi', peer: c.peer });
  let buf = Buffer.alloc(0), parts = [];
  const end = () => { if (c.dead) return; c.dead = true; clients.delete(c); for (const n of [...c.rooms]) leave(c, n); try { sock.destroy(); } catch (e) {} };
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]); if (buf.length > 1 << 20) return end();
    for (;;) {
      if (buf.length < 2) return; const fin = buf[0] & 0x80, op = buf[0] & 15, masked = buf[1] & 0x80; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; if (buf.readUInt32BE(2)) return end(); }
      if (!masked || len > 1 << 18) return end(); if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len)); for (let i = 0; i < len; i++) data[i] ^= mask[i & 3]; buf = buf.subarray(off + 4 + len);
      if (op === 8) return end(); if (op === 9) { frame(sock, data, 10); continue; } if (op === 10) { c.alive = true; continue; }
      if (op === 1 || op === 0) { parts.push(data); if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; try { onMessage(c, text); } catch (e) {} } }
    }
  });
  sock.on('close', end); sock.on('error', end);
});
setInterval(() => { for (const c of clients) { if (!c.alive) { try { c.sock.destroy(); } catch (e) {} continue; } c.alive = false; frame(c.sock, '', 9); } }, 25000);
server.listen(PORT, () => console.log('Project Zombie is running on port ' + PORT));
