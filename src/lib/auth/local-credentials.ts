/**
 * Simple app-level credentials gate (User ID + password).
 * Session is stored in sessionStorage for the browser tab lifetime.
 */

const SESSION_KEY = "insight-hub.local-session";

/** Allowed operators (client-side gate for this dashboard). */
const CREDENTIALS: ReadonlyArray<{ userId: string; password: string; displayName: string }> = [
  { userId: "esri", password: "esri", displayName: "Esri" },
];

export type LocalSession = {
  userId: string;
  displayName: string;
  signedInAt: number;
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to local session changes (for React). */
export function subscribeLocalSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function readLocalSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSession;
    if (!parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/**
 * Validate user id + password. On success, persist session and return it.
 * Throws with a user-facing message on failure.
 */
export function signInWithCredentials(userId: string, password: string): LocalSession {
  const id = userId.trim();
  const pass = password;
  const match = CREDENTIALS.find(
    (c) => c.userId.toLowerCase() === id.toLowerCase() && c.password === pass,
  );
  if (!match) {
    throw new Error("Invalid user ID or password.");
  }
  const session: LocalSession = {
    userId: match.userId,
    displayName: match.displayName,
    signedInAt: Date.now(),
  };
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* private mode — still treat as signed in for this page load */
    }
  }
  notify();
  return session;
}
