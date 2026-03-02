/**
 * Enhanced Firebase Auth service that provides automatic persistence across
 * same-origin iframes.  This module sets LOCAL persistence whenever possible
 * and gracefully falls back to SESSION or NONE if the browser blocks storage
 * in embedded contexts (common in privacy-restricted browsers or when
 * embedded in Google Sites).  All pages on the same GitHub Pages domain can
 * include this file to share a single login session without any server-side
 * coordination.
 */
(function () {
  // Holds a minimal user snapshot (uid/email/role) for quick access.
  let cachedUser = null;
  // Guard to ensure we only attach the auth state listener once.
  let bootstrapAttached = false;
  // Promise that resolves when we've attempted to set auth persistence.
  let persistenceReady = null;

  /**
   * Returns the Firebase Auth instance if available.
   */
  function getAuth() {
    if (window.firebaseAuth) {
      // firebase-config.js exposes a cached instance on window.firebaseAuth.
      return window.firebaseAuth;
    }
    if (window.firebase && typeof window.firebase.auth === "function") {
      return window.firebase.auth();
    }
    return null;
  }

  /**
   * Normalize a Firebase user to a lightweight snapshot.  Returns null if the
   * argument is falsy or missing a uid.
   */
  function toUserSnapshot(user) {
    if (!user || !user.uid) {
      return null;
    }
    return {
      uid: user.uid,
      email: user.email || "",
      role: ""
    };
  }

  /**
   * Read a stored user snapshot from localStorage.  If storage is unavailable
   * (e.g. blocked in an iframe), this returns null silently.
   */
  function readStoredUser() {
    try {
      const raw = localStorage.getItem("currentUser");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.uid) return null;
      return {
        uid: parsed.uid,
        email: parsed.email || "",
        role: parsed.role || localStorage.getItem("userRole") || ""
      };
    } catch {
      // Ignore storage errors silently; persistence will still work while page is open.
      return null;
    }
  }

  /**
   * Persist the provided Firebase user snapshot to localStorage.  Clears the
   * stored value if user is falsy.  We catch and ignore any storage errors
   * because storage may be blocked in some iframe contexts.
   */
  function persistUserSnapshot(user) {
    const nextSnapshot = toUserSnapshot(user);
    const previousUid = cachedUser?.uid || "";
    cachedUser = nextSnapshot;
    try {
      if (nextSnapshot) {
        if (previousUid && previousUid !== nextSnapshot.uid) {
          // Remove stale role if we switched users.
          localStorage.removeItem("userRole");
        }
        localStorage.setItem("currentUser", JSON.stringify(nextSnapshot));
      } else {
        localStorage.removeItem("currentUser");
        localStorage.removeItem("userRole");
      }
    } catch {
      // silently ignore when storage is unavailable
    }
  }

  /**
   * Attach the auth state listener exactly once.  This keeps our cached user
   * snapshot in sync with Firebase Auth and persists it to localStorage.  We
   * call this in isConfigured and whenever we start the persistence init.
   */
  function ensureBootstrapListener() {
    if (bootstrapAttached) return;
    const auth = getAuth();
    if (!auth) return;
    bootstrapAttached = true;
    auth.onAuthStateChanged(
      (user) => {
        persistUserSnapshot(user);
      },
      (error) => {
        console.error("Auth bootstrap listener failed:", error);
      }
    );
  }

  /**
   * Attempt to set Firebase Auth persistence in order of preference:
   *   1. LOCAL – persists across tabs and reloads
   *   2. SESSION – persists for the life of the tab
   *   3. NONE – no persistence (fallback)
   * We memoize the resulting promise so multiple callers share the same
   * initialization.  Any errors thrown by setPersistence are swallowed and
   * logged, because some browsers reject storage attempts when embedded.
   */
  async function initPersistence() {
    const auth = getAuth();
    if (!auth || !window.firebase || !window.firebase.auth) {
      return "UNKNOWN";
    }

    if (persistenceReady) return persistenceReady;

    // Kick off early to attach the listener.
    ensureBootstrapListener();

    persistenceReady = (async () => {
      // Try LOCAL first
      try {
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
        console.log("[AuthService] Persistence set to LOCAL");
        return "LOCAL";
      } catch (e1) {
        console.warn("[AuthService] LOCAL persistence failed, falling back to SESSION:", e1?.message || e1);
      }

      // Then SESSION
      try {
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
        console.log("[AuthService] Persistence set to SESSION");
        return "SESSION";
      } catch (e2) {
        console.warn("[AuthService] SESSION persistence failed, falling back to NONE:", e2?.message || e2);
      }

      // Finally NONE
      try {
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.NONE);
        console.log("[AuthService] Persistence set to NONE");
        return "NONE";
      } catch (e3) {
        console.warn("[AuthService] Failed to set Auth persistence:", e3?.message || e3);
        return "UNKNOWN";
      }
    })();

    return persistenceReady;
  }

  /**
   * Determine whether Firebase Auth is available.  When it is, start
   * persistence initialization as soon as possible.
   */
  function isConfigured() {
    const ok = Boolean(getAuth());
    if (ok) {
      // Start the bootstrap listener and persistence initialization
      ensureBootstrapListener();
      // Fire-and-forget – avoid awaiting here to prevent blocking
      initPersistence().catch(() => {});
    }
    return ok;
  }

  /**
   * Ensure persistence has been initialized.  This is awaited in signIn/signUp
   * so that the persistence mode is set before authenticating.
   */
  async function ensureReady() {
    isConfigured();
    if (persistenceReady) {
      await persistenceReady;
    }
  }

  /**
   * Sign in with email and password.  Ensures persistence is initialized first.
   * Stores the user snapshot on success.
   */
  async function signIn(email, password) {
    const auth = getAuth();
    if (!auth) throw new Error("Auth not initialized");
    await ensureReady();
    const credential = await auth.signInWithEmailAndPassword(email, password);
    persistUserSnapshot(credential?.user || null);
    return credential;
  }

  /**
   * Create a new user with email and password.  Ensures persistence is
   * initialized first.  Stores the user snapshot on success.
   */
  async function signUp(email, password) {
    const auth = getAuth();
    if (!auth) throw new Error("Auth not initialized");
    await ensureReady();
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    persistUserSnapshot(credential?.user || null);
    return credential;
  }

  /**
   * Sign out of Firebase.  Clears the cached user snapshot and storage.  We do
   * not await persistence initialization here since signOut() works without it.
   */
  async function signOut() {
    const auth = getAuth();
    if (auth) {
      try {
        await auth.signOut();
      } catch (error) {
        console.error("Failed to sign out:", error);
      }
    }
    persistUserSnapshot(null);
  }

  /**
   * Subscribe to auth state changes.  The callback receives a lightweight
   * snapshot (uid/email/role).  The returned function can be called to
   * unsubscribe.  Persistence initialization is started but not awaited.
   */
  function onAuthStateChanged(cb) {
    const auth = getAuth();
    if (!auth || typeof cb !== "function") {
      return () => {};
    }
    // Ensure listener and persistence are started.
    ensureBootstrapListener();
    initPersistence().catch(() => {});
    return auth.onAuthStateChanged(
      (user) => {
        persistUserSnapshot(user);
        cb(toUserSnapshot(user));
      },
      (error) => {
        console.error("Auth state listener failed:", error);
        cb(toUserSnapshot(auth.currentUser));
      }
    );
  }

  /**
   * Wait for the current auth state.  Resolves with a lightweight snapshot of
   * the current user or null if not signed in.  Times out after the provided
   * duration in milliseconds (default 5000).
   */
  async function waitForAuthState(timeoutMs) {
    const auth = getAuth();
    if (!auth) return null;
    await ensureReady();
    // If user is already available, return immediately.
    if (auth.currentUser?.uid) {
      const snap = toUserSnapshot(auth.currentUser);
      cachedUser = snap;
      return snap;
    }
    const ms = Math.max(1, Number(timeoutMs) || 5000);
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      let unsubscribe = () => {};
      const finish = (user) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          unsubscribe();
        } catch {}
        resolve(user || null);
      };
      unsubscribe = auth.onAuthStateChanged(
        (user) => finish(toUserSnapshot(user)),
        () => finish(toUserSnapshot(auth.currentUser))
      );
      timer = setTimeout(() => {
        finish(toUserSnapshot(auth.currentUser) || readStoredUser());
      }, ms);
    });
  }

  /**
   * Synchronously get the current user snapshot.  It prefers the live
   * firebaseAuth.currentUser, then our cached value, then the stored user in
   * localStorage.  Does not trigger persistence initialization.
   */
  function getCurrentUser() {
    const auth = getAuth();
    if (auth?.currentUser?.uid) {
      const snap = toUserSnapshot(auth.currentUser);
      cachedUser = snap;
      return snap;
    }
    if (cachedUser?.uid) {
      return cachedUser;
    }
    const stored = readStoredUser();
    if (stored?.uid) {
      cachedUser = stored;
      return stored;
    }
    return null;
  }

  // Immediately initialize if Firebase is ready.
  isConfigured();

  // Expose the API on the global window for ease of use in inline scripts.
  window.authService = {
    isConfigured,
    ensureReady,
    signIn,
    signUp,
    signOut,
    onAuthStateChanged,
    waitForAuthState,
    getCurrentUser
  };
})();