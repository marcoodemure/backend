document.addEventListener("DOMContentLoaded", async () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const signinBtn = document.getElementById("signinBtn");
  const createAccountLink = document.getElementById("createAccountLink");
  const signinFeedback = document.getElementById("signinFeedback");
  const appDb = window.appDb;
  const auth = window.authService;

  if (!emailInput || !passwordInput || !signinBtn) {
    console.error("signin.js: Missing required elements");
    return;
  }

  if (!auth || !auth.isConfigured()) {
    console.error("signin.js: Authentication service not available");
    if (signinFeedback) {
      signinFeedback.classList.remove("is-info", "is-success");
      signinFeedback.textContent = "Sign-in service is not configured yet.";
      signinFeedback.classList.remove("hidden");
      signinFeedback.classList.add("is-error");
    }
    return;
  }

  const pageParams = new URLSearchParams(window.location.search);
  const passthroughKeys = ["from", "product_id", "qty", "next"];

  if (createAccountLink) {
    const linkParams = new URLSearchParams();
    passthroughKeys.forEach((key) => {
      const value = pageParams.get(key);
      if (value) {
        linkParams.set(key, value);
      }
    });

    const query = linkParams.toString();
    createAccountLink.href = query ? `create-account.html?${query}` : "create-account.html";
  }

  function getRedirectUrl() {
    const from = pageParams.get("from");
    const paramProductId = Number(pageParams.get("product_id"));
    const pendingDraft = JSON.parse(localStorage.getItem("pendingOrderDraft")||"null");

    if (from === "admin") {
      return "admin.html";
    }

    if (from === "orders") {
      return "orders.html";
    }

    if (from === "profile") {
      return "profile.html";
    }

    if (from === "donate") {
      return "donate.html";
    }

    if (from === "cart") {
      return paramProductId ? `cart.html?product_id=${paramProductId}` : "cart.html";
    }

    if (from === "add_to_cart") {
      const qty = Math.max(1, Number(pageParams.get("qty")) || 1);
      const next = pageParams.get("next") || "";
      const linkParams = new URLSearchParams();
      if (paramProductId) {
        linkParams.set("product_id", String(paramProductId));
      }
      linkParams.set("qty", String(qty));
      if (next) {
        linkParams.set("next", next);
      }
      return `add-to-cart.html?${linkParams.toString()}`;
    }

    const pendingProductId = Number(pendingDraft?.productId);
    const cartProductId = Number(localStorage.getItem("cartProductId"));
    const resolvedProductId = paramProductId || pendingProductId || cartProductId;

    if (resolvedProductId) {
      const resumeFlag = pendingDraft ? "&resume=1" : "";
      return `checkout.html?product_id=${resolvedProductId}${resumeFlag}`;
    }

    if (pendingDraft) {
      return "checkout.html?resume=1";
    }

    return "checkout.html";
  }

  function setFeedback(type, message) {
    if (!signinFeedback) {
      return;
    }
    signinFeedback.classList.remove("is-error", "is-success", "is-info");

    if (!message) {
      signinFeedback.textContent = "";
      signinFeedback.classList.add("hidden");
      return;
    }

    signinFeedback.textContent = message;
    signinFeedback.classList.add(`is-${type || "info"}`);
    signinFeedback.classList.remove("hidden");
  }

  function formatSignInError(error) {
    const code = String(error?.code || "").toLowerCase();
    switch (code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return {
          message: "Incorrect email or password.",
          focus: passwordInput
        };
      case "auth/invalid-email":
        return {
          message: "Invalid email format.",
          focus: emailInput
        };
      case "auth/user-disabled":
        return {
          message: "This account is disabled. Contact support.",
          focus: emailInput
        };
      case "auth/network-request-failed":
        return {
          message: "Network error. Check your connection and try again.",
          focus: emailInput
        };
      case "auth/too-many-requests":
        return {
          message: "Too many attempts. Please wait a bit before trying again.",
          focus: passwordInput
        };
      case "auth/missing-password":
        return {
          message: "Please enter your password.",
          focus: passwordInput
        };
      default:
        return {
          message: error?.message || "Sign in failed. Please try again.",
          focus: emailInput
        };
    }
  }

  async function redirectIfAlreadySignedIn() {
    try {
      let currentUser = typeof auth.getCurrentUser === "function" ? auth.getCurrentUser() : null;
      if (!currentUser?.uid && typeof auth.waitForAuthState === "function") {
        currentUser = await auth.waitForAuthState(2500);
      }
      if (currentUser?.uid) {
        window.location.replace(getRedirectUrl());
        return true;
      }
    } catch (error) {
      console.error("signin.js: Failed to check existing session", error);
    }
    return false;
  }

  signinBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      setFeedback("error", "Please enter both email and password.");
      if (!email) {
        emailInput.focus();
      } else {
        passwordInput.focus();
      }
      return;
    }

    if (!auth.isConfigured()) {
      setFeedback("error", "Sign-in service is not configured yet.");
      return;
    }

    signinBtn.disabled = true;
    setFeedback("info", "Signing in...");

    try {
      const credential = await auth.signIn(email, password);
      // ensure user document in firestore
      if (appDb && appDb.isConfigured()) {
        try {
          const profile = await appDb.ensureUserDocument(credential.user);
          if (profile) {
            // optionally store role locally
            localStorage.setItem('userRole', profile.role || 'customer');
          }
        } catch (dbError) {
          console.error("Failed to sync user document:", dbError);
        }
      }
      setFeedback("", "");
      window.location.href = getRedirectUrl();
    } catch (error) {
      console.error("Sign in failed:", error);
      const signInError = formatSignInError(error);
      setFeedback("error", signInError.message);
      if (signInError.focus && typeof signInError.focus.focus === "function") {
        signInError.focus.focus();
      }
    } finally {
      signinBtn.disabled = false;
    }
  });

  emailInput.addEventListener("input", () => setFeedback("", ""));
  passwordInput.addEventListener("input", () => setFeedback("", ""));

  redirectIfAlreadySignedIn().catch(() => {});
});
