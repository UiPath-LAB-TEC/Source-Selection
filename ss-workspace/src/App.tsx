import { useEffect, useLayoutEffect, useState } from 'react'
import { Outlet, RouterProvider, createHashRouter, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Alert, AlertDescription } from '@uipath/apollo-wind/components/ui/alert'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@uipath/apollo-wind/components/ui/sheet'
import { Spinner } from '@uipath/apollo-wind/components/ui/spinner'
import { Toaster } from '@uipath/apollo-wind/components/ui/sonner'
import { useTerms } from '@forms/lib/terms'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { PersonaProvider } from './hooks/usePersona'
import { FrameworkProvider } from './hooks/useFramework'
import { Sidebar } from './components/Sidebar'
import { LoginScreen } from './components/LoginScreen'
import { DataProvider, useData } from './lib/data'
import { Workspace } from './pages/Workspace'
import { Evaluations } from './pages/Evaluations'
import { NewEvaluation } from './pages/NewEvaluation'
import { Solicitation } from './pages/Solicitation'
import { Trace } from './pages/Trace'
import { MyTasks } from './pages/MyTasks'

/** Each page opens at the top: the window is the scroller, so it would otherwise keep the previous page's position. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function Shell() {
  const { data, error } = useData()
  const t = useTerms()
  const { logout: onSignOut } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-background/80 backdrop-blur lg:block">
        <Sidebar onSignOut={onSignOut} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
        <span className="font-semibold">{t.sled ? 'RFP Evaluation' : 'Source Selection'}</span>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar onSignOut={onSignOut} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="ss-backdrop min-h-screen lg:pl-72">
        <main className="mx-auto max-w-[1680px] px-4 py-6 md:px-8 2xl:px-10">
          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
          {!data ? (
            <div className="flex h-[60vh] items-center justify-center"><Spinner label={`Loading ${t.process}s…`} showLabel /></div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      <Toaster />
    </div>
  )
}

// A data router (not <HashRouter>) so a page can hold navigation, e.g. the new-evaluation wizard asking to save a draft.
const router = createHashRouter([{
  element: <><ScrollToTop /><Shell /></>,
  children: [
    { path: '/', element: <Workspace /> },
    { path: '/evaluations', element: <Evaluations /> },
    { path: '/new', element: <NewEvaluation /> },
    { path: '/tasks', element: <MyTasks /> },
    { path: '/s/:id', element: <Solicitation /> },
    { path: '/s/:id/trace/:offerorId/:factorId', element: <Trace /> },
  ],
}])

/** After the UiPath redirect, the sign-in screen stays over the workspace until its data has loaded, then fades away. */
function SignInCurtain({ onDone }: { onDone: () => void }) {
  const { data, error } = useData()
  const ready = !!data || !!error
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(onDone, 500)
    return () => clearTimeout(t)
  }, [ready, onDone])
  return (
    <div aria-hidden={ready} className={`fixed inset-0 z-50 overflow-auto transition-opacity duration-500 ease-out ${ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <LoginScreen onLogin={() => undefined} error={null} busy still status="Loading your workspace…" />
    </div>
  )
}

function AppContent() {
  const { isAuthenticated, isLoading, signingIn, login, error, sdk } = useAuth()
  // Back from the UiPath redirect: one continuous sign-in screen until the workspace is ready (see SignInCurtain).
  const [curtain, setCurtain] = useState(() => sdk.isInOAuthCallback())
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
    return (
      <DataProvider sdk={sdk} preview>
        <FrameworkProvider><PersonaProvider><RouterProvider router={router} /></PersonaProvider></FrameworkProvider>
      </DataProvider>
    )
  }
  // During sign-in (redirecting out, or completing the callback on return) the sign-in page stays up, busy,
  // so the OAuth round trip reads as one continuous step rather than page → spinner → page → spinner → app.
  if (isLoading && !signingIn) return <div className="flex h-screen items-center justify-center"><Spinner label="Loading…" showLabel /></div>
  // Dev-only: ?login previews the sign-in screen without signing out.
  const previewLogin = import.meta.env.DEV && new URLSearchParams(window.location.search).has('login')
  if (!isAuthenticated || previewLogin || signingIn) return <FrameworkProvider><LoginScreen onLogin={login} error={error} busy={signingIn && !previewLogin} still={curtain} /></FrameworkProvider>
  return (
    <DataProvider sdk={sdk}>
      <FrameworkProvider>
        <PersonaProvider>
          <RouterProvider router={router} />
          {curtain && <SignInCurtain onDone={() => setCurtain(false)} />}
        </PersonaProvider>
      </FrameworkProvider>
    </DataProvider>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
