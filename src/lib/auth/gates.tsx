import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { authEnabled } from "./client";
import { clearLocalSession, signInWithCredentials } from "./local-credentials";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

/** Where `RedirectToSignIn` sends signed-out visitors. */
export const SIGN_IN_PATH = "/login";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function SignInGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const state = resolveSignInGateState({ isPending, hasUser: user !== null });
  if (state === "pending") return null;
  if (state === "signed_in") return <>{children}</>;
  return <>{fallback ?? <CredentialSignIn />}</>;
}

/** User ID + password form (legacy; not used when enterprise OAuth is the gate). */
export function CredentialSignIn() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      signInWithCredentials(userId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-credentials" onSubmit={onSubmit}>
      <label className="auth-field">
        <span>User ID</span>
        <input
          type="text"
          name="userId"
          autoComplete="username"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" className="auth-submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** @deprecated Prefer CredentialSignIn — kept as alias for existing imports. */
export function SignInButtons() {
  return <CredentialSignIn />;
}

export function UserButton() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (event.target instanceof Node && !el.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className="header-user-menu" ref={rootRef}>
      <button
        type="button"
        className={`header-user-avatar-btn${open ? " is-open" : ""}`}
        aria-label={`Account menu for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="header-user-avatar" aria-hidden="true">
          {initial}
        </span>
      </button>

      {open ? (
        <div className="header-user-dropdown" role="menu" aria-label="Account">
          <div className="header-user-dropdown-head">
            <span className="header-user-avatar header-user-avatar--lg" aria-hidden="true">
              {initial}
            </span>
            <div className="header-user-dropdown-meta">
              <span className="header-user-dropdown-name">{label}</span>
              <span className="header-user-dropdown-role">Signed in</span>
            </div>
          </div>
          {authEnabled ? (
            <div className="header-user-dropdown-actions">
              <button
                type="button"
                className="header-user-dropdown-item"
                role="menuitem"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  clearLocalSession();
                  // Also end ArcGIS Enterprise / portal OAuth session when present.
                  void (async () => {
                    try {
                      const IdentityManager = (
                        await import("@arcgis/core/identity/IdentityManager.js")
                      ).default as { destroyCredentials?: () => void };
                      IdentityManager.destroyCredentials?.();
                    } catch {
                      /* optional — portal modules may not be loaded yet */
                    }
                    setSigningOut(false);
                    setOpen(false);
                    if (typeof window !== "undefined") {
                      window.location.reload();
                    }
                  })();
                }}
              >
                <calcite-icon icon="sign-out" scale="s" />
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
