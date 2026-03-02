document.addEventListener("DOMContentLoaded", async () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const createBtn = document.getElementById("createBtn");
  const signinLink = document.getElementById("signinLink");
  const appDb = window.appDb;
  const auth = window.authService;

  if (!emailInput || !passwordInput || !createBtn) {
    console.error("create-account.js: Missing required elements");
    return;
  }

  if (!auth || !auth.isConfigured()) {
    console.error("create-account.js: Authentication service not available");
    return;
  }

  const pageParams = new URLSearchParams(window.location.search);
  const passthroughKeys = ["from", "product_id", "qty", "next"];

  if (signinLink) {
    const linkParams = new URLSearchParams();
    passthroughKeys.forEach((key) => {
      const value = pageParams.get(key);
      if (value) {
        linkParams.set(key, value);
      }
    });

    const query = linkParams.toString();
    signinLink.href = query ? `login.html?${query}` : "login.html";
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

  function formatCreateError(error) {
    switch (error?.code) {
      case "auth/email-already-in-use":
        return "Email is already in use.";
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/weak-password":
        return "Password should be at least 6 characters.";
      default:
        return error?.message || "Failed to create account.";
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
      console.error("create-account.js: Failed to check existing session", error);
    }
    return false;
  }

  createBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    if (!auth.isConfigured()) {
      alert("Firebase authentication is not configured yet.");
      return;
    }

    createBtn.disabled = true;

    try {
      const credential = await auth.signUp(email, password);
      if (appDb && appDb.isConfigured()) {
        try {
          const profile = await appDb.ensureUserDocument(credential.user);
          if (profile) {
            localStorage.setItem('userRole', profile.role || 'customer');
          }
        } catch (dbError) {
          console.error("Failed to sync user document:", dbError);
        }
      }
      window.location.href = getRedirectUrl();
    } catch (error) {
      console.error("Account creation failed:", error);
      alert(formatCreateError(error));
    } finally {
      createBtn.disabled = false;
    }
  });

  redirectIfAlreadySignedIn().catch(() => {});
});
