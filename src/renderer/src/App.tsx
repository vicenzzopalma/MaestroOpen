import { Bot, Command, FileText, FolderTree, Globe2, Plus, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ShellDescriptor } from '../../shared/contracts'

const tools = [
  { label: 'Terminal', icon: Command, shortcut: 'T' },
  { label: 'Nota', icon: FileText, shortcut: 'N' },
  { label: 'Arquivos', icon: FolderTree, shortcut: 'F' },
  { label: 'Portal', icon: Globe2, shortcut: 'P' }
]

export function App(): React.JSX.Element {
  const [shells, setShells] = useState<ShellDescriptor[]>([])

  useEffect(() => {
    void window.maestri.listShells().then(setShells)
  }, [])

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="traffic-space" />
        <strong>Maestri Open</strong>
        <span className="titlebar-workspace">Meu Workspace · Ground</span>
      </header>

      <aside className="sidebar">
        <button className="new-workspace"><Plus size={15} /> Novo workspace</button>
        <div className="sidebar-label">WORKSPACES</div>
        <button className="workspace-row active">
          <span className="workspace-mark">M</span>
          <span><b>Meu Workspace</b><small>Ground · {shells.length} shells</small></span>
        </button>
        <button className="settings"><Settings2 size={16} /> Ajustes</button>
      </aside>

      <main className="canvas">
        <div className="toolbar">
          {tools.map(({ label, icon: Icon, shortcut }) => (
            <button key={label} title={`${label} (${shortcut})`}><Icon size={17} /><span>{label}</span></button>
          ))}
        </div>

        <svg className="cables" aria-hidden="true">
          <path d="M 490 385 C 650 520, 720 260, 910 400" />
        </svg>

        <section className="node terminal-node">
          <div className="node-header"><Bot size={15} /><b>Lead</b><span className="status active" /></div>
          <div className="terminal-body">
            <span className="muted">Maestri Open local terminal</span><br />
            <span className="prompt">PS D:\Maestri-Open\1&gt;</span> <span className="caret" />
          </div>
          <div className="node-footer">PowerShell · Maestro</div>
        </section>

        <section className="node note-node">
          <div className="node-header"><FileText size={15} /><b>Arquitetura</b></div>
          <div className="note-body">
            <h3>Canvas multiagente</h3>
            <p>Terminais, notas e portals conectados num espaço local.</p>
            <code>schemaVersion: 2</code>
          </div>
        </section>

        <div className="canvas-status">100% · Ground</div>
      </main>
    </div>
  )
}
