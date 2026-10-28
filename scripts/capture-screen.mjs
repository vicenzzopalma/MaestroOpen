import fs from 'node:fs';

const port = process.argv[2] ?? '9444';
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find((item) => item.type === 'page');

if (!target) {
  console.error('Target not found');
  process.exit(1);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let seq = 0;
const pending = new Map();
socket.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  const r = pending.get(msg.id);
  if (r) {
    pending.delete(msg.id);
    r(msg);
  }
};

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
const screenshot = await send('Page.captureScreenshot', { format: 'png' });
const buffer = Buffer.from(screenshot.result.data, 'base64');
fs.writeFileSync('scripts/current-screen.png', buffer);
console.log('Screenshot saved to scripts/current-screen.png');
process.exit(0);
