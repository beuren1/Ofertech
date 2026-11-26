import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const localApiHost = globalThis.location?.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost'
const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : `http://${localApiHost}:8000/api`)).replace(/\/+$/, '')

export type AuthUser = {
  id: number
  username: string
  email: string
  name: string
  commercial_admin?: boolean
  profile: {
    company: string
    phone: string
    plan: string
    plan_name?: string
    dark_mode: boolean
  }
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function canRetryApiRequest(reason: unknown) {
  return reason instanceof TypeError || reason instanceof SyntaxError
    || (reason instanceof ApiError && (reason.status === 0 || (reason.status >= 200 && reason.status < 300)))
}

function errorMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const values = Object.values(payload).flatMap(value =>
      Array.isArray(value) ? value : [value],
    )
    const messages = values.filter((value): value is string => typeof value === 'string')
    if (messages.length) return messages.join(' ')
  }
  return 'Não foi possível concluir a solicitação. Tente novamente.'
}

async function fetchApi(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/${path}`, init)
  } catch {
    throw new ApiError('Não foi possível conectar à Ofertech. Verifique sua conexão e tente novamente.', 0)
  }
  if (response.status >= 500) {
    throw new ApiError('O servidor da Ofertech está indisponível no momento. Tente novamente em instantes.', response.status)
  }
  if (path === 'auth/login/' && response.status === 401) {
    throw new ApiError('E-mail ou senha inválidos.', 401)
  }
  return response
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const isUpload = options.body instanceof FormData
  const response = await fetchApi(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(options.body === undefined || isUpload ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: isUpload ? options.body as FormData : JSON.stringify(options.body) }),
  })

  if (response.status === 204 || response.status === 205) return undefined as T
  const payload: unknown = await response.json().catch((reason: unknown) => {
    if (!(reason instanceof SyntaxError)) throw reason
    throw new ApiError(`O servidor respondeu em um formato inesperado (HTTP ${response.status}). Tente novamente em instantes.`, response.status)
  })
  if (!response.ok) throw new ApiError(errorMessage(payload), response.status)
  return payload as T
}

export async function apiUpload<T>(
  path: string,
  file: File,
  accessToken: string,
): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<T>(path, {
    method: 'POST',
    accessToken,
    body: form,
  })
}

export async function apiBlobRequest(path: string, accessToken: string): Promise<Blob> {
  const response = await fetchApi(path, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    throw new ApiError(errorMessage(payload), response.status)
  }
  return response.blob()
}

type AuthContextValue = {
  user: AuthUser | null
  accessToken: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearSession: () => void
  syncPlan: (plan: { code: string; name: string }, token: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sessionRevision = useRef(0)
  const sessionToken = useRef<string | null>(null)
  const syncPlan = useCallback(({ code, name }: { code: string; name: string }, token: string) => {
    setUser(current => current && sessionToken.current === token && (current.profile.plan !== code || current.profile.plan_name !== name)
      ? { ...current, profile: { ...current.profile, plan: code, plan_name: name } }
      : current)
  }, [])

  useEffect(() => {
    let active = true
    const revision = sessionRevision.current
    const restoreSession = async () => {
      try {
        const tokens = await apiRequest<{ access: string }>('auth/refresh/', { method: 'POST' })
        const currentUser = await apiRequest<AuthUser>('auth/me/', { accessToken: tokens.access })
        if (active && revision === sessionRevision.current) {
          sessionToken.current = tokens.access
          setAccessToken(tokens.access)
          setUser(currentUser)
        }
      } catch (reason) {
        if (active && revision === sessionRevision.current && (!(reason instanceof ApiError) || reason.status !== 401)) {
          setError(reason instanceof Error ? reason.message : 'Erro ao restaurar a sessão.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  const clearSession = () => {
    sessionRevision.current += 1
    sessionToken.current = null
    setAccessToken(null)
    setUser(null)
  }

  const establishSession = async (access: string) => {
    const currentUser = await apiRequest<AuthUser>('auth/me/', { accessToken: access })
    sessionToken.current = access
    setAccessToken(access)
    setUser(currentUser)
  }

  const authenticate = async (email: string, password: string) => {
    setError(null)
    const tokens = await apiRequest<{ access: string }>('auth/login/', {
      method: 'POST',
      body: { username: email.trim().toLowerCase(), password },
    })
    await establishSession(tokens.access)
  }

  const login = async (email: string, password: string) => {
    await authenticate(email, password)
  }

  const register = async (name: string, email: string, password: string) => {
    setError(null)
    const tokens = await apiRequest<{ access: string }>('auth/register/', {
      method: 'POST',
      body: { name, email, password },
    })
    await establishSession(tokens.access)
  }

  const logout = async () => {
    setError(null)
    try {
      await apiRequest('auth/logout/', { method: 'POST' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível encerrar a sessão.')
    } finally {
      clearSession()
    }
  }

  const value = { user, accessToken, loading, error, login, register, logout, clearSession, syncPlan }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return context
}

export function getErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Não foi possível concluir a solicitação.'
}
