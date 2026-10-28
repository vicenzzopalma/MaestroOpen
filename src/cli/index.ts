#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { Command } from 'commander'
import {
  AUTOMATION_PROTOCOL_VERSION,
  runtimeDescriptorPath,
  type JsonRpcRequest,
  type JsonRpcResponse
} from '../shared/automation'

type RuntimeDescriptor = { endpoint: string; token: string; protocolVersion: number }

async function call(method: string, params?: unknown): Promise<unknown> {
  let runtime: RuntimeDescriptor
  try {
    runtime = JSON.parse(await readFile(runtimeDescriptorPath(), 'utf8')) as RuntimeDescriptor
  } catch {
    throw new Error('Maestri não está em execução ou o runtime local ainda não foi criado.')
  }
  if (runtime.protocolVersion !== AUTOMATION_PROTOCOL_VERSION) {
    throw new Error('A versão do CLI não é compatível com a aplicação em execução.')
  }

  const endpoint =
    process.env.MAESTRI_PIPE || process.env.MAESTRI_AUTOMATION_ENDPOINT || runtime.endpoint
  const requestParams = {
    ...((params && typeof params === 'object' ? params : {}) as Record<string, unknown>),
    ...(process.env.MAESTRI_TERMINAL_ID
      ? { clientTerminalId: process.env.MAESTRI_TERMINAL_ID }
      : {})
  }

  return new Promise((resolve, reject) => {
    const socket = connect(endpoint)
    const id = Date.now()
    let buffer = ''
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: requestParams,
      auth: runtime.token
    }

    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      const response = JSON.parse(buffer.slice(0, newline)) as JsonRpcResponse
      socket.end()
      if (response.error) reject(new Error(response.error.message))
      else resolve(response.result)
    })
    socket.on('error', reject)
    socket.setTimeout(30_000, () => socket.destroy(new Error('Tempo limite excedido.')))
  })
}

function print(value: unknown): void {
  if (typeof value === 'string') process.stdout.write(`${value}\n`)
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function action(method: string, toParams: (...args: unknown[]) => unknown = (...args) => args) {
  return async (...args: unknown[]): Promise<void> => print(await call(method, toParams(...args)))
}

const program = new Command()
  .name('maestri')
  .description('Controle local do canvas Maestri e comunicação entre agentes.')
  .version('0.1.0')
  .showHelpAfterError()

program
  .command('context')
  .description('Mostra identidade e conexões deste agente.')
  .action(action('agent.context', () => ({})))
program
  .command('list')
  .description('Lista agentes, notas e portals conectados.')
  .action(action('canvas.list', () => ({})))
program
  .command('ask [name] [prompt]')
  .description('Entrega uma mensagem assíncrona; use check para consultar a resposta.')
  .option('--batch <json>', 'mapa JSON de agente para prompt')
  .option('--raw <input>', 'envia bytes/teclas sem interpretar como prompt')
  .option('--timeout <seconds>', 'tempo limite em segundos', '300')
  .action(
    action('agent.ask', (name, prompt, options) => ({ name, prompt, ...(options as object) }))
  )
program
  .command('check <name>')
  .description('Lê a saída recente de um agente.')
  .option('--lines <count>', 'quantidade de linhas', '200')
  .action(action('agent.check', (name, options) => ({ name, ...(options as object) })))
program
  .command('say [text]')
  .description('Responde ao Maestri Chat com texto, arquivo ou atualização intermediária.')
  .option('--file [path]', 'envia texto UTF-8 ou anexa uma imagem')
  .option('--progress', 'envia uma atualização intermediária')
  .action(action('chat.say', (message, options) => ({ message, ...(options as object) })))

const recall = program
  .command('recall [thread]')
  .description('Lê a memória de uma conversa do Maestri Chat.')
  .option('--turns <count>')
  .option('--last <period>', 'day, week ou month')
  .option('--from <date>')
  .option('--to <date>')
  .option('--all')
  .option('--json')
  .action(action('chat.recall', (thread, options) => ({ thread, ...(options as object) })))
recall.command('list').action(action('chat.recall.list', () => ({})))
recall.command('attachment <id>').action(action('chat.recall.attachment', (id) => ({ id })))

const note = program.command('note').description('Cria, lê, edita e organiza notas.')
note
  .command('create [content]')
  .option('--name <name>', 'nome estável')
  .option('--stack [stack]', 'adiciona a um fichário')
  .action(action('note.create', (content, options) => ({ content, ...(options as object) })))
note
  .command('read <name> [start] [count]')
  .action(action('note.read', (name, start, count) => ({ name, start, count })))
note
  .command('write <name> <content>')
  .action(action('note.write', (name, content) => ({ name, content })))
note
  .command('edit <name> <oldText> <newText>')
  .action(action('note.edit', (name, oldText, newText) => ({ name, oldText, newText })))
note
  .command('stack <name> [stack]')
  .action(action('note.stack', (name, stack) => ({ name, stack })))
note.command('unstack <name>').action(action('note.unstack', (name) => ({ name })))
note.command('delete <name>').action(action('note.delete', (name) => ({ name })))

program
  .command('recruit [name]')
  .description('Cria um agente no canvas (somente Maestro).')
  .option('--preset <preset>')
  .option('--role <role>')
  .option('--account <account>')
  .option('--floor <floor>')
  .option('--workspace <workspace>')
  .option('--command <command>')
  .option('--dir <path>')
  .option('--replace <name>')
  .action(action('agent.recruit', (name, options) => ({ name, ...(options as object) })))
program
  .command('dismiss <name>')
  .description('Remove um agente (somente Maestro).')
  .action(action('agent.dismiss', (name) => ({ name })))
program
  .command('connect <from> <to>')
  .description('Conecta dois nós (somente Maestro).')
  .action(action('nodes.connect', (from, to) => ({ from, to })))
program
  .command('notify <message>')
  .description('Envia uma notificação local ao usuário.')
  .action(action('system.notify', (message) => ({ message })))
program
  .command('debug')
  .description('Diagnostica a conexão local com o Maestri.')
  .action(action('system.debug', () => ({})))

const preset = program.command('preset').description('Gerencia presets de agentes.')
preset.command('list').action(action('preset.list', () => ({})))
preset.command('show <name>').action(action('preset.show', (name) => ({ name })))
preset
  .command('create <name>')
  .option('--command <command>')
  .option('--account <account>')
  .option('--maestro <onOrOff>')
  .option('--chat <onOrOff>')
  .option('--quick-start <onOrOff>')
  .action(action('preset.create', (name, options) => ({ name, ...(options as object) })))
preset
  .command('set <name>')
  .option('--name <newName>')
  .option('--command <command>')
  .option('--account <account>')
  .option('--maestro <onOrOff>')
  .option('--chat <onOrOff>')
  .option('--quick-start <onOrOff>')
  .action(action('preset.set', (name, options) => ({ name, ...(options as object) })))
preset.command('delete <name>').action(action('preset.delete', (name) => ({ name })))

const role = program.command('role').description('Gerencia papéis de agentes.')
role.command('list').action(action('role.list', () => ({})))
role.command('show <name>').action(action('role.show', (name) => ({ name })))
role
  .command('create <name> <prompt>')
  .option('--scope <scope>', 'current ou global')
  .action(
    action('role.create', (name, prompt, options) => ({ name, prompt, ...(options as object) }))
  )
role
  .command('edit <name> [oldText] [newText]')
  .option('--scope <scope>', 'current ou global')
  .action(
    action('role.edit', (name, oldText, newText, options) => ({
      name,
      oldText,
      newText,
      ...(options as object)
    }))
  )
role
  .command('write <name> <prompt>')
  .action(action('role.write', (name, prompt) => ({ name, prompt })))
role
  .command('assign <recruit> [role]')
  .option('--none')
  .action(
    action('role.assign', (recruit, assignedRole, options) => ({
      recruit,
      role: assignedRole,
      ...(options as object)
    }))
  )
role
  .command('delete <name>')
  .option('--force')
  .action(action('role.delete', (name, options) => ({ name, ...(options as object) })))

const portal = program.command('portal').description('Controla um portal de navegador.')
portal.command('devices').action(action('portal.devices', () => ({})))
portal
  .command('create [url] [name]')
  .option('--size <widthXheight>')
  .option('--simulator <id>')
  .action(action('portal.create', (url, name, options) => ({ url, name, ...(options as object) })))
portal
  .command('edit <name>')
  .option('--url <url>')
  .action(action('portal.edit', (name, options) => ({ name, ...(options as object) })))
portal.command('close <name>').action(action('portal.close', (name) => ({ name })))
portal
  .command('navigate <name> <url>')
  .action(action('portal.navigate', (name, url) => ({ name, url })))
portal.command('snapshot <name>').action(action('portal.snapshot', (name) => ({ name })))
portal.command('a11y <name>').action(action('portal.snapshot', (name) => ({ name })))
portal.command('info <name>').action(action('portal.info', (name) => ({ name })))
portal.command('screenshot <name>').action(action('portal.screenshot', (name) => ({ name })))
portal.command('click <name> <ref>').action(action('portal.click', (name, ref) => ({ name, ref })))
portal.command('tap <name> <ref>').action(action('portal.tap', (name, ref) => ({ name, ref })))
portal
  .command('fill <name> <ref> <value>')
  .action(action('portal.fill', (name, ref, value) => ({ name, ref, value })))
portal.command('type <name> <text>').action(action('portal.type', (name, text) => ({ name, text })))
portal.command('key <name> <key>').action(action('portal.key', (name, key) => ({ name, key })))
portal
  .command('selectall <name> [ref]')
  .action(action('portal.selectall', (name, ref) => ({ name, ref })))
portal.command('clear <name> [ref]').action(action('portal.clear', (name, ref) => ({ name, ref })))
portal.command('hover <name> <ref>').action(action('portal.hover', (name, ref) => ({ name, ref })))
portal.command('focus <name> <ref>').action(action('portal.focus', (name, ref) => ({ name, ref })))
portal
  .command('select <name> <ref> <option>')
  .action(action('portal.select', (name, ref, option) => ({ name, ref, option })))
portal.command('check <name> [ref]').action(action('portal.check', (name, ref) => ({ name, ref })))
portal
  .command('uncheck <name> <ref>')
  .action(action('portal.uncheck', (name, ref) => ({ name, ref })))
portal
  .command('scroll <name> <direction> <amount> [target]')
  .action(
    action('portal.scroll', (name, direction, amount, target) => ({
      name,
      direction,
      amount,
      target
    }))
  )
portal
  .command('scrollintoview <name> <ref>')
  .action(action('portal.scrollintoview', (name, ref) => ({ name, ref })))
portal
  .command('drag <name> <from> <to>')
  .action(action('portal.drag', (name, from, to) => ({ name, from, to })))
portal.command('text <name> <ref>').action(action('portal.text', (name, ref) => ({ name, ref })))
portal.command('html <name>').action(action('portal.html', (name) => ({ name })))
portal
  .command('evaluate <name> <expression>')
  .action(action('portal.evaluate', (name, expression) => ({ name, expression })))
portal.command('logs-start <name>').action(action('portal.logs-start', (name) => ({ name })))
portal.command('logs <name>').action(action('portal.logs', (name) => ({ name })))
portal
  .command('resize <name> <width> <height>')
  .action(action('portal.resize', (name, width, height) => ({ name, width, height })))
portal
  .command('ua <name> [preset]')
  .action(action('portal.ua', (name, userAgentPreset) => ({ name, preset: userAgentPreset })))
portal
  .command('swipe <name> <from> <to>')
  .action(action('portal.swipe', (name, from, to) => ({ name, from, to })))
portal
  .command('button <name> <button>')
  .action(action('portal.button', (name, button) => ({ name, button })))
portal.command('home <name>').action(action('portal.button', (name) => ({ name, button: 'home' })))
portal.command('lock <name>').action(action('portal.button', (name) => ({ name, button: 'lock' })))
portal
  .command('wait <name> <ref> [timeoutMs]')
  .action(action('portal.wait', (name, ref, timeoutMs) => ({ name, ref, timeoutMs })))
portal
  .command('launch <name> <package>')
  .action(action('portal.launch', (name, packageName) => ({ name, package: packageName })))
portal
  .command('terminate <name> <package>')
  .action(action('portal.terminate', (name, packageName) => ({ name, package: packageName })))

const floor = program.command('floor').description('Gerencia pisos isolados do workspace.')
floor.command('list').action(action('floor.list', () => ({})))
floor
  .command('create [name]')
  .option('--branch <branch>')
  .option('--existing-branch')
  .option('--copy')
  .option('--no-git')
  .option('--copy-ground')
  .option('--pull-request <numberOrUrl>')
  .action(action('floor.create', (name, options) => ({ name, ...(options as object) })))
floor
  .command('land <name>')
  .option('--into <branch>')
  .option('--delete-branch')
  .option('--keep-floor')
  .action(action('floor.land', (name, options) => ({ name, ...(options as object) })))
floor
  .command('delete <name>')
  .option('--keep-branch')
  .option('--force')
  .action(action('floor.delete', (name, options) => ({ name, ...(options as object) })))
floor
  .command('status [text]')
  .option('--state <state>')
  .option('--progress <progress>')
  .option('--floor <name>')
  .option('--clear')
  .action(action('floor.status', (text, options) => ({ text, ...(options as object) })))
floor.command('unload <name>').action(action('floor.unload', (name) => ({ name })))

const workspace = program.command('workspace').description('Gerencia workspaces locais.')
workspace.command('list').action(action('workspace.list', () => ({})))
workspace
  .command('create <name>')
  .requiredOption('--dir <path>')
  .option('--from <workspace>')
  .option('--group <group>')
  .option('--folder <folder>')
  .action(action('workspace.create', (name, options) => ({ name, ...(options as object) })))
workspace
  .command('move <name>')
  .option('--group <group>')
  .option('--folder <folder>')
  .option('--root')
  .action(action('workspace.move', (name, options) => ({ name, ...(options as object) })))
workspace
  .command('rename <current> <next>')
  .action(action('workspace.rename', (current, next) => ({ current, next })))

const routine = program.command('routine').description('Gerencia rotinas e lembretes agendados.')
routine.command('list').action(action('routine.list', () => ({})))
routine
  .command('show <name>')
  .option('--id <prefix>')
  .action(action('routine.show', (name, options) => ({ name, ...(options as object) })))
for (const verb of ['create', 'edit'] as const) {
  const command = routine.command(`${verb} <name>`)
  if (verb === 'create') command.requiredOption('--command <command>')
  else command.option('--command <command>').option('--name <newName>')
  command
    .option('--every <interval>')
    .option('--daily <time>')
    .option('--weekly <schedule>')
    .option('--once <dateTime>')
    .option('--terminal <name>')
    .option('--reminder')
    .option('--count <count>')
    .option('--until <date>')
    .option('--pre-run <script>')
    .option('--no-skip-if-busy')
    .option('--no-notify')
    .option('--disabled')
    .option('--id <prefix>')
    .action(action(`routine.${verb}`, (name, options) => ({ name, ...(options as object) })))
}
for (const verb of ['enable', 'disable', 'run', 'delete'] as const) {
  routine
    .command(`${verb} <name>`)
    .option('--id <prefix>')
    .action(action(`routine.${verb}`, (name, options) => ({ name, ...(options as object) })))
}

const loop = program.command('loop').description('Controla ciclos de refinamento com prazo.')
loop.command('list').action(action('loop.list', () => ({})))
loop
  .command('start <name> <prompt>')
  .requiredOption('--until <date>', 'Prazo ISO com fuso horário')
  .action(
    action('loop.start', (name, prompt, options) => ({ name, prompt, ...(options as object) }))
  )
loop.command('stop <name>').action(action('loop.stop', (name) => ({ name })))

program.parseAsync(process.argv.slice(2), { from: 'user' }).catch((error: unknown) => {
  process.stderr.write(`maestri: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
