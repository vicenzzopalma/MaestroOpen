import { atom } from 'jotai'
import type { WorkspaceDocument } from '../../../shared/contracts'

export type Viewport = { x: number; y: number; zoom: number }

export const viewportAtom = atom<Viewport>({ x: 0, y: 0, zoom: 1 })
export const activeWorkspaceNameAtom = atom('Meu Workspace')
export const selectedNodeIdsAtom = atom<Set<string>>(new Set<string>())
export const workspaceAtom = atom<WorkspaceDocument | null>(null)
