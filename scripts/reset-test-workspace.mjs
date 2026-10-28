const port = process.argv[2] ?? '9444'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((item) => item.type === 'page' && item.title === 'Maestri Open')
if (!target) throw new Error('Renderer não encontrado.')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})

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
const response = await send('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const workspace = await window.maestri.loadWorkspace()
    const terminal = workspace.nodes.find((node) => node.type === 'terminal')
    const note = workspace.nodes.find((node) => node.type === 'note')
    const clean = {
      ...workspace,
      nodes: [
        { ...terminal, title: 'Lead', frame: { x: 180, y: 150, width: 520, height: 330 }, zIndex: 1, minimized: false, locked: false, data: {} },
        { ...note, title: 'Arquitetura', frame: { x: 790, y: 185, width: 340, height: 260 }, zIndex: 2, minimized: false, locked: false, data: { content: '# Canvas multiagente\\n\\nArraste, redimensione e edite este cartão.' } }
      ],
      connections: [],
      updatedAt: new Date().toISOString()
    }
    await window.maestri.saveWorkspace(clean)
    return { nodes: clean.nodes.length, connections: clean.connections.length }
  })()`
})

console.log(JSON.stringify(response.result?.result?.value))
socket.send(JSON.stringify({ id: ++id, method: 'Page.reload', params: {} }))
await new Promise((resolve) => setTimeout(resolve, 3000))
socket.close()
