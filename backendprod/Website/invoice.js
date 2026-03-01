document.addEventListener("DOMContentLoaded", async () => {
  const invoiceCard = document.getElementById("invoiceCard");
  const invoiceFeedback = document.getElementById("invoiceFeedback");
  const printInvoiceBtn = document.getElementById("printInvoiceBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");

  const auth = window.authService;
  const appDb = window.appDb;

  function setFeedback(type, message) {
    if (!invoiceFeedback) {
      return;
    }

    invoiceFeedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      invoiceFeedback.textContent = "";
      invoiceFeedback.classList.add("hidden");
      return;
    }

    invoiceFeedback.textContent = message;
    invoiceFeedback.classList.add(`is-${type || "info"}`);
    invoiceFeedback.classList.remove("hidden");
  }

  function formatMoney(value) {
    return `PHP ${Number(value || 0).toFixed(2)}`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "N/A";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }

  function renderInvoice(order) {
    const quantity = Math.max(1, Number(order.quantity) || 1);
    const unitPrice = Number(order.unitPrice) || 0;
    const shippingFee = Number(order.shippingFee) || 0;
    const totalPrice = Number(order.totalPrice) || unitPrice * quantity + shippingFee;
    const payment = String(order.paymentMethod || "cash_on_delivery").replace(/_/g, " ");
    const delivery = order.deliveryMethod === "pickup" ? "pickup" : "ship";
    const rawStatus = String(order.status || "pending");
    const status = rawStatus.replace(/_/g, " ");
    const statusClass = rawStatus === "in_transit" ? "status-transit" : rawStatus === "delivered" ? "status-delivered" : rawStatus === "canceled" ? "status-canceled" : "status-pending";
    const lat = Number(order.shippingLocation?.lat);
    const lng = Number(order.shippingLocation?.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const mapLinkUrl = order.shippingLocationSnapshot?.mapUrl
      || (
        hasCoords
          ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`
          : ""
      );
    const mapSnapshotUrl = order.shippingLocationSnapshot?.embedUrl || order.shippingLocationSnapshot?.imageUrl || "";
    const proofMapHtml = delivery === "ship" && (hasCoords || mapLinkUrl)
      ? `
        <div class="invoice-map-proof">
          <h3>Delivery Pin Proof</h3>
          <div class="summary-line"><span>Coordinates</span><span>${hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "N/A"}</span></div>
          <div class="summary-line"><span>Map link</span><span>${mapLinkUrl ? `<a href="${mapLinkUrl}" target="_blank" rel="noopener noreferrer">Open map pin</a>` : "N/A"}</span></div>
          ${mapSnapshotUrl ? `<img src="${mapSnapshotUrl}" alt="Pinned delivery map preview" class="invoice-map-image" onerror="this.style.display='none'">` : ""}
        </div>
      `
      : "";
    const pickupDetails = order.pickupDetails && typeof order.pickupDetails === "object" ? order.pickupDetails : null;
    const pickupQrHtml = delivery === "pickup" && pickupDetails?.reference
      ? `
        <div class="invoice-map-proof">
          <h3>Pickup Claim Proof</h3>
          <div class="summary-line"><span>Reference</span><span>${pickupDetails.reference}</span></div>
          <div class="summary-line"><span>Pickup schedule</span><span>${pickupDetails.pickupDate || "N/A"} ${pickupDetails.pickupTimeSlot || ""}</span></div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`PICKUP_CLAIM|ORDER:${order.id || "N/A"}|REF:${pickupDetails.reference}`)}" alt="Pickup claim QR code" class="invoice-map-image" onerror="this.style.display='none'">
        </div>
      `
      : "";

    invoiceCard.innerHTML = `
      <div class="invoice-brand">
        <div>
          <h1>DWAD Store Invoice</h1>
          <p>Order #${order.id || "N/A"}</p>
        </div>
        <span class="status-chip ${statusClass}">${status}</span>
      </div>
      <div class="summary-line"><span>Bill To</span><span>${order.contactEmail || order.email || "N/A"}</span></div>
      <div class="summary-line"><span>Placed</span><span>${formatDateTime(order.createdAt)}</span></div>
      <div class="summary-line"><span>Last Updated</span><span>${formatDateTime(order.updatedAt)}</span></div>
      <div class="summary-line"><span>Payment</span><span>${payment}</span></div>
      <div class="summary-line"><span>Delivery</span><span>${delivery}</span></div>

      <div class="invoice-line-items">
        <div class="summary-line"><strong>Item</strong><strong>Amount</strong></div>
        <div class="summary-line"><span>${order.productName || `Product #${order.productId || ""}`} x ${quantity}</span><span>${formatMoney(unitPrice * quantity)}</span></div>
        <div class="summary-line"><span>Shipping</span><span>${formatMoney(shippingFee)}</span></div>
      </div>
      ${proofMapHtml}
      ${pickupQrHtml}
      <div class="total"><span>Total</span><span>${formatMoney(totalPrice)}</span></div>
      <p class="invoice-footnote">This is a mock invoice generated for demo/reporting purposes.</p>
    `;
  }

  if (printInvoiceBtn) {
    printInvoiceBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", () => {
      setFeedback("info", "Use your browser's Save as PDF option in the print dialog.");
      window.print();
    });
  }

  if (!auth || !appDb || !auth.isConfigured() || !appDb.isConfigured()) {
    setFeedback("error", "Invoice service is not configured.");
    invoiceCard.innerHTML = "<p>Unable to load invoice.</p>";
    return;
  }

  let user = auth.getCurrentUser();

  if (!user || !user.uid) {
    setFeedback("error", "Sign in first to view invoices.");
    invoiceCard.innerHTML = "<p>You need to sign in.</p>";
    return;
  }

  try {
    const profile = await appDb.ensureUserDocument(user);
    // optionally store role in localstorage
    if (profile && profile.role) {
      try { localStorage.setItem('userRole', profile.role); } catch (e) {}
    }
  } catch (error) {
    console.error("Failed to sync invoice user profile", error);
  }

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id");
  const orderUid = params.get("uid");

  if (!orderId) {
    setFeedback("error", "Missing order ID.");
    invoiceCard.innerHTML = "<p>Invalid invoice link.</p>";
    return;
  }

  const targetUid = orderUid || user.uid;
  if (user.role !== "admin" && targetUid !== user.uid) {
    setFeedback("error", "You cannot open this invoice.");
    invoiceCard.innerHTML = "<p>Access denied for this invoice.</p>";
    return;
  }

  try {
    const order = await appDb.getOrderById(targetUid, orderId);
    if (!order) {
      setFeedback("error", "Order not found.");
      invoiceCard.innerHTML = "<p>Invoice data not found.</p>";
      return;
    }

    renderInvoice(order);
    setFeedback("", "");
  } catch (error) {
    console.error("Failed to load invoice", error);
    setFeedback("error", "Failed to load invoice.");
    invoiceCard.innerHTML = "<p>Could not load invoice right now.</p>";
  }
});
