const port = process.argv[2] ?? '9555'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page' && item.title === 'Maestri')
if (!target) throw new Error('Maestri original não encontrado.')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let id = 0
function send(method, params = {}) {
  return new Promise((resolve) => {
    const requestId = ++id
    const listener = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== requestId) return
      socket.removeEventListener('message', listener)
      resolve(message)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
}
await send('Runtime.enable')
const result = await send('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: true,
  expression: `JSON.stringify({
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    body: document.body.innerText.slice(0, 5000),
    elements: [...document.querySelectorAll('button,[role="button"],input,[role="slider"],[data-node-id],[data-testid]')].filter(e => { const r=e.getBoundingClientRect(); return r.width && r.height }).map(e => ({tag:e.tagName,role:e.getAttribute('role'),aria:e.getAttribute('aria-label'),title:e.title,text:e.innerText?.slice(0,80),cls:typeof e.className==='string'?e.className.slice(0,160):'',rect:(()=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]})()})).slice(0,250),
    canvases: [...document.querySelectorAll('canvas')].map(e=>({cls:e.className,rect:(()=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()}))
  })`
})
console.log(result.result?.result?.value)
socket.close()
