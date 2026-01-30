import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    console.log('[auth] ProtectedRoute: still loading, user:', user)
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-dark">
        <p className="text-text-muted text-lg">Loading (auth)...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/signin" replace />

  return <>{children}</>
}
