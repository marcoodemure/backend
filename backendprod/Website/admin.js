
document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;
  const appDb = window.appDb;

  const adminContent = document.getElementById("adminContent");
  const adminUnauthorized = document.getElementById("adminUnauthorized");
  const adminUserPanel = document.getElementById("adminUserPanel");
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
  const clearProductBtn = document.getElementById("clearProductBtn");
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

  if (!adminContent || !adminUnauthorized || !adminUserPanel || !productForm || !adminProductsList || !adminOrdersList) {
    console.error("admin.js: required elements are missing");
    return;
  }

  if (!auth || !appDb || !auth.isConfigured() || !appDb.isConfigured()) {
    showSetupError("<strong>Setup required.</strong> Firebase config/scripts are missing.");
    return;
  }

  // ensure the user is signed in and has admin role when accessing panel
  const signedIn = auth.getCurrentUser();
  if (!signedIn || !signedIn.uid) {
    // not logged in, drop back to login page
    window.location.href = "admin.html";
    return;
  }
  try {
    const profile = await appDb.ensureUserDocument(signedIn);
    if (profile?.role !== "admin") {
      await auth.signOut();
      window.location.href = "admin.html";
      return;
    }
  } catch (err) {
    console.error("Failed to verify admin role", err);
    // redirect any uncertainty back to login
    window.location.href = "admin.html";
    return;
  }

  let lowStockThreshold = Math.max(1, Number(localStorage.getItem("lowStockThreshold")) || 5);
  const ORDERS_PAGE_SIZE = 8;

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
  let activeTagChip = "";
  let allReturnRequests = [];
  let allNotifications = [];
  let backendAnalyticsSummary = null;

  function getCurrentUser() {
    return auth.getCurrentUser();
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

  function getFilteredProducts(products) {
    const searchValue = adminProductSearch?.value?.trim() || "";
    const stockFilter = adminStockFilter?.value || "all";
    const categoryFilter = adminCategoryFilter?.value || "all";
    const tagValue = (adminTagFilter?.value || "").trim().toLowerCase();
    const minPrice = Number(adminMinPriceFilter?.value);
    const maxPrice = Number(adminMaxPriceFilter?.value);
    const chip = activeTagChip.toLowerCase();

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
      if (chip && !tags.includes(chip)) return false;
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

    if (adminTagChips) {
      const tags = Array.from(new Set(products.flatMap((item) => Array.isArray(item.tags) ? item.tags : [])))
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 40);

      adminTagChips.innerHTML = "";
      tags.forEach((tag) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `tag-chip${activeTagChip === tag ? " active" : ""}`;
        chip.textContent = tag;
        chip.addEventListener("click", () => {
          activeTagChip = activeTagChip === tag ? "" : tag;
          renderProductFilterControls(allProducts);
          renderProducts(allProducts);
        });
        adminTagChips.appendChild(chip);
      });
    }
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
      <button id="adminLogoutBtn" type="button">Log out</button>
    `;

    const logoutBtn = document.getElementById("adminLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await auth.signOut();
        window.location.href = "admin.html";
      });
    }
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

  function getStockState(stockValue) {
    const stock = Number(stockValue);
    if (!Number.isFinite(stock)) return { label: "Stock N/A", className: "stock-na" };
    if (stock <= 0) return { label: "Out of stock", className: "stock-out" };
    if (stock <= lowStockThreshold) return { label: `Low stock (${stock})`, className: "stock-low" };
    return { label: `In stock (${stock})`, className: "stock-ok" };
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
    if (typeof appDb.getAnalyticsSummary !== "function") {
      return;
    }

    try {
      backendAnalyticsSummary = await appDb.getAnalyticsSummary({ days: 30 });
    } catch (error) {
      console.error("Failed to load backend analytics summary", error);
      backendAnalyticsSummary = null;
    }
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

    if (!visibleProducts.length) {
      adminProductsList.innerHTML = products.length ? "<p>No products match your search/filter.</p>" : "<p>No products yet.</p>";
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

      const card = document.createElement("div");
      card.className = "admin-item";
      card.innerHTML = `
        <div class="admin-item-main">
          <strong>#${product.id} - ${product.name}</strong>
          <span>Category: ${category} | Size: ${product.size} | Price: ${formatMoney(product.price)}</span>
          <span>Tags: ${tags}</span>
          <span class="stock-pill ${stockState.className}">${stockState.label}</span>
        </div>
        <div class="admin-item-actions">
          <button class="editBtn" type="button">Edit</button>
          <button class="deleteBtn" type="button">Archive</button>
        </div>
      `;

      card.querySelector(".editBtn").addEventListener("click", () => fillProductForm(product));
      card.querySelector(".deleteBtn").addEventListener("click", async () => {
        try {
          await appDb.deleteProduct(product.id);
          showToast(`Archived product #${product.id}.`, "success");
        } catch (error) {
          console.error("Failed to archive product", error);
          showToast("Failed to archive product.", "error");
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
    allOrders = orders;
    const filter = adminStatusFilter.value || "all";
    filteredOrders = filter === "all" ? [...allOrders] : allOrders.filter((order) => order.status === filter);

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
      const eta = order.status === "canceled" ? "Canceled" : formatDateTime(getEstimatedDelivery(order));
      const notes = order.orderNotes ? order.orderNotes : "No notes";
      const courierNote = order.courierNote ? order.courierNote : "";
      const pickupDetails = order.pickupDetails && typeof order.pickupDetails === "object" ? order.pickupDetails : null;
      const pickupSummary = order.deliveryMethod === "pickup" && pickupDetails
        ? `Pickup: ${pickupDetails.pickupDate || "N/A"} ${pickupDetails.pickupTimeSlot || ""} | Ref ${pickupDetails.reference || "N/A"}`
        : "";
      const shippingAddress = order.shippingAddress && typeof order.shippingAddress === "object" ? order.shippingAddress : {};
      const contactPhone = String(shippingAddress.phone || pickupDetails?.contactPhone || "").trim();
      const telPhone = contactPhone.replace(/[^\d+]/g, "");
      const contactName = [
        String(shippingAddress.firstName || "").trim(),
        String(shippingAddress.lastName || "").trim()
      ].filter(Boolean).join(" ") || String(pickupDetails?.contactName || "").trim() || "N/A";
      const confidenceScore = Number(order.deliveryConfidence?.score || 0);
      const confidenceLevel = String(order.deliveryConfidence?.level || "low").toUpperCase();
      const confidenceLabel = `${confidenceLevel} (${confidenceScore}/100)`;
      const lat = Number(order.shippingLocation?.lat);
      const lng = Number(order.shippingLocation?.lng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      const coordinateText = hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "";
      const googleMapUrl = hasCoords ? `https://maps.google.com/?q=${encodeURIComponent(`${lat},${lng}`)}` : "";
      const mapSnapshotUrl = order.shippingLocationSnapshot?.embedUrl || order.shippingLocationSnapshot?.imageUrl || "";
      const mapLinkUrl = order.shippingLocationSnapshot?.mapUrl
        || (
          hasCoords
            ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`
            : ""
        );
      const fullAddressLines = order.deliveryMethod === "pickup"
        ? [
          "Pickup Point: Notre Dame of Dadiangas University (NDDU)",
          "Address: 459C+CJ6, Marist Ave, General Santos City, South Cotabato",
          `Pickup Contact: ${contactName}`,
          `Pickup Phone: ${contactPhone || "N/A"}`,
          `Pickup Reference: ${pickupDetails?.reference || "N/A"}`,
          `Pickup Schedule: ${pickupDetails?.pickupDate || "N/A"} ${pickupDetails?.pickupTimeSlot || ""}`.trim()
        ]
        : [
          `Recipient: ${contactName}`,
          `Phone: ${contactPhone || "N/A"}`,
          `Address: ${[
            shippingAddress.addressLine1,
            shippingAddress.addressLine2,
            shippingAddress.city,
            shippingAddress.province,
            shippingAddress.postalCode,
            shippingAddress.country
          ].filter(Boolean).join(", ") || "N/A"}`,
          `Coordinates: ${hasCoords ? coordinateText : "N/A"}`,
          `OSM: ${mapLinkUrl || "N/A"}`
        ];
      const fullAddressBlock = fullAddressLines.join("\n");
      const courierMapHtml = mapLinkUrl
        ? `
          <div class="admin-rider-card">
            <strong>Rider-ready delivery pin</strong>
            <span>Coordinates: ${coordinateText}</span>
            <div class="admin-rider-actions">
              <button type="button" class="copyCoordsBtn">Copy coordinates</button>
              <a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer" class="admin-courier-map-link">Open Google Maps</a>
              <a href="${mapLinkUrl}" target="_blank" rel="noopener noreferrer" class="admin-courier-map-link">Open OSM</a>
            </div>
          </div>
          ${mapSnapshotUrl ? `<img src="${mapSnapshotUrl}" alt="Courier map preview" class="admin-courier-map-image" onerror="this.style.display='none'">` : ""}
        `
        : "<span>Courier map pin: Not set</span>";
      const historyHtml = Array.isArray(order.statusHistory) && order.statusHistory.length
        ? order.statusHistory
          .slice()
          .reverse()
          .slice(0, 5)
          .map((entry) => `<span>${(entry.status || "pending").replace(/_/g, " ")} @ ${formatDateTime(entry.createdAt)} ${entry.note ? `- ${entry.note}` : ""}</span>`)
          .join("")
        : "<span>No status history yet.</span>";

      const card = document.createElement("div");
      card.className = "admin-item";
      card.innerHTML = `
        <div class="admin-item-main">
          <strong>Order ${order.id}</strong>
          <span>${order.email || order.contactEmail || "N/A"}</span>
          <span>${order.productName || `Product #${order.productId}`} | Qty: ${order.quantity} | Total: ${formatMoney(order.totalPrice)}</span>
          <span>Placed: ${createdAt}</span>
          <span>Last Updated: ${updatedAt}</span>
          <span>ETA: ${eta}</span>
          <span>Notes: ${notes}</span>
          ${pickupSummary ? `<span>${pickupSummary}</span>` : ""}
          <span>Delivery Confidence: ${confidenceLabel}</span>
          ${courierMapHtml}
          <div class="status-history">${historyHtml}</div>
        </div>
        <div class="admin-item-actions">
          <select class="statusSelect">
            <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="in_transit" ${order.status === "in_transit" ? "selected" : ""}>In Transit</option>
            <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>Delivered</option>
            <option value="canceled" ${order.status === "canceled" ? "selected" : ""}>Canceled</option>
          </select>
          <input class="courierNoteInput" type="text" placeholder="Courier note" value="${courierNote.replace(/\"/g, "&quot;")}">
          ${telPhone ? `<a href="tel:${telPhone}" class="invoice-link">Call customer</a>` : `<button type="button" class="quickActionBtn" disabled>No phone</button>`}
          <button class="copyPhoneBtn" type="button" ${contactPhone ? "" : "disabled"}>Copy phone</button>
          <button class="copyAddressBtn" type="button">Copy address block</button>
          <button class="applyStatusBtn" type="button">Update</button>
          <a href="${getInvoiceUrl(order)}" class="invoice-link" target="_blank" rel="noopener noreferrer">Invoice</a>
        </div>
      `;

      card.querySelector(".applyStatusBtn").addEventListener("click", async () => {
        const nextStatus = card.querySelector(".statusSelect").value;
        const nextCourierNote = card.querySelector(".courierNoteInput")?.value?.trim() || "";
        try {
          const actor = getCurrentUser();
          await appDb.updateOrderStatus(order.uid, order.id, nextStatus, {
            actorUid: actor?.uid || "",
            actorEmail: actor?.email || "",
            actorRole: "admin",
            source: "admin_panel",
            courierNote: nextCourierNote,
            note: nextCourierNote
          });
          showToast(`Order ${order.id} updated to ${nextStatus.replace(/_/g, " ")}.`, "success");
        } catch (error) {
          console.error("Failed to update order status", error);
          if (error?.code === "out_of_stock" || error?.message === "out_of_stock") {
            showToast("Not enough stock to move this order state.", "error");
          } else {
            showToast("Failed to update order status.", "error");
          }
        }
      });

      const copyCoordsBtn = card.querySelector(".copyCoordsBtn");
      if (copyCoordsBtn && coordinateText) {
        copyCoordsBtn.addEventListener("click", () => {
          copyText(coordinateText, "Coordinates copied.");
        });
      }
      const copyPhoneBtn = card.querySelector(".copyPhoneBtn");
      if (copyPhoneBtn && contactPhone) {
        copyPhoneBtn.addEventListener("click", () => {
          copyText(contactPhone, "Phone copied.");
        });
      }
      const copyAddressBtn = card.querySelector(".copyAddressBtn");
      if (copyAddressBtn) {
        copyAddressBtn.addEventListener("click", () => {
          copyText(fullAddressBlock, "Address block copied.");
        });
      }

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
    stopProducts = null;
    stopOrders = null;
    stopAudit = null;
    stopReturns = null;
    stopNotifications = null;
    listenersStarted = false;
  }

  function startRealtimeListeners(user) {
    if (listenersStarted) return;

    stopProducts = appDb.watchProducts(
      (products) => renderProducts(products),
      (error) => {
        console.error("Product listener error", error);
        adminProductsList.innerHTML = "<p>Failed to load products.</p>";
      }
    );

    stopOrders = appDb.watchAllOrders(
      (orders) => {
        renderOrders(orders);
        refreshBackendAnalyticsSummary()
          .then(() => renderMetrics())
          .catch((error) => console.error("Failed to refresh analytics summary", error));
      },
      (error) => {
        console.error("Order listener error", error);
        adminOrdersList.innerHTML = "<p>Failed to load orders.</p>";
      }
    );

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

    listenersStarted = true;
  }
  async function resolveUserWithRole(user) {
    const profile = await appDb.ensureUserDocument(user);
    if (!profile) return user;
    // optionally store role in localstorage
    try {
      localStorage.setItem('userRole', profile.role || 'customer');
    } catch (e) {}
    return user;
  }

  async function handleAdminAccess(user, loginMessage) {
    stopRealtimeListeners();

    if (!user) {
      await renderUserPanel(null);
      showLoginWall(loginMessage || "");
      return;
    }

    let resolvedUser = user;
    try {
      resolvedUser = await resolveUserWithRole(user);
    } catch (error) {
      console.error("Failed to resolve user role", error);
      await auth.signOut();
      await renderUserPanel(null);
      showLoginWall("Failed to verify admin account.");
      return;
    }

    if (resolvedUser.role !== "admin") {
      await auth.signOut();
      await renderUserPanel(null);
      showLoginWall("This account is not an admin.");
      return;
    }

    await renderUserPanel(resolvedUser);
    showAdminContent();
    renderMetrics();
    setSkeleton(adminNotificationsList, 3);
    setSkeleton(adminProductsList, 4);
    setSkeleton(adminOrdersList, 4);
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
      return;
    }

    try {
      await appDb.upsertProduct({ id, name, size, price, image, stock, category: category || "General", tags, isActive: true });
      resetProductForm({ keepLink: true });
      showProductLink(id);
      showToast(`Saved product #${id}.`, "success");
    } catch (error) {
      console.error("Failed to save product", error);
      showToast("Failed to save product.", "error");
    }
  });

  adminStatusFilter.addEventListener("change", () => {
    currentOrdersPage = 1;
    renderOrders(allOrders);
  });

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

  // initial admin access check using current auth state
  await handleAdminAccess(getCurrentUser(), "");

  window.addEventListener("beforeunload", () => stopRealtimeListeners());
});
