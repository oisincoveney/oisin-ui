function App() {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-xl bg-white/10 p-6 shadow-lg ring-1 ring-border/50">
        <h1 className="text-3xl font-semibold">Oisin UI</h1>
        <p className="text-sm text-foreground/80">
          Vite + React SPA scaffolded with Tailwind, ShadCN foundation, and Effect TS
          prepared for the terminal web client.
        </p>
        <button
          type="button"
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Open the workspace
        </button>
      </div>
    </main>
  )
}

export default App
