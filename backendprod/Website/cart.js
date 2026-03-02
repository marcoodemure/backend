document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;
  const appDb = window.appDb;

  const cartUserPanel = document.getElementById("cartUserPanel");
  const cartFeedback = document.getElementById("cartFeedback");
  const cartToolbar = document.getElementById("cartToolbar");
  const cartSelectAll = document.getElementById("cartSelectAll");
  const cartCheckoutSelectedBtn = document.getElementById("cartCheckoutSelectedBtn");
  const cartRemoveSelectedBtn = document.getElementById("cartRemoveSelectedBtn");
  const cartList = document.getElementById("cartList");
  const query = new URLSearchParams(window.location.search);
  const requireSignInFirst = query.get("signin_first") === "1";
  const signInRedirectRaw = String(query.get("signin_redirect") || "").trim();
  const notLoggedInRedirectUrl = /^https?:\/\//i.test(signInRedirectRaw)
    ? signInRedirectRaw
    : "https://sites.google.com/view/habitlikha/home/profile";

  const CHECKOUT_QUEUE_KEY = "checkoutQueueV1";

  let currentUser = null;
  let cartItems = [];
  let selectedProductIds = new Set();

  function setFeedback(type, message) {
    if (!cartFeedback) return;
    cartFeedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      cartFeedback.textContent = "";
      cartFeedback.classList.add("hidden");
      return;
    }
    cartFeedback.textContent = message;
    cartFeedback.classList.add(`is-${type || "info"}`);
    cartFeedback.classList.remove("hidden");
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

  function toProductId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
  }

  function toQty(value) {
    const qty = Number(value);
    return Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.floor(qty)) : 1;
  }

  function formatMoney(value) {
    return `PHP ${Number(value || 0).toFixed(2)}`;
  }

  function normalizeCartItem(raw) {
    const productId = toProductId(raw?.productId);
    if (!productId) {
      return null;
    }
    return {
      productId,
      quantity: toQty(raw?.quantity),
      productName: String(raw?.productName || `Product #${productId}`),
      productSize: String(raw?.productSize || "N/A"),
      productImage: String(raw?.productImage || ""),
      unitPrice: Number(raw?.unitPrice) || 0
    };
  }

  function normalizeCartItems(list) {
    const map = new Map();
    const source = Array.isArray(list) ? list : [];
    source.forEach((entry) => {
      const item = normalizeCartItem(entry);
      if (!item) return;
      const existing = map.get(item.productId);
      if (!existing) {
        map.set(item.productId, { ...item });
        return;
      }
      existing.quantity += item.quantity;
      if (!existing.productName && item.productName) existing.productName = item.productName;
      if (!existing.productSize && item.productSize) existing.productSize = item.productSize;
      if (!existing.productImage && item.productImage) existing.productImage = item.productImage;
      if (!existing.unitPrice && item.unitPrice) existing.unitPrice = item.unitPrice;
    });
    return Array.from(map.values()).sort((a, b) => a.productId - b.productId);
  }

  function setPrimaryLocalCart(item) {
    if (!item?.productId) return;
    try {
      localStorage.setItem("cartProductId", String(item.productId));
      localStorage.setItem("cartQuantity", String(toQty(item.quantity)));
    } catch {}
  }

  function clearPrimaryLocalCart() {
    try {
      localStorage.removeItem("cartProductId");
      localStorage.removeItem("cartQuantity");
    } catch {}
  }

  function syncPrimaryLocalCart(items) {
    if (Array.isArray(items) && items.length) {
      setPrimaryLocalCart(items[0]);
      return;
    }
    clearPrimaryLocalCart();
  }

  function saveQueue(items) {
    writeJson(CHECKOUT_QUEUE_KEY, items || []);
  }

  function redirectToSignInPage() {
    try {
      if (window.top && window.top !== window) {
        window.top.location.replace(notLoggedInRedirectUrl);
        return;
      }
    } catch {}
    window.location.replace(notLoggedInRedirectUrl);
  }

  async function resolveCurrentUser() {
    let user = null;
    if (auth && typeof auth.getCurrentUser === "function") {
      user = auth.getCurrentUser();
    }
    if (!user?.uid && auth && typeof auth.waitForAuthState === "function") {
      user = await auth.waitForAuthState(5000);
    }
    return user;
  }

  async function renderUserPanel(user) {
    if (!cartUserPanel) return;
    if (!user) {
      cartUserPanel.innerHTML = `
        <a href="login.html?from=cart" class="signinBtn">Sign in</a>
        <a href="create-account.html?from=cart" class="cartBtn">Create account</a>
      `;
      return;
    }

    cartUserPanel.innerHTML = `
      <span class="email">${user.email || "Signed in"}</span>
      <a href="orders.html" class="cartBtn">Orders</a>
      <a href="profile.html" class="cartBtn">Profile</a>
      <button id="cartLogoutBtn" type="button">Log out</button>
    `;

    const logoutBtn = document.getElementById("cartLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          if (auth && typeof auth.signOut === "function") {
            await auth.signOut();
          }
        } catch (error) {
          console.error("cart.js: signout failed", error);
        }
        window.location.reload();
      });
    }
  }

  async function hydrateWithProducts(items) {
    if (!Array.isArray(items) || !items.length) {
      return [];
    }
    if (!appDb || !appDb.isConfigured() || typeof appDb.getProductById !== "function") {
      return items;
    }

    const productMap = new Map();
    await Promise.all(
      items.map(async (item) => {
        try {
          const product = await appDb.getProductById(item.productId);
          if (product) {
            productMap.set(item.productId, product);
          }
        } catch (error) {
          console.error("cart.js: failed to hydrate product", error);
        }
      })
    );

    return items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) return item;
      return {
        ...item,
        productName: product.name || item.productName,
        productSize: product.size || item.productSize,
        productImage: product.image || item.productImage,
        unitPrice: Number(product.price) || item.unitPrice
      };
    });
  }

  async function loadCartItems() {
    let items = [];
    let remoteLoadAttempted = false;
    let remoteLoadFailed = false;

    if (currentUser?.uid && appDb && appDb.isConfigured()) {
      remoteLoadAttempted = true;
      try {
        if (typeof appDb.listCartItems === "function") {
          items = normalizeCartItems(await appDb.listCartItems(currentUser.uid));
        } else if (typeof appDb.getCart === "function") {
          const cart = await appDb.getCart(currentUser.uid);
          if (Array.isArray(cart?.items)) {
            items = normalizeCartItems(cart.items);
          } else if (cart?.productId) {
            items = normalizeCartItems([{
              productId: cart.productId,
              quantity: cart.quantity
            }]);
          }
        }
      } catch (error) {
        remoteLoadFailed = true;
        console.error("cart.js: failed to load remote cart", error);
        setFeedback("error", "Failed to load cart from database.");
      }
    }

    const allowLocalFallback = !currentUser?.uid && (!remoteLoadAttempted || remoteLoadFailed);
    if (!items.length && allowLocalFallback) {
      const localProductId = toProductId(localStorage.getItem("cartProductId"));
      if (localProductId) {
        items = normalizeCartItems([{
          productId: localProductId,
          quantity: toQty(localStorage.getItem("cartQuantity"))
        }]);
      }
    }

    return hydrateWithProducts(items);
  }

  async function refreshCart() {
    cartItems = await loadCartItems();
    syncPrimaryLocalCart(cartItems);
    const currentIds = new Set(cartItems.map((item) => item.productId));
    selectedProductIds = new Set(Array.from(selectedProductIds).filter((id) => currentIds.has(id)));
    renderCart();
  }

  function renderEmptyState() {
    if (cartToolbar) cartToolbar.classList.add("hidden");
    cartList.innerHTML = `
      <div class="cart-empty">
        <p>Your cart is empty.</p>
        <a href="orders.html" class="cartBtn">Go to Orders</a>
      </div>
    `;
  }

  function updateSelectAllState() {
    if (!cartSelectAll) return;
    if (!cartItems.length) {
      cartSelectAll.checked = false;
      cartSelectAll.indeterminate = false;
      return;
    }
    const selectedCount = cartItems.filter((item) => selectedProductIds.has(item.productId)).length;
    cartSelectAll.checked = selectedCount === cartItems.length;
    cartSelectAll.indeterminate = selectedCount > 0 && selectedCount < cartItems.length;
  }

  function renderCart() {
    if (!cartList) return;
    if (!cartItems.length) {
      renderEmptyState();
      return;
    }

    if (cartToolbar) cartToolbar.classList.remove("hidden");
    const totalSelectedAmount = cartItems
      .filter((item) => selectedProductIds.has(item.productId))
      .reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0);

    cartList.innerHTML = `
      <div class="cart-summary-line">
        <span>${selectedProductIds.size} selected</span>
        <strong>${formatMoney(totalSelectedAmount)}</strong>
      </div>
      <div class="cart-items-wrap">
        ${cartItems.map((item) => `
          <div class="cart-item" data-product-id="${item.productId}">
            <label class="cart-item-check">
              <input type="checkbox" data-cart-select-id="${item.productId}" ${selectedProductIds.has(item.productId) ? "checked" : ""}>
            </label>
            <div class="cart-item-image-wrap">
              ${item.productImage ? `<img src="${item.productImage}" alt="${item.productName}">` : `<div class="cart-item-image-placeholder">No image</div>`}
            </div>
            <div class="cart-item-info">
              <div class="cart-item-name">${item.productName}</div>
              <div class="cart-item-meta">Product ID: ${item.productId}</div>
              <div class="cart-item-meta">Size: ${item.productSize || "N/A"}</div>
              <div class="cart-item-price">${formatMoney(item.unitPrice)}</div>
            </div>
            <div class="cart-item-actions">
              <div class="qty-control compact">
                <button type="button" data-cart-minus="${item.productId}">-</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-plus="${item.productId}">+</button>
              </div>
              <button type="button" class="cart-remove-btn" data-cart-remove="${item.productId}">Remove</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    cartList.querySelectorAll("[data-cart-select-id]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = toProductId(input.getAttribute("data-cart-select-id"));
        if (!id) return;
        if (input.checked) {
          selectedProductIds.add(id);
        } else {
          selectedProductIds.delete(id);
        }
        updateSelectAllState();
      });
    });

    cartList.querySelectorAll("[data-cart-minus]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = toProductId(button.getAttribute("data-cart-minus"));
        const item = cartItems.find((entry) => entry.productId === id);
        if (!item) return;
        await changeQuantity(id, Math.max(0, item.quantity - 1));
      });
    });

    cartList.querySelectorAll("[data-cart-plus]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = toProductId(button.getAttribute("data-cart-plus"));
        const item = cartItems.find((entry) => entry.productId === id);
        if (!item) return;
        await changeQuantity(id, item.quantity + 1);
      });
    });

    cartList.querySelectorAll("[data-cart-remove]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = toProductId(button.getAttribute("data-cart-remove"));
        if (!id) return;
        await removeItems([id]);
      });
    });

    updateSelectAllState();
  }

  async function changeQuantity(productId, nextQuantity) {
    if (!currentUser?.uid || !appDb || !appDb.isConfigured()) {
      setFeedback("error", "Cart service is unavailable.");
      return;
    }

    try {
      if (typeof appDb.updateCartItemQuantity === "function") {
        await appDb.updateCartItemQuantity(currentUser.uid, productId, nextQuantity);
      } else if (typeof appDb.setCart === "function") {
        const item = cartItems.find((entry) => entry.productId === productId);
        if (item && nextQuantity > 0) {
          await appDb.setCart(currentUser.uid, {
            productId,
            quantity: nextQuantity,
            productName: item.productName,
            productSize: item.productSize,
            productImage: item.productImage,
            unitPrice: item.unitPrice,
            contactEmail: currentUser.email || ""
          });
        }
      }
      await refreshCart();
    } catch (error) {
      console.error("cart.js: quantity update failed", error);
      setFeedback("error", "Failed to update cart quantity.");
    }
  }

  async function removeItems(productIds) {
    if (!currentUser?.uid || !appDb || !appDb.isConfigured()) {
      setFeedback("error", "Cart service is unavailable.");
      return;
    }
    const safeIds = Array.from(
      new Set((Array.isArray(productIds) ? productIds : [productIds]).map((id) => toProductId(id)).filter((id) => id > 0))
    );
    if (!safeIds.length) {
      return;
    }

    const previousItems = cartItems.slice();
    const removeSet = new Set(safeIds);
    cartItems = cartItems.filter((item) => !removeSet.has(item.productId));
    safeIds.forEach((id) => selectedProductIds.delete(id));
    syncPrimaryLocalCart(cartItems);
    renderCart();

    try {
      if (typeof appDb.removeCartItems === "function") {
        await appDb.removeCartItems(currentUser.uid, safeIds);
      } else if (typeof appDb.clearCart === "function") {
        await appDb.clearCart(currentUser.uid);
      }
      await refreshCart();
    } catch (error) {
      cartItems = previousItems;
      syncPrimaryLocalCart(cartItems);
      renderCart();
      console.error("cart.js: remove failed", error);
      setFeedback("error", "Failed to remove selected cart items.");
    }
  }

  function checkoutSelectedItems() {
    const selectedItems = cartItems.filter((item) => selectedProductIds.has(item.productId));
    if (!selectedItems.length) {
      setFeedback("info", "Select at least one item to checkout.");
      return;
    }

    const queue = selectedItems.map((item) => ({
      productId: item.productId,
      quantity: toQty(item.quantity)
    }));
    saveQueue(queue);

    const first = queue[0];
    setPrimaryLocalCart(first);
    setFeedback("success", `Starting checkout for ${queue.length} selected item(s).`);
    window.location.replace(`checkout.html?product_id=${encodeURIComponent(String(first.productId))}&from=cart`);
  }

  if (!auth || !appDb || !auth.isConfigured() || !appDb.isConfigured()) {
    setFeedback("error", "Cart service is not configured.");
    return;
  }

  currentUser = await resolveCurrentUser();
  await renderUserPanel(currentUser);

  if (!currentUser?.uid) {
    if (requireSignInFirst) {
      redirectToSignInPage();
      return;
    }
    setFeedback("info", "Please sign in to view your cart.");
    cartList.innerHTML = `<p><a href="login.html?from=cart">Sign in</a> to continue.</p>`;
    return;
  }

  if (cartSelectAll) {
    cartSelectAll.addEventListener("change", () => {
      if (cartSelectAll.checked) {
        selectedProductIds = new Set(cartItems.map((item) => item.productId));
      } else {
        selectedProductIds.clear();
      }
      renderCart();
    });
  }

  if (cartCheckoutSelectedBtn) {
    cartCheckoutSelectedBtn.addEventListener("click", () => {
      checkoutSelectedItems();
    });
  }

  if (cartRemoveSelectedBtn) {
    cartRemoveSelectedBtn.addEventListener("click", async () => {
      const ids = Array.from(selectedProductIds);
      if (!ids.length) {
        setFeedback("info", "Select at least one item to remove.");
        return;
      }
      await removeItems(ids);
    });
  }

  await refreshCart();
});
