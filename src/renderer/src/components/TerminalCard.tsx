import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'

type TerminalCardProps = {
  terminalId?: string | undefined
  shellName?: string | undefined
}

export function TerminalCard({ terminalId, shellName }: TerminalCardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState(terminalId ? 'Conectando…' : 'Sessão indisponível')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 10_000,
      theme: {
        background: '#18181a',
        foreground: '#f5f5f7',
        cursor: '#0a84ff',
        selectionBackground: 'rgba(10, 132, 255, 0.35)',
        black: '#1e1e1e',
        brightBlack: '#636366',
        blue: '#0a84ff',
        brightBlue: '#409cff',
        green: '#30d158',
        brightGreen: '#34c759',
        red: '#ff453a',
        brightRed: '#ff6961'
      }
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(new SearchAddon())
    terminal.open(host)

    try {
      terminal.loadAddon(new WebglAddon())
    } catch {
      // XTerm keeps its DOM renderer when WebGL is unavailable.
    }

    const resize = (): void => {
      try {
        fit.fit()
        if (terminalId) void window.maestri.resizeTerminal(terminalId, terminal.cols, terminal.rows)
      } catch {
        // A minimized or detached card has no measurable terminal viewport.
      }
    }
    const observer = new ResizeObserver(() => requestAnimationFrame(resize))
    observer.observe(host)

    const input = terminal.onData((data) => {
      if (terminalId) void window.maestri.writeTerminal(terminalId, data)
    })
    const removeData = window.maestri.onTerminalData((event) => {
      if (event.id === terminalId) terminal.write(event.data)
    })
    const removeExit = window.maestri.onTerminalExit((event) => {
      if (event.id !== terminalId) return
      terminal.writeln(`\r\n\x1b[90m[processo encerrado: ${event.exitCode}]\x1b[0m`)
      setStatus('Encerrado')
    })

    if (terminalId) {
      void window.maestri.readTerminal(terminalId, 500).then((output) => {
        if (output) terminal.write(output)
        setStatus('Ativo')
        requestAnimationFrame(resize)
      }).catch((error: unknown) => {
        terminal.writeln(`\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m`)
        setStatus('Desconectado')
      })
    } else {
      terminal.writeln('\x1b[90mSessão de terminal não disponível.\x1b[0m')
    }

    requestAnimationFrame(resize)
    return () => {
      observer.disconnect()
      removeData()
      removeExit()
      input.dispose()
      terminal.dispose()
    }
  }, [terminalId])

  return (
    <div className="terminal-card-body">
      <div ref={hostRef} className="xterm-host" />
      <div className="node-footer">
        <span className="node-footer-shell">{shellName ?? 'Windows PowerShell'}</span>
        <span className={`terminal-state ${status === 'Ativo' ? 'running' : 'stopped'}`}>
          <span className="status-dot" />
          {status}
        </span>
      </div>
    </div>
  )
}
