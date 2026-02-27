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

  function getCurrentUser() {
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
    return Boolean(window.firebaseReady && getAuthInstance());
  }

  async function syncCurrentUser() {
    const auth = getAuthInstance();

    if (!auth) {
      return getCurrentUser();
    }

    return new Promise((resolve) => {
      let unsubscribe = () => {};
      let completed = false;

      const finish = (value) => {
        if (completed) {
          return;
        }
        completed = true;
        unsubscribe();
        resolve(value);
      };

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
    signOut,
    isConfigured,
    getAuthInstance
  };
})();
