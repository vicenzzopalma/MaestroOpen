const port = process.argv[2] ?? '9444'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page')

if (!target) {
  console.log('No target')
  process.exit(1)
}

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve) => socket.onopen = resolve)

let seq = 0
const pending = new Map()
socket.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  const r = pending.get(msg.id)
  if (r) {
    pending.delete(msg.id)
    r(msg)
  }
}

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evalCode(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return res.result?.result?.value
}

await send('Runtime.enable')
const list = await evalCode(`window.maestri.loopList()`)
console.log('LOOP LIST:', JSON.stringify(list, null, 2))
process.exit(0)
