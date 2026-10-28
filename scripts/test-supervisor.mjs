import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const temp = await mkdtemp(join(tmpdir(), 'maestri-supervisor-'))
try {
  const output = join(temp, 'test.mjs')
  await build({ entryPoints: ['src/main/automation/loop-manager.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'test-process', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'mock' }))
    b.onResolve({ filter: /^node:child_process$/ }, () => ({ path: 'process', namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'electron' ? 'export const app = { getPath: () => "test" }' : `
      import { EventEmitter } from 'node:events';
      export function spawn(command, args, options) {
        if (command === 'taskkill') { globalThis.kills++; return new EventEmitter() }
        const child = new EventEmitter(); child.pid = 99999999;
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.stdin = new EventEmitter(); child.stdin.end = prompt => {
          globalThis.prompts.push(prompt);
          if (globalThis.mode === 'success') setTimeout(() => { child.stdout.emit('data', Buffer.from('completed')); child.emit('close', 0) }, 15);
          if (globalThis.mode === 'fail') setTimeout(() => child.emit('close', 1), 15);
        };
        child.kill = () => { globalThis.kills++; child.emit('close', 1) };
        return child;
      }` }))
  } }] })
  const { LoopManager, agentContext } = await import(pathToFileURL(output).href)
  const doc = { name: 'Test', rootPath: temp, nodes: [{ id: 'a', type: 'terminal', title: 'Lead', data: { role: 'Engineer', terminalId: 't1' } }, { id: 'b', type: 'terminal', title: 'Peer', data: { role: 'Reviewer' } }], connections: [{ fromNodeId: 'a', toNodeId: 'b' }] }
  const manager = new LoopManager({ load: async () => doc })
  globalThis.prompts = []; globalThis.kills = 0; globalThis.mode = 'success'
  assert.match(agentContext(doc, 'a'), /Peer/)
  await assert.rejects(manager.start('a', 'work', 'invalid'))
  await assert.rejects(manager.start('a', '', new Date(Date.now()+10000).toISOString()))
  const attempts = await Promise.allSettled([manager.start('a', 'work', new Date(Date.now()+10000).toISOString()), manager.start('a', 'work', new Date(Date.now()+10000).toISOString())])
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(manager.receive('a', 'Review accessibility'), true)
  await new Promise(r => setTimeout(r, 3200))
  assert.ok(manager.list()[0].cycle >= 2, 'Completion must start another cycle')
  assert.match(globalThis.prompts[1], /Review accessibility/)
  manager.stop('a')
  assert.equal(manager.list()[0].status, 'stopped')
  const cycles = manager.list()[0].cycle
  await new Promise(r => setTimeout(r, 3100))
  assert.equal(manager.list()[0].cycle, cycles)
  globalThis.mode = 'hang'
  await manager.start('a', 'work', new Date(Date.now()+80).toISOString())
  await new Promise(r => setTimeout(r, 150))
  assert.equal(manager.list()[0].status, 'expired')
  assert.ok(globalThis.kills > 0)
  const failing = new LoopManager({ load: async () => doc })
  globalThis.mode = 'fail'
  await failing.start('a', 'work', new Date(Date.now()+10000).toISOString())
  await new Promise(r => setTimeout(r, 50))
  assert.equal(failing.list()[0].status, 'error')
  failing.dispose(); manager.dispose()
  console.log('PASS: identity/context, validation, duplicate starts, repeat after completion, message queue, manual stop, deadline cancellation, process failure')
} finally { await rm(temp, { recursive: true, force: true }) }
