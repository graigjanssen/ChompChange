import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CalendarView } from './CalendarView'

export function AppShell() {
  const { signOut } = useAuth()

  return (
    <div className="flex flex-col min-h-screen bg-bg-dark">
      <header className="flex items-center justify-between px-6 py-4 bg-surface border-b border-border">
        <h1 className="text-2xl font-bold text-accent tracking-tight">ChompChange</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/budget"
            className="text-sm text-text-muted hover:text-text border border-border px-3 py-1.5 rounded hover:border-accent transition-colors"
          >
            Set Budget
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-text-muted hover:text-text border border-border px-3 py-1.5 rounded hover:border-accent transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="flex-1 flex">
        <CalendarView />
      </main>
    </div>
  )
}
