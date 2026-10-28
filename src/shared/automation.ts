import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const AUTOMATION_PROTOCOL_VERSION = 1

export function defaultAutomationEndpoint(): string {
  return process.platform === 'win32'
    ? '\\\\.\\pipe\\maestri-open'
    : join(tmpdir(), `maestri-open-${process.getuid?.() ?? 'user'}.sock`)
}

export function runtimeDescriptorPath(): string {
  return join(homedir(), '.maestri-open', 'runtime.json')
}

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
  auth?: string
}

export type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}
