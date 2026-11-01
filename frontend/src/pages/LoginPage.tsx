import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { StatusToast } from '../components/Toast'
import { ThemeToggle } from '../theme'
import logo from '../assets/tazama-pipelines.png'
import './LoginPage.css'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState('it@tazama.co.tz')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      
      <div className="login-wash" aria-hidden>
        <svg className="login-wave login-wave-a" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0,192L48,170.7C96,149,192,107,288,112C384,117,480,171,576,186.7C672,203,768,181,864,154.7C960,128,1056,96,1152,101.3C1248,107,1344,149,1392,170.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>
        <svg className="login-wave login-wave-b" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0,256L60,245.3C120,235,240,213,360,202.7C480,192,600,192,720,208C840,224,960,256,1080,250.7C1200,245,1320,203,1380,181.3L1440,160L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
        </svg>
        <svg className="login-wave login-wave-c" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0,128L80,144C160,160,320,192,480,186.7C640,181,800,139,960,133.3C1120,128,1280,160,1360,176L1440,192L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z" />
        </svg>
      </div>
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-brand">
          <img className="login-logo" src={logo} alt="TAZAMA Pipelines" />
          <div className="login-brand-text">
            <h1>rDMS-HQ</h1>
            <p>Records & Document Management System</p>
          </div>
        </div>
        <p className="login-tagline muted">
          Secure registry for TAZAMA. Watermarks identify readers.
        </p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <StatusToast error={error} />
        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
