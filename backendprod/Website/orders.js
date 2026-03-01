document.addEventListener("DOMContentLoaded", async () => {
  const ordersList = document.getElementById("ordersList");
  const userPanel = document.getElementById("userPanel");
  const ordersFeedback = document.getElementById("ordersFeedback");

  const auth = window.authService;
  const appDb = window.appDb;

  if (!ordersList || !userPanel) {
    console.error("orders.js: required elements are missing");
    return;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error(`Failed to parse localStorage key: ${key}`, error);
      return fallback;
    }
  }

  function getCurrentUser() {
    // prefer the new auth service, fallback to localStorage for offline/debug
    if (auth && typeof auth.getCurrentUser === "function") {
      const u = auth.getCurrentUser();
      if (u) return u;
    }
    return readJson("currentUser", null);
  }

  function setOrdersFeedback(type, message) {
    if (!ordersFeedback) return;

    ordersFeedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      ordersFeedback.textContent = "";
      ordersFeedback.classList.add("hidden");
      return;
    }

    ordersFeedback.textContent = message;
    ordersFeedback.classList.add(`is-${type || "info"}`);
    ordersFeedback.classList.remove("hidden");
  }

  function renderOrdersSkeleton(count) {
    const total = Math.max(1, Number(count) || 3);
    ordersList.innerHTML = Array.from({ length: total }).map(() => `
      <div class="skeleton-row">
        <div class="skeleton-line w-40"></div>
        <div class="skeleton-line w-80"></div>
        <div class="skeleton-line w-55"></div>
      </div>
    `).join("");
  }

  function formatMoney(value) {
    return `PHP ${Number(value || 0).toFixed(2)}`;
  }

  function formatPayment(method) {
    if (method === "cash_on_delivery") return "Cash on Delivery";
    if (method === "gcash") return "GCash";
    return String(method || "cash_on_delivery").replace(/_/g, " ");
  }

  function formatDateTime(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function isRemoteDbReady() {
    return Boolean(appDb && appDb.isConfigured());
  }

  function getStatusClass(status) {
    if (status === "in_transit") return "status-transit";
    if (status === "delivered") return "status-delivered";
    if (status === "canceled") return "status-canceled";
    return "status-pending";
  }

  function getTimelineStepClasses(status) {
    if (status === "delivered") {
      return ["done", "done", "current"];
    }

    if (status === "in_transit") {
      return ["done", "current", "pending"];
    }

    if (status === "canceled") {
      return ["done", "canceled", "pending"];
    }

    return ["current", "pending", "pending"];
  }

  function renderTimeline(status) {
    const classes = getTimelineStepClasses(status);
    const labels = ["Pending", "In Transit", "Delivered"];
    const steps = labels
      .map((label, index) => `<div class="timeline-step ${classes[index]}"><span>${label}</span></div>`)
      .join("");

    const canceledNote = status === "canceled"
      ? `<div class="timeline-note">Canceled before delivery</div>`
      : "";

    return `
      <div class="order-timeline">
        ${steps}
      </div>
      ${canceledNote}
    `;
  }

  function normalizeCreatedAt(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    return null;
  }

  function getEstimatedDelivery(order) {
    if (order.estimatedDeliveryAt) return order.estimatedDeliveryAt;
    const base = order.createdAt ? new Date(order.createdAt) : new Date();
    const days = order.deliveryMethod === "pickup"
      ? 5
      : order.shippingOption === "express_shipping"
        ? 2
        : 5;
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  async function syncUserAndProfile() {
    let user = auth && typeof auth.getCurrentUser === "function" ? auth.getCurrentUser() : null;

    if (user && isRemoteDbReady() && user.uid) {
      try {
        const profile = await appDb.ensureUserDocument(user);
        // optionally store role in localstorage
        if (profile && profile.role) {
          try { localStorage.setItem('userRole', profile.role); } catch (e) {}
        }
      } catch (error) {
        console.error("Failed to sync user profile", error);
      }
    }

    return user;
  }

  async function loadProducts() {
    if (isRemoteDbReady()) {
      try {
        const remoteProducts = await appDb.listProducts();
        if (remoteProducts.length) {
          return remoteProducts;
        }
      } catch (error) {
        console.error("Failed to load products from Firestore", error);
      }
    }

    try {
      const response = await fetch("products.json");
      return await response.json();
    } catch (error) {
      console.error("Failed to load products.json", error);
      return [];
    }
  }

  async function resolveCartProductId(user) {
    const localDraft = readJson("pendingOrderDraft", null);
    let productId = Number(localDraft?.productId) || Number(localStorage.getItem("cartProductId"));

    if (isRemoteDbReady() && user?.uid) {
      try {
        const remoteCart = await appDb.getCart(user.uid);
        if (remoteCart?.productId) {
          productId = Number(remoteCart.productId) || productId;
        }
      } catch (error) {
        console.error("Failed to load cart from Firestore", error);
      }
    }

    return productId;
  }

  function getCartUrl(productId) {
    return productId ? `checkout.html?product_id=${productId}` : "index.html";
  }

  function getInvoiceUrl(order) {
    const params = new URLSearchParams();
    if (order?.id) params.set("order_id", String(order.id));
    if (order?.uid) params.set("uid", String(order.uid));
    return `invoice.html?${params.toString()}`;
  }

  async function renderUserPanel(user, cartProductId) {
    const cartUrl = getCartUrl(cartProductId);

    if (!user) {
      userPanel.innerHTML = `
        <a href="signin.html?from=orders" class="signinBtn">Sign in</a>
        <a href="${cartUrl}" class="cartBtn">Cart</a>
      `;
      return;
    }

    const adminLink = user.role === "admin" ? `<a href="admin.html" class="cartBtn">Admin</a>` : "";

    userPanel.innerHTML = `
      <span class="email">${user.email}</span>
      ${adminLink}
      <a href="profile.html" class="cartBtn">Profile</a>
      <a href="${cartUrl}" class="cartBtn">Cart</a>
      <button id="logoutBtn" type="button">Log out</button>
    `;

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          if (auth && auth.isConfigured()) {
            await auth.signOut();
          } else {
            localStorage.removeItem("currentUser");
          }
        } catch (error) {
          console.error("Failed to sign out", error);
          localStorage.removeItem("currentUser");
        }

        window.location.reload();
      });
    }
  }

  let products = [];
  let currentFilter = "all";
  let userOrders = [];
  let userReturnRequests = [];
  let unsubscribeOrders = null;
  let unsubscribeReturns = null;
  let hasFilterBar = false;

  function findProduct(order) {
    if (order.productName || order.productImage || order.productSize) {
      return {
        name: order.productName || `Product #${order.productId}`,
        size: order.productSize || "N/A",
        image: order.productImage || ""
      };
    }

    return products.find((item) => Number(item.id) === Number(order.productId)) || null;
  }

  function getOrderReturnRequest(order) {
    return userReturnRequests.find((entry) => entry.orderId === order.id);
  }

  function ensureFilterBar() {
    if (hasFilterBar) {
      return;
    }

    const filterBar = document.createElement("div");
    filterBar.className = "filter-bar";
    filterBar.innerHTML = `
      <button class="filterBtn active" data-filter="all" type="button">All</button>
      <button class="filterBtn" data-filter="pending" type="button">Pending</button>
      <button class="filterBtn" data-filter="in_transit" type="button">In Transit</button>
      <button class="filterBtn" data-filter="delivered" type="button">Delivered</button>
      <button class="filterBtn" data-filter="canceled" type="button">Canceled</button>
      <span class="filter-count" id="filterCount"></span>
    `;

    ordersList.parentElement.insertBefore(filterBar, ordersList);

    document.querySelectorAll(".filterBtn").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filterBtn").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        currentFilter = button.dataset.filter || "all";
        renderOrders();
      });
    });

    hasFilterBar = true;
  }

  async function cancelOrder(order) {
    const user = getCurrentUser();
    if (!user) return;

    if (isRemoteDbReady() && user.uid && order.id) {
      await appDb.updateOrderStatus(user.uid, order.id, "canceled", {
        actorUid: user.uid,
        actorEmail: user.email || "",
        actorRole: "customer",
        source: "orders_page",
        note: "Customer canceled order"
      });
      return;
    }

    const users = readJson("users", []);
    const index = users.findIndex((item) => item.email === user.email);
    if (index < 0) return;

    const orderIndex = users[index].orders.findIndex((item, idx) => idx === order.localIndex);
    if (orderIndex >= 0) {
      users[index].orders[orderIndex].status = "canceled";
      localStorage.setItem("users", JSON.stringify(users));
      localStorage.setItem("currentUser", JSON.stringify(users[index]));
      userOrders[order.localIndex].status = "canceled";
      renderOrders();
    }
  }

  async function requestReturn(order) {
    const user = getCurrentUser();
    if (!user?.uid || !isRemoteDbReady() || typeof appDb.createReturnRequest !== "function") {
      alert("Return request API is unavailable.");
      return;
    }

    const reason = window.prompt("Reason for return request:");
    if (!reason || !reason.trim()) {
      return;
    }

    await appDb.createReturnRequest({
      orderId: order.id,
      orderUid: order.uid || user.uid,
      requesterUid: user.uid,
      requesterEmail: user.email || "",
      reason: reason.trim(),
      notes: ""
    });

    setOrdersFeedback("success", `Return request submitted for order ${order.id}.`);
  }

  function renderStatusHistory(history, fallbackStatus, fallbackDate) {
    if (!Array.isArray(history) || !history.length) {
      return `<div class="status-history"><div class="status-history-item"><strong>${fallbackStatus}</strong><span>${fallbackDate}</span></div></div>`;
    }

    const rows = history
      .slice()
      .reverse()
      .slice(0, 6)
      .map((entry) => `
        <div class="status-history-item">
          <strong>${String(entry.status || "pending").replace(/_/g, " ")}</strong>
          <span>${formatDateTime(entry.createdAt)}</span>
          <small>${entry.note || ""}</small>
        </div>
      `)
      .join("");

    return `<div class="status-history">${rows}</div>`;
  }

  function renderOrders() {
    ensureFilterBar();
    ordersList.innerHTML = "";

    let filteredOrders = userOrders.map((order, index) => ({ ...order, localIndex: index }));
    if (currentFilter !== "all") {
      filteredOrders = filteredOrders.filter((order) => order.status === currentFilter);
    }

    const filterCount = document.getElementById("filterCount");
    if (filterCount) {
      filterCount.innerText = `(${filteredOrders.length})`;
    }

    if (!filteredOrders.length) {
      ordersList.innerHTML = "<p>No orders in this filter.</p>";
      return;
    }

    filteredOrders.forEach((order, displayIndex) => {
      const product = findProduct(order);
      const unitPrice = Number(order.unitPrice || 0);
      const quantity = Math.max(1, Number(order.quantity) || 1);
      const shippingFee = Number(order.shippingFee || 0);
      const totalPrice = Number(order.totalPrice || unitPrice * quantity + shippingFee);
      const paymentMethod = formatPayment(order.paymentMethod);
      const deliveryMethod = order.deliveryMethod === "pickup" ? "Pickup" : "Ship";
      const statusText = (order.status || "pending").replace(/_/g, " ");
      const createdDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : "N/A";
      const eta = order.status === "canceled" ? "Canceled" : formatDateTime(getEstimatedDelivery(order));
      const courierNote = order.courierNote ? order.courierNote : "No courier note yet.";
      const returnRequest = getOrderReturnRequest(order);
      const returnStatus = returnRequest ? String(returnRequest.status || "requested").replace(/_/g, " ") : "";
      const confidenceScore = Number(order.deliveryConfidence?.score || 0);
      const confidenceLevel = String(order.deliveryConfidence?.level || "low").toUpperCase();
      const pickupDetails = order.pickupDetails && typeof order.pickupDetails === "object" ? order.pickupDetails : null;
      const pickupInfoHtml = order.deliveryMethod === "pickup" && pickupDetails
        ? `
          <div>Pickup Contact: ${pickupDetails.contactName || "N/A"}</div>
          <div>Pickup Phone: ${pickupDetails.contactPhone || "N/A"}</div>
          <div>Pickup Schedule: ${pickupDetails.pickupDate || "N/A"} ${pickupDetails.pickupTimeSlot || ""}</div>
          <div>Pickup Reference: ${pickupDetails.reference || "N/A"}</div>
        `
        : "";
      const mapSnapshotUrl = order.shippingLocationSnapshot?.embedUrl || order.shippingLocationSnapshot?.imageUrl || "";
      const mapLinkUrl = order.shippingLocationSnapshot?.mapUrl
        || (
          Number.isFinite(Number(order.shippingLocation?.lat)) && Number.isFinite(Number(order.shippingLocation?.lng))
            ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(Number(order.shippingLocation.lat))}&mlon=${encodeURIComponent(Number(order.shippingLocation.lng))}#map=18/${encodeURIComponent(Number(order.shippingLocation.lat))}/${encodeURIComponent(Number(order.shippingLocation.lng))}`
            : ""
        );
      const mapPreviewHtml = mapLinkUrl
        ? `
          <div class="order-map-preview">
            <a href="${mapLinkUrl}" target="_blank" rel="noopener noreferrer">Pinned house location</a>
            ${mapSnapshotUrl ? `<img src="${mapSnapshotUrl}" alt="Pinned house map preview" onerror="this.style.display='none'">` : ""}
          </div>
        `
        : "";

      const imageHtml = product?.image
        ? `<img src="${product.image}" alt="${product?.name || "Product"}" />`
        : "";

      const card = document.createElement("div");
      card.className = "order-card";
      card.innerHTML = `
        <div class="order-top">
          <strong>Order #${displayIndex + 1}</strong>
          <span class="status-chip ${getStatusClass(order.status)}">${statusText}</span>
        </div>

        <div class="order-product">
          ${imageHtml}
          <div class="order-info">
            <div class="order-name">${product?.name || `Product #${order.productId}`}</div>
            <div>Size: ${product?.size || "N/A"}</div>
            <div>Quantity: ${quantity}</div>
            <div>Unit Price: ${formatMoney(unitPrice)}</div>
            <div>Shipping Fee: ${formatMoney(shippingFee)}</div>
            <div>Delivery: ${deliveryMethod}</div>
            <div>Payment: ${paymentMethod}</div>
            <div>Placed: ${createdDate}</div>
            <div>ETA: ${eta}</div>
            <div>Courier Note: ${courierNote}</div>
            <div>Delivery Confidence: ${confidenceLevel} (${confidenceScore}/100)</div>
            ${pickupInfoHtml}
            <div>Return Status: ${order.returnStatus ? String(order.returnStatus).replace(/_/g, " ") : "None"}</div>
            <div class="order-total"><strong>Total: ${formatMoney(totalPrice)}</strong></div>
          </div>
        </div>

        ${mapPreviewHtml}

        ${renderTimeline(order.status)}

        <div class="order-history-block">
          <strong>Status history</strong>
          ${renderStatusHistory(order.statusHistory, statusText, createdDate)}
        </div>

        <div class="order-card-actions">
          <a href="${getInvoiceUrl(order)}" class="cartBtn" target="_blank" rel="noopener noreferrer">Invoice</a>
        </div>

        ${order.status === "pending" ? `<button class="cancelBtn" type="button">Cancel</button>` : ""}
        ${order.status === "delivered" && !returnRequest ? `<button class="returnBtn" type="button">Request return</button>` : ""}
        ${returnRequest ? `<div class="return-request-pill">Return request: ${returnStatus}</div>` : ""}
      `;

      if (order.status === "pending") {
        const cancelBtn = card.querySelector(".cancelBtn");
        cancelBtn.addEventListener("click", async () => {
          try {
            await cancelOrder(order);
          } catch (error) {
            console.error("Failed to cancel order", error);
            if (error?.code === "out_of_stock" || error?.message === "out_of_stock") {
              alert("Cannot reopen this order state because stock changed.");
            } else {
              alert("Failed to cancel order. Please try again.");
            }
          }
        });
      }

      if (order.status === "delivered" && !returnRequest) {
        const returnBtn = card.querySelector(".returnBtn");
        if (returnBtn) {
          returnBtn.addEventListener("click", async () => {
            try {
              await requestReturn(order);
            } catch (error) {
              console.error("Failed to submit return request", error);
              if (error?.code === "return_request_already_exists") {
                setOrdersFeedback("info", "You already have an active return request for this order.");
              } else {
                setOrdersFeedback("error", "Failed to submit return request.");
              }
            }
          });
        }
      }

      ordersList.appendChild(card);
    });
  }

  renderOrdersSkeleton(4);
  const user = await syncUserAndProfile();
  const cartProductId = await resolveCartProductId(user);
  await renderUserPanel(user, cartProductId);

  if (!user) {
    ordersList.innerHTML = `<p>Please <a href="signin.html?from=orders">sign in</a> first.</p>`;
    return;
  }

  products = await loadProducts();

  if (isRemoteDbReady() && user.uid) {
    if (typeof appDb.watchUserReturnRequests === "function") {
      unsubscribeReturns = appDb.watchUserReturnRequests(
        user.uid,
        (requests) => {
          userReturnRequests = requests || [];
          renderOrders();
        },
        (error) => {
          console.error("Failed to watch return requests", error);
        },
        40
      );
    }

    unsubscribeOrders = appDb.watchUserOrders(
      user.uid,
      (orders) => {
        userOrders = orders.map((order) => ({
          ...order,
          createdAt: normalizeCreatedAt(order.createdAt) || new Date().toISOString(),
          status: order.status || "pending"
        }));

        if (!userOrders.length) {
          ensureFilterBar();
          ordersList.innerHTML = "<p>No orders yet.</p>";
          const filterCount = document.getElementById("filterCount");
          if (filterCount) filterCount.innerText = "(0)";
          return;
        }

        renderOrders();
      },
      (error) => {
        console.error("Failed to watch orders", error);
        ordersList.innerHTML = "<p>Failed to load orders.</p>";
      }
    );

    window.addEventListener("beforeunload", () => {
      if (unsubscribeOrders) {
        unsubscribeOrders();
      }
      if (unsubscribeReturns) {
        unsubscribeReturns();
      }
    });

    return;
  }

  const localOrders = Array.isArray(user.orders) ? user.orders : [];
  userOrders = localOrders.map((order, index) => ({
    ...order,
    localIndex: index,
    createdAt: normalizeCreatedAt(order.createdAt) || new Date().toISOString(),
    status: order.status || "pending"
  }));

  if (!userOrders.length) {
    ordersList.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  renderOrders();
});
