const port = process.argv[2] ?? '9444'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page' && item.title === 'Maestri Open')

if (!target) throw new Error('Renderer não encontrado')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})

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
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.text)
  return res.result?.result?.value
}

await send('Runtime.enable')

const result = await evalCode(`(() => {
  const nodes = document.querySelectorAll('.node')
  const ports = document.querySelectorAll('.cable-port')
  const portsBySide = {
    top: document.querySelectorAll('.cable-port.top').length,
    bottom: document.querySelectorAll('.cable-port.bottom').length,
    left: document.querySelectorAll('.cable-port.left').length,
    right: document.querySelectorAll('.cable-port.right').length
  }

  const cables = [...document.querySelectorAll('.cable-group')].map(group => {
    const line = group.querySelector('.cable-line')
    const shadow = group.querySelector('.cable-shadow')
    const jacks = group.querySelectorAll('.cable-jack-outer').length
    const disconnectBtn = group.querySelector('.cable-disconnect')
    return {
      d: line?.getAttribute('d'),
      hasShadow: Boolean(shadow),
      jacksCount: jacks,
      hasDisconnect: Boolean(disconnectBtn)
    }
  })

  return {
    nodeCount: nodes.length,
    totalPorts: ports.length,
    portsBySide,
    cables
  }
})()`)

console.log(JSON.stringify(result, null, 2))
process.exit(0)
