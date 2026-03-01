document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;
  const appDb = window.appDb;

  const emailInput = document.getElementById("adminEmailInput");
  const passwordInput = document.getElementById("adminPasswordInput");
  const loginForm = document.getElementById("adminLoginForm");
  const loginBtn = document.getElementById("adminLoginBtn");
  const loginError = document.getElementById("adminLoginError");

  function setError(message) {
    if (!loginError) return;
    if (!message) {
      loginError.textContent = "";
      loginError.classList.add("hidden");
    } else {
      loginError.textContent = message;
      loginError.classList.remove("hidden");
    }
  }

  function formatAdminLoginError(error) {
    switch (error?.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Invalid admin credentials.";
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      default:
        return error?.message || "Failed to sign in.";
    }
  }

  if (!auth || !auth.isConfigured()) {
    setError("Authentication service is not available.");
    if (loginBtn) loginBtn.disabled = true;
    return;
  }

  // if already signed in, skip form and go to panel
  const existing = auth.getCurrentUser();
  if (existing && existing.uid) {
    try {
      if (appDb && appDb.isConfigured()) {
        const profile = await appDb.ensureUserDocument(existing);
        if (profile?.role === "admin") {
          window.location.href = "panel.html";
          return;
        }
      }
    } catch (err) {
      console.error("Error checking existing admin role", err);
      // fall through to show login form
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput?.value.trim() || "";
      const password = passwordInput?.value || "";
      if (!email || !password) {
        setError("Please enter email and password.");
        return;
      }

      setError("");
      if (loginBtn) loginBtn.disabled = true;

      try {
        const credential = await auth.signIn(email, password);

        // verify role if we can reach the database
        if (appDb && appDb.isConfigured()) {
          const profile = await appDb.ensureUserDocument(credential.user);
          if (profile?.role !== "admin") {
            await auth.signOut();
            setError("Account is not authorized as admin.");
            return;
          }
        }

        window.location.href = "panel.html";
      } catch (err) {
        console.error("Admin login error", err);
        setError(formatAdminLoginError(err));
      } finally {
        if (loginBtn) loginBtn.disabled = false;
      }
    });
  }
});
