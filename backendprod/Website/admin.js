
document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;
  const appDb = window.appDb;

  const adminContent = document.getElementById("adminContent");
  const adminUnauthorized = document.getElementById("adminUnauthorized");
  const adminUserPanel = document.getElementById("adminUserPanel");
  const adminHeaderLogoutBtn = document.getElementById("adminHeaderLogoutBtn");
  const adminLoginWall = document.getElementById("adminLoginWall");
  const adminLoginForm = document.getElementById("adminLoginForm");
  const adminEmailInput = document.getElementById("adminEmailInput");
  const adminPasswordInput = document.getElementById("adminPasswordInput");
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  const adminLoginError = document.getElementById("adminLoginError");

  const adminMetrics = document.getElementById("adminMetrics");
  const adminAuditLog = document.getElementById("adminAuditLog");

  const productForm = document.getElementById("productForm");
  const productIdInput = document.getElementById("productIdInput");
  const productNameInput = document.getElementById("productNameInput");
  const productSizeInput = document.getElementById("productSizeInput");
  const productPriceInput = document.getElementById("productPriceInput");
  const productImageInput = document.getElementById("productImageInput");
  const productStockInput = document.getElementById("productStockInput");
  const productCategoryInput = document.getElementById("productCategoryInput");
  const productTagsInput = document.getElementById("productTagsInput");
  const saveProductBtn = document.getElementById("saveProductBtn");
  const clearProductBtn = document.getElementById("clearProductBtn");
  const productFormStatus = document.getElementById("productFormStatus");
  const productLinkResult = document.getElementById("productLinkResult");
  const productLinkInput = document.getElementById("productLinkInput");
  const copyProductLinkBtn = document.getElementById("copyProductLinkBtn");
  const openProductLinkBtn = document.getElementById("openProductLinkBtn");
  const exportProductsJsonBtn = document.getElementById("exportProductsJsonBtn");
  const importProductsJsonInput = document.getElementById("importProductsJsonInput");

  const adminProductsList = document.getElementById("adminProductsList");
  const adminOrdersList = document.getElementById("adminOrdersList");
  const adminOrdersPagination = document.getElementById("adminOrdersPagination");
  const adminStatusFilter = document.getElementById("adminStatusFilter");
  const adminOrderSearch = document.getElementById("adminOrderSearch");
  const adminOrderForm = document.getElementById("adminOrderForm");
  const adminOrderUidInput = document.getElementById("adminOrderUidInput");
  const adminOrderEmailInput = document.getElementById("adminOrderEmailInput");
  const adminOrderProductIdInput = document.getElementById("adminOrderProductIdInput");
  const adminOrderQuantityInput = document.getElementById("adminOrderQuantityInput");
  const adminOrderShippingFeeInput = document.getElementById("adminOrderShippingFeeInput");
  const adminOrderContactEmailInput = document.getElementById("adminOrderContactEmailInput");
  const adminOrderShippingOptionInput = document.getElementById("adminOrderShippingOptionInput");
  const adminOrderPaymentMethodInput = document.getElementById("adminOrderPaymentMethodInput");
  const adminOrderDeliveryMethodInput = document.getElementById("adminOrderDeliveryMethodInput");
  const adminOrderNotesInput = document.getElementById("adminOrderNotesInput");
  const adminSaveOrderBtn = document.getElementById("adminSaveOrderBtn");
  const adminClearOrderBtn = document.getElementById("adminClearOrderBtn");
  const adminOrderFormStatus = document.getElementById("adminOrderFormStatus");
  const adminProductSearch = document.getElementById("adminProductSearch");
  const adminStockFilter = document.getElementById("adminStockFilter");
  const adminCategoryFilter = document.getElementById("adminCategoryFilter");
  const adminTagFilter = document.getElementById("adminTagFilter");
  const adminMinPriceFilter = document.getElementById("adminMinPriceFilter");
  const adminMaxPriceFilter = document.getElementById("adminMaxPriceFilter");
  const adminTagChips = document.getElementById("adminTagChips");
  const adminLowStockThresholdInput = document.getElementById("adminLowStockThresholdInput");
  const saveLowStockThresholdBtn = document.getElementById("saveLowStockThresholdBtn");
  const exportOrdersCsvBtn = document.getElementById("exportOrdersCsvBtn");
  const adminTopProducts = document.getElementById("adminTopProducts");
  const adminConversionFunnel = document.getElementById("adminConversionFunnel");
  const adminDailySalesChart = document.getElementById("adminDailySalesChart");
  const exportDailySalesCsvBtn = document.getElementById("exportDailySalesCsvBtn");
  const adminReturnRequests = document.getElementById("adminReturnRequests");
  const adminNotificationsList = document.getElementById("adminNotificationsList");
  const adminUnreadBadge = document.getElementById("adminUnreadBadge");
  const markAllAdminNotificationsBtn = document.getElementById("markAllAdminNotificationsBtn");
  const returnRequestModal = document.getElementById("returnRequestModal");
  const returnModalBody = document.getElementById("returnModalBody");
  const returnModalCloseBtn = document.getElementById("returnModalCloseBtn");
  const adminTabs = document.getElementById("adminTabs");
  const adminTabButtons = Array.from(document.querySelectorAll("[data-admin-tab-target]"));
  const adminTabPanels = Array.from(document.querySelectorAll("[data-admin-tab-panel]"));

  // Defensive guard: never allow native form submit to reload this page.
  if (productForm) {
    productForm.addEventListener("submit", (event) => {
      event.preventDefault();
    }, true);
  }
  if (adminOrderForm) {
    adminOrderForm.addEventListener("submit", (event) => {
      event.preventDefault();
    }, true);
  }

  if (!adminContent || !adminUnauthorized || !adminUserPanel || !productForm || !adminProductsList || !adminOrdersList) {
    console.error("admin.js: required elements are missing");
    return;
  }

  if (!auth || !appDb || !auth.isConfigured() || !appDb.isConfigured()) {
    showSetupError("<strong>Setup required.</strong> Firebase config/scripts are missing.");
    return;
  }

  // wait for Firebase auth state in case it hasn't hydrated yet
  async function waitForAuthUser(timeoutMs = 7000) {
    if (typeof auth.waitForAuthState === "function") {
      const resolved = await auth.waitForAuthState(Math.max(1500, Number(timeoutMs) || 7000));
      if (resolved?.uid) {
        return resolved;
      }
    }

    return new Promise((resolve) => {
      const live = window.firebaseAuth?.currentUser || null;
      if (live?.uid) {
        resolve({ uid: live.uid, email: live.email || "", role: "" });
        return;
      }

      if (typeof auth.onAuthStateChanged !== "function") {
        resolve(null);
        return;
      }

      const unsub = auth.onAuthStateChanged((u) => {
        if (!u?.uid) return;
        unsub();
        resolve(u);
      });
      // fallback just in case the listener never fires
      setTimeout(() => {
        try { unsub(); } catch {}
        const latest = window.firebaseAuth?.currentUser || null;
        if (latest?.uid) {
          resolve({ uid: latest.uid, email: latest.email || "", role: "" });
          return;
        }
        resolve(null);
      }, Math.max(1500, Number(timeoutMs) || 7000));
    });
  }

  let signedIn = await waitForAuthUser();
  if (!signedIn || !signedIn.uid) {
    // not logged in, go back to login
    window.location.replace("admin.html");
    return;
  }

  let lowStockThreshold = Math.max(1, Number(localStorage.getItem("lowStockThreshold")) || 5);
  const ORDERS_PAGE_SIZE = 8;
  const INITIAL_ORDERS_LIMIT = 80;
  const ANALYTICS_MIN_REFRESH_MS = 15000;
  const ORDERS_ENABLED = true;
  const ROLE_CACHE_KEY = "adminRoleCacheV1";
  const ROLE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  let allProducts = [];
  let allOrders = [];
  let filteredOrders = [];
  let currentOrdersPage = 1;
  let stopProducts = null;
  let stopOrders = null;
  let stopAudit = null;
  let stopReturns = null;
  let stopNotifications = null;
  let listenersStarted = false;
  let allReturnRequests = [];
  let allNotifications = [];
  let backendAnalyticsSummary = null;
  let savingProduct = false;
  let savingOrder = false;
  let currentUserRole = "";
  let deferredListenersTimer = null;
  let analyticsRefreshTimer = null;
  let analyticsRefreshInFlight = false;
  let analyticsRefreshQueued = false;
  let lastAnalyticsRefreshAt = 0;
  let roleRefreshInFlight = false;

  function getCurrentUser() {
    return auth.getCurrentUser();
  }

  function readCachedRole(uid) {
    if (!uid) return "";
    try {
      const raw = localStorage.getItem(ROLE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const sameUser = String(parsed?.uid || "") === String(uid);
        const role = String(parsed?.role || "").toLowerCase();
        const cachedAt = Number(parsed?.cachedAt || 0);
        if (sameUser && role && Number.isFinite(cachedAt) && (Date.now() - cachedAt) <= ROLE_CACHE_TTL_MS) {
          return role;
        }
        if (sameUser) {
          localStorage.removeItem(ROLE_CACHE_KEY);
        }
      }
    } catch {}
    return "";
  }

  function writeCachedRole(uid, role) {
    const safeUid = String(uid || "");
    const safeRole = String(role || "").toLowerCase();
    if (!safeUid || !safeRole) return;
    try {
      localStorage.setItem("userRole", safeRole);
      localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({
        uid: safeUid,
        role: safeRole,
        cachedAt: Date.now()
      }));
    } catch {}
  }

  function clearCachedRole() {
    try {
      localStorage.removeItem("userRole");
      localStorage.removeItem(ROLE_CACHE_KEY);
    } catch {}
  }

  function formatMoney(value) {
    return `PHP ${Number(value || 0).toFixed(2)}`;
  }

  function formatDateTime(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function normalizeTagList(value) {
    const source = Array.isArray(value) ? value : String(value || "").split(",");
    return Array.from(new Set(source.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)));
  }

  function parseOptionalNumberInput(inputEl) {
    const raw = String(inputEl?.value ?? "").trim();
    if (!raw) return NaN;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function getFilteredProducts(products) {
    const searchValue = adminProductSearch?.value?.trim() || "";
    const stockFilter = adminStockFilter?.value || "all";
    const categoryFilter = adminCategoryFilter?.value || "all";
    const tagValue = (adminTagFilter?.value || "").trim().toLowerCase();
    const minPrice = parseOptionalNumberInput(adminMinPriceFilter);
    const maxPrice = parseOptionalNumberInput(adminMaxPriceFilter);

    return products.filter((product) => {
      if (!matchesProductSearch(product, searchValue)) return false;
      const stock = Number(product.stock);
      const price = Number(product.price) || 0;
      const category = String(product.category || "general").toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags.map((tag) => String(tag).toLowerCase()) : [];

      if (!Number.isFinite(stock) && stockFilter !== "all") return false;
      if (stockFilter === "out" && stock > 0) return false;
      if (stockFilter === "low" && !(stock > 0 && stock <= lowStockThreshold)) return false;

      if (categoryFilter !== "all" && category !== categoryFilter) return false;
      if (tagValue && !tags.some((tag) => tag.includes(tagValue))) return false;
      if (Number.isFinite(minPrice) && price < minPrice) return false;
      if (Number.isFinite(maxPrice) && price > maxPrice) return false;
      return true;
    });
  }

  function renderProductFilterControls(products) {
    if (adminCategoryFilter) {
      const selected = adminCategoryFilter.value || "all";
      const categories = Array.from(new Set(products.map((item) => String(item.category || "General").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      adminCategoryFilter.innerHTML = `<option value="all">All categories</option>`;
      categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.toLowerCase();
        option.textContent = category;
        adminCategoryFilter.appendChild(option);
      });
      adminCategoryFilter.value = categories.map((item) => item.toLowerCase()).includes(selected) ? selected : "all";
    }

  }

  function renderAvailableProductsCards(products) {
    if (!adminTagChips) return;
    const safeProducts = Array.isArray(products) ? products : [];

    if (!safeProducts.length) {
      adminTagChips.innerHTML = `
        <div class="admin-empty-state">
          <p>No products available for current filters.</p>
          <button type="button" id="clearAvailableProductsFiltersBtn" class="admin-inline-action">Reset filters</button>
        </div>
      `;
      const resetBtn = document.getElementById("clearAvailableProductsFiltersBtn");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => resetProductFilters());
      }
      return;
    }

    adminTagChips.innerHTML = "";
    safeProducts
      .slice()
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
      .forEach((product) => {
        const thumbUrl = normalizeImageUrl(product.image);
        const link = buildProductUrl(product.id);
        const stockState = getStockState(product.stock);
        const card = document.createElement("div");
        card.className = "admin-product-card";
        card.innerHTML = `
          <div class="admin-order-thumb-wrap admin-product-thumb-wrap">
            ${renderThumbMarkup(thumbUrl, product.name || "", "admin-product-thumb")}
          </div>
          <div class="admin-order-content admin-product-content">
            <div class="admin-order-top admin-product-top">
              <strong>${escapeHtml(product.name || `Product #${product.id}`)}</strong>
              <span class="admin-product-id">#${escapeHtml(String(product.id || ""))}</span>
            </div>
            <div class="admin-order-meta admin-product-meta">
              <span>${escapeHtml(formatMoney(product.price))}</span>
              <span>Stock: ${escapeHtml(String(product.stock ?? "N/A"))}</span>
            </div>
            <span class="stock-pill ${stockState.className}">${escapeHtml(stockState.label)}</span>
            <div class="admin-order-actions admin-product-actions">
              <button type="button" class="quickCopyProductLinkBtn">Copy product link</button>
              <button type="button" class="quickDeleteProductBtn danger">Remove product</button>
              <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open checkout</a>
            </div>
          </div>
        `;

        const copyBtn = card.querySelector(".quickCopyProductLinkBtn");
        if (copyBtn) {
          copyBtn.addEventListener("click", async () => {
            await copyText(link, `Product link copied for #${product.id}.`);
          });
        }
        const removeBtn = card.querySelector(".quickDeleteProductBtn");
        if (removeBtn) {
          removeBtn.addEventListener("click", async () => {
            const confirmed = window.confirm(`Remove product #${product.id}?`);
            if (!confirmed) return;
            try {
              await appDb.deleteProduct(product.id);
              showToast(`Removed product #${product.id}.`, "success");
            } catch (error) {
              console.error("Failed to remove product", error);
              showToast("Failed to remove product.", "error");
            }
          });
        }

        adminTagChips.appendChild(card);
      });
  }

  function getEstimatedDelivery(order) {
    if (order.estimatedDeliveryAt) return order.estimatedDeliveryAt;
    const base = order.createdAt ? new Date(order.createdAt) : new Date();
    const days = order.deliveryMethod === "pickup" ? 5 : order.shippingOption === "express_shipping" ? 2 : 5;
    return new Date(base.getTime() + days * 86400000).toISOString();
  }

  function createToastRoot() {
    let root = document.getElementById("toastRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "toastRoot";
      root.className = "toast-root";
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(message, type) {
    if (!message) return;
    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type || "info"}`;
    toast.textContent = message;
    createToastRoot().appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 250);
    }, 2600);
  }

  function setProductFormStatus(message, type) {
    if (!productFormStatus) return;
    productFormStatus.classList.remove("hidden", "is-success", "is-error", "is-info");
    if (!message) {
      productFormStatus.textContent = "";
      productFormStatus.classList.add("hidden");
      return;
    }
    productFormStatus.textContent = message;
    productFormStatus.classList.add(`is-${type || "info"}`);
  }

  function setOrderFormStatus(message, type) {
    if (!adminOrderFormStatus) return;
    adminOrderFormStatus.classList.remove("hidden", "is-success", "is-error", "is-info");
    if (!message) {
      adminOrderFormStatus.textContent = "";
      adminOrderFormStatus.classList.add("hidden");
      return;
    }
    adminOrderFormStatus.textContent = message;
    adminOrderFormStatus.classList.add(`is-${type || "info"}`);
  }

  function switchAdminTab(tabName) {
    const safeTab = String(tabName || "overview");
    adminTabButtons.forEach((button) => {
      const active = button.dataset.adminTabTarget === safeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    adminTabPanels.forEach((panel) => {
      const active = panel.dataset.adminTabPanel === safeTab;
      panel.classList.toggle("active", active);
    });
  }

  function withTimeout(promise, timeoutMs, timeoutCode, timeoutMessage) {
    const safeMs = Math.max(1000, Number(timeoutMs) || 15000);
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        const err = new Error(timeoutMessage || "Request timed out.");
        err.code = timeoutCode || "timeout";
        reject(err);
      }, safeMs);

      Promise.resolve(promise)
        .then((value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const lower = raw.toLowerCase();
    if (lower === "." || lower === "./" || lower === ".." || lower === "../" || lower === "/") {
      return "";
    }
    if (lower.startsWith("javascript:")) {
      return "";
    }
    if (lower.startsWith("data:")) {
      return lower.startsWith("data:image/") ? raw : "";
    }
    if (lower.startsWith("blob:") || lower.startsWith("http://") || lower.startsWith("https://")) {
      return raw;
    }
    if (lower.includes("://") || raw.startsWith("?") || raw.startsWith("#")) {
      return "";
    }
    if (raw.endsWith("/") || raw.endsWith("\\")) {
      return "";
    }

    const noQuery = raw.split(/[?#]/)[0] || "";
    const hasPathSeparator = /[\\/]/.test(noQuery);
    const hasImageExtension = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(noQuery);
    if (!hasPathSeparator && !hasImageExtension) {
      return "";
    }

    return raw;
  }

  function renderThumbMarkup(imageValue, altText, className) {
    const safeUrl = normalizeImageUrl(imageValue);
    const safeClass = escapeHtml(className || "admin-product-thumb");
    if (!safeUrl) {
      return `<div class="${safeClass} placeholder">No image</div>`;
    }
    return `<img class="${safeClass}" src="${escapeHtml(safeUrl)}" alt="${escapeHtml(altText || "Product image")}">`;
  }

  async function copyText(value, successText) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(value));
      } else {
        const tempInput = document.createElement("input");
        tempInput.value = String(value);
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        tempInput.remove();
      }
      if (successText) {
        showToast(successText, "success");
      }
    } catch (error) {
      console.error("Failed to copy text", error);
      showToast("Copy failed.", "error");
    }
  }

  function setSkeleton(target, rows) {
    if (!target) return;
    const count = Math.max(1, Number(rows) || 3);
    target.innerHTML = Array.from({ length: count }).map(() => `
      <div class="skeleton-row">
        <div class="skeleton-line w-40"></div>
        <div class="skeleton-line w-80"></div>
        <div class="skeleton-line w-55"></div>
      </div>
    `).join("");
  }

  function setLoginError(message) {
    if (!adminLoginError) return;
    if (!message) {
      adminLoginError.textContent = "";
      adminLoginError.classList.add("hidden");
      return;
    }
    adminLoginError.textContent = message;
    adminLoginError.classList.remove("hidden");
  }

  function showLoginWall(message) {
    adminContent.classList.add("hidden");
    adminUnauthorized.classList.add("hidden");
    if (adminLoginWall) adminLoginWall.classList.remove("hidden");
    setLoginError(message || "");
  }

  function showAdminContent() {
    adminUnauthorized.classList.add("hidden");
    if (adminLoginWall) adminLoginWall.classList.add("hidden");
    adminContent.classList.remove("hidden");
    setLoginError("");
  }

  function showSetupError(message) {
    adminUnauthorized.classList.remove("hidden");
    adminUnauthorized.innerHTML = message;
    adminContent.classList.add("hidden");
    if (adminLoginWall) adminLoginWall.classList.add("hidden");
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
  function buildProductUrl(productId) {
    const url = new URL("checkout.html", window.location.href);
    url.search = "";
    url.searchParams.set("product_id", String(productId));
    return url.toString();
  }

  function showProductLink(productId) {
    if (!productLinkResult || !productLinkInput || !openProductLinkBtn) return;
    const productUrl = buildProductUrl(productId);
    productLinkInput.value = productUrl;
    openProductLinkBtn.href = productUrl;
    productLinkResult.classList.remove("hidden");
  }

  async function copyGeneratedLink() {
    if (!productLinkInput?.value) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(productLinkInput.value);
      } else {
        productLinkInput.select();
        productLinkInput.setSelectionRange(0, productLinkInput.value.length);
        document.execCommand("copy");
      }
      showToast("Checkout URL copied.", "success");
    } catch (error) {
      console.error("Failed to copy checkout URL", error);
      showToast("Failed to copy checkout URL.", "error");
    }
  }

  function resetProductForm(options) {
    const keepLink = Boolean(options?.keepLink);
    productForm.reset();
    productIdInput.readOnly = false;
    productCategoryInput.value = "";
    productTagsInput.value = "";
    if (!keepLink && productLinkResult && productLinkInput && openProductLinkBtn) {
      productLinkResult.classList.add("hidden");
      productLinkInput.value = "";
      openProductLinkBtn.href = "#";
    }
  }

  function resetOrderForm() {
    if (!adminOrderForm) return;
    adminOrderForm.reset();
    if (adminOrderQuantityInput) adminOrderQuantityInput.value = "1";
    if (adminOrderShippingFeeInput) adminOrderShippingFeeInput.value = "0";
    if (adminOrderShippingOptionInput) adminOrderShippingOptionInput.value = "standard_shipping";
    if (adminOrderPaymentMethodInput) adminOrderPaymentMethodInput.value = "cash_on_delivery";
    if (adminOrderDeliveryMethodInput) adminOrderDeliveryMethodInput.value = "ship";
  }

  function fillProductForm(product) {
    productIdInput.value = product.id;
    productIdInput.readOnly = true;
    productNameInput.value = product.name || "";
    productSizeInput.value = product.size || "";
    productPriceInput.value = Number(product.price || 0);
    productImageInput.value = product.image || "";
    productStockInput.value = Number(product.stock || 0);
    productCategoryInput.value = product.category || "";
    productTagsInput.value = Array.isArray(product.tags) ? product.tags.join(", ") : "";
    showProductLink(product.id);
  }

  async function renderUserPanel(user) {
    if (!user) {
      adminUserPanel.innerHTML = "<span>Not signed in</span>";
      return;
    }

    adminUserPanel.innerHTML = `
      <span>${user.email}</span>
      <a href="orders.html">Orders</a>
      <a href="profile.html">Profile</a>
    `;
  }

  function bindLogoutButton(button) {
    if (!button || button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await auth.signOut();
      } catch (error) {
        console.error("Failed to sign out admin user", error);
      } finally {
        try {
          localStorage.removeItem("currentUser");
          clearCachedRole();
          sessionStorage.removeItem("forceAdminLoggedOut");
          sessionStorage.removeItem("adminLoginError");
        } catch {}
        window.location.replace("admin.html");
      }
    });
  }

  function matchesProductSearch(product, searchValue) {
    if (!searchValue) return true;
    const query = searchValue.toLowerCase();
    const tags = Array.isArray(product.tags) ? product.tags.join(" ") : "";
    return (
      String(product.id || "").toLowerCase().includes(query) ||
      String(product.name || "").toLowerCase().includes(query) ||
      String(product.size || "").toLowerCase().includes(query) ||
      String(product.category || "").toLowerCase().includes(query) ||
      tags.toLowerCase().includes(query)
    );
  }

  function matchesOrderSearch(order, searchValue) {
    if (!searchValue) return true;
    const query = searchValue.toLowerCase();
    const haystack = [
      order.id,
      order.uid,
      order.email,
      order.contactEmail,
      order.productId,
      order.productName,
      order.productCategory,
      order.status,
      order.orderNotes
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  }

  function getStockState(stockValue) {
    const stock = Number(stockValue);
    if (!Number.isFinite(stock)) return { label: "Stock N/A", className: "stock-na" };
    if (stock <= 0) return { label: "Out of stock", className: "stock-out" };
    if (stock <= lowStockThreshold) return { label: `Low stock (${stock})`, className: "stock-low" };
    return { label: `In stock (${stock})`, className: "stock-ok" };
  }

  function resetProductFilters() {
    if (adminProductSearch) adminProductSearch.value = "";
    if (adminStockFilter) adminStockFilter.value = "all";
    if (adminCategoryFilter) adminCategoryFilter.value = "all";
    if (adminTagFilter) adminTagFilter.value = "";
    if (adminMinPriceFilter) adminMinPriceFilter.value = "";
    if (adminMaxPriceFilter) adminMaxPriceFilter.value = "";
    renderProductFilterControls(allProducts);
    renderProducts(allProducts);
  }

  function renderMetrics() {
    if (!adminMetrics) return;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const todayOrders = allOrders.filter((order) => {
      const createdAt = new Date(order.createdAt || 0).getTime();
      return Number.isFinite(createdAt) && createdAt >= startOfDay;
    });

    const todayRevenue = todayOrders
      .filter((order) => order.status !== "canceled")
      .reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);

    const lowStockCount = allProducts.filter((product) => {
      const stock = Number(product.stock);
      return Number.isFinite(stock) && stock > 0 && stock <= lowStockThreshold;
    }).length;

    const pendingCount = allOrders.filter((order) => order.status === "pending").length;
    const inTransitCount = allOrders.filter((order) => order.status === "in_transit").length;
    const deliveredCount = allOrders.filter((order) => order.status === "delivered").length;
    const canceledCount = allOrders.filter((order) => order.status === "canceled").length;
    const conversionRate = allOrders.length
      ? ((deliveredCount / allOrders.length) * 100).toFixed(1)
      : "0.0";
    const lowConfidenceCount = backendAnalyticsSummary?.lowConfidenceCount
      ?? allOrders.filter((order) => Number(order.deliveryConfidence?.score || 0) < 50).length;
    const avgFulfillmentHours = Number(backendAnalyticsSummary?.avgFulfillmentHours || 0);
    const returnRequestedCount = Number(backendAnalyticsSummary?.returnRequestedCount || 0);
    const returnRefundedCount = Number(backendAnalyticsSummary?.returnRefundedCount || 0);

    adminMetrics.innerHTML = `
      <div class="metric-card"><span class="metric-label">Orders Today</span><strong class="metric-value">${todayOrders.length}</strong></div>
      <div class="metric-card"><span class="metric-label">Revenue Today (Mock)</span><strong class="metric-value">${formatMoney(todayRevenue)}</strong></div>
      <div class="metric-card"><span class="metric-label">Low Stock Items (<=${lowStockThreshold})</span><strong class="metric-value">${lowStockCount}</strong></div>
      <div class="metric-card"><span class="metric-label">Pending Orders</span><strong class="metric-value">${pendingCount}</strong></div>
      <div class="metric-card"><span class="metric-label">In Transit</span><strong class="metric-value">${inTransitCount}</strong></div>
      <div class="metric-card"><span class="metric-label">Delivered</span><strong class="metric-value">${deliveredCount}</strong></div>
      <div class="metric-card"><span class="metric-label">Canceled</span><strong class="metric-value">${canceledCount}</strong></div>
      <div class="metric-card"><span class="metric-label">Conversion</span><strong class="metric-value">${conversionRate}%</strong></div>
      <div class="metric-card"><span class="metric-label">Low Confidence Deliveries</span><strong class="metric-value">${lowConfidenceCount}</strong></div>
      <div class="metric-card"><span class="metric-label">Avg Fulfillment (hrs)</span><strong class="metric-value">${avgFulfillmentHours.toFixed(1)}</strong></div>
      <div class="metric-card"><span class="metric-label">Returns Requested</span><strong class="metric-value">${returnRequestedCount}</strong></div>
      <div class="metric-card"><span class="metric-label">Returns Refunded</span><strong class="metric-value">${returnRefundedCount}</strong></div>
    `;
  }

  async function refreshBackendAnalyticsSummary() {
    if (!ORDERS_ENABLED) {
      backendAnalyticsSummary = null;
      return;
    }
    if (typeof appDb.getAnalyticsSummary !== "function") {
      return;
    }

    try {
      backendAnalyticsSummary = await appDb.getAnalyticsSummary({ days: 30 });
    } catch (error) {
      const denied = String(error?.code || "") === "permission-denied";
      const message = String(error?.message || "").toLowerCase();
      const missingIndex = message.includes("requires a collection_group")
        || message.includes("query requires")
        || message.includes("requires an index");
      if (denied) {
        console.warn("Analytics summary denied by Firestore rules. Admin role/session may be missing.");
      } else if (missingIndex) {
        console.warn("Analytics summary index is still building; using fallback metrics.");
      } else {
        console.error("Failed to load backend analytics summary", error);
      }
      backendAnalyticsSummary = null;
    }
  }

  async function runAnalyticsRefresh(force) {
    const now = Date.now();
    if (!force && now - lastAnalyticsRefreshAt < ANALYTICS_MIN_REFRESH_MS) {
      return;
    }
    if (analyticsRefreshInFlight) {
      analyticsRefreshQueued = true;
      return;
    }

    analyticsRefreshInFlight = true;
    try {
      await refreshBackendAnalyticsSummary();
      lastAnalyticsRefreshAt = Date.now();
      renderMetrics();
    } catch (error) {
      console.error("Failed to refresh analytics summary", error);
    } finally {
      analyticsRefreshInFlight = false;
      if (analyticsRefreshQueued) {
        analyticsRefreshQueued = false;
        scheduleAnalyticsRefresh(1200, true);
      }
    }
  }

  function scheduleAnalyticsRefresh(delayMs, force) {
    if (analyticsRefreshTimer) {
      clearTimeout(analyticsRefreshTimer);
      analyticsRefreshTimer = null;
    }
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    analyticsRefreshTimer = setTimeout(() => {
      analyticsRefreshTimer = null;
      runAnalyticsRefresh(Boolean(force)).catch((error) => {
        console.error("Analytics refresh scheduler failed", error);
      });
    }, safeDelay);
  }

  function buildDailySalesRows(orders) {
    const rows = new Map();
    orders
      .filter((order) => order.status !== "canceled")
      .forEach((order) => {
        const date = new Date(order.createdAt || Date.now());
        const key = Number.isNaN(date.getTime())
          ? new Date().toISOString().slice(0, 10)
          : date.toISOString().slice(0, 10);
        const previous = rows.get(key) || { date: key, orders: 0, revenue: 0 };
        previous.orders += 1;
        previous.revenue += Number(order.totalPrice || 0);
        rows.set(key, previous);
      });

    return Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderAnalytics() {
    if (adminTopProducts) {
      const grouped = new Map();
      allOrders.forEach((order) => {
        const key = String(order.productId || order.productName || "unknown");
        const existing = grouped.get(key) || {
          productName: order.productName || `Product #${order.productId || "N/A"}`,
          units: 0,
          revenue: 0
        };
        existing.units += Number(order.quantity || 0);
        if (order.status !== "canceled") {
          existing.revenue += Number(order.totalPrice || 0);
        }
        grouped.set(key, existing);
      });

      const top = Array.from(grouped.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      adminTopProducts.innerHTML = top.length
        ? top.map((entry) => `<div class="admin-item"><div class="admin-item-main"><strong>${entry.productName}</strong><span>Units: ${entry.units}</span><span>Revenue: ${formatMoney(entry.revenue)}</span></div></div>`).join("")
        : "<p>No product analytics yet.</p>";
    }

    if (adminConversionFunnel) {
      const placed = allOrders.length;
      const inTransit = allOrders.filter((order) => order.status === "in_transit").length;
      const delivered = allOrders.filter((order) => order.status === "delivered").length;
      const canceled = allOrders.filter((order) => order.status === "canceled").length;

      adminConversionFunnel.innerHTML = `
        <div class="admin-item"><div class="admin-item-main"><strong>Conversion Funnel</strong><span>Placed: ${placed}</span><span>In Transit: ${inTransit}</span><span>Delivered: ${delivered}</span><span>Canceled: ${canceled}</span></div></div>
      `;
    }

    if (adminDailySalesChart) {
      const rows = buildDailySalesRows(allOrders);
      if (!rows.length) {
        adminDailySalesChart.innerHTML = "<p>No daily sales data yet.</p>";
      } else {
        const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
        adminDailySalesChart.innerHTML = rows.slice(-10).map((row) => {
          const width = Math.max(4, Math.round((row.revenue / maxRevenue) * 100));
          return `<div class="sales-bar-row"><span>${row.date}</span><div class="sales-bar"><i style="width:${width}%"></i></div><strong>${formatMoney(row.revenue)}</strong></div>`;
        }).join("");
      }
    }
  }

  function renderNotifications(entries) {
    allNotifications = Array.isArray(entries) ? entries : [];
    if (!adminNotificationsList) return;

    const unreadCount = allNotifications.filter((entry) => !entry.read).length;
    if (adminUnreadBadge) {
      adminUnreadBadge.textContent = `${unreadCount} unread`;
    }

    if (!allNotifications.length) {
      adminNotificationsList.innerHTML = "<p>No notifications yet.</p>";
      return;
    }

    adminNotificationsList.innerHTML = "";
    allNotifications.forEach((entry) => {
      const card = document.createElement("div");
      card.className = `admin-item notification-item${entry.read ? "" : " unread"}`;
      const orderLink = entry.relatedOrderId
        ? `<a href="orders.html" class="invoice-link">Open related order</a>`
        : "";
      card.innerHTML = `
        <div class="admin-item-main">
          <strong>${escapeHtml(entry.title || "Notification")}</strong>
          <span>${escapeHtml(entry.message || "")}</span>
          <span>${formatDateTime(entry.createdAt)}</span>
        </div>
        <div class="admin-item-actions">
          ${orderLink}
          <button type="button" class="markReadBtn" ${entry.read ? "disabled" : ""}>${entry.read ? "Read" : "Mark read"}</button>
        </div>
      `;

      const markReadBtn = card.querySelector(".markReadBtn");
      if (markReadBtn && !entry.read) {
        markReadBtn.addEventListener("click", async () => {
          try {
            await appDb.markNotificationRead(entry.id);
          } catch (error) {
            console.error("Failed to mark notification read", error);
            showToast("Failed to mark notification.", "error");
          }
        });
      }

      adminNotificationsList.appendChild(card);
    });
  }

  function closeReturnModal() {
    if (!returnRequestModal || !returnModalBody) return;
    returnRequestModal.classList.add("hidden");
    returnModalBody.innerHTML = "";
  }

  function openReturnModal(entry) {
    if (!returnRequestModal || !returnModalBody) return;
    const timeline = Array.isArray(entry?.history) && entry.history.length
      ? entry.history
        .slice()
        .reverse()
        .map((item) => `<li><strong>${escapeHtml(item.action || "updated")}</strong> - ${formatDateTime(item.createdAt)}${item.note ? ` - ${escapeHtml(item.note)}` : ""}</li>`)
        .join("")
      : "<li>No timeline yet.</li>";
    const transitions = {
      requested: ["approved", "rejected"],
      approved: ["received"],
      received: ["refunded"],
      refunded: [],
      rejected: []
    };
    const allowed = transitions[String(entry?.status || "requested")] || [];

    returnModalBody.innerHTML = `
      <div class="return-detail-grid">
        <p><strong>Order:</strong> ${escapeHtml(entry?.orderId || "N/A")}</p>
        <p><strong>Status:</strong> ${escapeHtml(String(entry?.status || "requested").replace(/_/g, " "))}</p>
        <p><strong>Requester:</strong> ${escapeHtml(entry?.requesterEmail || "N/A")}</p>
        <p><strong>Reason:</strong> ${escapeHtml(entry?.reason || "N/A")}</p>
        <p><strong>Notes:</strong> ${escapeHtml(entry?.notes || "N/A")}</p>
        <p><strong>Decision note:</strong> ${escapeHtml(entry?.decisionNote || "N/A")}</p>
        <p><strong>Next allowed action:</strong> ${allowed.length ? escapeHtml(allowed.join(", ").replace(/_/g, " ")) : "None"}</p>
      </div>
      <h4>Timeline</h4>
      <ul class="return-timeline">${timeline}</ul>
    `;
    returnRequestModal.classList.remove("hidden");
  }

  function renderReturnRequests(requests) {
    allReturnRequests = Array.isArray(requests) ? requests : [];
    if (!adminReturnRequests) return;
    if (!allReturnRequests.length) {
      adminReturnRequests.innerHTML = "<p>No return requests yet.</p>";
      return;
    }

    adminReturnRequests.innerHTML = "";
    allReturnRequests.forEach((entry) => {
      const card = document.createElement("div");
      const statusLabel = String(entry.status || "requested").replace(/_/g, " ");
      const transitions = {
        requested: ["approved", "rejected"],
        approved: ["received"],
        received: ["refunded"],
        refunded: [],
        rejected: []
      };
      const allowed = transitions[String(entry.status || "requested")] || [];
      card.className = "admin-item";
      const historyPreview = Array.isArray(entry.history) && entry.history.length
        ? entry.history
          .slice()
          .reverse()
          .slice(0, 4)
          .map((item) => `${item.action || "update"} @ ${formatDateTime(item.createdAt)}${item.note ? ` - ${item.note}` : ""}`)
          .join(" | ")
        : "No history";
      card.innerHTML = `
        <div class="admin-item-main">
          <strong>Order ${entry.orderId || "N/A"}</strong>
          <span>Requester: ${entry.requesterEmail || "N/A"}</span>
          <span>Status: ${statusLabel}</span>
          <span>Reason: ${entry.reason || "N/A"}</span>
          <span>Submitted: ${formatDateTime(entry.createdAt)}</span>
          <span>Decision Note: ${entry.decisionNote || "N/A"}</span>
          <span>Audit: ${historyPreview}</span>
        </div>
        <div class="admin-item-actions">
          <button class="openReturnDetailBtn" type="button">Details</button>
          <select class="returnStatusSelect">
            <option value="">Select next</option>
            ${allowed.map((state) => `<option value="${state}">${state.replace(/_/g, " ")}</option>`).join("")}
          </select>
          <button class="applyReturnBtn" type="button">Apply</button>
        </div>
      `;

      const applyBtn = card.querySelector(".applyReturnBtn");
      const statusSelect = card.querySelector(".returnStatusSelect");
      const actor = getCurrentUser();

      if (!allowed.length) {
        if (applyBtn) applyBtn.disabled = true;
        if (statusSelect) statusSelect.disabled = true;
      }

      const openReturnDetailBtn = card.querySelector(".openReturnDetailBtn");
      if (openReturnDetailBtn) {
        openReturnDetailBtn.addEventListener("click", () => openReturnModal(entry));
      }

      if (applyBtn) {
        applyBtn.addEventListener("click", async () => {
          const nextStatus = statusSelect?.value || "";
          if (!nextStatus) {
            showToast("Select a valid return transition.", "error");
            return;
          }

          const note = window.prompt("Decision note (optional):") || "";
          try {
            await appDb.updateReturnRequestStatus(entry.id, nextStatus, {
              decisionNote: note,
              reviewedBy: actor?.email || "",
              actorEmail: actor?.email || "",
              actorRole: "admin"
            });
            showToast(`Return moved to ${nextStatus.replace(/_/g, " ")}.`, "success");
          } catch (error) {
            console.error("Failed to update return status", error);
            if (error?.code === "invalid_return_status_transition") {
              const fromState = error?.meta?.from || String(entry.status || "requested");
              showToast(`Invalid transition: ${fromState} -> ${nextStatus}`, "error");
            } else {
              showToast("Failed to update return status.", "error");
            }
          }
        });
      }

      adminReturnRequests.appendChild(card);
    });
  }
  function renderProducts(products) {
    allProducts = products;
    renderProductFilterControls(products);
    const visibleProducts = getFilteredProducts(products);
    renderAvailableProductsCards(visibleProducts);

    if (!visibleProducts.length) {
      if (!products.length) {
        adminProductsList.innerHTML = "<p>No products yet.</p>";
      } else {
        adminProductsList.innerHTML = `
          <div class="admin-empty-state">
            <p>No products match your search/filter.</p>
            <button type="button" id="clearProductFiltersInlineBtn" class="admin-inline-action">Reset filters</button>
          </div>
        `;
        const clearFiltersBtn = document.getElementById("clearProductFiltersInlineBtn");
        if (clearFiltersBtn) {
          clearFiltersBtn.addEventListener("click", () => resetProductFilters());
        }
      }
      renderMetrics();
      renderAnalytics();
      return;
    }

    adminProductsList.innerHTML = "";

    const lowStockCount = visibleProducts.filter((product) => {
      const stock = Number(product.stock);
      return Number.isFinite(stock) && stock > 0 && stock <= lowStockThreshold;
    }).length;
    const outOfStockCount = visibleProducts.filter((product) => Number(product.stock) <= 0).length;

    if (lowStockCount || outOfStockCount) {
      const summary = document.createElement("div");
      summary.className = "admin-stock-summary";
      summary.innerHTML = `<strong>Stock alerts:</strong><span>Low stock: ${lowStockCount}</span><span>Out of stock: ${outOfStockCount}</span>`;
      adminProductsList.appendChild(summary);
    }

    visibleProducts.forEach((product) => {
      const stockState = getStockState(product.stock);
      const tags = Array.isArray(product.tags) && product.tags.length ? product.tags.join(", ") : "No tags";
      const category = product.category || "General";
      const thumbUrl = normalizeImageUrl(product.image);
      const checkoutLink = buildProductUrl(product.id);

      const card = document.createElement("div");
      card.className = "admin-product-card";
      card.innerHTML = `
        <div class="admin-order-thumb-wrap admin-product-thumb-wrap">
          ${renderThumbMarkup(thumbUrl, product.name || "", "admin-product-thumb")}
        </div>
        <div class="admin-order-content admin-product-content">
          <div class="admin-order-top admin-product-top">
            <strong>${escapeHtml(product.name || `Product #${product.id}`)}</strong>
            <span class="admin-product-id">#${escapeHtml(String(product.id))}</span>
          </div>
          <div class="admin-order-meta admin-product-meta">
            <span>${escapeHtml(category)}</span>
            <span>Size: ${escapeHtml(String(product.size || "N/A"))}</span>
            <span>${escapeHtml(formatMoney(product.price))}</span>
            <span>Stock: ${escapeHtml(String(product.stock ?? "N/A"))}</span>
          </div>
          <p class="admin-order-sub admin-product-sub">Tags: ${escapeHtml(tags)}</p>
          <span class="stock-pill ${stockState.className}">${escapeHtml(stockState.label)}</span>
          <div class="admin-order-actions admin-product-actions">
            <button class="editBtn" type="button">Edit</button>
            <button class="copyCheckoutBtn" type="button">Copy product link</button>
            <button class="deleteBtn danger" type="button">Delete product</button>
            <a href="${escapeHtml(checkoutLink)}" target="_blank" rel="noopener noreferrer">Open checkout</a>
          </div>
        </div>
      `;

      card.querySelector(".editBtn").addEventListener("click", () => fillProductForm(product));
      card.querySelector(".copyCheckoutBtn").addEventListener("click", async () => {
        const link = buildProductUrl(product.id);
        await copyText(link, `Product link copied for product #${product.id}.`);
      });
      card.querySelector(".deleteBtn").addEventListener("click", async () => {
        const confirmed = window.confirm(`Delete product #${product.id}? This will hide it from listings.`);
        if (!confirmed) return;
        try {
          await appDb.deleteProduct(product.id);
          showToast(`Deleted product #${product.id}.`, "success");
        } catch (error) {
          console.error("Failed to delete product", error);
          showToast("Failed to delete product.", "error");
        }
      });

      adminProductsList.appendChild(card);
    });

    renderMetrics();
    renderAnalytics();
  }

  function getInvoiceUrl(order) {
    const params = new URLSearchParams();
    if (order?.id) params.set("order_id", String(order.id));
    if (order?.uid) params.set("uid", String(order.uid));
    return `invoice.html?${params.toString()}`;
  }

  function renderOrdersPagination() {
    if (!adminOrdersPagination) return;

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
    if (currentOrdersPage > totalPages) currentOrdersPage = totalPages;

    adminOrdersPagination.innerHTML = `
      <button type="button" data-page="${Math.max(1, currentOrdersPage - 1)}" ${currentOrdersPage <= 1 ? "disabled" : ""}>Prev</button>
      <span>Page ${currentOrdersPage} of ${totalPages}</span>
      <button type="button" data-page="${Math.min(totalPages, currentOrdersPage + 1)}" ${currentOrdersPage >= totalPages ? "disabled" : ""}>Next</button>
    `;
  }

  function renderOrders(orders) {
    allOrders = Array.isArray(orders) ? orders : [];
    const statusFilter = adminStatusFilter?.value || "all";
    const searchValue = adminOrderSearch?.value?.trim() || "";
    filteredOrders = allOrders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) {
        return false;
      }
      return matchesOrderSearch(order, searchValue);
    });

    if (!filteredOrders.length) {
      adminOrdersList.innerHTML = "<p>No matching orders.</p>";
      if (adminOrdersPagination) adminOrdersPagination.innerHTML = "";
      renderMetrics();
      renderAnalytics();
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
    if (currentOrdersPage > totalPages) currentOrdersPage = totalPages;
    if (currentOrdersPage < 1) currentOrdersPage = 1;

    const start = (currentOrdersPage - 1) * ORDERS_PAGE_SIZE;
    const pageOrders = filteredOrders.slice(start, start + ORDERS_PAGE_SIZE);

    adminOrdersList.innerHTML = "";

    pageOrders.forEach((order) => {
      const createdAt = formatDateTime(order.createdAt);
      const updatedAt = formatDateTime(order.updatedAt);
      const orderTitle = order.productName || `Product #${order.productId || "N/A"}`;
      const email = order.email || order.contactEmail || "N/A";
      const statusLabel = String(order.status || "pending").replace(/_/g, " ");
      const notes = String(order.orderNotes || "No notes");
      const detailsBlock = [
        `Order ID: ${order.id || "N/A"}`,
        `UID: ${order.uid || "N/A"}`,
        `Product: ${orderTitle}`,
        `Product ID: ${order.productId || "N/A"}`,
        `Qty: ${Number(order.quantity || 0)}`,
        `Total: ${formatMoney(order.totalPrice)}`,
        `Status: ${statusLabel}`,
        `Created: ${createdAt}`,
        `Updated: ${updatedAt}`
      ].join("\n");

      const card = document.createElement("div");
      card.className = "admin-order-card";
      card.innerHTML = `
        <div class="admin-order-thumb-wrap">
          ${renderThumbMarkup(order.productImage, orderTitle, "admin-order-thumb")}
        </div>
        <div class="admin-order-content">
          <div class="admin-order-top">
            <strong>${escapeHtml(orderTitle)}</strong>
            <span class="order-status-pill ${escapeHtml(String(order.status || "pending"))}">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="admin-order-meta">
            <span>#${escapeHtml(String(order.id || "N/A"))}</span>
            <span>Product ID: ${escapeHtml(String(order.productId || "N/A"))}</span>
            <span>Qty: ${escapeHtml(String(order.quantity || 0))}</span>
            <span>${escapeHtml(formatMoney(order.totalPrice))}</span>
          </div>
          <p class="admin-order-sub">${escapeHtml(email)}</p>
          <p class="admin-order-sub">${escapeHtml(notes)}</p>
          <div class="admin-order-actions">
            <select class="statusSelect">
              <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pending</option>
              <option value="in_transit" ${order.status === "in_transit" ? "selected" : ""}>In Transit</option>
              <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>Delivered</option>
              <option value="canceled" ${order.status === "canceled" ? "selected" : ""}>Canceled</option>
            </select>
            <button class="applyStatusBtn" type="button">Update</button>
            <button class="copyOrderDetailsBtn" type="button">Copy details</button>
            <a href="${getInvoiceUrl(order)}" class="invoice-link" target="_blank" rel="noopener noreferrer">Invoice</a>
          </div>
        </div>
      `;

      card.querySelector(".applyStatusBtn").addEventListener("click", async () => {
        const nextStatus = card.querySelector(".statusSelect")?.value || "pending";
        try {
          const actor = getCurrentUser();
          await appDb.updateOrderStatus(order.uid, order.id, nextStatus, {
            actorUid: actor?.uid || "",
            actorEmail: actor?.email || "",
            actorRole: "admin",
            source: "admin_panel_compact"
          });
          showToast(`Order ${order.id} updated to ${nextStatus.replace(/_/g, " ")}.`, "success");
        } catch (error) {
          console.error("Failed to update order status", error);
          if (error?.code === "out_of_stock" || error?.message === "out_of_stock") {
            showToast("Not enough stock to update this order.", "error");
          } else {
            showToast("Failed to update order status.", "error");
          }
        }
      });

      card.querySelector(".copyOrderDetailsBtn").addEventListener("click", () => {
        copyText(detailsBlock, `Copied order #${order.id} details.`);
      });

      adminOrdersList.appendChild(card);
    });

    renderOrdersPagination();
    renderMetrics();
    renderAnalytics();
  }
  function renderAuditLog(entries) {
    if (!adminAuditLog) return;
    if (!entries.length) {
      adminAuditLog.innerHTML = "<p>No audit entries yet.</p>";
      return;
    }

    adminAuditLog.innerHTML = "";
    entries.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "admin-item";
      card.innerHTML = `
        <div class="admin-item-main">
          <strong>Order ${entry.orderId || "N/A"}</strong>
          <span>${entry.actorEmail || "Unknown actor"} (${entry.actorRole || "unknown"})</span>
          <span>Status: ${(entry.previousStatus || "unknown").replace(/_/g, " ")} -> ${(entry.nextStatus || "unknown").replace(/_/g, " ")}</span>
          <span>Source: ${entry.source || "unknown"}</span>
          <span>When: ${formatDateTime(entry.createdAt)}</span>
        </div>
      `;
      adminAuditLog.appendChild(card);
    });
  }

  function escapeCsvCell(value) {
    const raw = String(value ?? "");
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  }

  function exportOrdersAsCsv() {
    if (!filteredOrders.length) {
      showToast("No orders to export.", "info");
      return;
    }

    const header = ["orderId", "uid", "email", "productId", "productName", "productCategory", "productTags", "quantity", "unitPrice", "shippingFee", "totalPrice", "paymentMethod", "deliveryMethod", "orderNotes", "status", "createdAt", "updatedAt", "estimatedDeliveryAt"];
    const lines = [header.join(",")];

    filteredOrders.forEach((order) => {
      const row = [
        order.id || "",
        order.uid || "",
        order.email || order.contactEmail || "",
        order.productId || "",
        order.productName || "",
        order.productCategory || "",
        Array.isArray(order.productTags) ? order.productTags.join("|") : "",
        Number(order.quantity || 0),
        Number(order.unitPrice || 0),
        Number(order.shippingFee || 0),
        Number(order.totalPrice || 0),
        order.paymentMethod || "",
        order.deliveryMethod || "",
        order.orderNotes || "",
        order.status || "",
        order.createdAt ? new Date(order.createdAt).toISOString() : "",
        order.updatedAt ? new Date(order.updatedAt).toISOString() : "",
        order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toISOString() : ""
      ].map(escapeCsvCell).join(",");
      lines.push(row);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Orders CSV exported.", "success");
  }

  function exportDailySalesCsv() {
    const rows = buildDailySalesRows(allOrders);
    if (!rows.length) {
      showToast("No daily sales data to export.", "info");
      return;
    }

    const lines = ["date,orders,revenue"];
    rows.forEach((row) => {
      lines.push(`${escapeCsvCell(row.date)},${escapeCsvCell(row.orders)},${escapeCsvCell(row.revenue.toFixed(2))}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Daily sales CSV exported.", "success");
  }

  function exportProductsAsJson() {
    if (!allProducts.length) {
      showToast("No products to export.", "info");
      return;
    }

    const payload = allProducts.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((product) => ({
      id: Number(product.id),
      name: String(product.name || ""),
      size: String(product.size || ""),
      price: Number(product.price || 0),
      image: String(product.image || ""),
      stock: Number(product.stock || 0),
      category: String(product.category || "General"),
      tags: Array.isArray(product.tags) ? product.tags : [],
      isActive: product.isActive !== false
    }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `products-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Products JSON exported.", "success");
  }

  async function importProductsFromJson(file) {
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error("invalid_format");

      let imported = 0;
      for (const item of parsed) {
        const id = Number(item?.id);
        if (!Number.isFinite(id) || id <= 0) continue;

        await appDb.upsertProduct({
          id,
          name: String(item?.name || `Product ${id}`),
          size: String(item?.size || "N/A"),
          price: Number(item?.price || 0),
          image: String(item?.image || ""),
          stock: Number(item?.stock || 0),
          category: String(item?.category || "General"),
          tags: normalizeTagList(item?.tags),
          isActive: item?.isActive !== false
        });
        imported += 1;
      }

      showToast(imported ? `Imported ${imported} products.` : "No valid products found in file.", imported ? "success" : "info");
    } catch (error) {
      console.error("Failed to import products JSON", error);
      showToast("Failed to import products JSON.", "error");
    } finally {
      if (importProductsJsonInput) importProductsJsonInput.value = "";
    }
  }

  function stopRealtimeListeners() {
    if (stopProducts) stopProducts();
    if (stopOrders) stopOrders();
    if (stopAudit) stopAudit();
    if (stopReturns) stopReturns();
    if (stopNotifications) stopNotifications();
    if (deferredListenersTimer) clearTimeout(deferredListenersTimer);
    if (analyticsRefreshTimer) clearTimeout(analyticsRefreshTimer);
    stopProducts = null;
    stopOrders = null;
    stopAudit = null;
    stopReturns = null;
    stopNotifications = null;
    deferredListenersTimer = null;
    analyticsRefreshTimer = null;
    analyticsRefreshInFlight = false;
    analyticsRefreshQueued = false;
    lastAnalyticsRefreshAt = 0;
    listenersStarted = false;
  }

  function startDeferredRealtimeListeners(user) {
    if (!listenersStarted) return;

    if (typeof appDb.watchOrderAudit === "function") {
      stopAudit = appDb.watchOrderAudit(
        (entries) => renderAuditLog(entries),
        (error) => {
          console.error("Order audit listener error", error);
          adminAuditLog.innerHTML = "<p>Failed to load audit log.</p>";
        },
        40
      );
    } else if (adminAuditLog) {
      adminAuditLog.innerHTML = "<p>Audit log API is not available.</p>";
    }

    if (typeof appDb.watchReturnRequests === "function") {
      stopReturns = appDb.watchReturnRequests(
        (entries) => renderReturnRequests(entries),
        (error) => {
          console.error("Return request listener error", error);
          if (adminReturnRequests) adminReturnRequests.innerHTML = "<p>Failed to load return requests.</p>";
        },
        60
      );
    } else if (adminReturnRequests) {
      adminReturnRequests.innerHTML = "<p>Return request API is not available.</p>";
    }

    if (user?.uid && typeof appDb.watchUserNotifications === "function") {
      stopNotifications = appDb.watchUserNotifications(
        user.uid,
        (entries) => renderNotifications(entries),
        (error) => {
          console.error("Notification listener error", error);
          if (adminNotificationsList) adminNotificationsList.innerHTML = "<p>Failed to load notifications.</p>";
        },
        60
      );
    } else if (adminNotificationsList) {
      adminNotificationsList.innerHTML = "<p>Notification API is not available.</p>";
    }
  }

  function startRealtimeListeners(user) {
    if (listenersStarted) return;
    listenersStarted = true;

    stopProducts = appDb.watchProducts(
      (products) => renderProducts(products),
      (error) => {
        console.error("Product listener error", error);
        adminProductsList.innerHTML = "<p>Failed to load products.</p>";
      }
    );

    if (ORDERS_ENABLED) {
      stopOrders = appDb.watchAllOrders(
        (orders) => {
          renderOrders(orders);
          scheduleAnalyticsRefresh(1200, false);
        },
        (error) => {
          console.error("Order listener error", error);
          const denied = String(error?.code || "") === "permission-denied";
          adminOrdersList.innerHTML = denied
            ? "<p>Permission denied loading orders. Sign out/in and ensure users/&lt;uid&gt;.role is admin in Firestore.</p>"
            : "<p>Failed to load orders.</p>";
        },
        { limitCount: INITIAL_ORDERS_LIMIT }
      );

      scheduleAnalyticsRefresh(500, true);
    } else {
      allOrders = [];
      filteredOrders = [];
      if (adminOrdersList) {
        adminOrdersList.innerHTML = "<p>Orders module disabled.</p>";
      }
      if (adminOrdersPagination) {
        adminOrdersPagination.innerHTML = "";
      }
    }
    deferredListenersTimer = setTimeout(() => {
      deferredListenersTimer = null;
      startDeferredRealtimeListeners(user);
    }, 700);
  }
  async function refreshRoleFromServer(user, options) {
    if (!user?.uid || roleRefreshInFlight || typeof appDb.getUserProfile !== "function") {
      return "";
    }

    roleRefreshInFlight = true;
    try {
      let profile = await withTimeout(
        appDb.getUserProfile(user.uid),
        3500,
        "role_timeout",
        "Admin role check timed out."
      );
      if (!profile && typeof appDb.ensureUserDocument === "function") {
        profile = await withTimeout(
          appDb.ensureUserDocument(user),
          2500,
          "role_timeout",
          "Admin role check timed out."
        );
      }
      const role = String(profile?.role || "").toLowerCase();
      if (role) {
        writeCachedRole(user.uid, role);
        currentUserRole = role;
      }
      return role;
    } catch (error) {
      if (!options?.silent) {
        if (String(error?.code || "") === "role_timeout") {
          console.info("Admin role lookup timed out. Using cached role.");
        } else {
          console.info("Failed to resolve user role. Using cached role.", error);
        }
      }
      return "";
    } finally {
      roleRefreshInFlight = false;
    }
  }

  async function resolveUserWithRole(user) {
    if (!user?.uid) return user;

    const cachedRole = readCachedRole(user.uid) || String(localStorage.getItem("userRole") || "").toLowerCase();
    if (cachedRole) {
      refreshRoleFromServer(user, { silent: true }).catch(() => {});
      return { ...user, role: cachedRole };
    }

    const liveRole = await Promise.race([
      refreshRoleFromServer(user, { silent: true }),
      new Promise((resolve) => setTimeout(() => resolve(""), 1200))
    ]);
    if (!liveRole) {
      refreshRoleFromServer(user, { silent: true }).catch(() => {});
    }
    return { ...user, role: String(liveRole || cachedRole || "").toLowerCase() };
  }

  async function handleAdminAccess(user, loginMessage) {
    stopRealtimeListeners();

    if (!user?.uid) {
      currentUserRole = "";
      clearCachedRole();
      await renderUserPanel(null);
      window.location.replace("admin.html");
      return;
    }

    const resolvedUser = await resolveUserWithRole(user);

    const role = String(resolvedUser?.role || "").toLowerCase();
    currentUserRole = role;
    if (role) {
      writeCachedRole(resolvedUser.uid, role);
    }
    if (role && role !== "admin") {
      await auth.signOut();
      currentUserRole = "";
      clearCachedRole();
      await renderUserPanel(null);
      const message = `This account is not an admin. Set users/${resolvedUser?.uid || "YOUR_UID"}.role to "admin".`;
      try {
        sessionStorage.setItem("adminLoginError", message);
      } catch {}
      window.location.replace("admin.html");
      return;
    }

    if (!role) {
      refreshRoleFromServer(resolvedUser, { silent: true })
        .then(async (latestRole) => {
          const normalized = String(latestRole || "").toLowerCase();
          if (!normalized || normalized === "admin") return;
          try {
            await auth.signOut();
          } catch {}
          currentUserRole = "";
          clearCachedRole();
          window.location.replace("admin.html");
        })
        .catch(() => {});
    }

    // if role cannot be resolved, continue loading panel and let write operations report exact permission errors
    await renderUserPanel(resolvedUser);
    bindLogoutButton(adminHeaderLogoutBtn);
    showAdminContent();
    renderMetrics();
    setSkeleton(adminNotificationsList, 3);
    setSkeleton(adminProductsList, 4);
    if (ORDERS_ENABLED) {
      setSkeleton(adminOrdersList, 4);
    } else if (adminOrdersList) {
      adminOrdersList.innerHTML = "<p>Orders module disabled.</p>";
      if (adminOrdersPagination) adminOrdersPagination.innerHTML = "";
    }
    setSkeleton(adminReturnRequests, 3);
    startRealtimeListeners(resolvedUser);
  }

  clearProductBtn.addEventListener("click", () => resetProductForm());

  if (adminLowStockThresholdInput) {
    adminLowStockThresholdInput.value = String(lowStockThreshold);
  }

  if (saveLowStockThresholdBtn) {
    saveLowStockThresholdBtn.addEventListener("click", () => {
      const parsed = Number(adminLowStockThresholdInput?.value);
      if (!Number.isFinite(parsed) || parsed < 1) {
        showToast("Enter a valid threshold value.", "error");
        return;
      }
      lowStockThreshold = Math.round(parsed);
      localStorage.setItem("lowStockThreshold", String(lowStockThreshold));
      renderProducts(allProducts);
      showToast(`Low-stock threshold set to ${lowStockThreshold}.`, "success");
    });
  }

  if (copyProductLinkBtn) {
    copyProductLinkBtn.addEventListener("click", () => {
      copyGeneratedLink().catch((error) => console.error("Copy action failed", error));
    });
  }

  if (exportProductsJsonBtn) exportProductsJsonBtn.addEventListener("click", exportProductsAsJson);
  if (exportDailySalesCsvBtn) exportDailySalesCsvBtn.addEventListener("click", exportDailySalesCsv);
  if (markAllAdminNotificationsBtn) {
    markAllAdminNotificationsBtn.addEventListener("click", async () => {
      const user = getCurrentUser();
      if (!user?.uid || typeof appDb.markAllNotificationsRead !== "function") return;
      try {
        const count = await appDb.markAllNotificationsRead(user.uid);
        showToast(count ? `Marked ${count} notifications as read.` : "No unread notifications.", "success");
      } catch (error) {
        console.error("Failed to mark all notifications read", error);
        showToast("Failed to mark notifications.", "error");
      }
    });
  }

  if (returnModalCloseBtn) {
    returnModalCloseBtn.addEventListener("click", closeReturnModal);
  }
  if (returnRequestModal) {
    returnRequestModal.addEventListener("click", (event) => {
      if (event.target === returnRequestModal) {
        closeReturnModal();
      }
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && returnRequestModal && !returnRequestModal.classList.contains("hidden")) {
      closeReturnModal();
    }
  });

  if (importProductsJsonInput) {
    importProductsJsonInput.addEventListener("change", async () => {
      const file = importProductsJsonInput.files && importProductsJsonInput.files[0];
      await importProductsFromJson(file);
    });
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = adminEmailInput?.value?.trim() || "";
      const password = adminPasswordInput?.value || "";

      if (!email || !password) {
        setLoginError("Enter admin email and password.");
        return;
      }

      // authService used for sign-in
      // const auth = appAuth.getAuthInstance();
      if (!auth) {
        setLoginError("Authentication is unavailable. Please refresh the page.");
        return;
      }

      setLoginError("");
      if (adminLoginBtn) adminLoginBtn.disabled = true;

      try {
        const credential = await auth.signIn(email, password);
        await handleAdminAccess(credential.user || getCurrentUser(), "");
        if (adminPasswordInput) adminPasswordInput.value = "";
      } catch (error) {
        console.error("Admin sign-in failed", error);
        setLoginError(formatAdminLoginError(error));
      } finally {
        if (adminLoginBtn) adminLoginBtn.disabled = false;
      }
    });
  }

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (savingProduct) return;

    const id = Number(productIdInput.value);
    const name = productNameInput.value.trim();
    const size = productSizeInput.value.trim();
    const price = Number(productPriceInput.value);
    const image = productImageInput.value.trim();
    const stock = Number(productStockInput.value);
    const category = (productCategoryInput.value || "General").trim();
    const tags = normalizeTagList(productTagsInput.value);

    if (!id || !name || !size || !Number.isFinite(price) || price < 0 || !image || !Number.isFinite(stock) || stock < 0) {
      showToast("Please fill all product fields correctly.", "error");
      setProductFormStatus("Please fill all product fields correctly.", "error");
      return;
    }

    if (!appDb || !appDb.isConfigured()) {
      showToast("Database is not configured. Cannot save product.", "error");
      setProductFormStatus("Database is not configured. Cannot save product.", "error");
      console.error("appDb is not available");
      return;
    }

    savingProduct = true;
    if (saveProductBtn) saveProductBtn.disabled = true;
    setProductFormStatus("Saving product...", "info");

    try {
      const sessionUser = await withTimeout(
        waitForAuthUser(5000),
        7000,
        "auth_timeout",
        "Authentication check timed out."
      );
      if (!sessionUser?.uid) {
        const err = new Error("auth_required");
        err.code = "auth_required";
        throw err;
      }

      const roleHint = String(currentUserRole || readCachedRole(sessionUser.uid) || localStorage.getItem("userRole") || "").toLowerCase();
      if (roleHint && roleHint !== "admin") {
        const roleErr = new Error("not_admin");
        roleErr.code = "not_admin";
        throw roleErr;
      }

      console.log("Attempting to save product", { id, name, uid: sessionUser.uid });
      const savePromise = appDb.upsertProduct({
        id,
        name,
        size,
        price,
        image,
        stock,
        category: category || "General",
        tags,
        isActive: true
      });
      let saved = null;
      try {
        saved = await withTimeout(
          savePromise,
          15000,
          "save_timeout",
          "Saving product is taking too long."
        );
      } catch (error) {
        if (String(error?.code || "") !== "save_timeout") {
          throw error;
        }

        setProductFormStatus("Slow network detected. Still saving to Firebase...", "info");
        showToast("Slow network detected. Waiting for Firebase write...", "info");
        saved = await withTimeout(
          savePromise,
          45000,
          "save_timeout_final",
          "Saving product timed out. Check network and Firestore write rules, then try again."
        );
      }
      if (!saved || Number(saved.id) !== id) {
        const err = new Error("save_failed");
        err.code = "save_failed";
        throw err;
      }

      currentUserRole = "admin";
      writeCachedRole(sessionUser.uid, "admin");

      resetProductForm({ keepLink: true });
      showProductLink(id);
      showToast(`Saved product #${id}.`, "success");
      setProductFormStatus(`Saved product #${id}.`, "success");
    } catch (error) {
      console.error("Failed to save product", error);
      const message = error?.code === "permission-denied"
        ? "Permission denied: this account cannot write products. Check users/<uid>.role = \"admin\" in Firestore."
        : error?.code === "unauthenticated"
          ? "Session expired. Please sign in again."
        : error?.code === "not_admin"
          ? "Account is signed in but not admin. Set users/<uid>.role to \"admin\"."
          : error?.code === "rest_fallback_unavailable"
            ? "Save fallback is unavailable. Please refresh and sign in again."
          : error?.code === "rest_write_failed"
            ? "Firebase REST write failed. Check Firestore rules and project config."
          : error?.code === "save_timeout_final"
            ? "Saving timed out. Your network or Firestore rules may be blocking writes."
          : error?.code === "auth_required"
            ? "Sign in again as admin to save products."
            : (error?.message || String(error) || "Failed to save product.");
      showToast(message, "error");
      setProductFormStatus(message, "error");
    } finally {
      savingProduct = false;
      if (saveProductBtn) saveProductBtn.disabled = false;
    }
  });

  if (adminClearOrderBtn) {
    adminClearOrderBtn.addEventListener("click", () => {
      resetOrderForm();
      setOrderFormStatus("", "info");
    });
  }

  if (adminOrderForm) {
    adminOrderForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (savingOrder) return;
      if (typeof appDb.createOrder !== "function") {
        setOrderFormStatus("Order API is unavailable.", "error");
        showToast("Order API is unavailable.", "error");
        return;
      }

      const actor = getCurrentUser();
      const uid = (adminOrderUidInput?.value || "").trim() || String(actor?.uid || "");
      const emailInput = (adminOrderEmailInput?.value || "").trim();
      const contactEmail = (adminOrderContactEmailInput?.value || "").trim();
      const email = emailInput || contactEmail || String(actor?.email || "");
      const productId = Number(adminOrderProductIdInput?.value);
      const quantity = Number(adminOrderQuantityInput?.value);
      const shippingFee = Math.max(0, Number(adminOrderShippingFeeInput?.value || 0));
      const orderNotes = (adminOrderNotesInput?.value || "").trim();
      const shippingOption = adminOrderShippingOptionInput?.value || "standard_shipping";
      const paymentMethod = adminOrderPaymentMethodInput?.value || "cash_on_delivery";
      const deliveryMethod = adminOrderDeliveryMethodInput?.value || "ship";

      if (!uid) {
        setOrderFormStatus("Customer UID is required. You can leave it blank to use your current UID.", "error");
        showToast("Customer UID is required.", "error");
        return;
      }
      if (!Number.isFinite(productId) || productId <= 0) {
        setOrderFormStatus("Enter a valid Product ID.", "error");
        showToast("Enter a valid Product ID.", "error");
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setOrderFormStatus("Enter a valid quantity.", "error");
        showToast("Enter a valid quantity.", "error");
        return;
      }
      if (!email) {
        setOrderFormStatus("Customer email is required.", "error");
        showToast("Customer email is required.", "error");
        return;
      }

      savingOrder = true;
      if (adminSaveOrderBtn) adminSaveOrderBtn.disabled = true;
      setOrderFormStatus("Creating order...", "info");

      try {
        const product = await appDb.getProductById(productId);
        if (!product) {
          const err = new Error("product_not_found");
          err.code = "product_not_found";
          throw err;
        }

        const draft = {
          productId,
          productName: product.name || `Product #${productId}`,
          productSize: product.size || "N/A",
          productImage: product.image || "",
          productCategory: product.category || "General",
          productTags: Array.isArray(product.tags) ? product.tags : [],
          quantity,
          unitPrice: Number(product.price || 0),
          shippingFee,
          shippingOption,
          paymentMethod,
          deliveryMethod,
          totalPrice: Number(product.price || 0) * quantity + shippingFee,
          contactEmail,
          orderNotes,
          shippingAddress: {
            country: "",
            firstName: email.split("@")[0] || "Customer",
            lastName: "",
            company: "",
            addressLine1: "Manual admin order",
            addressLine2: "",
            postalCode: "",
            city: "",
            province: "",
            phone: ""
          }
        };

        const created = await withTimeout(
          appDb.createOrder(uid, email, draft),
          20000,
          "create_order_timeout",
          "Order creation timed out."
        );
        resetOrderForm();
        setOrderFormStatus(`Order created: ${created?.id || "success"}.`, "success");
        showToast(`Order created: ${created?.id || "success"}.`, "success");
      } catch (error) {
        console.error("Failed to create order", error);
        const message = error?.code === "permission-denied"
          ? "Permission denied creating order. Check admin role."
          : error?.code === "product_not_found"
            ? "Product not found."
            : error?.code === "out_of_stock"
              ? "Not enough stock for this order."
              : error?.code === "create_order_timeout"
                ? "Order creation timed out. Try again."
                : (error?.message || "Failed to create order.");
        setOrderFormStatus(message, "error");
        showToast(message, "error");
      } finally {
        savingOrder = false;
        if (adminSaveOrderBtn) adminSaveOrderBtn.disabled = false;
      }
    });
  }

  if (adminStatusFilter) {
    adminStatusFilter.addEventListener("change", () => {
      currentOrdersPage = 1;
      renderOrders(allOrders);
    });
  }
  if (adminOrderSearch) {
    adminOrderSearch.addEventListener("input", () => {
      currentOrdersPage = 1;
      renderOrders(allOrders);
    });
  }

  if (adminProductSearch) adminProductSearch.addEventListener("input", () => renderProducts(allProducts));
  if (adminStockFilter) adminStockFilter.addEventListener("change", () => renderProducts(allProducts));
  if (adminCategoryFilter) adminCategoryFilter.addEventListener("change", () => renderProducts(allProducts));
  if (adminTagFilter) adminTagFilter.addEventListener("input", () => renderProducts(allProducts));
  if (adminMinPriceFilter) adminMinPriceFilter.addEventListener("input", () => renderProducts(allProducts));
  if (adminMaxPriceFilter) adminMaxPriceFilter.addEventListener("input", () => renderProducts(allProducts));
  if (exportOrdersCsvBtn) exportOrdersCsvBtn.addEventListener("click", exportOrdersAsCsv);

  if (adminOrdersPagination) {
    adminOrdersPagination.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const pageValue = Number(target.dataset.page);
      if (!Number.isFinite(pageValue) || pageValue < 1) return;
      currentOrdersPage = pageValue;
      renderOrders(allOrders);
    });
  }

  if (adminTabs && adminTabButtons.length && adminTabPanels.length) {
    adminTabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-admin-tab-target]");
      if (!button) return;
      switchAdminTab(button.dataset.adminTabTarget || "overview");
    });
    switchAdminTab("overview");
  }

  // initial admin access check using resolved sign-in state
  await handleAdminAccess(signedIn, "");

  window.addEventListener("beforeunload", () => stopRealtimeListeners());
});
