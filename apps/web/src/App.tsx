import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { LaunchInstructionsPage } from '@/features/auth/launch-instructions-page'
import { EditorWorkspacePage } from '@/features/editor-workspace/EditorWorkspacePage'
import { AppShell } from '@/components/app-shell'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import axios from 'axios'

function extractJwtFromUnknown(value: unknown): string | null {
  const isProbablyJwt = (candidate: string): boolean =>
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed && isProbablyJwt(trimmed) ? trimmed : null
  }

  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const candidate =
    record.jwt ??
    record.JWT ??
    record.token ??
    record.access_token ??
    record.accessToken ??
    record.ssoToken ??
    record.sso_token

  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed && isProbablyJwt(trimmed) ? trimmed : null
}

function App() {
  const { isAuthenticated, setAuth, logout } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLaunchHelp, setShowLaunchHelp] = useState(false)
  const isEmbedded = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.self !== window.top
    } catch {
      return true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let attempt = 0
    const maxAttempts = 6

    const checkAuth = async (): Promise<void> => {
      try {
        const response = await axios.get('/api/auth/me')
        if (cancelled) return
        setAuth(response.data.user, response.data.tenant)
      } catch (err) {
        if (cancelled) return
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 401) {
            logout()
            if (isEmbedded && attempt < maxAttempts) {
              attempt += 1
              const delayMs = Math.min(1000 * attempt, 5000)
              window.setTimeout(() => {
                void checkAuth()
              }, delayMs)
              return
            }
            setShowLaunchHelp(true)
            return
          }
          setError(err.message || 'Failed to connect to backend')
          return
        }
        setError('Failed to connect to backend')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    checkAuth()
    return () => {
      cancelled = true
    }
  }, [setAuth, logout, isEmbedded])

  useEffect(() => {
    if (!isEmbedded || isAuthenticated) return

    let cancelled = false
    let loginInFlight = false

    const tryJwtLogin = async (jwt: string): Promise<void> => {
      if (cancelled || loginInFlight) return
      loginInFlight = true
      try {
        await axios.post(
          '/api/auth/login',
          { jwt },
          { headers: { Accept: 'application/json' } }
        )
        if (cancelled) return
        const response = await axios.get('/api/auth/me')
        if (cancelled) return
        setAuth(response.data.user, response.data.tenant)
      } catch {
        // Intentionally ignore; backend will reject invalid/expired JWTs.
      } finally {
        loginInFlight = false
      }
    }

    const handleMessage = (event: MessageEvent): void => {
      if (cancelled) return
      const jwt = extractJwtFromUnknown(event.data)
      if (!jwt) return
      void tryJwtLogin(jwt)
    }

    const jwtFromQuery =
      typeof window !== 'undefined'
        ? extractJwtFromUnknown(
            new URLSearchParams(window.location.search).get('jwt')
          )
        : null

    if (jwtFromQuery) {
      void tryJwtLogin(jwtFromQuery)
    }

    window.addEventListener('message', handleMessage)
    return () => {
      cancelled = true
      window.removeEventListener('message', handleMessage)
    }
  }, [isEmbedded, isAuthenticated, setAuth])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground animate-pulse">Initializing Query++...</p>
        </div>
      </div>
    )
  }

  if (error && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-destructive/5">
        <div className="p-8 max-w-md text-center space-y-4 border border-destructive/20 rounded-lg bg-background shadow-xl">
          <h2 className="text-xl font-bold text-destructive">Connection Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-xs">Please ensure the backend is running and reachable.</p>
          <Button onClick={() => window.location.reload()}>Retry Connection</Button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
        {isEmbedded ? (
          showLaunchHelp ? (
            <LaunchInstructionsPage />
          ) : (
            <div className="flex items-center justify-center min-h-screen bg-background">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <div>Authenticating with Marketing Cloud...</div>
                <Button variant="secondary" onClick={() => void window.location.reload()}>
                  Retry
                </Button>
                <Button variant="ghost" onClick={() => setShowLaunchHelp(true)}>
                  Launch Help
                </Button>
              </div>
            </div>
          )
        ) : (
          <LaunchInstructionsPage />
        )}
        <Toaster />
      </>
    )
  }

  return (
    <AppShell>
      <EditorWorkspacePage />
      <Toaster />
    </AppShell>
  )
}

export default App
