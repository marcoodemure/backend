document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;

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
        return "Invalid email/password for Firebase Authentication. This login does not use Firestore users docs. Check Firebase Auth account + password reset.";
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/user-disabled":
        return "This Firebase Auth account is disabled.";
      case "auth/network-request-failed":
        return "Network error while contacting Firebase. Check internet or firewall.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      default:
        return `${error?.message || "Failed to sign in."}${error?.code ? ` (${error.code})` : ""}`;
    }
  }

  function withTimeout(promise, timeoutMs, timeoutCode, timeoutMessage) {
    const ms = Math.max(1000, Number(timeoutMs) || 12000);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const err = new Error(timeoutMessage || "Request timed out.");
        err.code = timeoutCode || "timeout";
        reject(err);
      }, ms);

      Promise.resolve(promise)
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  function getServiceError() {
    if (!auth || !auth.isConfigured()) {
      return "Authentication service is not available.";
    }
    return "";
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const serviceError = getServiceError();
      if (serviceError) {
        setError(serviceError);
        return;
      }

      const email = emailInput?.value.trim() || "";
      const password = passwordInput?.value || "";
      if (!email || !password) {
        setError("Please enter email and password.");
        return;
      }

      setError("Signing in...");
      if (loginBtn) loginBtn.disabled = true;

      try {
        console.log("admin-login: sign-in started");
        const credential = await withTimeout(
          auth.signIn(email, password),
          15000,
          "auth/timeout",
          "Authentication request timed out."
        );
        console.log("admin-login: sign-in success", { uid: credential?.user?.uid || "" });
        setError("Login successful. Redirecting...");
        console.log("admin-login: redirecting to panel.html");
        window.location.replace("panel.html");
      } catch (err) {
        console.error("Admin login error", err);
        setError(formatAdminLoginError(err));
      } finally {
        if (loginBtn) loginBtn.disabled = false;
      }
    });
  }

  const startupServiceError = getServiceError();
  if (startupServiceError) {
    setError(startupServiceError);
  }
  try {
    const persistedError = sessionStorage.getItem("adminLoginError");
    if (persistedError) {
      setError(persistedError);
      sessionStorage.removeItem("adminLoginError");
    }
  } catch {}

  if (startupServiceError) {
    return;
  }
  // no auto-redirect on load; user controls navigation explicitly
});
