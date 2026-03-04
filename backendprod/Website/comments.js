document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;
  const appDb = window.appDb;
  const params = new URLSearchParams(window.location.search);

  const productLabel = document.getElementById("commentsProductLabel");
  const feedback = document.getElementById("commentsFeedback");
  const avgRatingValue = document.getElementById("commentsAvgRating");
  const commentsCountValue = document.getElementById("commentsCount");
  const userPanel = document.getElementById("commentsUserPanel");
  const composeHint = document.getElementById("commentsComposeHint");
  const starPicker = document.getElementById("commentsStarPicker");
  const commentInput = document.getElementById("commentInput");
  const sendCommentBtn = document.getElementById("sendCommentBtn");
  const charCount = document.getElementById("commentsCharCount");
  const commentsState = document.getElementById("commentsState");
  const commentsList = document.getElementById("commentsList");

  const LOCAL_COMMENTS_KEY = "productCommentsLocalV1";
  const MAX_COMMENT_LEN = 800;
  const COMMENTS_LIMIT = 60;

  let productId = toProductId(params.get("product_id"));
  let selectedRating = 5;
  let currentUser = null;
  let activeCommentsUnsubscribe = null;
  let authStateUnsubscribe = null;
  let authPollTimer = null;
  let remoteCommentsHealthy = false;
  let lastUserKey = "";

  function toProductId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
  }

  function toRating(value) {
    const rating = Math.round(Number(value));
    if (!Number.isFinite(rating)) return 0;
    return Math.max(1, Math.min(5, rating));
  }

  function normalizeCommentText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT_LEN);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function setFeedback(type, message) {
    if (!feedback) return;
    feedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      feedback.textContent = "";
      feedback.classList.add("hidden");
      return;
    }
    feedback.textContent = message;
    feedback.classList.add(`is-${type || "info"}`);
    feedback.classList.remove("hidden");
  }

  function setCommentsState(type, message) {
    if (!commentsState) return;
    commentsState.classList.remove("is-error", "is-info");
    if (type === "error") {
      commentsState.classList.add("is-error");
    } else {
      commentsState.classList.add("is-info");
    }
    commentsState.textContent = message || "";
    commentsState.classList.remove("hidden");
    commentsList.classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }
    return date.toLocaleString();
  }

  function buildStars(rating) {
    const safe = toRating(rating) || 0;
    if (!safe) return "No rating";
    return `${"\u2605".repeat(safe)}${"\u2606".repeat(Math.max(0, 5 - safe))} (${safe}/5)`;
  }

  function getDisplayName(user) {
    const email = String(user?.email || "").trim();
    if (email.includes("@")) {
      return email.split("@")[0].slice(0, 80);
    }
    return "Customer";
  }

  function normalizeComment(raw) {
    const normalizedProductId = toProductId(raw?.productId);
    const rating = toRating(raw?.rating);
    const text = normalizeCommentText(raw?.text);
    if (!normalizedProductId || !rating || !text) {
      return null;
    }
    return {
      id: String(raw?.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      productId: normalizedProductId,
      uid: String(raw?.uid || "").trim(),
      email: String(raw?.email || "").trim(),
      displayName: String(raw?.displayName || "").trim() || "Customer",
      rating,
      text,
      createdAt: String(raw?.createdAt || new Date().toISOString()),
      updatedAt: String(raw?.updatedAt || "")
    };
  }

  function listLocalCommentsByProduct(targetProductId) {
    const stored = readJson(LOCAL_COMMENTS_KEY, []);
    const rows = Array.isArray(stored) ? stored : [];
    return rows
      .map(normalizeComment)
      .filter((row) => row && row.productId === targetProductId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, COMMENTS_LIMIT);
  }

  function appendLocalComment(comment) {
    const stored = readJson(LOCAL_COMMENTS_KEY, []);
    const existing = Array.isArray(stored) ? stored : [];
    const normalized = normalizeComment(comment);
    if (!normalized) return;
    const withoutDuplicate = existing.filter((row) => String(row?.id || "") !== normalized.id);
    const next = [normalized, ...withoutDuplicate].slice(0, 400);
    writeJson(LOCAL_COMMENTS_KEY, next);
  }

  function renderSummary(rows) {
    const source = Array.isArray(rows) ? rows : [];
    const count = source.length;
    const average = count
      ? (source.reduce((sum, row) => sum + toRating(row?.rating), 0) / count)
      : 0;
    avgRatingValue.textContent = count ? `${average.toFixed(1)} / 5` : "0.0 / 5";
    commentsCountValue.textContent = String(count);
  }

  function renderComments(rows) {
    const source = Array.isArray(rows) ? rows : [];
    renderSummary(source);
    commentsList.innerHTML = "";

    if (!source.length) {
      setCommentsState("info", "No comments yet for this product.");
      return;
    }

    commentsState.classList.add("hidden");
    commentsList.classList.remove("hidden");

    source.forEach((comment) => {
      const card = document.createElement("article");
      card.className = "comment-card";
      card.innerHTML = `
        <div class="comment-card-head">
          <div class="comment-author">
            <strong>${escapeHtml(comment.displayName || "Customer")}</strong>
            <small>${escapeHtml(formatDate(comment.createdAt))}</small>
          </div>
          <span class="comment-rating">${escapeHtml(buildStars(comment.rating))}</span>
        </div>
        <p class="comment-text">${escapeHtml(comment.text || "")}</p>
      `;
      commentsList.appendChild(card);
    });
  }

  function setComposeEnabled(enabled, hintText) {
    const canWrite = Boolean(enabled);
    commentInput.disabled = !canWrite;
    sendCommentBtn.disabled = !canWrite;
    starPicker.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
      button.classList.toggle("is-auth-locked", !canWrite);
    });
    composeHint.textContent = hintText || (canWrite ? "You can post comments now." : "Sign in to comment.");
  }

  function signInUrl() {
    const url = new URL("signin.html", window.location.href);
    url.search = "";
    url.searchParams.set("from", "comments");
    url.searchParams.set("product_id", String(productId));
    return url.toString();
  }

  function openSignInPage() {
    const target = signInUrl();
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = target;
        return;
      }
    } catch {}
    window.location.href = target;
  }

  function renderUserPanel(user) {
    if (!user?.uid) {
      userPanel.innerHTML = `
        <button id="commentsSignInBtn" type="button">Sign in</button>
      `;
      const signInButton = document.getElementById("commentsSignInBtn");
      if (signInButton) {
        signInButton.addEventListener("click", () => {
          openSignInPage();
        });
      }
      return;
    }

    userPanel.innerHTML = `
      <span class="comments-user-email">${escapeHtml(user.email || "Signed in")}</span>
      <a href="profile.html">Profile</a>
    `;
  }

  function updateCharCounter() {
    const length = String(commentInput.value || "").length;
    charCount.textContent = `${length} / ${MAX_COMMENT_LEN}`;
  }

  function setSelectedRating(rating) {
    selectedRating = toRating(rating) || 5;
    starPicker.querySelectorAll("button").forEach((button) => {
      const value = toRating(button.getAttribute("data-rating"));
      button.classList.toggle("active", value === selectedRating);
    });
  }

  function isRemoteReady() {
    return Boolean(appDb && typeof appDb.isConfigured === "function" && appDb.isConfigured());
  }

  async function resolveCurrentUser(waitMs) {
    let user = null;
    if (auth && typeof auth.getCurrentUser === "function") {
      user = auth.getCurrentUser();
    }
    if (!user?.uid && auth && typeof auth.waitForAuthState === "function") {
      user = await auth.waitForAuthState(Math.max(300, Number(waitMs) || 800));
    }

    const liveFirebaseUser = (() => {
      try {
        if (window.firebaseAuth?.currentUser?.uid) {
          return window.firebaseAuth.currentUser;
        }
        if (window.firebase && typeof window.firebase.auth === "function") {
          const authInstance = window.firebase.auth();
          if (authInstance?.currentUser?.uid) {
            return authInstance.currentUser;
          }
        }
      } catch {}
      return null;
    })();

    if (liveFirebaseUser?.uid) {
      user = {
        uid: String(liveFirebaseUser.uid),
        email: String(liveFirebaseUser.email || user?.email || "")
      };
    }

    if (!user?.uid) {
      const cached = readJson("currentUser", null);
      if (cached?.uid) {
        user = {
          uid: String(cached.uid),
          email: String(cached.email || "")
        };
      }
    }

    if (!user?.uid) {
      return null;
    }

    return {
      uid: String(user.uid),
      email: String(user.email || "")
    };
  }

  async function syncCurrentUser(waitMs) {
    const resolved = await resolveCurrentUser(waitMs);
    const nextKey = resolved?.uid ? `${resolved.uid}|${resolved.email || ""}` : "";
    if (nextKey === lastUserKey) {
      return;
    }

    lastUserKey = nextKey;
    currentUser = resolved;
    if (currentUser?.uid && isRemoteReady() && typeof appDb.ensureUserDocument === "function") {
      appDb.ensureUserDocument(currentUser).catch((error) => {
        console.error("comments.js: failed to sync user document", error);
      });
    }
    renderUserPanel(currentUser);
    setComposeEnabled(
      Boolean(currentUser?.uid),
      currentUser?.uid
        ? `Signed in as ${currentUser.email || "account"}.`
        : "Sign in first to post your rating and comment."
    );
  }

  function mapCommentError(error) {
    const code = String(error?.code || "").toLowerCase();
    if (code === "unauthenticated" || code === "auth/user-token-expired") {
      return "Session expired. Sign in again to post comments.";
    }
    if (code === "permission-denied") {
      return "Permission denied while posting comment.";
    }
    if (code === "product_not_found") {
      return "This product does not exist.";
    }
    if (code === "product_inactive") {
      return "This product is inactive.";
    }
    if (code === "invalid_rating") {
      return "Please select a star rating from 1 to 5.";
    }
    if (code === "empty_comment") {
      return "Comment cannot be empty.";
    }
    return "Failed to post comment. Please try again.";
  }

  async function loadProductTitle() {
    if (!productId) {
      productLabel.textContent = "Missing product reference";
      return;
    }

    let product = null;
    if (isRemoteReady() && typeof appDb.getProductById === "function") {
      try {
        product = await appDb.getProductById(productId);
      } catch (error) {
        console.error("comments.js: failed to load Firestore product", error);
      }
    }

    if (!product) {
      try {
        const response = await fetch("products.json", { cache: "no-store" });
        if (response.ok) {
          const rows = await response.json();
          if (Array.isArray(rows)) {
            product = rows.find((entry) => Number(entry?.id) === productId) || null;
          }
        }
      } catch (error) {
        console.error("comments.js: failed to load products.json fallback", error);
      }
    }

    productLabel.textContent = product?.name
      ? `Product #${productId}: ${product.name}`
      : `Product #${productId}`;
  }

  async function loadCommentsOnce() {
    if (!productId) {
      renderComments([]);
      return;
    }

    setCommentsState("info", "Loading comments...");
    let rows = [];
    const localRows = listLocalCommentsByProduct(productId);

    if (isRemoteReady() && typeof appDb.listProductComments === "function") {
      try {
        rows = await appDb.listProductComments(productId, { limitCount: COMMENTS_LIMIT });
        remoteCommentsHealthy = true;
      } catch (error) {
        remoteCommentsHealthy = false;
        console.error("comments.js: failed to load remote comments", error);
        setFeedback("error", "Comments database is unavailable. Showing local fallback.");
      }
    }

    const source = rows.length ? rows : localRows;
    renderComments(source);
  }

  function startCommentsRealtime() {
    if (activeCommentsUnsubscribe) {
      try {
        activeCommentsUnsubscribe();
      } catch {}
      activeCommentsUnsubscribe = null;
    }

    if (!isRemoteReady() || typeof appDb.watchProductComments !== "function" || !productId) {
      return;
    }

    activeCommentsUnsubscribe = appDb.watchProductComments(
      productId,
      (rows) => {
        remoteCommentsHealthy = true;
        renderComments(rows || []);
      },
      (error) => {
        remoteCommentsHealthy = false;
        console.error("comments.js: realtime comments failed", error);
        setFeedback("error", "Realtime comment sync failed. Showing latest available comments.");
        loadCommentsOnce().catch((loadError) => {
          console.error("comments.js: failed to reload comments after realtime error", loadError);
        });
      },
      COMMENTS_LIMIT
    );
  }

  async function submitComment() {
    if (!productId) {
      setFeedback("error", "Missing product_id in URL.");
      return;
    }

    const text = normalizeCommentText(commentInput.value);
    if (!text) {
      setFeedback("error", "Write a comment before sending.");
      return;
    }
    if (!currentUser?.uid) {
      setFeedback("info", "Please sign in first.");
      openSignInPage();
      return;
    }

    sendCommentBtn.disabled = true;
    const previousButtonLabel = sendCommentBtn.textContent;
    sendCommentBtn.textContent = "Sending...";
    setFeedback("info", "Posting your comment...");

    try {
      let saved = null;
      if (isRemoteReady() && typeof appDb.addProductComment === "function") {
        saved = await appDb.addProductComment(currentUser.uid, currentUser.email || "", {
          productId,
          rating: selectedRating,
          text,
          displayName: getDisplayName(currentUser)
        });
      } else {
        saved = normalizeComment({
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          productId,
          uid: currentUser.uid,
          email: currentUser.email || "",
          displayName: getDisplayName(currentUser),
          rating: selectedRating,
          text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      if (!saved) {
        throw new Error("comment_not_saved");
      }

      appendLocalComment(saved);
      commentInput.value = "";
      updateCharCounter();
      setFeedback("success", "Comment posted.");

      if (!remoteCommentsHealthy) {
        await loadCommentsOnce();
      }
    } catch (error) {
      console.error("comments.js: failed to submit comment", error);
      setFeedback("error", mapCommentError(error));
      if (String(error?.code || "").toLowerCase() === "unauthenticated") {
        await syncCurrentUser(400);
      }
    } finally {
      sendCommentBtn.disabled = false;
      sendCommentBtn.textContent = previousButtonLabel;
    }
  }

  if (!productId) {
    productLabel.textContent = "Missing product_id";
    setFeedback("error", "Open comments.html with ?product_id=YOUR_ID");
    setCommentsState("error", "Cannot load comments because product_id is missing.");
    setComposeEnabled(false, "Sign in is disabled until product_id is provided.");
    return;
  }

  setSelectedRating(selectedRating);
  updateCharCounter();
  setComposeEnabled(false, "Checking sign-in status...");

  starPicker.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-rating]");
    if (!button || !starPicker.contains(button)) return;
    setSelectedRating(button.getAttribute("data-rating"));
  });

  commentInput.addEventListener("input", () => {
    updateCharCounter();
  });

  sendCommentBtn.addEventListener("click", () => {
    submitComment().catch((error) => {
      console.error("comments.js: unexpected submit error", error);
      setFeedback("error", "Unexpected error while posting comment.");
    });
  });

  await loadProductTitle();
  await syncCurrentUser(4200);
  await loadCommentsOnce();
  startCommentsRealtime();

  if (auth && typeof auth.onAuthStateChanged === "function") {
    authStateUnsubscribe = auth.onAuthStateChanged(() => {
      syncCurrentUser(700).catch((error) => {
        console.error("comments.js: failed to sync auth listener state", error);
      });
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "currentUser" || event.key === "userRole") {
      syncCurrentUser(500).catch((error) => {
        console.error("comments.js: failed to sync storage state", error);
      });
    }
  });

  authPollTimer = setInterval(() => {
    syncCurrentUser(500).catch((error) => {
      console.error("comments.js: failed to sync polled auth state", error);
    });
  }, 2500);

  window.addEventListener("beforeunload", () => {
    if (activeCommentsUnsubscribe) {
      try { activeCommentsUnsubscribe(); } catch {}
    }
    if (authStateUnsubscribe) {
      try { authStateUnsubscribe(); } catch {}
    }
    if (authPollTimer) {
      clearInterval(authPollTimer);
    }
  }, { once: true });
});
