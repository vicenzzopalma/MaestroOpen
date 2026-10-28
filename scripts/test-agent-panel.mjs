import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const targets = await (await fetch('http://127.0.0.1:9458/json/list')).json()
const target = targets.find(t => t.type === 'page')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let id = 0; const waiting = new Map()
socket.onmessage = e => { const msg = JSON.parse(e.data); waiting.get(msg.id)?.(msg); waiting.delete(msg.id) }
const send = (method, params = {}) => new Promise(resolve => { waiting.set(++id, resolve); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value }
try {
  assert.equal(await evaluate('Boolean(window.maestri)'), true)
  await evaluate(`document.querySelector('[title="Identidade e timer"]').click()`)
  await new Promise(r => setTimeout(r, 250))
  assert.equal(await evaluate('Boolean(document.querySelector(".agent-panel"))'), true)
  const context = await evaluate(`(async () => { const w = await window.maestri.loadWorkspace(); const n = w.nodes.find(n => n.type === 'terminal'); await window.maestri.automation('role.write', { name: 'Reviewer', prompt: 'Review accessibility and correctness' }); await window.maestri.automation('role.assign', { recruit: n.id, role: 'Reviewer' }); return window.maestri.automation('agent.context', { nodeId: n.id }); })()`)
  assert.match(context, /Review accessibility/)
  assert.equal(await evaluate(`window.maestri.loopStart('missing', 'test', 'invalid').then(() => false, () => true)`), true)
  const shellOutput = await evaluate(`(async () => { const w = await window.maestri.loadWorkspace(); const n = w.nodes.find(n => n.type === 'terminal'); await window.maestri.writeTerminal(n.data.terminalId, 'maestri context\\r'); await new Promise(r => setTimeout(r, 2000)); return window.maestri.readTerminal(n.data.terminalId, 100); })()`)
  assert.match(shellOutput, /Review accessibility/)
  const image = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile('analysis/agent-panel.png', Buffer.from(image.result.data, 'base64'))
  console.log('PASS: Electron preload, inspector rendering, role creation/assignment/persistence, context, invalid deadline; screenshot analysis/agent-panel.png')
} finally { socket.close() }
