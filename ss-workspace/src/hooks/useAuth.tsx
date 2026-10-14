import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { UiPath, UiPathError } from '@uipath/uipath-typescript/core';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Sign-in in flight: redirecting to UiPath, or completing the OAuth callback on the way back. */
  signingIn: boolean;
  sdk: UiPath;
  login: () => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The SDK keeps the sign-in in this tab's sessionStorage (`uipath_sdk_user_token-<clientId>`): it survives a refresh
 * but not a new tab. A copy in localStorage (SHARED) lets a new tab pick it up; signing out removes it, which signs
 * every open tab out.
 */
const TOKEN_PREFIX = 'uipath_sdk_user_token';
const SHARED = 'ss.signin';

/**
 * Sign-in names the organization the way the platform's own apps do (acr_values=tenantName:<org>), so UiPath opens
 * uipathlabs' login page. The SDK sends no organization hint, and someone not already signed in to UiPath then lands
 * on an account with a pending invitation ("#219"); its enforceSso option sends a different hint that skips straight
 * to the organization's SSO. The SDK redirects by setting location.href, so the hint is added as that navigation
 * starts (Navigation API; a browser without it signs in as before).
 */
function hintOrganizationOnSignIn() {
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  const org = document.querySelector<HTMLMetaElement>('meta[name="uipath:org-name"]')?.content?.trim();
  if (!nav || !org) return;
  nav.addEventListener('navigate', (e) => {
    const event = e as Event & { destination: { url: string } };
    const url = new URL(event.destination.url);
    if (!url.pathname.endsWith('/identity_/connect/authorize') || url.searchParams.has('acr_values') || !event.cancelable) return;
    url.searchParams.set('acr_values', `tenantName:${org}`);
    event.preventDefault();
    window.location.href = url.toString();
  });
}
hintOrganizationOnSignIn();

const tabKeys = () => Object.keys(sessionStorage).filter((k) => k.startsWith(TOKEN_PREFIX));
const hasSavedSignIn = () => {
  try {
    return tabKeys().length > 0;
  } catch {
    return false;
  }
};
/** Copy this tab's sign-in for other tabs (also picks up the SDK's token refreshes). */
const shareSignIn = () => {
  try {
    const copy = Object.fromEntries(tabKeys().map((k) => [k, sessionStorage.getItem(k) ?? '']));
    if (Object.keys(copy).length) localStorage.setItem(SHARED, JSON.stringify(copy));
  } catch { /* storage unavailable: this tab still works on its own */ }
};
/** A new tab: take the sign-in another tab shared, so the SDK finds it as if it were this tab's own. */
const adoptSharedSignIn = () => {
  try {
    const raw = tabKeys().length ? null : localStorage.getItem(SHARED);
    if (!raw) return;
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) if (k.startsWith(TOKEN_PREFIX) && v) sessionStorage.setItem(k, v);
  } catch { /* unreadable copy: fall back to the sign-in screen */ }
};
const forgetSharedSignIn = () => {
  try {
    localStorage.removeItem(SHARED);
  } catch { /* nothing to remove */ }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `new UiPath()` reads clientId/orgName/tenantName/baseUrl/scope/redirectUri
  // from <meta name="uipath:*"> tags. The uipathCodedApps() Vite plugin
  // injects them locally from uipath.json; the platform injects them in prod.
  const [sdk] = useState<UiPath>(() => new UiPath());
  // True from the first render when returning from the UiPath redirect, so the sign-in page stays up (busy)
  // instead of flashing a spinner screen between the two halves of the OAuth round trip.
  const [signingIn, setSigningIn] = useState(() => sdk.isInOAuthCallback());
  const didInit = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode's double-invocation in dev.
    // OAuth authorization codes are single-use — calling completeOAuth()
    // twice would fail the second time with "Authentication failed".
    if (didInit.current) return;
    didInit.current = true;

    const initializeAuth = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (sdk.isInOAuthCallback()) {
          await sdk.completeOAuth();
          // Strip OAuth params from the URL so a refresh doesn't try to
          // re-consume the (now-invalid) code.
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (!sdk.isAuthenticated() && (adoptSharedSignIn(), hasSavedSignIn())) {
          // A refresh: the saved sign-in is only loaded by initialize(). Without one, stay on the sign-in screen
          // rather than redirecting; if the saved token has expired, initialize() renews it through UiPath.
          await sdk.initialize();
        }
        setIsAuthenticated(sdk.isAuthenticated());
        if (sdk.isAuthenticated()) shareSignIn();
      } catch (err) {
        console.error('Authentication failed:', err);
        setError(err instanceof UiPathError ? err.message : 'Authentication failed');
      } finally {
        setIsLoading(false);
        setSigningIn(false);
      }
    };
    initializeAuth();
  }, [sdk]);

  // Keep the sign-in page on screen while the browser leaves for UiPath: no global loading state, and no
  // reset on success (the page is navigating away). Reset only on error, or if the redirect never happens.
  const login = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await sdk.initialize();
      if (sdk.isAuthenticated()) {
        shareSignIn();
        setIsAuthenticated(true);
        setSigningIn(false);
      } else {
        setTimeout(() => setSigningIn(false), 15000);
      }
    } catch (err) {
      setError(err instanceof UiPathError ? err.message : 'Login failed');
      setSigningIn(false);
    }
  };

  const logout = () => {
    forgetSharedSignIn();
    sdk.logout();
    setIsAuthenticated(false);
    setError(null);
  };

  // While signed in, keep the shared copy current (the SDK refreshes its token in this tab), and follow a sign-out
  // made in any other tab.
  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setInterval(shareSignIn, 60_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHARED && e.newValue === null) {
        sdk.logout();
        setIsAuthenticated(false);
      }
    };
    window.addEventListener('pagehide', shareSignIn);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', shareSignIn);
      window.removeEventListener('storage', onStorage);
    };
  }, [isAuthenticated, sdk]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, signingIn, sdk, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
