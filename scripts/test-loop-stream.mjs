const port = '9445'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page' && item.title === 'Maestri Open')

if (!target) throw new Error('Renderer não encontrado.')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.onopen = res
  socket.onerror = rej
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
  return new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evalCode(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.text)
  return res.result?.result?.value
}

await send('Runtime.enable')

// Clica no botão de Atribuir Role do primeiro card para abrir o painel
const status = await evalCode(`(() => {
  const btn = document.querySelector('.node-role-btn')
  if (btn) btn.click()
  return {
    panelOpened: !!document.querySelector('.agent-panel'),
    terminals: document.querySelectorAll('.node').length
  }
})()`)

console.log('Painel aberto:', status)

await new Promise(r => setTimeout(r, 1000))

// Verifica se os elementos do loop existem no painel
const panelState = await evalCode(`(() => {
  const panel = document.querySelector('.agent-panel')
  const textarea = panel?.querySelector('textarea[aria-label="Objetivo do refinamento"]')
  const startBtn = panel?.querySelector('.panel-actions button.primary')
  return {
    hasTextarea: !!textarea,
    hasStartBtn: !!startBtn,
    hasLiveStatus: !!panel?.querySelector('.run-status')
  }
})()`)

console.log('Estado do painel:', panelState)
socket.close()
process.exit(0)
