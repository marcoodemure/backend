(function () {
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error(`Failed to parse localStorage key: ${key}`, error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getAuthInstance() {
    if (window.firebaseAuth) {
      return window.firebaseAuth;
    }

    if (window.firebase && typeof window.firebase.auth === "function") {
      return window.firebase.auth();
    }

    return null;
  }

  function getAuthService() {
    if (window.authService && typeof window.authService === "object") {
      return window.authService;
    }
    return null;
  }

  function getCurrentUser() {
    const service = getAuthService();
    if (service && typeof service.getCurrentUser === "function") {
      const user = service.getCurrentUser();
      if (user?.uid) {
        return user;
      }
    }
    return readJson("currentUser", null);
  }

  function setCurrentUser(user) {
    if (!user) {
      localStorage.removeItem("currentUser");
      return null;
    }

    writeJson("currentUser", user);
    return user;
  }

  function updateCurrentUser(patch) {
    const current = getCurrentUser();
    if (!current) {
      return null;
    }

    const next = { ...current, ...patch };
    setCurrentUser(next);

    const users = readJson("users", []);
    const index = users.findIndex((item) => item.email === next.email);
    if (index >= 0) {
      users[index] = { ...users[index], ...patch };
      writeJson("users", users);
    }

    return next;
  }

  function upsertLocalUser(authUser) {
    if (!authUser || !authUser.email) {
      return null;
    }

    const users = readJson("users", []);
    const index = users.findIndex((item) => item.email === authUser.email);

    let localUser;
    if (index === -1) {
      localUser = {
        uid: authUser.uid,
        email: authUser.email,
        role: "customer",
        orders: []
      };
      users.push(localUser);
    } else {
      localUser = users[index];
      localUser.uid = authUser.uid;
      localUser.email = authUser.email;
      localUser.role = typeof localUser.role === "string" ? localUser.role : "customer";
      localUser.orders = Array.isArray(localUser.orders) ? localUser.orders : [];
      users[index] = localUser;
    }

    writeJson("users", users);
    setCurrentUser(localUser);
    return localUser;
  }

  function clearCurrentUser() {
    localStorage.removeItem("currentUser");
  }

  function isConfigured() {
    const service = getAuthService();
    if (service && typeof service.isConfigured === "function") {
      return Boolean(service.isConfigured());
    }
    return Boolean(window.firebaseReady && getAuthInstance());
  }

  async function ensureReady() {
    const service = getAuthService();
    if (service && typeof service.ensureReady === "function") {
      await service.ensureReady();
    }
  }

  async function syncCurrentUser() {
    const service = getAuthService();
    if (service && typeof service.waitForAuthState === "function") {
      const user = await service.waitForAuthState(5000);
      if (user) {
        return upsertLocalUser(user);
      }
      clearCurrentUser();
      return null;
    }

    const auth = getAuthInstance();

    if (!auth) {
      return getCurrentUser();
    }

    return new Promise((resolve) => {
      let unsubscribe = () => {};
      let completed = false;
      let timeoutId = null;

      const finish = (value) => {
        if (completed) {
          return;
        }
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
        resolve(value);
      };

      // Set a timeout to prevent hanging indefinitely
      timeoutId = setTimeout(() => {
        console.warn("Auth state sync timed out after 5 seconds, using cached user");
        finish(getCurrentUser());
      }, 5000);

      unsubscribe = auth.onAuthStateChanged(
        (authUser) => {
          if (authUser) {
            finish(upsertLocalUser(authUser));
          } else {
            clearCurrentUser();
            finish(null);
          }
        },
        (error) => {
          console.error("Failed to sync auth state", error);
          finish(getCurrentUser());
        }
      );
    });
  }

  async function signOut() {
    const service = getAuthService();
    if (service && typeof service.signOut === "function") {
      await service.signOut();
      clearCurrentUser();
      return;
    }

    const auth = getAuthInstance();

    if (auth) {
      await auth.signOut();
    }

    clearCurrentUser();
  }

  window.appAuth = {
    readJson,
    getCurrentUser,
    setCurrentUser,
    updateCurrentUser,
    upsertLocalUser,
    syncCurrentUser,
    ensureReady,
    signOut,
    isConfigured,
    getAuthInstance
  };
})();
