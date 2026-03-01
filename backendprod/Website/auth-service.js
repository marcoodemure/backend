(function () {
  function getAuth() {
    if (window.firebase && typeof window.firebase.auth === 'function') {
      return window.firebase.auth();
    }
    return null;
  }

  function isConfigured() {
    return Boolean(getAuth());
  }

  function signIn(email, password) {
    console.log('authService.signIn', { email });
    const auth = getAuth();
    if (!auth) return Promise.reject(new Error('Auth not initialized'));
    return auth.signInWithEmailAndPassword(email, password);
  }

  function signUp(email, password) {
    console.log('authService.signUp', { email });
    const auth = getAuth();
    if (!auth) return Promise.reject(new Error('Auth not initialized'));
    return auth.createUserWithEmailAndPassword(email, password);
  }

  function signOut() {
    const auth = getAuth();
    if (!auth) return Promise.resolve();
    return auth.signOut();
  }

  function onAuthStateChanged(cb) {
    const auth = getAuth();
    if (!auth || typeof cb !== 'function') return () => {};
    return auth.onAuthStateChanged(cb);
  }

  function getCurrentUser() {
    const auth = getAuth();
    return auth ? auth.currentUser : null;
  }

  window.authService = {
    isConfigured,
    signIn,
    signUp,
    signOut,
    onAuthStateChanged,
    getCurrentUser
  };
})();