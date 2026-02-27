const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

function sanitizeCoordinate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(6));
}

function computeDeliveryConfidence(raw = {}) {
  const address = raw.shippingAddress || {};
  const lat = sanitizeCoordinate(raw.shippingLocation?.lat);
  const lng = sanitizeCoordinate(raw.shippingLocation?.lng);
  const pinConfirmed = Boolean(raw.shippingLocationConfirmed);
  const mapUrl = String(raw.shippingLocationSnapshot?.mapUrl || "").trim();
  let score = 0;
  const flags = [];

  if (lat !== null && lng !== null) {
    score += 25;
    flags.push("has_pin");
  }
  if (pinConfirmed) {
    score += 30;
    flags.push("pin_confirmed");
  }
  if (mapUrl) {
    score += 10;
    flags.push("map_link_saved");
  }
  if (String(address.addressLine1 || "").trim()) score += 15;
  if (String(address.city || "").trim() || String(address.province || "").trim()) score += 8;
  if (String(address.postalCode || "").trim()) score += 5;
  if (String(address.country || "").trim()) score += 3;
  if (String(address.phone || "").trim()) score += 4;

  const clamped = Math.max(0, Math.min(100, score));
  const level = clamped >= 80 ? "high" : clamped >= 50 ? "medium" : "low";
  return { score: clamped, level, flags };
}

async function queueNotification(payload = {}) {
  const uid = String(payload.uid || "").trim();
  const email = String(payload.email || "").trim();
  if (!uid && !email) return;

  await db.collection("notifications").add({
    uid,
    email,
    type: String(payload.type || "general"),
    title: String(payload.title || "Update"),
    message: String(payload.message || ""),
    relatedOrderId: String(payload.relatedOrderId || ""),
    read: false,
    data: payload.data && typeof payload.data === "object" ? payload.data : {},
    createdAt: FieldValue.serverTimestamp(),
    readAt: null
  });
}

async function writeOrderAudit(entry = {}) {
  await db.collection("order_audit").add({
    orderId: String(entry.orderId || ""),
    orderUid: String(entry.orderUid || ""),
    eventType: String(entry.eventType || "order_status_changed"),
    previousStatus: String(entry.previousStatus || ""),
    nextStatus: String(entry.nextStatus || ""),
    actorUid: String(entry.actorUid || ""),
    actorEmail: String(entry.actorEmail || ""),
    actorRole: String(entry.actorRole || ""),
    source: String(entry.source || "cloud_function"),
    message: String(entry.message || ""),
    meta: entry.meta && typeof entry.meta === "object" ? entry.meta : {},
    createdAt: FieldValue.serverTimestamp()
  });
}

function sanitizeDraft(raw = {}) {
  const quantity = Math.max(1, Number(raw.quantity) || 1);
  const unitPrice = Number(raw.unitPrice) || 0;
  const shippingFee = Number(raw.shippingFee) || 0;
  const productId = Number(raw.productId) || 0;

  return {
    productId,
    productName: String(raw.productName || ""),
    productSize: String(raw.productSize || ""),
    productImage: String(raw.productImage || ""),
    quantity,
    unitPrice,
    shippingFee,
    shippingOption: String(raw.shippingOption || "standard_shipping"),
    paymentMethod: String(raw.paymentMethod || "cash_on_delivery"),
    deliveryMethod: raw.deliveryMethod === "pickup" ? "pickup" : "ship",
    totalPrice: Number(raw.totalPrice) || unitPrice * quantity + shippingFee,
    contactEmail: String(raw.contactEmail || ""),
    shippingAddress: raw.shippingAddress && typeof raw.shippingAddress === "object" ? raw.shippingAddress : {},
    shippingLocation: raw.shippingLocation && typeof raw.shippingLocation === "object" ? raw.shippingLocation : null,
    shippingLocationSnapshot: raw.shippingLocationSnapshot && typeof raw.shippingLocationSnapshot === "object" ? raw.shippingLocationSnapshot : null,
    shippingLocationConfirmed: Boolean(raw.shippingLocationConfirmed)
  };
}

exports.createOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email || "";
  const draft = sanitizeDraft(request.data?.draft || {});

  if (!draft.productId) {
    throw new HttpsError("invalid-argument", "Invalid product id");
  }

  const userRef = db.collection("users").doc(uid);
  const orderRef = userRef.collection("orders").doc();
  const productRef = db.collection("products").doc(String(draft.productId));
  const cartRef = db.collection("carts").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const productSnap = await tx.get(productRef);

    if (!productSnap.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productSnap.data() || {};
    if (product.isActive === false) {
      throw new HttpsError("failed-precondition", "Product is inactive");
    }

    const stock = Number(product.stock);
    if (Number.isFinite(stock) && stock < draft.quantity) {
      throw new HttpsError("failed-precondition", "Out of stock");
    }

    if (Number.isFinite(stock)) {
      tx.update(productRef, {
        stock: stock - draft.quantity,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const unitPrice = Number(product.price) || draft.unitPrice;
    const deliveryConfidence = computeDeliveryConfidence(draft);
    const orderPayload = {
      uid,
      email,
      productId: draft.productId,
      productName: product.name || draft.productName || `Product #${draft.productId}`,
      productSize: product.size || draft.productSize || "N/A",
      productImage: product.image || draft.productImage || "",
      quantity: draft.quantity,
      unitPrice,
      shippingFee: draft.shippingFee,
      shippingOption: draft.shippingOption,
      paymentMethod: draft.paymentMethod,
      deliveryMethod: draft.deliveryMethod,
      totalPrice: unitPrice * draft.quantity + draft.shippingFee,
      contactEmail: draft.contactEmail || email,
      shippingAddress: draft.shippingAddress || null,
      shippingLocation: draft.shippingLocation || null,
      shippingLocationSnapshot: draft.shippingLocationSnapshot || null,
      shippingLocationConfirmed: Boolean(draft.shippingLocationConfirmed),
      deliveryConfidence,
      statusHistory: [
        {
          status: "pending",
          note: "Order created",
          actorEmail: email,
          source: "cloud_function_checkout",
          createdAt: new Date().toISOString()
        }
      ],
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    tx.set(orderRef, orderPayload, { merge: true });
    tx.delete(cartRef);

    return orderPayload;
  });

  await db.collection("mail").add({
    to: [result.contactEmail || email],
    message: {
      subject: `Order #${orderRef.id} placed`,
      text: `Your order for ${result.productName} is now pending.`
    },
    createdAt: FieldValue.serverTimestamp()
  });

  await queueNotification({
    uid,
    email: result.contactEmail || email,
    type: "order_created",
    title: `Order #${orderRef.id} placed`,
    message: `Delivery confidence: ${result.deliveryConfidence?.level || "n/a"} (${result.deliveryConfidence?.score || 0}/100).`,
    relatedOrderId: orderRef.id,
    data: {
      status: result.status,
      deliveryConfidence: result.deliveryConfidence || null
    }
  });

  await writeOrderAudit({
    orderId: orderRef.id,
    orderUid: uid,
    eventType: "order_created",
    previousStatus: "",
    nextStatus: "pending",
    actorUid: uid,
    actorEmail: email,
    actorRole: "customer",
    source: "cloud_function_checkout",
    message: "Order created from callable function."
  });

  return {
    orderId: orderRef.id,
    ...result
  };
});

exports.onOrderStatusChanged = onDocumentUpdated("users/{uid}/orders/{orderId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  if (!after) {
    return;
  }

  if ((before?.status || "") === (after.status || "")) {
    return;
  }

  const receiver = after.contactEmail || after.email;
  if (receiver) {
    await db.collection("mail").add({
      to: [receiver],
      message: {
        subject: `Order #${event.params.orderId} status updated`,
        text: `Your order status is now ${(after.status || "pending").replace(/_/g, " ")}.`
      },
      createdAt: FieldValue.serverTimestamp()
    });
  }

  await queueNotification({
    uid: event.params.uid,
    email: receiver || "",
    type: "order_status_updated",
    title: `Order #${event.params.orderId} status updated`,
    message: `Your order status is now ${(after.status || "pending").replace(/_/g, " ")}.`,
    relatedOrderId: event.params.orderId,
    data: {
      previousStatus: before?.status || "",
      nextStatus: after.status || "pending"
    }
  });

  await writeOrderAudit({
    orderId: event.params.orderId,
    orderUid: event.params.uid,
    eventType: "order_status_changed",
    previousStatus: before?.status || "",
    nextStatus: after.status || "pending",
    actorUid: "",
    actorEmail: "",
    actorRole: "system",
    source: "cloud_function_trigger",
    message: "Order status changed and notification queued."
  });

  logger.info("Queued status email", {
    orderId: event.params.orderId,
    status: after.status
  });
});
