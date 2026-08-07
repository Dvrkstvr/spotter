/**
 * The buddy relay — a dev-only stand-in for the air between two phones.
 *
 * Clients are app instances running the sim radio (src/data/sim-radio.ts,
 * enabled by EXPO_PUBLIC_SIM_RADIO). The relay mimics the shape of Google
 * Nearby Connections: advertising/discovery, a two-sided connection
 * handshake with shared auth digits, payload forwarding between established
 * links. It knows nothing about workouts — all protocol logic stays in the
 * app, which is the point: everything above the native module runs for real.
 *
 * Run with `npm run buddy-relay`. Uses the `ws` package that ships with
 * Expo's toolchain (a Metro dependency), so there is nothing to install.
 *
 * Console keys (each followed by Enter):
 *   d — drop every live link (simulates the buddies walking out of range)
 *   l — list connected clients
 */
import ws from 'ws';

const PORT = Number(process.env.BUDDY_RELAY_PORT ?? 8787);

/** id → { id, ws, name, advertising, discovering } */
const clients = new Map();
/** pairKey → { digits, accepted: Set<id> } — handshakes in flight */
const pendings = new Map();
/** pairKey — established connections */
const links = new Set();
let nextPayloadId = 1;

const pairKey = (a, b) => [a, b].sort().join('|');
const log = (...args) => console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
const tag = (c) => (c.name ? `${c.id} (${c.name})` : c.id);

const send = (c, msg) => {
  if (c && c.ws.readyState === ws.OPEN) c.ws.send(JSON.stringify(msg));
};

/** Nearby-style 4-char endpoint ids. */
function newId() {
  let s = '';
  for (let i = 0; i < 4; i++)
    s += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)];
  return clients.has(s) ? newId() : s;
}

function onAdvertise(c, name) {
  c.name = name;
  c.advertising = true;
  log(`${tag(c)} advertising`);
  for (const o of clients.values())
    if (o !== c && o.discovering) send(o, { t: 'found', id: c.id, name });
}

function onStopAdvertise(c) {
  if (!c.advertising) return;
  c.advertising = false;
  for (const o of clients.values())
    if (o !== c && o.discovering) send(o, { t: 'lost', id: c.id });
}

function onDiscover(c) {
  c.discovering = true;
  for (const o of clients.values())
    if (o !== c && o.advertising) send(c, { t: 'found', id: o.id, name: o.name });
}

function onRequest(c, name, to) {
  const target = clients.get(to);
  if (!target) return send(c, { t: 'failed', id: to, status: 8012 });
  c.name = name;
  const key = pairKey(c.id, to);
  // Simultaneous mutual requests (both phones auto-reconnecting) collapse
  // into one handshake; requests on an existing link are noise.
  if (links.has(key) || pendings.has(key)) return;
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  pendings.set(key, { digits, accepted: new Set() });
  log(`${tag(c)} → ${tag(target)} requested, code ${digits}`);
  send(target, { t: 'initiated', id: c.id, name, isIncoming: true, digits });
  send(c, { t: 'initiated', id: to, name: target.name ?? '?', isIncoming: false, digits });
}

function onAccept(c, to) {
  const key = pairKey(c.id, to);
  const p = pendings.get(key);
  if (!p) return;
  p.accepted.add(c.id);
  if (p.accepted.size < 2) return;
  pendings.delete(key);
  links.add(key);
  send(c, { t: 'connected', id: to });
  send(clients.get(to), { t: 'connected', id: c.id });
  log(`${c.id} ⇄ ${to} connected`);
}

function onReject(c, to) {
  const key = pairKey(c.id, to);
  if (!pendings.delete(key)) return;
  // Nearby reports a rejection to both sides as STATUS_CONNECTION_REJECTED.
  send(c, { t: 'failed', id: to, status: 8004 });
  send(clients.get(to), { t: 'failed', id: c.id, status: 8004 });
  log(`${tag(c)} rejected ${to}`);
}

function onPayload(c, to, data) {
  if (!links.has(pairKey(c.id, to))) return;
  send(clients.get(to), { t: 'payload', id: c.id, data });
  send(c, { t: 'sent', id: to, payloadId: String(nextPayloadId++) });
}

function dropLink(key, why) {
  if (!links.delete(key)) return;
  const [a, b] = key.split('|');
  send(clients.get(a), { t: 'disconnected', id: b });
  send(clients.get(b), { t: 'disconnected', id: a });
  log(`${a} ⇄ ${b} disconnected${why ? ` (${why})` : ''}`);
}

const keysOf = (id) => [...links, ...pendings.keys()].filter((k) => k.split('|').includes(id));

const server = new ws.Server({ port: PORT }, () => {
  log(`buddy relay listening on ws://0.0.0.0:${PORT}`);
  log('keys: d+Enter drops all links · l+Enter lists clients');
});

server.on('connection', (sock) => {
  const c = { id: newId(), ws: sock, name: null, advertising: false, discovering: false };
  clients.set(c.id, c);
  log(`${c.id} joined`);
  send(c, { t: 'welcome', id: c.id });

  sock.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'advertise') onAdvertise(c, String(m.name ?? ''));
    else if (m.t === 'stopAdvertise') onStopAdvertise(c);
    else if (m.t === 'discover') onDiscover(c);
    else if (m.t === 'stopDiscover') c.discovering = false;
    else if (m.t === 'request') onRequest(c, String(m.name ?? ''), String(m.to ?? ''));
    else if (m.t === 'accept') onAccept(c, String(m.to ?? ''));
    else if (m.t === 'reject') onReject(c, String(m.to ?? ''));
    else if (m.t === 'payload') onPayload(c, String(m.to ?? ''), String(m.data ?? ''));
    else if (m.t === 'disconnect') dropLink(pairKey(c.id, String(m.to ?? '')));
    else if (m.t === 'stopAll') for (const key of keysOf(c.id)) dropLink(key);
  });

  sock.on('close', () => {
    clients.delete(c.id);
    onStopAdvertise(c);
    for (const key of keysOf(c.id)) {
      if (pendings.delete(key)) {
        const other = key.split('|').find((x) => x !== c.id);
        send(clients.get(other), { t: 'failed', id: c.id, status: 8012 });
      }
      dropLink(key, `${c.id} left`);
    }
    log(`${tag(c)} left`);
  });
});

process.stdin.on('data', (buf) => {
  const key = buf.toString().trim().toLowerCase();
  if (key === 'd') {
    if (!links.size) log('no links to drop');
    for (const k of [...links]) dropLink(k, 'dropped from console');
  } else if (key === 'l') {
    if (!clients.size) log('no clients connected');
    for (const c of clients.values())
      log(
        `  ${tag(c)} advertising=${c.advertising} discovering=${c.discovering} linked=${[...links].some((k) => k.split('|').includes(c.id))}`
      );
  }
});
