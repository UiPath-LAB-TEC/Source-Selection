import { useEffect, useLayoutEffect, useState } from 'react'
import { Outlet, RouterProvider, createHashRouter, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Alert, AlertDescription } from '@uipath/apollo-wind/components/ui/alert'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@uipath/apollo-wind/components/ui/sheet'
import { Spinner } from '@uipath/apollo-wind/components/ui/spinner'
import { Toaster } from '@uipath/apollo-wind/components/ui/sonner'
import { AuthProvider, useAuth } from '@ss/hooks/useAuth'
import { FrameworkProvider } from '@ss/hooks/useFramework'
import { ReqPersonaProvider } from './hooks/usePersona'
import { Sidebar } from './components/Sidebar'
import { LoginScreen } from './components/LoginScreen'
import { RequirementsDataProvider, useRequirementsData } from './lib/data'
import { Builder } from './pages/Builder'
import { Home } from './pages/Home'
import { Requirement } from './pages/Requirement'
import { Requirements } from './pages/Requirements'
import { Settings } from './pages/Settings'

/** Each page opens at the top: the window is the scroller, so it would otherwise keep the previous page's position. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

/** The same frame as the other apps: sidebar on wide screens, a sheet on narrow ones. */
function Shell() {
  const { data, error } = useRequirementsData()
  const { logout: onSignOut } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-background/80 backdrop-blur lg:block">
        <Sidebar onSignOut={onSignOut} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
        <span className="font-semibold">Requirements</span>
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
          {!data ? <div className="flex h-[60vh] items-center justify-center"><Spinner label="Loading requirements…" showLabel /></div> : <Outlet />}
        </main>
      </div>
      <Toaster />
    </div>
  )
}

const router = createHashRouter([{
  element: <><ScrollToTop /><Shell /></>,
  children: [
    { path: '/', element: <Home /> },
    { path: '/requirements', element: <Requirements /> },
    { path: '/new', element: <Builder /> },
    { path: '/r/:id', element: <Requirement /> },
    { path: '/r/:id/build', element: <Builder /> },
    { path: '/settings', element: <Settings /> },
  ],
}])

/** After the UiPath redirect, the sign-in screen stays up until the requirements have loaded, then fades away. */
function SignInCurtain({ onDone }: { onDone: () => void }) {
  const { data, error } = useRequirementsData()
  const ready = !!data || !!error
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(onDone, 500)
    return () => clearTimeout(t)
  }, [ready, onDone])
  return (
    <div aria-hidden={ready} className={`fixed inset-0 z-50 overflow-auto transition-opacity duration-500 ease-out ${ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <LoginScreen onLogin={() => undefined} error={null} busy still status="Loading requirements…" />
    </div>
  )
}

function AppContent() {
  const { isAuthenticated, isLoading, signingIn, login, error, sdk } = useAuth()
  const [curtain, setCurtain] = useState(() => sdk.isInOAuthCallback())
  // Dev-only: ?preview renders on a snapshot, without signing in; the agents answer from canned results.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
    return (
      <RequirementsDataProvider sdk={sdk} preview>
        <FrameworkProvider><ReqPersonaProvider><RouterProvider router={router} /></ReqPersonaProvider></FrameworkProvider>
      </RequirementsDataProvider>
    )
  }
  if (isLoading && !signingIn) return <div className="flex h-screen items-center justify-center"><Spinner label="Loading…" showLabel /></div>
  const previewLogin = import.meta.env.DEV && new URLSearchParams(window.location.search).has('login')
  if (!isAuthenticated || previewLogin || signingIn) return <FrameworkProvider><LoginScreen onLogin={login} error={error} busy={signingIn && !previewLogin} still={curtain} /></FrameworkProvider>
  return (
    <RequirementsDataProvider sdk={sdk}>
      <FrameworkProvider>
        <ReqPersonaProvider>
          <RouterProvider router={router} />
          {curtain && <SignInCurtain onDone={() => setCurtain(false)} />}
        </ReqPersonaProvider>
      </FrameworkProvider>
    </RequirementsDataProvider>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
