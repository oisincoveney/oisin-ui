import { ConnectionOverlay } from './components/ConnectionOverlay'
import { useConnectionStatus } from './lib/ws'

function App() {
  const status = useConnectionStatus()

  return (
    <main className="relative min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-xl bg-card p-6 shadow-lg ring-1 ring-border/50">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">Oisin UI</h1>
          <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card px-3 py-1 text-xs font-medium text-card-foreground">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status === 'connected' ? 'bg-green-500' : 'bg-red-500'
              }`}
              aria-hidden="true"
            />
            <span>{status === 'connected' ? 'Connected' : 'Disconnected'}</span>
          </div>
        </header>

        <p className="text-sm text-foreground/80">
          Vite + React SPA scaffolded with Tailwind, ShadCN foundation, and Effect TS prepared for
          the terminal web client.
        </p>
        <button
          type="button"
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Open the workspace
        </button>
      </div>
      <ConnectionOverlay status={status} />
    </main>
  )
}

export default App
