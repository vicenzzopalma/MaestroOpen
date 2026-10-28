import { writeFile } from 'node:fs/promises'

const port = process.argv[2] ?? '9444'
const screenshotPath = process.argv[3]
const closeAfter = process.argv.includes('--close')
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page' && item.title === 'Maestri Open') ?? targets.find((item) => item.type === 'page')

if (!target) throw new Error('Renderer do Maestri Open não encontrado.')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})

let sequence = 0
const pending = new Map()
const events = []

socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  } else {
    events.push(message)
  }
}

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++sequence
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')

const expression = `JSON.stringify({
  ready: document.readyState,
  title: document.title,
  root: document.querySelector('#root')?.innerHTML,
  bodyText: document.body.innerText,
  api: typeof window.maestri,
  scripts: [...document.scripts].map((script) => script.src),
  styles: [...document.styleSheets].map((sheet) => sheet.href),
  background: getComputedStyle(document.body).backgroundColor
})`

const evaluation = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true
})

await new Promise((resolve) => setTimeout(resolve, 500))

console.log(
  JSON.stringify(
    {
      evaluation: evaluation.result?.result,
      exception: evaluation.result?.exceptionDetails,
      events: events.filter((event) =>
        ['Runtime.exceptionThrown', 'Runtime.consoleAPICalled', 'Log.entryAdded'].includes(event.method)
      )
    },
    null,
    2
  )
)

if (screenshotPath) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(screenshotPath, Buffer.from(screenshot.result.data, 'base64'))
  console.log(`Screenshot: ${screenshotPath}`)
}

if (closeAfter) {
  socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close', params: {} }))
  await new Promise((resolve) => setTimeout(resolve, 100))
}

socket.close()
