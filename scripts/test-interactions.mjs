const port = process.argv[2] ?? '9444'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page' && item.title === 'Maestri Open')

if (!target) throw new Error('Renderer do Maestri Open não encontrado.')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})

let sequence = 0
const pending = new Map()
socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  const resolve = pending.get(message.id)
  if (!resolve) return
  pending.delete(message.id)
  resolve(message)
}

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++sequence
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result?.result?.value
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

await send('Runtime.enable')

const before = await evaluate(`(() => {
  const node = document.querySelector('.node')
  const status = document.querySelector('.canvas-status') || document.querySelector('.zoom-value')
  const ports = document.querySelectorAll('.cable-port')
  const cables = document.querySelectorAll('.cable-group')
  return {
    count: document.querySelectorAll('.node').length,
    left: node?.style.left,
    top: node?.style.top,
    width: node?.style.width,
    height: node?.style.height,
    zoom: status?.textContent,
    portsCount: ports.length,
    cablesCount: cables.length
  }
})()`)

await evaluate(`(() => {
  const header = document.querySelector('.node .node-header')
  const rect = header.getBoundingClientRect()
  const options = { bubbles: true, button: 0, clientX: rect.left + 80, clientY: rect.top + 18 }
  header.dispatchEvent(new PointerEvent('pointerdown', options))
  window.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: options.clientX + 64, clientY: options.clientY + 38 }))
  window.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: options.clientX + 64, clientY: options.clientY + 38 }))
})()`)
await delay(100)

await evaluate(`(() => {
  const handle = document.querySelector('.node .resize-handle')
  const rect = handle.getBoundingClientRect()
  const options = { bubbles: true, button: 0, clientX: rect.left + 5, clientY: rect.top + 5 }
  handle.dispatchEvent(new PointerEvent('pointerdown', options))
  window.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: options.clientX + 55, clientY: options.clientY + 32 }))
  window.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: options.clientX + 55, clientY: options.clientY + 32 }))
})()`)
await delay(100)

await evaluate(`document.querySelector('.toolbar button[title^="Nota"]')?.click()`)
await delay(100)
await evaluate(`(() => {
  const note = [...document.querySelectorAll('.note-editor')].at(-1)
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(note, '# Nota funcional\\n\\nEdição confirmada.')
  note.dispatchEvent(new Event('input', { bubbles: true }))
})()`)

await evaluate(`(() => {
  const canvas = document.querySelector('.canvas')
  const rect = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -180, clientX: rect.left + 500, clientY: rect.top + 350 }))
})()`)
await delay(100)

await evaluate(`(() => {
  const buttons = document.querySelectorAll('.node-actions button[title*="Conectar"]')
  if (buttons[0]) buttons[0].click()
})()`)
await delay(50)
await evaluate(`(() => {
  const buttons = document.querySelectorAll('.node-actions button[title*="Conectar"]')
  if (buttons[1]) buttons[1].click()
  document.querySelector('.settings')?.click()
})()`)
await delay(100)

const after = await evaluate(`(() => {
  const node = document.querySelector('.node')
  const status = document.querySelector('.canvas-status') || document.querySelector('.zoom-value')
  return {
    count: document.querySelectorAll('.node').length,
    left: node.style.left,
    top: node.style.top,
    width: node.style.width,
    height: node.style.height,
    zoom: status?.textContent,
    note: [...document.querySelectorAll('.note-editor')].at(-1)?.value,
    cables: document.querySelectorAll('.cables .cable-group').length || document.querySelectorAll('.cables path').length,
    settings: Boolean(document.querySelector('.settings-modal')),
    terminal: document.querySelector('.terminal-state')?.textContent
  }
})()`)

await evaluate(`document.querySelector('.xterm-helper-textarea')?.focus()`)
await send('Input.insertText', { text: 'Write-Output "__MAESTRI_PTY_OK__"' })
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await delay(900)

const passed =
  after.count === before.count + 1 &&
  after.left !== before.left &&
  after.top !== before.top &&
  after.width !== before.width &&
  after.height !== before.height &&
  after.zoom !== before.zoom &&
  after.note?.includes('Edição confirmada') &&
  after.cables >= 1 &&
  after.settings &&
  after.terminal === 'Ativo'

console.log(JSON.stringify({ passed, before, after }, null, 2))
socket.close()
if (!passed) process.exitCode = 1
