(function () {
  let cachedUser = null;
  let bootstrapUnsubscribed = false;

  function getAuth() {
    if (window.firebase && typeof window.firebase.auth === 'function') {
      return window.firebase.auth();
    }
    return null;
  }

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
    } catch (error) {
      console.error("Failed to parse stored auth user", error);
      return null;
    }
  }

  function persistCachedUser(user) {
    const nextUser = toUserSnapshot(user);
    const previousUid = cachedUser?.uid || "";
    cachedUser = nextUser;
    try {
      if (cachedUser) {
        if (previousUid && previousUid !== cachedUser.uid) {
          localStorage.removeItem("userRole");
        }
        localStorage.setItem("currentUser", JSON.stringify(cachedUser));
      } else {
        localStorage.removeItem("currentUser");
        localStorage.removeItem("userRole");
      }
    } catch (error) {
      console.error("Failed to persist auth user cache", error);
    }
  }

  function ensureBootstrapListener() {
    if (bootstrapUnsubscribed) return;

    const auth = getAuth();
    if (!auth) return;

    bootstrapUnsubscribed = true;
    auth.onAuthStateChanged(
      (user) => persistCachedUser(user),
      (error) => {
        console.error("Auth bootstrap listener failed", error);
      }
    );
  }

  function isConfigured() {
    const configured = Boolean(getAuth());
    if (configured) {
      ensureBootstrapListener();
    }
    return configured;
  }

  function signIn(email, password) {
    console.log('authService.signIn', { email });
    const auth = getAuth();
    if (!auth) return Promise.reject(new Error('Auth not initialized'));
    ensureBootstrapListener();
    return auth.signInWithEmailAndPassword(email, password).then((credential) => {
      persistCachedUser(credential?.user || null);
      return credential;
    });
  }

  function signUp(email, password) {
    console.log('authService.signUp', { email });
    const auth = getAuth();
    if (!auth) return Promise.reject(new Error('Auth not initialized'));
    ensureBootstrapListener();
    return auth.createUserWithEmailAndPassword(email, password).then((credential) => {
      persistCachedUser(credential?.user || null);
      return credential;
    });
  }

  function signOut() {
    const auth = getAuth();
    if (!auth) {
      persistCachedUser(null);
      return Promise.resolve();
    }
    return auth.signOut().finally(() => {
      persistCachedUser(null);
    });
  }

  function onAuthStateChanged(cb) {
    const auth = getAuth();
    if (!auth || typeof cb !== 'function') return () => {};
    ensureBootstrapListener();
    return auth.onAuthStateChanged(
      (user) => {
        persistCachedUser(user);
        cb(toUserSnapshot(user));
      },
      (error) => {
        console.error("Auth state listener failed", error);
        cb(getCurrentUser());
      }
    );
  }

  function waitForAuthState(timeoutMs) {
    const auth = getAuth();
    if (!auth) return Promise.resolve(null);

    ensureBootstrapListener();

    const immediate = getCurrentUser();
    if (immediate?.uid) {
      return Promise.resolve(immediate);
    }

    const existing = auth.currentUser;
    if (existing?.uid) {
      const snapshot = toUserSnapshot(existing);
      cachedUser = snapshot;
      return Promise.resolve(snapshot);
    }

    const safeTimeout = Math.max(1, Number(timeoutMs) || 5000);
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      let unsubscribe = () => {};
      const finish = (user) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try { unsubscribe(); } catch {}
        resolve(user || null);
      };

      unsubscribe = auth.onAuthStateChanged(
        (user) => finish(toUserSnapshot(user)),
        () => finish(getCurrentUser())
      );

      timer = setTimeout(() => finish(getCurrentUser()), safeTimeout);
    });
  }

  function getCurrentUser() {
    const auth = getAuth();
    if (auth?.currentUser?.uid) {
      const snapshot = toUserSnapshot(auth.currentUser);
      cachedUser = snapshot;
      return snapshot;
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

  window.authService = {
    isConfigured,
    signIn,
    signUp,
    signOut,
    onAuthStateChanged,
    waitForAuthState,
    getCurrentUser
  };
})();
