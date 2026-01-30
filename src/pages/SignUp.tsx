import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const { error } = await signUp(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-dark">
      <div className="w-full max-w-sm p-8 bg-surface border border-border rounded-lg">
        <h1 className="text-3xl font-bold text-accent mb-2 tracking-tight">ChompChange</h1>
        <p className="text-text-muted mb-6 text-sm">Create your account</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-surface-light border border-border rounded px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="bg-surface-light border border-border rounded px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="bg-surface-light border border-border rounded px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-bg-dark font-semibold py-2 rounded hover:bg-accent-dim transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-text-muted text-sm mt-4 text-center">
          Already have an account?{' '}
          <Link to="/signin" className="text-accent hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
