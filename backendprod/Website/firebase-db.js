(function () {
  let cachedDb = null;
  let firestoreSettingsApplied = false;

  function getDbInstance() {
    if (cachedDb) {
      return cachedDb;
    }

    if (!window.firebaseReady || !window.firebase || typeof window.firebase.firestore !== "function") {
      return null;
    }

    const databaseId = typeof window.firebaseDatabaseId === "string"
      ? window.firebaseDatabaseId.trim()
      : "";
    const app = typeof window.firebase.app === "function" ? window.firebase.app() : null;

    try {
      let db = null;

      if (databaseId) {
        try {
          // Prefer named database when configured (e.g., "dbbackend").
          if (app) {
            db = window.firebase.firestore(app, databaseId);
          } else {
            db = window.firebase.firestore(databaseId);
          }
        } catch (namedDbError) {
          console.warn(`Named Firestore database "${databaseId}" is unavailable in this SDK path; falling back to default database.`, namedDbError);
        }
      }

      if (!db && app) {
        db = window.firebase.firestore(app);
      }

      if (!db) {
        db = window.firebase.firestore();
      }

      // Helps on restrictive networks/incognito where websocket streams may fail.
      try {
        if (!firestoreSettingsApplied) {
          db.settings({
            experimentalAutoDetectLongPolling: true,
            useFetchStreams: false
          });
          firestoreSettingsApplied = true;
        }
      } catch (settingsError) {
        // Firestore settings can only be set once before first use.
        // Swallow the error since settings may already be applied by other code paths.
      }

      cachedDb = db;
      return cachedDb;
    } catch (error) {
      console.error("Failed to initialize Firestore", error);
      return null;
    }
  }

  function isConfigured() {
    return Boolean(getDbInstance());
  }

  function getServerTimestamp() {
    if (!window.firebase || !window.firebase.firestore || !window.firebase.firestore.FieldValue) {
      return new Date();
    }

    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function normalizeDateValue(value) {
    if (!value) {
      return null;
    }

    if (typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === "string") {
      return value;
    }

    return null;
  }

  function sanitizeMethod(value, fallback) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    return fallback;
  }

  function sanitizeString(value, fallback) {
    if (typeof value === "string") {
      const cleaned = value.trim();
      if (cleaned) {
        return cleaned;
      }
    }

    return fallback || "";
  }

  function sanitizeTagList(value) {
    const source = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];

    const normalized = source
      .map((item) => sanitizeString(item, "").toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(normalized));
  }

  function sanitizeCoordinate(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    return Number(num.toFixed(6));
  }

  function normalizeDeliveryConfidence(value) {
    const score = Math.max(0, Math.min(100, Number(value?.score) || 0));
    const levelRaw = sanitizeString(value?.level, "").toLowerCase();
    const level = ["low", "medium", "high"].includes(levelRaw)
      ? levelRaw
      : score >= 80
        ? "high"
        : score >= 50
          ? "medium"
          : "low";
    const flags = Array.isArray(value?.flags)
      ? value.flags.map((flag) => sanitizeString(flag, "")).filter(Boolean)
      : [];

    return { score, level, flags };
  }

  function computeDeliveryConfidence(raw) {
    const country = sanitizeString(raw?.shippingAddress?.country, "");
    const city = sanitizeString(raw?.shippingAddress?.city, "");
    const province = sanitizeString(raw?.shippingAddress?.province, "");
    const addressLine1 = sanitizeString(raw?.shippingAddress?.addressLine1, "");
    const postalCode = sanitizeString(raw?.shippingAddress?.postalCode, "");
    const phone = sanitizeString(raw?.shippingAddress?.phone, "");
    const lat = sanitizeCoordinate(raw?.shippingLocation?.lat);
    const lng = sanitizeCoordinate(raw?.shippingLocation?.lng);
    const pinConfirmed = Boolean(raw?.shippingLocationConfirmed);
    const mapUrl = sanitizeString(raw?.shippingLocationSnapshot?.mapUrl, "");

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
    if (addressLine1) {
      score += 15;
      flags.push("street_present");
    }
    if (city || province) {
      score += 8;
      flags.push("city_or_province_present");
    }
    if (postalCode) {
      score += 5;
      flags.push("postal_present");
    }
    if (country) {
      score += 3;
      flags.push("country_present");
    }
    if (phone) {
      score += 4;
      flags.push("phone_present");
    }

    return normalizeDeliveryConfidence({ score, flags });
  }

  function buildDeliveryProofBundle(raw) {
    const confidence = computeDeliveryConfidence(raw);
    return {
      pin: {
        lat: sanitizeCoordinate(raw?.shippingLocation?.lat),
        lng: sanitizeCoordinate(raw?.shippingLocation?.lng),
        confirmed: Boolean(raw?.shippingLocationConfirmed),
        mapUrl: sanitizeString(raw?.shippingLocationSnapshot?.mapUrl, ""),
        embedUrl: sanitizeString(raw?.shippingLocationSnapshot?.embedUrl, ""),
        imageUrl: sanitizeString(raw?.shippingLocationSnapshot?.imageUrl, "")
      },
      address: {
        country: sanitizeString(raw?.shippingAddress?.country, ""),
        city: sanitizeString(raw?.shippingAddress?.city, ""),
        province: sanitizeString(raw?.shippingAddress?.province, ""),
        addressLine1: sanitizeString(raw?.shippingAddress?.addressLine1, ""),
        addressLine2: sanitizeString(raw?.shippingAddress?.addressLine2, ""),
        postalCode: sanitizeString(raw?.shippingAddress?.postalCode, ""),
        phone: sanitizeString(raw?.shippingAddress?.phone, "")
      },
      confidence,
      timeline: Array.isArray(raw?.deliveryProof?.timeline)
        ? raw.deliveryProof.timeline
            .map((item) => ({
              action: sanitizeString(item?.action, ""),
              note: sanitizeString(item?.note, ""),
              actor: sanitizeString(item?.actor, ""),
              createdAt: normalizeDateValue(item?.createdAt) || sanitizeString(item?.createdAt, "")
            }))
            .filter((item) => item.action)
        : []
    };
  }

  function estimateDeliveryIso(deliveryMethod, shippingOption, baseDateIso) {
    const base = baseDateIso ? new Date(baseDateIso) : new Date();
    const days = deliveryMethod === "pickup"
      ? 5
      : shippingOption === "express_shipping"
        ? 2
        : 5;

    const deliveryDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return deliveryDate.toISOString();
  }

  function normalizeProductId(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }

    return 0;
  }

  function formatStatusLabel(status) {
    return String(status || "pending").replace(/_/g, " ");
  }

  function sanitizeDraft(raw) {
    const quantity = Math.max(1, Number(raw?.quantity) || 1);
    const unitPrice = Number(raw?.unitPrice) || 0;
    const shippingFee = Number(raw?.shippingFee) || 0;
    const locationLng = sanitizeCoordinate(raw?.shippingLocation?.lng);
    const locationLat = sanitizeCoordinate(raw?.shippingLocation?.lat);
    const shippingLocation = locationLng !== null && locationLat !== null
      ? { lng: locationLng, lat: locationLat }
      : null;
    const locationSnapshotImageUrl = sanitizeString(raw?.shippingLocationSnapshot?.imageUrl, "");
    const locationSnapshotEmbedUrl = sanitizeString(raw?.shippingLocationSnapshot?.embedUrl, "");
    const locationSnapshotMapUrl = sanitizeString(raw?.shippingLocationSnapshot?.mapUrl, "");
    const shippingLocationSnapshot = (locationSnapshotEmbedUrl || locationSnapshotImageUrl) && locationSnapshotMapUrl
      ? {
        embedUrl: locationSnapshotEmbedUrl || locationSnapshotImageUrl,
        imageUrl: locationSnapshotImageUrl,
        mapUrl: locationSnapshotMapUrl
      }
      : null;
    const pickupDetails = raw?.pickupDetails && typeof raw.pickupDetails === "object"
      ? {
        contactName: sanitizeString(raw.pickupDetails.contactName, ""),
        contactPhone: sanitizeString(raw.pickupDetails.contactPhone, ""),
        pickupDate: sanitizeString(raw.pickupDetails.pickupDate, ""),
        pickupTimeSlot: sanitizeString(raw.pickupDetails.pickupTimeSlot, ""),
        agreedToBringId: Boolean(raw.pickupDetails.agreedToBringId),
        reference: sanitizeString(raw.pickupDetails.reference, "")
      }
      : null;
    const deliveryConfidence = computeDeliveryConfidence({
      shippingAddress: raw?.shippingAddress,
      shippingLocation,
      shippingLocationSnapshot,
      shippingLocationConfirmed: raw?.shippingLocationConfirmed
    });
    const deliveryProof = buildDeliveryProofBundle({
      shippingAddress: raw?.shippingAddress,
      shippingLocation,
      shippingLocationSnapshot,
      shippingLocationConfirmed: raw?.shippingLocationConfirmed,
      deliveryProof: raw?.deliveryProof
    });

    return {
      productId: normalizeProductId(raw?.productId),
      productName: typeof raw?.productName === "string" ? raw.productName.trim() : "",
      productSize: typeof raw?.productSize === "string" ? raw.productSize.trim() : "",
      productImage: typeof raw?.productImage === "string" ? raw.productImage.trim() : "",
      productCategory: sanitizeString(raw?.productCategory, "General"),
      productTags: sanitizeTagList(raw?.productTags),
      quantity,
      unitPrice,
      shippingFee,
      shippingOption: sanitizeMethod(raw?.shippingOption, "standard_shipping"),
      paymentMethod: sanitizeMethod(raw?.paymentMethod, "cash_on_delivery"),
      deliveryMethod: raw?.deliveryMethod === "pickup" ? "pickup" : "ship",
      totalPrice: Number(raw?.totalPrice) || unitPrice * quantity + shippingFee,
      contactEmail: typeof raw?.contactEmail === "string" ? raw.contactEmail.trim() : "",
      paymentSessionId: typeof raw?.paymentSessionId === "string" ? raw.paymentSessionId.trim() : "",
      orderNotes: sanitizeString(raw?.orderNotes, ""),
      estimatedDeliveryAt: sanitizeString(raw?.estimatedDeliveryAt, ""),
      shippingLocation,
      shippingLocationSnapshot,
      shippingLocationConfirmed: Boolean(raw?.shippingLocationConfirmed),
      pickupDetails,
      deliveryConfidence,
      deliveryProof,
      shippingAddress: {
        country: sanitizeString(raw?.shippingAddress?.country, ""),
        firstName: sanitizeString(raw?.shippingAddress?.firstName, ""),
        lastName: sanitizeString(raw?.shippingAddress?.lastName, ""),
        company: sanitizeString(raw?.shippingAddress?.company, ""),
        addressLine1: sanitizeString(raw?.shippingAddress?.addressLine1, ""),
        addressLine2: sanitizeString(raw?.shippingAddress?.addressLine2, ""),
        postalCode: sanitizeString(raw?.shippingAddress?.postalCode, ""),
        city: sanitizeString(raw?.shippingAddress?.city, ""),
        province: sanitizeString(raw?.shippingAddress?.province, ""),
        phone: sanitizeString(raw?.shippingAddress?.phone, "")
      }
    };
  }

  function normalizeStatusHistory(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    return list
      .map((item) => ({
        status: sanitizeMethod(item?.status, "pending"),
        note: sanitizeString(item?.note, ""),
        actorEmail: sanitizeString(item?.actorEmail, ""),
        source: sanitizeString(item?.source, "system"),
        createdAt: normalizeDateValue(item?.createdAt) || sanitizeString(item?.createdAt, "")
      }))
      .filter((item) => item.status);
  }

  function mapProduct(doc) {
    const data = doc.data() || {};
    const id = normalizeProductId(data.id || doc.id);

    return {
      id,
      name: typeof data.name === "string" ? data.name : `Product ${id}`,
      size: typeof data.size === "string" ? data.size : "N/A",
      price: Number(data.price) || 0,
      image: typeof data.image === "string" ? data.image : "",
      category: sanitizeString(data.category, "General"),
      tags: sanitizeTagList(data.tags),
      stock: Number.isFinite(Number(data.stock)) ? Math.max(0, Number(data.stock)) : null,
      isActive: data.isActive !== false,
      updatedAt: normalizeDateValue(data.updatedAt)
    };
  }

  function mapOrder(doc) {
    const data = doc.data() || {};
    const uidFromPath = doc.ref?.parent?.parent?.id;

    return {
      id: doc.id,
      uid: data.uid || uidFromPath || "",
      email: data.email || "",
      productId: normalizeProductId(data.productId),
      productName: data.productName || "",
      productSize: data.productSize || "",
      productImage: data.productImage || "",
      productCategory: sanitizeString(data.productCategory, "General"),
      productTags: sanitizeTagList(data.productTags),
      quantity: Math.max(1, Number(data.quantity) || 1),
      unitPrice: Number(data.unitPrice) || 0,
      shippingFee: Number(data.shippingFee) || 0,
      shippingOption: sanitizeMethod(data.shippingOption, "standard_shipping"),
      paymentMethod: sanitizeMethod(data.paymentMethod, "cash_on_delivery"),
      deliveryMethod: data.deliveryMethod === "pickup" ? "pickup" : "ship",
      totalPrice: Number(data.totalPrice) || 0,
      contactEmail: data.contactEmail || data.email || "",
      paymentSessionId: data.paymentSessionId || "",
      orderNotes: sanitizeString(data.orderNotes, ""),
      shippingLocation: {
        lng: sanitizeCoordinate(data.shippingLocation?.lng),
        lat: sanitizeCoordinate(data.shippingLocation?.lat)
      },
      shippingLocationSnapshot: {
        embedUrl: sanitizeString(data.shippingLocationSnapshot?.embedUrl, ""),
        imageUrl: sanitizeString(data.shippingLocationSnapshot?.imageUrl, ""),
        mapUrl: sanitizeString(data.shippingLocationSnapshot?.mapUrl, "")
      },
      shippingLocationConfirmed: Boolean(data.shippingLocationConfirmed),
      pickupDetails: data.pickupDetails && typeof data.pickupDetails === "object"
        ? {
          contactName: sanitizeString(data.pickupDetails.contactName, ""),
          contactPhone: sanitizeString(data.pickupDetails.contactPhone, ""),
          pickupDate: sanitizeString(data.pickupDetails.pickupDate, ""),
          pickupTimeSlot: sanitizeString(data.pickupDetails.pickupTimeSlot, ""),
          agreedToBringId: Boolean(data.pickupDetails.agreedToBringId),
          reference: sanitizeString(data.pickupDetails.reference, "")
        }
        : null,
      deliveryConfidence: data.deliveryConfidence
        ? normalizeDeliveryConfidence(data.deliveryConfidence)
        : computeDeliveryConfidence(data),
      deliveryProof: buildDeliveryProofBundle(data.deliveryProof || data),
      shippingAddress: {
        country: sanitizeString(data.shippingAddress?.country, ""),
        firstName: sanitizeString(data.shippingAddress?.firstName, ""),
        lastName: sanitizeString(data.shippingAddress?.lastName, ""),
        company: sanitizeString(data.shippingAddress?.company, ""),
        addressLine1: sanitizeString(data.shippingAddress?.addressLine1, ""),
        addressLine2: sanitizeString(data.shippingAddress?.addressLine2, ""),
        postalCode: sanitizeString(data.shippingAddress?.postalCode, ""),
        city: sanitizeString(data.shippingAddress?.city, ""),
        province: sanitizeString(data.shippingAddress?.province, ""),
        phone: sanitizeString(data.shippingAddress?.phone, "")
      },
      courierNote: sanitizeString(data.courierNote, ""),
      returnStatus: sanitizeMethod(data.returnStatus, ""),
      statusHistory: normalizeStatusHistory(data.statusHistory),
      estimatedDeliveryAt: normalizeDateValue(data.estimatedDeliveryAt) || "",
      status: data.status || "pending",
      createdAt: normalizeDateValue(data.createdAt) || new Date().toISOString(),
      updatedAt: normalizeDateValue(data.updatedAt)
    };
  }

  function mapReturnRequest(doc) {
    const data = doc.data() || {};
    const rawStatus = sanitizeMethod(data.status, "requested");
    const normalizedStatus = rawStatus === "denied" ? "rejected" : rawStatus;
    return {
      id: doc.id,
      orderId: sanitizeString(data.orderId, ""),
      orderUid: sanitizeString(data.orderUid, ""),
      requesterUid: sanitizeString(data.requesterUid, ""),
      requesterEmail: sanitizeString(data.requesterEmail, ""),
      reason: sanitizeString(data.reason, ""),
      notes: sanitizeString(data.notes, ""),
      status: normalizedStatus,
      decisionNote: sanitizeString(data.decisionNote, ""),
      reviewedBy: sanitizeString(data.reviewedBy, ""),
      reviewedAt: normalizeDateValue(data.reviewedAt),
      createdAt: normalizeDateValue(data.createdAt),
      updatedAt: normalizeDateValue(data.updatedAt),
      history: Array.isArray(data.history)
        ? data.history.map((item) => ({
          action: sanitizeString(item?.action, ""),
          by: sanitizeString(item?.by, ""),
          note: sanitizeString(item?.note, ""),
          createdAt: normalizeDateValue(item?.createdAt) || sanitizeString(item?.createdAt, "")
        }))
        : []
    };
  }

  function mapOrderAudit(doc) {
    const data = doc.data() || {};
    return {
      id: doc.id,
      orderId: data.orderId || "",
      orderUid: data.orderUid || "",
      eventType: sanitizeString(data.eventType, "order_status_changed"),
      previousStatus: data.previousStatus || "",
      nextStatus: data.nextStatus || "",
      actorUid: data.actorUid || "",
      actorEmail: data.actorEmail || "",
      actorRole: data.actorRole || "",
      source: data.source || "",
      message: sanitizeString(data.message, ""),
      meta: data.meta && typeof data.meta === "object" ? data.meta : {},
      createdAt: normalizeDateValue(data.createdAt)
    };
  }

  function mapPaymentSession(doc) {
    const data = doc.data() || {};

    return {
      id: doc.id,
      uid: data.uid || "",
      email: data.email || "",
      status: data.status || "pending",
      amount: Number(data.amount) || 0,
      currency: data.currency || "PHP",
      draft: data.draft || null,
      source: data.source || "",
      createdAt: normalizeDateValue(data.createdAt),
      updatedAt: normalizeDateValue(data.updatedAt),
      scannedAt: normalizeDateValue(data.scannedAt),
      paidAt: normalizeDateValue(data.paidAt),
      completedAt: normalizeDateValue(data.completedAt),
      orderId: data.orderId || ""
    };
  }

  async function queueEmail(payload) {
    const db = getDbInstance();
    if (!db) {
      return;
    }

    const to = Array.isArray(payload?.to) ? payload.to : [payload?.to].filter(Boolean);
    if (!to.length) {
      return;
    }

    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const text = typeof payload?.text === "string" ? payload.text : "";
    const html = typeof payload?.html === "string" ? payload.html : "";

    await db.collection("mail").add({
      to,
      message: {
        subject: subject || "Order update",
        text,
        html
      },
      createdAt: getServerTimestamp()
    });
  }

  function mapNotification(doc) {
    const data = doc.data() || {};
    return {
      id: doc.id,
      uid: sanitizeString(data.uid, ""),
      email: sanitizeString(data.email, ""),
      type: sanitizeString(data.type, "general"),
      title: sanitizeString(data.title, ""),
      message: sanitizeString(data.message, ""),
      relatedOrderId: sanitizeString(data.relatedOrderId, ""),
      relatedReturnRequestId: sanitizeString(data.relatedReturnRequestId, ""),
      read: Boolean(data.read),
      createdAt: normalizeDateValue(data.createdAt),
      readAt: normalizeDateValue(data.readAt),
      data: data.data && typeof data.data === "object" ? data.data : {}
    };
  }

  async function queueNotification(payload) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const uid = sanitizeString(payload?.uid, "");
    const email = sanitizeString(payload?.email, "");
    if (!uid && !email) {
      return null;
    }

    const record = {
      uid,
      email,
      type: sanitizeString(payload?.type, "general"),
      title: sanitizeString(payload?.title, "Update"),
      message: sanitizeString(payload?.message, ""),
      relatedOrderId: sanitizeString(payload?.relatedOrderId, ""),
      relatedReturnRequestId: sanitizeString(payload?.relatedReturnRequestId, ""),
      read: false,
      data: payload?.data && typeof payload.data === "object" ? payload.data : {},
      createdAt: getServerTimestamp(),
      readAt: null
    };

    const ref = await db.collection("notifications").add(record);
    const snap = await ref.get();
    return mapNotification(snap);
  }

  async function ensureUserDocument(user) {
    const db = getDbInstance();
    if (!db || !user?.uid) {
      return null;
    }

    const userRef = db.collection("users").doc(user.uid);
    const snapshot = await userRef.get();

    if (!snapshot.exists) {
      const payload = {
        uid: user.uid,
        email: user.email || "",
        role: "customer",
        profile: {
          firstName: "",
          lastName: "",
          phone: "",
          country: "",
          city: "",
          province: "",
          postalCode: "",
          addressLine1: "",
          addressLine2: ""
        },
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp()
      };
      await userRef.set(payload, { merge: true });
      return { ...payload, id: user.uid, role: "customer" };
    }

    const data = snapshot.data() || {};
    await userRef.set(
      {
        uid: user.uid,
        email: user.email || data.email || "",
        updatedAt: getServerTimestamp()
      },
      { merge: true }
    );

    return {
      id: snapshot.id,
      uid: user.uid,
      email: user.email || data.email || "",
      role: typeof data.role === "string" ? data.role : "customer",
      profile: {
        firstName: sanitizeString(data.profile?.firstName, ""),
        lastName: sanitizeString(data.profile?.lastName, ""),
        phone: sanitizeString(data.profile?.phone, ""),
        country: sanitizeString(data.profile?.country, ""),
        city: sanitizeString(data.profile?.city, ""),
        province: sanitizeString(data.profile?.province, ""),
        postalCode: sanitizeString(data.profile?.postalCode, ""),
        addressLine1: sanitizeString(data.profile?.addressLine1, ""),
        addressLine2: sanitizeString(data.profile?.addressLine2, "")
      },
      createdAt: normalizeDateValue(data.createdAt),
      updatedAt: normalizeDateValue(data.updatedAt)
    };
  }

  async function getUserProfile(uid) {
    const db = getDbInstance();
    if (!db || !uid) {
      return null;
    }

    const snapshot = await db.collection("users").doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() || {};
    return {
      id: snapshot.id,
      uid,
      email: data.email || "",
      role: typeof data.role === "string" ? data.role : "customer",
      profile: {
        firstName: sanitizeString(data.profile?.firstName, ""),
        lastName: sanitizeString(data.profile?.lastName, ""),
        phone: sanitizeString(data.profile?.phone, ""),
        country: sanitizeString(data.profile?.country, ""),
        city: sanitizeString(data.profile?.city, ""),
        province: sanitizeString(data.profile?.province, ""),
        postalCode: sanitizeString(data.profile?.postalCode, ""),
        addressLine1: sanitizeString(data.profile?.addressLine1, ""),
        addressLine2: sanitizeString(data.profile?.addressLine2, "")
      },
      createdAt: normalizeDateValue(data.createdAt),
      updatedAt: normalizeDateValue(data.updatedAt)
    };
  }

  async function updateUserProfile(uid, payload) {
    const db = getDbInstance();
    if (!db || !uid) {
      return null;
    }

    const profile = {
      firstName: sanitizeString(payload?.firstName, ""),
      lastName: sanitizeString(payload?.lastName, ""),
      phone: sanitizeString(payload?.phone, ""),
      country: sanitizeString(payload?.country, ""),
      city: sanitizeString(payload?.city, ""),
      province: sanitizeString(payload?.province, ""),
      postalCode: sanitizeString(payload?.postalCode, ""),
      addressLine1: sanitizeString(payload?.addressLine1, ""),
      addressLine2: sanitizeString(payload?.addressLine2, "")
    };

    await db.collection("users").doc(uid).set(
      {
        profile,
        updatedAt: getServerTimestamp()
      },
      { merge: true }
    );

    return profile;
  }

  async function listProducts() {
    const db = getDbInstance();
    if (!db) {
      return [];
    }

    let snapshot;
    try {
      snapshot = await db.collection("products").get();
    } catch (error) {
      console.error("Failed to list products", error);
      return [];
    }

    return snapshot.docs
      .map(mapProduct)
      .filter((product) => product.id > 0 && product.isActive !== false)
      .sort((a, b) => a.id - b.id);
  }

  function watchProducts(onData, onError) {
    const db = getDbInstance();
    if (!db) {
      return () => {};
    }

    return db.collection("products").onSnapshot(
      (snapshot) => {
        const products = snapshot.docs
          .map(mapProduct)
          .filter((product) => product.id > 0 && product.isActive !== false)
          .sort((a, b) => a.id - b.id);

        onData(products);
      },
      (error) => {
        if (typeof onError === "function") {
          onError(error);
        } else {
          console.error("Product realtime listener failed", error);
        }
      }
    );
  }

  async function upsertProduct(product) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const id = normalizeProductId(product?.id);
    if (!id) {
      throw new Error("invalid_product_id");
    }

    const payload = {
      id,
      name: typeof product?.name === "string" ? product.name.trim() : `Product ${id}`,
      size: typeof product?.size === "string" ? product.size.trim() : "N/A",
      price: Number(product?.price) || 0,
      image: typeof product?.image === "string" ? product.image.trim() : "",
      category: sanitizeString(product?.category, "General"),
      tags: sanitizeTagList(product?.tags),
      stock: Number.isFinite(Number(product?.stock)) ? Math.max(0, Number(product.stock)) : 0,
      isActive: product?.isActive !== false,
      updatedAt: getServerTimestamp()
    };

    await db.collection("products").doc(String(id)).set(payload, { merge: true });
    return payload;
  }

  async function deleteProduct(productId) {
    const db = getDbInstance();
    if (!db) {
      return;
    }

    const id = normalizeProductId(productId);
    if (!id) {
      return;
    }

    await db.collection("products").doc(String(id)).set(
      {
        isActive: false,
        updatedAt: getServerTimestamp()
      },
      { merge: true }
    );
  }

  async function getProductById(productId) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const id = normalizeProductId(productId);
    if (!id) {
      return null;
    }

    const snapshot = await db.collection("products").doc(String(id)).get();
    if (!snapshot.exists) {
      return null;
    }

    const product = mapProduct(snapshot);
    if (product.isActive === false) {
      return null;
    }

    return product;
  }

  async function getCart(uid) {
    const db = getDbInstance();
    if (!db || !uid) {
      return null;
    }

    const snapshot = await db.collection("carts").doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() || {};
    return {
      id: snapshot.id,
      productId: normalizeProductId(data.productId),
      quantity: Math.max(1, Number(data.quantity) || 1),
      shippingOption: sanitizeMethod(data.shippingOption, "standard_shipping"),
      paymentMethod: sanitizeMethod(data.paymentMethod, "cash_on_delivery"),
      deliveryMethod: data.deliveryMethod === "pickup" ? "pickup" : "ship",
      orderNotes: sanitizeString(data.orderNotes, ""),
      contactEmail: sanitizeString(data.contactEmail, ""),
      shippingLocation: {
        lng: sanitizeCoordinate(data.shippingLocation?.lng),
        lat: sanitizeCoordinate(data.shippingLocation?.lat)
      },
      shippingLocationSnapshot: {
        embedUrl: sanitizeString(data.shippingLocationSnapshot?.embedUrl, ""),
        imageUrl: sanitizeString(data.shippingLocationSnapshot?.imageUrl, ""),
        mapUrl: sanitizeString(data.shippingLocationSnapshot?.mapUrl, "")
      },
      shippingLocationConfirmed: Boolean(data.shippingLocationConfirmed),
      updatedAt: normalizeDateValue(data.updatedAt)
    };
  }

  async function setCart(uid, draft) {
    const db = getDbInstance();
    if (!db || !uid) {
      return null;
    }

    const safe = sanitizeDraft(draft);

    const payload = {
      productId: safe.productId,
      quantity: safe.quantity,
      shippingOption: safe.shippingOption,
      paymentMethod: safe.paymentMethod,
      deliveryMethod: safe.deliveryMethod,
      orderNotes: safe.orderNotes,
      contactEmail: safe.contactEmail,
      shippingLocation: safe.shippingLocation,
      shippingLocationSnapshot: safe.shippingLocationSnapshot,
      shippingLocationConfirmed: safe.shippingLocationConfirmed,
      updatedAt: getServerTimestamp()
    };

    await db.collection("carts").doc(uid).set(payload, { merge: true });
    return payload;
  }

  async function clearCart(uid) {
    const db = getDbInstance();
    if (!db || !uid) {
      return;
    }

    await db.collection("carts").doc(uid).delete();
  }

  async function createPaymentSession(payload) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const draft = sanitizeDraft(payload?.draft || {});
    const sessionRef = db.collection("payment_sessions").doc();

    const sessionPayload = {
      uid: payload?.uid || "",
      email: payload?.email || "",
      status: "pending",
      amount: Number(payload?.amount) || draft.totalPrice || 0,
      currency: String(payload?.currency || "PHP"),
      draft,
      source: String(payload?.source || "checkout"),
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    };

    await sessionRef.set(sessionPayload, { merge: true });
    const snapshot = await sessionRef.get();
    return mapPaymentSession(snapshot);
  }

  async function getPaymentSession(sessionId) {
    const db = getDbInstance();
    if (!db || !sessionId) {
      return null;
    }

    const snapshot = await db.collection("payment_sessions").doc(sessionId).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapPaymentSession(snapshot);
  }

  async function markPaymentSessionPaid(sessionId, meta) {
    const db = getDbInstance();
    if (!db || !sessionId) {
      return null;
    }

    const sessionRef = db.collection("payment_sessions").doc(sessionId);
    let existingSnapshot = null;

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      if (!snapshot.exists) {
        const missingErr = new Error("payment_session_not_found");
        missingErr.code = "payment_session_not_found";
        throw missingErr;
      }

      const currentStatus = String(snapshot.data()?.status || "pending");
      if (currentStatus === "completed") {
        existingSnapshot = snapshot;
        return;
      }

      transaction.set(
        sessionRef,
        {
          status: "paid",
          source: String(meta?.source || "qr_scan"),
          scannerMeta: {
            userAgent: String(meta?.userAgent || ""),
            scannedBy: String(meta?.scannedBy || ""),
            scannedFrom: String(meta?.scannedFrom || "")
          },
          scannedAt: getServerTimestamp(),
          paidAt: getServerTimestamp(),
          updatedAt: getServerTimestamp()
        },
        { merge: true }
      );
    });

    if (existingSnapshot?.exists) {
      return mapPaymentSession(existingSnapshot);
    }

    const updatedSnapshot = await sessionRef.get();
    return updatedSnapshot.exists ? mapPaymentSession(updatedSnapshot) : null;
  }

  async function markPaymentSessionCompleted(sessionId, orderId) {
    const db = getDbInstance();
    if (!db || !sessionId) {
      return null;
    }

    const sessionRef = db.collection("payment_sessions").doc(sessionId);
    await sessionRef.set(
      {
        status: "completed",
        orderId: orderId || "",
        completedAt: getServerTimestamp(),
        updatedAt: getServerTimestamp()
      },
      { merge: true }
    );

    const snapshot = await sessionRef.get();
    return snapshot.exists ? mapPaymentSession(snapshot) : null;
  }

  function watchPaymentSession(sessionId, onData, onError) {
    const db = getDbInstance();
    if (!db || !sessionId) {
      return () => {};
    }

    return db.collection("payment_sessions").doc(sessionId).onSnapshot(
      (snapshot) => {
        if (!snapshot.exists) {
          onData(null);
          return;
        }

        onData(mapPaymentSession(snapshot));
      },
      (error) => {
        if (typeof onError === "function") {
          onError(error);
        } else {
          console.error("Payment session realtime listener failed", error);
        }
      }
    );
  }

  async function createOrder(uid, email, draft) {
    const db = getDbInstance();
    if (!db || !uid) {
      return null;
    }

    const safe = sanitizeDraft(draft);
    const userRef = db.collection("users").doc(uid);
    const ordersRef = userRef.collection("orders");
    const orderRef = ordersRef.doc();
    const cartRef = db.collection("carts").doc(uid);
    const productRef = safe.productId ? db.collection("products").doc(String(safe.productId)) : null;

    await db.runTransaction(async (transaction) => {
      let productData = null;

      if (productRef) {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) {
          const missingErr = new Error("product_not_found");
          missingErr.code = "product_not_found";
          throw missingErr;
        }

        productData = productSnap.data() || {};

        if (productData.isActive === false) {
          const inactiveErr = new Error("product_inactive");
          inactiveErr.code = "product_inactive";
          throw inactiveErr;
        }

        const stock = Number(productData.stock);
        if (Number.isFinite(stock)) {
          if (safe.quantity > stock) {
            const outErr = new Error("out_of_stock");
            outErr.code = "out_of_stock";
            throw outErr;
          }

          transaction.update(productRef, {
            stock: stock - safe.quantity,
            updatedAt: getServerTimestamp()
          });
        }
      }

      const productName = productData?.name || safe.productName || `Product #${safe.productId}`;
      const productSize = productData?.size || safe.productSize || "N/A";
      const productImage = productData?.image || safe.productImage || "";
      const productCategory = sanitizeString(productData?.category, safe.productCategory || "General");
      const productTags = sanitizeTagList(productData?.tags?.length ? productData.tags : safe.productTags);
      const unitPrice = Number(productData?.price) || safe.unitPrice;
      const totalPrice = unitPrice * safe.quantity + safe.shippingFee;
      const estimatedDeliveryAt = safe.estimatedDeliveryAt || estimateDeliveryIso(safe.deliveryMethod, safe.shippingOption);
      const deliveryConfidence = computeDeliveryConfidence({
        shippingAddress: safe.shippingAddress,
        shippingLocation: safe.shippingLocation,
        shippingLocationSnapshot: safe.shippingLocationSnapshot,
        shippingLocationConfirmed: safe.shippingLocationConfirmed
      });
      const deliveryProof = buildDeliveryProofBundle({
        shippingAddress: safe.shippingAddress,
        shippingLocation: safe.shippingLocation,
        shippingLocationSnapshot: safe.shippingLocationSnapshot,
        shippingLocationConfirmed: safe.shippingLocationConfirmed,
        deliveryProof: safe.deliveryProof
      });
      deliveryProof.timeline = [
        ...(Array.isArray(deliveryProof.timeline) ? deliveryProof.timeline : []),
        {
          action: "order_created",
          note: "Checkout completed with delivery proof bundle.",
          actor: email || "",
          createdAt: new Date().toISOString()
        }
      ];

      const payload = {
        uid,
        email: email || "",
        productId: safe.productId,
        productName,
        productSize,
        productImage,
        productCategory,
        productTags,
        quantity: safe.quantity,
        unitPrice,
        shippingFee: safe.shippingFee,
        shippingOption: safe.shippingOption,
        paymentMethod: safe.paymentMethod,
        deliveryMethod: safe.deliveryMethod,
        totalPrice,
        contactEmail: safe.contactEmail || email || "",
        paymentSessionId: safe.paymentSessionId || "",
        orderNotes: safe.orderNotes || "",
        shippingLocation: safe.shippingLocation || null,
        shippingLocationSnapshot: safe.shippingLocationSnapshot || null,
        shippingLocationConfirmed: Boolean(safe.shippingLocationConfirmed),
        deliveryConfidence,
        deliveryProof,
        shippingAddress: safe.shippingAddress || null,
        courierNote: "",
        statusHistory: [
          {
            status: "pending",
            note: "Order created",
            actorEmail: email || "",
            source: "checkout",
            createdAt: new Date().toISOString()
          }
        ],
        estimatedDeliveryAt,
        status: "pending",
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp()
      };

      transaction.set(orderRef, payload, { merge: true });
      transaction.delete(cartRef);

    });

    const orderSnap = await orderRef.get();
    const order = mapOrder(orderSnap);

    const receiver = order.contactEmail || order.email || email;
    if (receiver) {
      await queueEmail({
        to: receiver,
        subject: `Order #${order.id} placed`,
        text: `Your order for ${order.productName} is now pending. Total: PHP ${order.totalPrice.toFixed(2)}.`
      }).catch((error) => {
        console.error("Failed to queue order receipt email", error);
      });
    }

    await queueNotification({
      uid,
      email: receiver || email || "",
      type: "order_created",
      title: `Order #${order.id} placed`,
      message: `Your order is pending. Delivery confidence: ${order.deliveryConfidence?.level || "n/a"} (${order.deliveryConfidence?.score || 0}/100).`,
      relatedOrderId: order.id,
      data: {
        status: order.status,
        deliveryConfidence: order.deliveryConfidence || null
      }
    }).catch((error) => {
      console.error("Failed to queue order notification", error);
    });

    await logOrderAudit({
      orderId: order.id,
      orderUid: uid,
      eventType: "order_created",
      previousStatus: "",
      nextStatus: order.status || "pending",
      actorUid: uid,
      actorEmail: email || "",
      actorRole: "customer",
      source: "checkout",
      message: "Order created from checkout flow.",
      meta: {
        paymentMethod: order.paymentMethod,
        deliveryConfidence: order.deliveryConfidence
      }
    }).catch((error) => {
      console.error("Failed to write order-created audit log", error);
    });

    return order;
  }

  async function getOrderById(uid, orderId) {
    const db = getDbInstance();
    if (!db || !uid || !orderId) {
      return null;
    }

    const snapshot = await db.collection("users").doc(uid).collection("orders").doc(orderId).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapOrder(snapshot);
  }

  async function listOrders(uid) {
    const db = getDbInstance();
    if (!db || !uid) {
      return [];
    }

    const snapshot = await db.collection("users").doc(uid).collection("orders").get();

    return snapshot.docs
      .map(mapOrder)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  function watchUserOrders(uid, onData, onError) {
    const db = getDbInstance();
    if (!db || !uid) {
      return () => {};
    }

    return db.collection("users").doc(uid).collection("orders").onSnapshot(
      (snapshot) => {
        const orders = snapshot.docs
          .map(mapOrder)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        onData(orders);
      },
      (error) => {
        if (typeof onError === "function") {
          onError(error);
        } else {
          console.error("User orders realtime listener failed", error);
        }
      }
    );
  }

  async function listAllOrders() {
    const db = getDbInstance();
    if (!db) {
      return [];
    }

    const snapshot = await db.collectionGroup("orders").get();

    return snapshot.docs
      .map(mapOrder)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  function watchAllOrders(onData, onError) {
    const db = getDbInstance();
    if (!db) {
      return () => {};
    }

    return db.collectionGroup("orders").onSnapshot(
      (snapshot) => {
        const orders = snapshot.docs
          .map(mapOrder)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        onData(orders);
      },
      (error) => {
        if (typeof onError === "function") {
          onError(error);
        } else {
          console.error("All orders realtime listener failed", error);
        }
      }
    );
  }

  async function getAnalyticsSummary(options) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const days = Math.max(1, Number(options?.days) || 30);
    const startAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [ordersSnapshot, returnsSnapshot] = await Promise.all([
      db.collectionGroup("orders")
        .where("createdAt", ">=", startAt)
        .get(),
      db.collection("return_requests")
        .where("createdAt", ">=", startAt)
        .get()
    ]);

    const orders = ordersSnapshot.docs.map(mapOrder);
    const returns = returnsSnapshot.docs.map(mapReturnRequest);
    const deliveredOrders = orders.filter((order) => order.status === "delivered");
    const canceledOrders = orders.filter((order) => order.status === "canceled");
    const lowConfidenceOrders = orders.filter((order) => Number(order.deliveryConfidence?.score || 0) < 50);
    const refundedReturns = returns.filter((entry) => entry.status === "refunded");

    const deliveredDurationsHours = deliveredOrders
      .map((order) => {
        const created = new Date(order.createdAt || 0).getTime();
        const deliveredEntry = Array.isArray(order.statusHistory)
          ? order.statusHistory.find((entry) => entry.status === "delivered")
          : null;
        const deliveredAt = new Date(deliveredEntry?.createdAt || order.updatedAt || 0).getTime();
        if (!Number.isFinite(created) || !Number.isFinite(deliveredAt) || deliveredAt < created) {
          return null;
        }
        return (deliveredAt - created) / 3600000;
      })
      .filter((value) => Number.isFinite(value));

    const avgFulfillmentHours = deliveredDurationsHours.length
      ? Number((deliveredDurationsHours.reduce((sum, value) => sum + value, 0) / deliveredDurationsHours.length).toFixed(2))
      : 0;

    const totalRevenue = orders
      .filter((order) => order.status !== "canceled")
      .reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);

    const daily = new Map();
    orders.forEach((order) => {
      const key = new Date(order.createdAt || Date.now()).toISOString().slice(0, 10);
      const row = daily.get(key) || { date: key, orders: 0, revenue: 0 };
      row.orders += 1;
      if (order.status !== "canceled") {
        row.revenue += Number(order.totalPrice || 0);
      }
      daily.set(key, row);
    });

    return {
      days,
      totalOrders: orders.length,
      deliveredCount: deliveredOrders.length,
      canceledCount: canceledOrders.length,
      lowConfidenceCount: lowConfidenceOrders.length,
      returnRequestedCount: returns.length,
      returnRefundedCount: refundedReturns.length,
      cancellationRate: orders.length ? Number(((canceledOrders.length / orders.length) * 100).toFixed(2)) : 0,
      avgFulfillmentHours,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      dailySales: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  async function listUserNotifications(uid, limitCount) {
    const db = getDbInstance();
    if (!db || !uid) {
      return [];
    }

    const safeLimit = Math.max(1, Number(limitCount) || 30);
    const snapshot = await db.collection("notifications")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(safeLimit)
      .get();

    return snapshot.docs.map(mapNotification);
  }

  function watchUserNotifications(uid, onData, onError, limitCount) {
    const db = getDbInstance();
    if (!db || !uid) {
      return () => {};
    }

    const safeLimit = Math.max(1, Number(limitCount) || 30);
    return db.collection("notifications")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(safeLimit)
      .onSnapshot(
        (snapshot) => onData(snapshot.docs.map(mapNotification)),
        (error) => {
          if (typeof onError === "function") {
            onError(error);
          } else {
            console.error("User notification listener failed", error);
          }
        }
      );
  }

  async function markNotificationRead(notificationId) {
    const db = getDbInstance();
    if (!db || !notificationId) {
      return null;
    }

    const ref = db.collection("notifications").doc(notificationId);
    await ref.set(
      {
        read: true,
        readAt: getServerTimestamp()
      },
      { merge: true }
    );

    const snap = await ref.get();
    return snap.exists ? mapNotification(snap) : null;
  }

  async function markAllNotificationsRead(uid) {
    const db = getDbInstance();
    if (!db || !uid) {
      return 0;
    }

    const snapshot = await db.collection("notifications")
      .where("uid", "==", uid)
      .where("read", "==", false)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.set(doc.ref, { read: true, readAt: getServerTimestamp() }, { merge: true });
    });
    await batch.commit();
    return snapshot.size;
  }

  async function logOrderAudit(entry) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const payload = {
      orderId: sanitizeString(entry?.orderId, ""),
      orderUid: sanitizeString(entry?.orderUid, ""),
      eventType: sanitizeString(entry?.eventType, "order_status_changed"),
      previousStatus: sanitizeString(entry?.previousStatus, ""),
      nextStatus: sanitizeString(entry?.nextStatus, ""),
      actorUid: sanitizeString(entry?.actorUid, ""),
      actorEmail: sanitizeString(entry?.actorEmail, ""),
      actorRole: sanitizeString(entry?.actorRole, "customer"),
      source: sanitizeString(entry?.source, "unknown"),
      message: sanitizeString(entry?.message, ""),
      meta: entry?.meta && typeof entry.meta === "object" ? entry.meta : {},
      createdAt: getServerTimestamp()
    };

    const docRef = await db.collection("order_audit").add(payload);
    return { id: docRef.id, ...payload };
  }

  function watchOrderAudit(onData, onError, limitCount) {
    const db = getDbInstance();
    if (!db) {
      return () => {};
    }

    const safeLimit = Math.max(1, Number(limitCount) || 30);
    return db.collection("order_audit")
      .orderBy("createdAt", "desc")
      .limit(safeLimit)
      .onSnapshot(
        (snapshot) => {
          onData(snapshot.docs.map(mapOrderAudit));
        },
        (error) => {
          if (typeof onError === "function") {
            onError(error);
          } else {
            console.error("Order audit realtime listener failed", error);
          }
        }
      );
  }

  async function updateOrderStatus(uid, orderId, status, meta) {
    const db = getDbInstance();
    if (!db || !uid || !orderId) {
      return;
    }

    const safeStatus = sanitizeMethod(status, "pending");
    const orderRef = db.collection("users").doc(uid).collection("orders").doc(orderId);
    let previousStatusValue = "pending";
    let statusChanged = false;

    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const missingErr = new Error("order_not_found");
        missingErr.code = "order_not_found";
        throw missingErr;
      }

      const order = mapOrder(orderSnap);
      const previousStatus = order.status;
      previousStatusValue = previousStatus;
      const nextCourierNote = typeof meta?.courierNote === "string"
        ? sanitizeString(meta.courierNote, "")
        : order.courierNote;

      if (previousStatus === safeStatus) {
        if (nextCourierNote !== order.courierNote) {
          transaction.set(
            orderRef,
            {
              courierNote: nextCourierNote,
              updatedAt: getServerTimestamp()
            },
            { merge: true }
          );
        }
        return;
      }
      statusChanged = true;

      const productId = normalizeProductId(order.productId);
      const productRef = productId ? db.collection("products").doc(String(productId)) : null;

      if (productRef) {
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists) {
          const product = productSnap.data() || {};
          const stock = Number(product.stock);

          if (Number.isFinite(stock)) {
            if (previousStatus !== "canceled" && safeStatus === "canceled") {
              transaction.update(productRef, {
                stock: stock + order.quantity,
                updatedAt: getServerTimestamp()
              });
            }

            if (previousStatus === "canceled" && safeStatus !== "canceled") {
              if (stock < order.quantity) {
                const outErr = new Error("out_of_stock");
                outErr.code = "out_of_stock";
                throw outErr;
              }

              transaction.update(productRef, {
                stock: stock - order.quantity,
                updatedAt: getServerTimestamp()
              });
            }
          }
        }
      }

      transaction.set(
        orderRef,
        {
          status: safeStatus,
          courierNote: nextCourierNote,
          deliveryProof: {
            ...(order.deliveryProof && typeof order.deliveryProof === "object" ? order.deliveryProof : {}),
            timeline: [
              ...(Array.isArray(order.deliveryProof?.timeline) ? order.deliveryProof.timeline : []),
              {
                action: `status_${safeStatus}`,
                note: sanitizeString(meta?.note, nextCourierNote || ""),
                actor: sanitizeString(meta?.actorEmail, ""),
                createdAt: new Date().toISOString()
              }
            ]
          },
          statusHistory: [
            ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
            {
              status: safeStatus,
              note: sanitizeString(meta?.note, nextCourierNote || ""),
              actorEmail: sanitizeString(meta?.actorEmail, ""),
              source: sanitizeString(meta?.source, "status_update"),
              createdAt: new Date().toISOString()
            }
          ],
          updatedAt: getServerTimestamp()
        },
        { merge: true }
      );
    });

    const updatedSnap = await orderRef.get();
    const updatedOrder = mapOrder(updatedSnap);

    if (!statusChanged) {
      return updatedOrder;
    }

    const receiver = updatedOrder.contactEmail || updatedOrder.email;
    const statusLabel = formatStatusLabel(safeStatus);
    if (receiver) {
      await queueEmail({
        to: receiver,
        subject: `Order #${orderId} status updated`,
        text: `Your order status is now ${statusLabel}.`
      }).catch((error) => {
        console.error("Failed to queue status update email", error);
      });
    }

    await queueNotification({
      uid,
      email: receiver || "",
      type: "order_status_updated",
      title: `Order #${orderId} is now ${statusLabel}`,
      message: sanitizeString(meta?.note, `Status changed to ${statusLabel}.`),
      relatedOrderId: orderId,
      data: {
        previousStatus: previousStatusValue,
        nextStatus: safeStatus
      }
    }).catch((error) => {
      console.error("Failed to queue status notification", error);
    });

    await logOrderAudit({
      orderId,
      orderUid: uid,
      eventType: "order_status_changed",
      previousStatus: previousStatusValue,
      nextStatus: safeStatus,
      actorUid: meta?.actorUid || "",
      actorEmail: meta?.actorEmail || "",
      actorRole: meta?.actorRole || "customer",
      source: meta?.source || "status_update",
      message: sanitizeString(meta?.note, `Order status changed to ${safeStatus}`),
      meta: {
        courierNote: sanitizeString(meta?.courierNote, "")
      }
    }).catch((error) => {
      console.error("Failed to write order audit log", error);
    });

    return updatedOrder;
  }

  async function createReturnRequest(payload) {
    const db = getDbInstance();
    if (!db) {
      return null;
    }

    const orderId = sanitizeString(payload?.orderId, "");
    const requesterUid = sanitizeString(payload?.requesterUid, "");
    if (orderId && requesterUid) {
      const existingSnapshot = await db.collection("return_requests")
        .where("orderId", "==", orderId)
        .where("requesterUid", "==", requesterUid)
        .get();
      const activeExists = existingSnapshot.docs.some((doc) => {
        const status = sanitizeMethod(doc.data()?.status, "requested");
        return ["requested", "approved", "received"].includes(status);
      });
      if (activeExists) {
        const duplicateErr = new Error("return_request_already_exists");
        duplicateErr.code = "return_request_already_exists";
        throw duplicateErr;
      }
    }

    const requestPayload = {
      orderId,
      orderUid: sanitizeString(payload?.orderUid, ""),
      requesterUid,
      requesterEmail: sanitizeString(payload?.requesterEmail, ""),
      reason: sanitizeString(payload?.reason, ""),
      notes: sanitizeString(payload?.notes, ""),
      status: "requested",
      decisionNote: "",
      reviewedBy: "",
      reviewedAt: null,
      history: [
        {
          action: "requested",
          by: sanitizeString(payload?.requesterEmail, ""),
          note: sanitizeString(payload?.reason, ""),
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    };

    const ref = await db.collection("return_requests").add(requestPayload);
    const snap = await ref.get();
    const result = mapReturnRequest(snap);

    await queueNotification({
      uid: result.requesterUid,
      email: result.requesterEmail,
      type: "return_requested",
      title: `Return requested for order ${result.orderId || "N/A"}`,
      message: result.reason || "Your return request is now under review.",
      relatedOrderId: result.orderId,
      relatedReturnRequestId: result.id,
      data: {
        status: result.status
      }
    }).catch((error) => {
      console.error("Failed to queue return-requested notification", error);
    });

    if (result.requesterEmail) {
      await queueEmail({
        to: result.requesterEmail,
        subject: `Return requested for order ${result.orderId || "N/A"}`,
        text: `We received your return request and it is now under review.`
      }).catch((error) => {
        console.error("Failed to queue return-requested email", error);
      });
    }

    await logOrderAudit({
      orderId: result.orderId,
      orderUid: result.orderUid,
      eventType: "return_requested",
      previousStatus: "",
      nextStatus: "requested",
      actorUid: result.requesterUid,
      actorEmail: result.requesterEmail,
      actorRole: "customer",
      source: "return_request",
      message: "Customer requested a return.",
      meta: {
        returnRequestId: result.id,
        reason: result.reason
      }
    }).catch((error) => {
      console.error("Failed to write return-request audit log", error);
    });

    return result;
  }

  async function updateReturnRequestStatus(requestId, status, meta) {
    const db = getDbInstance();
    if (!db || !requestId) {
      return null;
    }

    const rawStatus = sanitizeMethod(status, "requested");
    const safeStatus = rawStatus === "denied" ? "rejected" : rawStatus;
    const ref = db.collection("return_requests").doc(requestId);

    let beforeStatus = "requested";
    let orderUid = "";
    let orderId = "";
    let requesterUid = "";
    let requesterEmail = "";
    let decisionText = "";

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        const err = new Error("return_request_not_found");
        err.code = "return_request_not_found";
        throw err;
      }

      const data = mapReturnRequest(snap);
      beforeStatus = sanitizeMethod(data.status, "requested");
      orderUid = data.orderUid;
      orderId = data.orderId;
      requesterUid = data.requesterUid;
      requesterEmail = data.requesterEmail;

      const transitions = {
        requested: ["approved", "rejected"],
        approved: ["received"],
        received: ["refunded"],
        refunded: [],
        rejected: [],
        denied: []
      };
      const allowed = transitions[beforeStatus] || [];
      if (beforeStatus !== safeStatus && !allowed.includes(safeStatus)) {
        const invalidErr = new Error("invalid_return_status_transition");
        invalidErr.code = "invalid_return_status_transition";
        invalidErr.meta = { from: beforeStatus, to: safeStatus };
        throw invalidErr;
      }

      const nextHistory = [
        ...(Array.isArray(data.history) ? data.history : []),
        {
          action: safeStatus,
          by: sanitizeString(meta?.reviewedBy || meta?.actorEmail, ""),
          note: sanitizeString(meta?.decisionNote, ""),
          createdAt: new Date().toISOString()
        }
      ];

      transaction.set(
        ref,
        {
          status: safeStatus,
          decisionNote: sanitizeString(meta?.decisionNote, ""),
          reviewedBy: sanitizeString(meta?.reviewedBy || meta?.actorEmail, ""),
          reviewedAt: getServerTimestamp(),
          history: nextHistory,
          updatedAt: getServerTimestamp()
        },
        { merge: true }
      );

      if (data.orderUid && data.orderId) {
        const orderRef = db.collection("users").doc(data.orderUid).collection("orders").doc(data.orderId);
        transaction.set(
          orderRef,
          {
            returnStatus: safeStatus,
            updatedAt: getServerTimestamp()
          },
          { merge: true }
        );
      }

      decisionText = sanitizeString(meta?.decisionNote, "");
    });

    const updated = await ref.get();
    const row = updated.exists ? mapReturnRequest(updated) : null;
    if (!row) {
      return null;
    }

    await queueNotification({
      uid: requesterUid,
      email: requesterEmail,
      type: "return_status_updated",
      title: `Return for order ${orderId || "N/A"} is now ${sanitizeMethod(row.status, "requested").replace(/_/g, " ")}`,
      message: decisionText || `Return request status changed from ${beforeStatus} to ${row.status}.`,
      relatedOrderId: orderId,
      relatedReturnRequestId: row.id,
      data: {
        from: beforeStatus,
        to: row.status
      }
    }).catch((error) => {
      console.error("Failed to queue return-status notification", error);
    });

    if (requesterEmail) {
      await queueEmail({
        to: requesterEmail,
        subject: `Return status updated for order ${orderId || "N/A"}`,
        text: `Your return request status is now ${String(row.status || "requested").replace(/_/g, " ")}.`
      }).catch((error) => {
        console.error("Failed to queue return-status email", error);
      });
    }

    await logOrderAudit({
      orderId,
      orderUid,
      eventType: "return_status_changed",
      previousStatus: beforeStatus,
      nextStatus: row.status,
      actorUid: sanitizeString(meta?.actorUid, ""),
      actorEmail: sanitizeString(meta?.actorEmail, ""),
      actorRole: sanitizeString(meta?.actorRole, "admin"),
      source: "return_request",
      message: decisionText || "Return request status updated.",
      meta: {
        returnRequestId: row.id
      }
    }).catch((error) => {
      console.error("Failed to write return-status audit log", error);
    });

    return row;
  }

  async function listReturnRequests() {
    const db = getDbInstance();
    if (!db) {
      return [];
    }

    const snapshot = await db.collection("return_requests").get();
    return snapshot.docs
      .map(mapReturnRequest)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  function watchReturnRequests(onData, onError, limitCount) {
    const db = getDbInstance();
    if (!db) {
      return () => {};
    }

    const safeLimit = Math.max(1, Number(limitCount) || 50);
    return db.collection("return_requests")
      .orderBy("createdAt", "desc")
      .limit(safeLimit)
      .onSnapshot(
        (snapshot) => {
          onData(snapshot.docs.map(mapReturnRequest));
        },
        (error) => {
          if (typeof onError === "function") {
            onError(error);
          } else {
            console.error("Return request listener failed", error);
          }
        }
      );
  }

  async function listUserReturnRequests(uid) {
    const db = getDbInstance();
    if (!db || !uid) {
      return [];
    }

    const snapshot = await db.collection("return_requests").where("requesterUid", "==", uid).get();
    return snapshot.docs
      .map(mapReturnRequest)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  function watchUserReturnRequests(uid, onData, onError, limitCount) {
    const db = getDbInstance();
    if (!db || !uid) {
      return () => {};
    }

    const safeLimit = Math.max(1, Number(limitCount) || 30);
    return db.collection("return_requests")
      .where("requesterUid", "==", uid)
      .onSnapshot(
        (snapshot) => {
          const rows = snapshot.docs
            .map(mapReturnRequest)
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, safeLimit);
          onData(rows);
        },
        (error) => {
          if (typeof onError === "function") {
            onError(error);
          } else {
            console.error("User return request listener failed", error);
          }
        }
      );
  }

  // Lightweight test helper to verify Firestore connectivity and basic read
  async function testConnection(timeoutMs = 10000) {
    const db = getDbInstance();
    if (!db) {
      return { ok: false, error: "Firestore is not initialized" };
    }

    const getPromise = (async () => {
      try {
        const snapshot = await db.collection("products").limit(1).get();
        return { ok: true, count: snapshot.size };
      } catch (error) {
        console.error("Firestore testConnection failed", error);
        return { ok: false, error: error?.message || String(error) };
      }
    })();

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ ok: false, error: `timeout after ${timeoutMs}ms` }), timeoutMs);
    });

    try {
      const result = await Promise.race([getPromise, timeoutPromise]);
      return result;
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  window.appDb = {
    isConfigured,
    ensureUserDocument,
    getUserProfile,
    updateUserProfile,
    listProducts,
    watchProducts,
    upsertProduct,
    deleteProduct,
    getProductById,
    getCart,
    setCart,
    clearCart,
    createPaymentSession,
    getPaymentSession,
    markPaymentSessionPaid,
    markPaymentSessionCompleted,
    watchPaymentSession,
    createOrder,
    getOrderById,
    listOrders,
    watchUserOrders,
    listAllOrders,
    watchAllOrders,
    getAnalyticsSummary,
    logOrderAudit,
    watchOrderAudit,
    queueNotification,
    listUserNotifications,
    watchUserNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    updateOrderStatus,
    createReturnRequest,
    updateReturnRequestStatus,
    listReturnRequests,
    watchReturnRequests,
    listUserReturnRequests,
    watchUserReturnRequests,
    testConnection,
    queueEmail
  };
})();
