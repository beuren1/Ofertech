import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { DashboardLayout, editorLinks } from './components/Layout'
import { CreationLoginContext } from './creationLogin'
import { AuthProvider, useAuth } from './auth'
import { LandingPage } from './pages/Landing'
import { AuthPage } from './pages/Auth'
import { DashboardPage } from './pages/Dashboard'
import { TemplatesPage } from './pages/Templates'
import { HistoryPage } from './pages/History'
import { PlansPage } from './pages/Plans'
import { SettingsPage } from './pages/Settings'
import { StorePage } from './pages/Store'
import { BrandFooter } from './components/Brand'
import { PageMetadata } from './components/PageMetadata'
const GeneratorPage = lazy(() => import('./pages/Generator').then(module => ({ default: module.GeneratorPage })))
const BulkPage = lazy(() => import('./pages/Bulk').then(module => ({ default: module.BulkPage })))
const FlyerPageEditor = lazy(() => import('./pages/Flyer').then(module => ({ default: module.FlyerPageEditor })))
const CommercialDashboard = lazy(() => import('./pages/CommercialDashboard').then(module => ({ default: module.CommercialDashboard })))
const ForgotPasswordPage = lazy(() => import('./pages/PasswordReset').then(module => ({ default: module.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/PasswordReset').then(module => ({ default: module.ResetPasswordPage })))

function withLayout(page: ReactNode) {
  return <DashboardLayout><Suspense fallback={<LoadingPage />}>{page}</Suspense></DashboardLayout>
}

function LoadingPage() {
  return <p role="status" className="p-8">Carregando…</p>
}

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-slate-500">Carregando...</div>
  return user ? <Outlet /> : <Navigate to="/login" replace />
}

function PlansRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-slate-500">Carregando...</div>
  return user ? withLayout(<PlansPage />) : (
    <div className="min-h-screen bg-slate-50">
      <main className="p-6 sm:p-10"><PlansPage /></main>
      <BrandFooter className="mx-auto max-w-7xl border-t border-slate-200 px-6 py-6 text-slate-600" />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const editorLocation = location.state?.editorLocation as Location | undefined
  const resumeEditor = (location.pathname === '/login' || location.pathname === '/register')
    && editorLinks.some(link => link.to === editorLocation?.pathname) ? editorLocation : undefined
  const { search } = resumeEditor ?? location

  return (
    <AuthProvider>
      <PageMetadata />
      <CreationLoginContext.Provider value={() => navigate('/login', { state: { editorLocation: location } })}>
        {/* Keep the editor mounted so the draft and uploaded photos survive sign-in. */}
        <div hidden={Boolean(resumeEditor)}>
          <Routes location={resumeEditor ?? location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/forgot-password" element={<Suspense fallback={<p role="status" className="p-8">Carregando…</p>}><ForgotPasswordPage /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<p role="status" className="p-8">Carregando…</p>}><ResetPasswordPage /></Suspense>} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/plans" element={<PlansRoute />} />
            <Route path="/generator" element={withLayout(<GeneratorPage />)} />
            <Route path="/bulk" element={withLayout(<BulkPage />)} />
            <Route path="/flyers" element={withLayout(<FlyerPageEditor key={`flyers${search}`} initialSearch={search} />)} />
            <Route path="/print" element={withLayout(<FlyerPageEditor key={`print${search}`} initialSearch={search} printMode />)} />
            <Route path="/videos" element={withLayout(<FlyerPageEditor key={`video${search}`} initialSearch={search} videoMode />)} />
            <Route path="/templates" element={withLayout(<TemplatesPage />)} />
            <Route element={<RequireAuth />}>
              <Route path="/admin-dashboard" element={<Suspense fallback={<LoadingPage />}><CommercialDashboard /></Suspense>} />
              <Route path="/dashboard" element={withLayout(<DashboardPage />)} />
              <Route path="/history" element={withLayout(<HistoryPage />)} />
              <Route path="/settings" element={withLayout(<SettingsPage />)} />
              <Route path="/store" element={withLayout(<StorePage />)} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {resumeEditor && <AuthPage mode={location.pathname === '/register' ? 'register' : 'login'} editorLocation={resumeEditor} />}
      </CreationLoginContext.Provider>
    </AuthProvider>
  )
}
