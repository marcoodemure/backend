document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const requestedProductId = Number(params.get("product_id"));
  const resumeOrder = params.get("resume") === "1";

  const shipBtn = document.getElementById("shipBtn");
  const pickupBtn = document.getElementById("pickupBtn");
  const shippingSection = document.getElementById("shippingSection");
  const pickupSection = document.getElementById("pickupSection");
  const shipToAddressLink = document.getElementById("shipToAddressLink");
  const payBtn = document.querySelector(".pay-btn");
  const cartSummary = document.getElementById("cartSummary");
  const userStatus = document.getElementById("userStatus");
  const emailInput = document.getElementById("emailInput");
  const emailError = document.getElementById("emailError");
  const checkoutFeedback = document.getElementById("checkoutFeedback");
  const checkoutProgress = document.getElementById("checkoutProgress");
  const postalHint = document.getElementById("postalHint");
  const phoneHint = document.getElementById("phoneHint");
  const addressPartsHint = document.getElementById("addressPartsHint");
  const savedAddressSlotSelect = document.getElementById("savedAddressSlotSelect");
  const saveAddressSlotBtn = document.getElementById("saveAddressSlotBtn");
  const clearAddressSlotBtn = document.getElementById("clearAddressSlotBtn");
  const savedAddressStatus = document.getElementById("savedAddressStatus");
  const saveDefaultPinCheckbox = document.getElementById("saveDefaultPinCheckbox");
  const mapLoadingSkeleton = document.getElementById("mapLoadingSkeleton");
  const pinSuccessMark = document.getElementById("pinSuccessMark");
  const orderConfetti = document.getElementById("orderConfetti");

  const authPrompt = document.getElementById("authPrompt");
  const authSigninLink = document.getElementById("authSigninLink");
  const authCreateLink = document.getElementById("authCreateLink");
  const authCancelBtn = document.getElementById("authCancelBtn");

  const orderComplete = document.getElementById("orderComplete");
  const orderCompleteText = document.getElementById("orderCompleteText");
  const pickupCompleteInfo = document.getElementById("pickupCompleteInfo");
  const pickupClaimWrap = document.getElementById("pickupClaimWrap");
  const pickupClaimQrImage = document.getElementById("pickupClaimQrImage");
  const qrPaymentModal = document.getElementById("qrPaymentModal");
  const qrPaymentImage = document.getElementById("qrPaymentImage");
  const qrPaymentStatus = document.getElementById("qrPaymentStatus");
  const qrPaymentOpenScanBtn = document.getElementById("qrPaymentOpenScanBtn");
  const qrPaymentCancelBtn = document.getElementById("qrPaymentCancelBtn");
  const orderNotesInput = document.getElementById("orderNotesInput");

  const countryInput = document.getElementById("countryInput");
  const firstNameInput = document.getElementById("firstNameInput");
  const lastNameInput = document.getElementById("lastNameInput");
  const companyInput = document.getElementById("companyInput");
  const addressLine1Input = document.getElementById("addressLine1Input");
  const addressLine2Input = document.getElementById("addressLine2Input");
  const postalCodeInput = document.getElementById("postalCodeInput");
  const cityInput = document.getElementById("cityInput");
  const provinceInput = document.getElementById("provinceInput");
  const phoneInput = document.getElementById("phoneInput");
  const saveProfileCheckbox = document.getElementById("saveProfileCheckbox");
  const pickupNameInput = document.getElementById("pickupNameInput");
  const pickupContactInput = document.getElementById("pickupContactInput");
  const pickupDateInput = document.getElementById("pickupDateInput");
  const pickupTimeInput = document.getElementById("pickupTimeInput");
  const pickupAgreeCheckbox = document.getElementById("pickupAgreeCheckbox");
  const pickupHint = document.getElementById("pickupHint");
  const pickupReferenceText = document.getElementById("pickupReferenceText");
  const addressMapPreview = document.getElementById("addressMapPreview");
  const locateAddressBtn = document.getElementById("locateAddressBtn");
  const useCurrentLocationBtn = document.getElementById("useCurrentLocationBtn");
  const confirmPinBtn = document.getElementById("confirmPinBtn");
  const addressMapHint = document.getElementById("addressMapHint");
  const addressCandidatesWrap = document.getElementById("addressCandidatesWrap");
  const addressCandidatesSelect = document.getElementById("addressCandidatesSelect");
  const useSelectedCandidateBtn = document.getElementById("useSelectedCandidateBtn");
  const pinMapPreviewWrap = document.getElementById("pinMapPreviewWrap");
  const pinMapPreviewLink = document.getElementById("pinMapPreviewLink");
  const pinMapPreviewFrame = document.getElementById("pinMapPreviewFrame");
  const pinMapPreviewStatus = document.getElementById("pinMapPreviewStatus");

  const auth = window.authService;
  const appDb = window.appDb;

  const requiredElements = {
    shipBtn,
    pickupBtn,
    shippingSection,
    pickupSection,
    shipToAddressLink,
    payBtn,
    cartSummary,
    userStatus,
    emailInput,
    orderComplete
  };
  const missingRequired = Object.entries(requiredElements)
    .filter(([, element]) => !element)
    .map(([name]) => name);
  if (missingRequired.length) {
    console.error("checkout.js: missing required elements", missingRequired);
    return;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.error(`Failed to parse localStorage key: ${key}`, err);
      return fallback;
    }
  }

  function getCurrentUser() {
    if (auth) {
      const user = auth.getCurrentUser();
      if (user) {
        return {
          ...user,
          role: user.role || localStorage.getItem("userRole") || ""
        };
      }
    }
    const fallback = readJson("currentUser", null);
    if (!fallback) return null;
    return {
      ...fallback,
      role: fallback.role || localStorage.getItem("userRole") || ""
    };
  }

  // local user helpers left intact in case existing flows require them
  function getUsers() {
    return readJson("users", []);
  }

  function saveUsers(users) {
    localStorage.setItem("users", JSON.stringify(users));
  }

  function setCurrentUser(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
  }

  function formatMoney(value) {
    return `PHP ${Number(value || 0).toFixed(2)}`;
  }

  function formatPayment(method) {
    if (method === "cash_on_delivery") return "Cash on Delivery";
    if (method === "gcash") return "GCash";
    return String(method || "cash_on_delivery").replace(/_/g, " ");
  }

  function isRemoteDbReady() {
    return Boolean(appDb && appDb.isConfigured());
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function readInputValue(el) {
    return typeof el?.value === "string" ? el.value.trim() : "";
  }

  function getShippingAddressPayload() {
    return {
      country: readInputValue(countryInput),
      firstName: readInputValue(firstNameInput),
      lastName: readInputValue(lastNameInput),
      company: readInputValue(companyInput),
      addressLine1: readInputValue(addressLine1Input),
      addressLine2: readInputValue(addressLine2Input),
      postalCode: readInputValue(postalCodeInput),
      city: readInputValue(cityInput),
      province: readInputValue(provinceInput),
      phone: readInputValue(phoneInput)
    };
  }

  function applyShippingAddress(address) {
    if (!address || typeof address !== "object") {
      return;
    }

    if (countryInput) countryInput.value = address.country || "";
    if (firstNameInput) firstNameInput.value = address.firstName || "";
    if (lastNameInput) lastNameInput.value = address.lastName || "";
    if (companyInput) companyInput.value = address.company || "";
    if (addressLine1Input) addressLine1Input.value = address.addressLine1 || "";
    if (addressLine2Input) addressLine2Input.value = address.addressLine2 || "";
    if (postalCodeInput) postalCodeInput.value = address.postalCode || "";
    if (cityInput) cityInput.value = address.city || "";
    if (provinceInput) provinceInput.value = address.province || "";
    if (phoneInput) phoneInput.value = address.phone || "";
  }

  function setAddressHint(message, type) {
    if (!addressMapHint) return;
    addressMapHint.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      addressMapHint.textContent = "";
      return;
    }
    addressMapHint.textContent = message;
    addressMapHint.classList.add(`is-${type || "info"}`);
  }

  function setFieldHint(element, message, type) {
    if (!element) return;
    element.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      element.textContent = "";
      element.classList.add("hidden");
      return;
    }
    element.textContent = message;
    element.classList.remove("hidden");
    element.classList.add(`is-${type || "info"}`);
  }

  function setSavedAddressStatus(message, type) {
    setFieldHint(savedAddressStatus, message, type || "info");
  }

  function loadSavedAddressSlots() {
    return readJson(SAVED_ADDRESS_SLOTS_KEY, {
      home: null,
      school: null,
      work: null
    });
  }

  function saveSavedAddressSlots(slots) {
    localStorage.setItem(SAVED_ADDRESS_SLOTS_KEY, JSON.stringify(slots || {}));
  }

  function getActiveSavedAddressSlot() {
    return String(savedAddressSlotSelect?.value || "home").toLowerCase();
  }

  function getSlotLabel(slot) {
    if (slot === "school") return "School";
    if (slot === "work") return "Work";
    return "Home";
  }

  function saveCurrentAddressToSlot(slot) {
    const safeSlot = ["home", "school", "work"].includes(slot) ? slot : "home";
    const address = getShippingAddressPayload();
    if (!address.addressLine1 || !address.city || !address.country) {
      setSavedAddressStatus("Add at least country, city, and street before saving a slot.", "error");
      return;
    }

    const slots = loadSavedAddressSlots();
    slots[safeSlot] = {
      shippingAddress: address,
      shippingLocation: selectedShippingLocation ? { ...selectedShippingLocation } : null,
      shippingLocationSnapshot: selectedShippingSnapshot ? { ...selectedShippingSnapshot } : null,
      shippingLocationConfirmed: Boolean(isShippingLocationConfirmed),
      updatedAt: new Date().toISOString()
    };
    saveSavedAddressSlots(slots);
    setSavedAddressStatus(`${getSlotLabel(safeSlot)} address saved.`, "success");
  }

  function clearSavedAddressSlot(slot) {
    const safeSlot = ["home", "school", "work"].includes(slot) ? slot : "home";
    const slots = loadSavedAddressSlots();
    slots[safeSlot] = null;
    saveSavedAddressSlots(slots);
    setSavedAddressStatus(`${getSlotLabel(safeSlot)} slot cleared.`, "info");
  }

  function applySavedAddressSlot(slot) {
    const safeSlot = ["home", "school", "work"].includes(slot) ? slot : "home";
    const slots = loadSavedAddressSlots();
    const payload = slots[safeSlot];
    if (!payload || !payload.shippingAddress) {
      setSavedAddressStatus(`No saved ${getSlotLabel(safeSlot).toLowerCase()} address yet.`, "info");
      return;
    }

    if (deliveryMethod !== "ship") {
      setDeliveryMethod("ship");
    }

    applyShippingAddress(payload.shippingAddress);
    if (
      payload.shippingLocation
      && Number.isFinite(Number(payload.shippingLocation.lng))
      && Number.isFinite(Number(payload.shippingLocation.lat))
    ) {
      selectedShippingLocation = {
        lng: toFixedCoordinate(payload.shippingLocation.lng),
        lat: toFixedCoordinate(payload.shippingLocation.lat)
      };
      isShippingLocationConfirmed = Boolean(payload.shippingLocationConfirmed);
      if (payload.shippingLocationSnapshot?.mapUrl) {
        selectedShippingSnapshot = {
          embedUrl: String(payload.shippingLocationSnapshot.embedUrl || payload.shippingLocationSnapshot.imageUrl || ""),
          imageUrl: String(payload.shippingLocationSnapshot.imageUrl || ""),
          mapUrl: String(payload.shippingLocationSnapshot.mapUrl)
        };
      }
      if (addressMap) {
        setMapMarker(selectedShippingLocation.lng, selectedShippingLocation.lat, true, { preserveConfirmation: true });
      } else {
        updatePinMapSnapshot(selectedShippingLocation.lng, selectedShippingLocation.lat);
      }
    }
    setLocationConfirmed(Boolean(payload.shippingLocationConfirmed));
    updateInlineValidationHints();
    updateCheckoutProgress();
    renderCart();
    setSavedAddressStatus(`${getSlotLabel(safeSlot)} address applied with pin restore.`, "success");
    persistCartState().catch((error) => console.error("Failed to persist saved address apply", error));
  }

  function setMapLoadingState(isLoading) {
    if (!addressMapPreview || !mapLoadingSkeleton) return;
    mapLoadingSkeleton.classList.toggle("hidden", !isLoading);
    addressMapPreview.classList.toggle("is-loading-map", Boolean(isLoading));
  }

  function loadDefaultDeliveryPin() {
    return readJson(DEFAULT_DELIVERY_PIN_KEY, null);
  }

  function saveDefaultDeliveryPin() {
    if (!saveDefaultPinCheckbox?.checked || !selectedShippingLocation) {
      return;
    }

    const payload = {
      shippingAddress: getShippingAddressPayload(),
      shippingLocation: { ...selectedShippingLocation },
      shippingLocationSnapshot: selectedShippingSnapshot ? { ...selectedShippingSnapshot } : null,
      shippingLocationConfirmed: Boolean(isShippingLocationConfirmed),
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(DEFAULT_DELIVERY_PIN_KEY, JSON.stringify(payload));
  }

  function getMissingAddressParts() {
    const payload = getShippingAddressPayload();
    const required = [
      { key: "country", label: "country" },
      { key: "addressLine1", label: "street/house number" },
      { key: "city", label: "city/town" },
      { key: "province", label: "state/province" }
    ];
    return required.filter((item) => !String(payload[item.key] || "").trim()).map((item) => item.label);
  }

  function isPostalCodeLikelyValid(value) {
    const cleaned = String(value || "").trim();
    if (!cleaned) return false;
    return /^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/.test(cleaned);
  }

  function isPhoneLikelyValid(value) {
    const cleaned = String(value || "").replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }

  function createPickupReference() {
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `PK-${token}`;
  }

  function setPickupHint(message, type) {
    setFieldHint(pickupHint, message, type || "info");
  }

  function syncPickupReferenceDisplay() {
    if (!pickupReferenceText) return;
    if (deliveryMethod !== "pickup") {
      pickupReferenceText.classList.add("hidden");
      pickupReferenceText.textContent = "";
      return;
    }
    pickupReferenceText.textContent = `Pickup reference: ${pickupReference}`;
    pickupReferenceText.classList.remove("hidden");
  }

  function getPickupPayload() {
    if (!pickupReference) {
      pickupReference = createPickupReference();
    }
    return {
      contactName: readInputValue(pickupNameInput),
      contactPhone: readInputValue(pickupContactInput),
      pickupDate: readInputValue(pickupDateInput),
      pickupTimeSlot: readInputValue(pickupTimeInput),
      agreedToBringId: Boolean(pickupAgreeCheckbox?.checked),
      reference: pickupReference
    };
  }

  function applyPickupPayload(pickupDetails) {
    if (!pickupDetails || typeof pickupDetails !== "object") {
      return;
    }
    if (pickupNameInput) pickupNameInput.value = pickupDetails.contactName || "";
    if (pickupContactInput) pickupContactInput.value = pickupDetails.contactPhone || "";
    if (pickupDateInput) pickupDateInput.value = pickupDetails.pickupDate || "";
    if (pickupTimeInput) pickupTimeInput.value = pickupDetails.pickupTimeSlot || "";
    if (pickupAgreeCheckbox) pickupAgreeCheckbox.checked = Boolean(pickupDetails.agreedToBringId);
    if (pickupDetails.reference) {
      pickupReference = String(pickupDetails.reference);
    }
    syncPickupReferenceDisplay();
  }

  function initializePickupDateConstraints() {
    if (!pickupDateInput) return;
    const now = new Date();
    const minDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const maxDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const toIsoDate = (value) => value.toISOString().slice(0, 10);
    pickupDateInput.min = toIsoDate(minDate);
    pickupDateInput.max = toIsoDate(maxDate);
    if (!pickupDateInput.value) {
      pickupDateInput.value = toIsoDate(minDate);
    }
  }

  function validatePickupDetails() {
    const pickupDetails = getPickupPayload();
    if (!pickupDetails.contactName) {
      setPickupHint("Pickup contact name is required.", "error");
      return false;
    }
    if (!isPhoneLikelyValid(pickupDetails.contactPhone)) {
      setPickupHint("Pickup phone must have 7-15 digits.", "error");
      return false;
    }
    if (!pickupDetails.pickupDate) {
      setPickupHint("Please pick a pickup date.", "error");
      return false;
    }
    if (!pickupDetails.pickupTimeSlot) {
      setPickupHint("Please pick a pickup time slot.", "error");
      return false;
    }
    if (!pickupDetails.agreedToBringId) {
      setPickupHint("Please confirm you'll bring a valid ID.", "error");
      return false;
    }

    setPickupHint(`Pickup details set. Keep reference ${pickupDetails.reference}.`, "success");
    return true;
  }

  function updateInlineValidationHints() {
    const postalValue = readInputValue(postalCodeInput);
    const phoneValue = readInputValue(phoneInput);
    const missingParts = getMissingAddressParts();

    if (!postalValue) {
      setFieldHint(postalHint, "Postal code helps couriers route faster.", "info");
    } else if (isPostalCodeLikelyValid(postalValue)) {
      setFieldHint(postalHint, "Postal code looks valid.", "success");
    } else {
      setFieldHint(postalHint, "Postal code format looks incomplete.", "error");
    }

    if (!phoneValue) {
      setFieldHint(phoneHint, "Add a contact number for delivery updates.", "info");
    } else if (isPhoneLikelyValid(phoneValue)) {
      setFieldHint(phoneHint, "Phone number looks valid.", "success");
    } else {
      setFieldHint(phoneHint, "Phone should have 7-15 digits.", "error");
    }

    if (!missingParts.length) {
      setFieldHint(addressPartsHint, "Address details look complete.", "success");
    } else {
      setFieldHint(addressPartsHint, `Still missing: ${missingParts.join(", ")}.`, "info");
    }
  }

  function updateCheckoutProgress() {
    if (!checkoutProgress) return;

    const emailDone = isValidEmail(readInputValue(emailInput));
    const addressDone = deliveryMethod === "pickup"
      ? true
      : getMissingAddressParts().length === 0;
    const pinDone = deliveryMethod === "pickup"
      ? true
      : Boolean(selectedShippingLocation && isShippingLocationConfirmed);
    const paymentDone = !orderComplete?.classList.contains("hidden");

    const states = {
      contact: emailDone,
      address: addressDone,
      pin: pinDone,
      payment: paymentDone
    };

    const current = !emailDone ? "contact" : !addressDone ? "address" : !pinDone ? "pin" : "payment";
    checkoutProgress.querySelectorAll(".checkout-progress-step").forEach((stepEl) => {
      const key = String(stepEl.dataset.step || "");
      stepEl.classList.remove("is-active", "is-done");
      stepEl.removeAttribute("aria-current");
      if (states[key]) {
        stepEl.classList.add("is-done");
      }
      if (key === current && !paymentDone) {
        stepEl.classList.add("is-active");
        stepEl.setAttribute("aria-current", "step");
      }
      if (paymentDone && key === "payment") {
        stepEl.classList.add("is-active", "is-done");
        stepEl.setAttribute("aria-current", "step");
      }
    });
  }

  function playPinSuccessAnimation() {
    if (!pinSuccessMark) return;
    pinSuccessMark.classList.remove("hidden", "show");
    requestAnimationFrame(() => {
      pinSuccessMark.classList.add("show");
    });
    window.setTimeout(() => {
      pinSuccessMark.classList.remove("show");
      pinSuccessMark.classList.add("hidden");
    }, 1700);
  }

  function playOrderConfetti() {
    if (!orderConfetti) return;
    orderConfetti.innerHTML = "";
    for (let index = 0; index < 22; index += 1) {
      const piece = document.createElement("i");
      piece.style.left = `${Math.round((index / 22) * 100)}%`;
      piece.style.animationDelay = `${(index % 7) * 0.05}s`;
      orderConfetti.appendChild(piece);
    }
    orderConfetti.classList.add("is-burst");
    window.setTimeout(() => {
      orderConfetti.classList.remove("is-burst");
      orderConfetti.innerHTML = "";
    }, 1700);
  }

  function buildPinMapSnapshot(lng, lat) {
    const fixedLat = toFixedCoordinate(lat);
    const fixedLng = toFixedCoordinate(lng);
    const delta = 0.004;
    const left = fixedLng - delta;
    const right = fixedLng + delta;
    const top = fixedLat + delta;
    const bottom = fixedLat - delta;
    const bbox = `${left},${bottom},${right},${top}`;
    const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${fixedLat},${fixedLng}`)}`;
    const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(fixedLat)}&mlon=${encodeURIComponent(fixedLng)}#map=18/${encodeURIComponent(fixedLat)}/${encodeURIComponent(fixedLng)}`;

    return {
      embedUrl,
      mapUrl,
      imageUrl: embedUrl
    };
  }

  function hidePinMapSnapshot() {
    selectedShippingSnapshot = null;
    if (pinMapPreviewFrame) {
      pinMapPreviewFrame.removeAttribute("src");
      pinMapPreviewFrame.classList.add("hidden");
    }
    if (pinMapPreviewLink) {
      pinMapPreviewLink.href = "#";
    }
    if (pinMapPreviewStatus) {
      pinMapPreviewStatus.textContent = "";
      pinMapPreviewStatus.classList.add("hidden");
    }
    if (pinMapPreviewWrap) {
      pinMapPreviewWrap.classList.add("hidden");
    }
  }

  function loadPinMapPreviewImage(snapshot) {
    if (!pinMapPreviewFrame || (!snapshot?.embedUrl && !snapshot?.imageUrl)) {
      return;
    }

    const src = snapshot.embedUrl || snapshot.imageUrl;
    pinMapPreviewFrame.src = src;
    pinMapPreviewFrame.classList.remove("hidden");
    if (pinMapPreviewStatus) {
      pinMapPreviewStatus.textContent = "";
      pinMapPreviewStatus.classList.add("hidden");
    }
  }

  function updatePinMapSnapshot(lng, lat) {
    if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) {
      hidePinMapSnapshot();
      return;
    }

    selectedShippingSnapshot = buildPinMapSnapshot(lng, lat);

    loadPinMapPreviewImage(selectedShippingSnapshot);
    if (pinMapPreviewLink) {
      pinMapPreviewLink.href = selectedShippingSnapshot.mapUrl;
    }
    if (pinMapPreviewWrap) {
      pinMapPreviewWrap.classList.remove("hidden");
    }
  }

  function clearAddressCandidates() {
    addressSearchResults = [];
    if (addressCandidatesSelect) {
      addressCandidatesSelect.innerHTML = "";
    }
    if (addressCandidatesWrap) {
      addressCandidatesWrap.classList.add("hidden");
    }
  }

  function renderAddressCandidates(results) {
    if (!addressCandidatesWrap || !addressCandidatesSelect) return;

    addressSearchResults = Array.isArray(results) ? results : [];
    addressCandidatesSelect.innerHTML = "";

    if (!addressSearchResults.length) {
      addressCandidatesWrap.classList.add("hidden");
      return;
    }

    addressSearchResults.forEach((result, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = result.display_name || `Result ${index + 1}`;
      addressCandidatesSelect.appendChild(option);
    });

    addressCandidatesWrap.classList.remove("hidden");
  }

  function setLocationConfirmed(isConfirmed) {
    isShippingLocationConfirmed = Boolean(isConfirmed);
    if (confirmPinBtn) {
      confirmPinBtn.textContent = isShippingLocationConfirmed ? "Pin confirmed" : "Confirm this pin";
      confirmPinBtn.setAttribute("aria-pressed", isShippingLocationConfirmed ? "true" : "false");
    }
    updateCheckoutProgress();
  }

  function toFixedCoordinate(value) {
    return Number(Number(value).toFixed(6));
  }

  function saveSelectedShippingLocation(lng, lat, options) {
    if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) {
      selectedShippingLocation = null;
      setLocationConfirmed(false);
      hidePinMapSnapshot();
      updateCheckoutProgress();
      return;
    }

    selectedShippingLocation = {
      lng: toFixedCoordinate(lng),
      lat: toFixedCoordinate(lat)
    };
    if (!options?.preserveConfirmation) {
      setLocationConfirmed(false);
    }
    updatePinMapSnapshot(lng, lat);
    updateCheckoutProgress();
  }

  function formatCoordinateLabel(lng, lat) {
    return `${toFixedCoordinate(lat)}, ${toFixedCoordinate(lng)}`;
  }

  function setMapActionLoading(button, isLoading, loadingLabel) {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent || "";
    }
    button.disabled = Boolean(isLoading);
    button.textContent = isLoading ? loadingLabel : button.dataset.defaultLabel;
  }

  function setMapActionsDisabled(isDisabled) {
    if (locateAddressBtn) {
      locateAddressBtn.disabled = Boolean(isDisabled);
    }
    if (useCurrentLocationBtn) {
      useCurrentLocationBtn.disabled = Boolean(isDisabled || geolocationUnsupported);
    }
    if (confirmPinBtn) {
      confirmPinBtn.disabled = Boolean(isDisabled);
    }
    if (useSelectedCandidateBtn) {
      useSelectedCandidateBtn.disabled = Boolean(isDisabled || !addressSearchResults.length);
    }
    if (addressCandidatesSelect) {
      addressCandidatesSelect.disabled = Boolean(isDisabled || !addressSearchResults.length);
    }
  }

  function setMapMarker(lng, lat, shouldCenter, options) {
    if (!addressMap || !window.maplibregl) return;
    if (!addressMapMarker) {
      addressMapMarker = new window.maplibregl.Marker({
        color: "#2563eb",
        draggable: true
      }).setLngLat([lng, lat]).addTo(addressMap);
      addressMapMarker.on("dragend", () => {
        const coords = addressMapMarker.getLngLat();
        clearAddressCandidates();
        fillAddressFromMap(coords.lng, coords.lat, {
          successPrefix: "Marker moved.",
          errorMessage: "Location moved, but address lookup failed."
        }).catch((error) => console.error("Failed to fill address after marker drag", error));
      });
    } else {
      addressMapMarker.setLngLat([lng, lat]);
    }

    saveSelectedShippingLocation(lng, lat, options);

    if (shouldCenter) {
      addressMap.flyTo({ center: [lng, lat], zoom: 14, essential: true });
    }
  }

  async function reverseGeocode(lng, lat) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&namedetails=1&zoom=18&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("reverse_geocode_failed");
    }
    return response.json();
  }

  async function geocodeAddress(query, limit) {
    const top = Number(limit) || 5;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${encodeURIComponent(top)}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("forward_geocode_failed");
    }
    return response.json();
  }

  function buildAddressQuery() {
    const parts = [
      readInputValue(addressLine1Input),
      readInputValue(addressLine2Input),
      readInputValue(cityInput),
      readInputValue(provinceInput),
      readInputValue(postalCodeInput),
      readInputValue(countryInput)
    ].filter(Boolean);
    return parts.join(", ");
  }

  function getSelectedAddressCandidate() {
    if (!addressCandidatesSelect || !addressSearchResults.length) {
      return null;
    }

    const index = Number(addressCandidatesSelect.value);
    if (!Number.isInteger(index) || index < 0 || index >= addressSearchResults.length) {
      return addressSearchResults[0] || null;
    }

    return addressSearchResults[index];
  }

  async function applySearchResult(result, options) {
    const lat = Number(result?.lat);
    const lon = Number(result?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setAddressHint("Map service returned invalid coordinates.", "error");
      return;
    }

    setMapMarker(lon, lat, true);
    await fillAddressFromMap(lon, lat, {
      successPrefix: options?.successPrefix || "Address located.",
      errorMessage: "Pin set, but address details could not be fully loaded."
    });

    if (!isShippingLocationConfirmed) {
      setAddressHint("Address matched. Review the pin, then click 'Confirm this pin'.", "info");
    }
  }

  async function locateTypedAddress() {
    if (!addressMap) return;
    const query = buildAddressQuery();
    if (!query) {
      locateRequestSeq += 1;
      setAddressHint("Enter at least part of an address before locating.", "error");
      clearAddressCandidates();
      return;
    }

    try {
      const requestSeq = ++locateRequestSeq;
      setAddressHint("Locating address...", "info");
      const results = await geocodeAddress(query, 5);
      if (requestSeq !== locateRequestSeq) {
        return;
      }
      if (!Array.isArray(results) || !results.length) {
        setAddressHint("Could not locate this address.", "error");
        clearAddressCandidates();
        return;
      }

      renderAddressCandidates(results);
      if (useSelectedCandidateBtn) {
        useSelectedCandidateBtn.disabled = false;
      }
      if (addressCandidatesSelect) {
        addressCandidatesSelect.disabled = false;
      }

      await applySearchResult(results[0], { successPrefix: "Top match located." });
    } catch (error) {
      console.error("Failed to geocode address", error);
      clearAddressCandidates();
      setAddressHint("Address lookup failed. You can pick manually on map.", "error");
    }
  }

  async function fillAddressFromMap(lng, lat, options) {
    try {
      saveSelectedShippingLocation(lng, lat);
      const payload = await reverseGeocode(lng, lat);
      const address = payload?.address || {};
      const road = [address.house_number, address.road].filter(Boolean).join(" ");

      if (addressLine1Input && road) addressLine1Input.value = road;
      if (cityInput) cityInput.value = address.city || address.town || address.village || address.municipality || cityInput.value;
      if (provinceInput) provinceInput.value = address.state || address.region || provinceInput.value;
      if (postalCodeInput) postalCodeInput.value = address.postcode || postalCodeInput.value;
      if (countryInput) countryInput.value = address.country || countryInput.value;

      const coordsLabel = formatCoordinateLabel(lng, lat);
      const prefix = options?.successPrefix ? `${options.successPrefix} ` : "";
      const hasDetailedStreet = Boolean(address.road) && (Boolean(address.house_number) || Boolean(address.postcode));
      if (hasDetailedStreet) {
        setAddressHint(`${prefix}Address fields updated (${coordsLabel}).`, "success");
      } else {
        setAddressHint(`${prefix}Approximate location only (${coordsLabel}). Drag pin closer and confirm.`, "info");
      }
      persistCartState().catch((persistError) => console.error("Failed to persist map location", persistError));
    } catch (error) {
      console.error("Failed to reverse geocode", error);
      saveSelectedShippingLocation(lng, lat);
      setAddressHint(options?.errorMessage || "Location selected, but reverse lookup failed.", "error");
      persistCartState().catch((persistError) => console.error("Failed to persist map location", persistError));
    }
  }

  function geolocationErrorMessage(error) {
    if (!error) {
      return "Could not get your current location. You can still search or place the pin manually.";
    }

    if (error.code === 1) {
      return "Location permission was denied. Allow location access or keep using manual search/pin.";
    }

    if (error.code === 2) {
      return "Current location is unavailable right now. Try again or keep using manual search/pin.";
    }

    if (error.code === 3) {
      return "Getting your location timed out. Try again or keep using manual search/pin.";
    }

    return "Could not get your current location. You can still search or place the pin manually.";
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      });
    });
  }

  async function useCurrentLocation() {
    if (!addressMap) return;

    if (geolocationUnsupported || !navigator.geolocation) {
      setAddressHint("Geolocation is unavailable here. Continue with manual search or map pin.", "info");
      return;
    }

    if (isGeolocationLoading) {
      return;
    }

    isGeolocationLoading = true;
    clearAddressCandidates();
    setMapActionLoading(useCurrentLocationBtn, true, "Locating...");
    setMapActionsDisabled(true);
    setAddressHint("Fetching your current location...", "info");

    try {
      const position = await getCurrentPosition();
      const lat = Number(position?.coords?.latitude);
      const lng = Number(position?.coords?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("invalid_geolocation_coordinates");
      }

      setMapMarker(lng, lat, true);
      await fillAddressFromMap(lng, lat, {
        successPrefix: "Current location selected.",
        errorMessage: "Current location selected, but reverse lookup failed. You can still continue."
      });
    } catch (error) {
      console.error("Failed to fetch current location", error);
      setAddressHint(geolocationErrorMessage(error), "error");
    } finally {
      isGeolocationLoading = false;
      setMapActionLoading(useCurrentLocationBtn, false);
      setMapActionsDisabled(false);
    }
  }

  function initializeAddressMap() {
    if (!addressMapPreview || !window.maplibregl) {
      return;
    }

    setMapLoadingState(true);

    const streetStyle = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors"
        }
      },
      layers: [
        {
          id: "osm-tiles",
          type: "raster",
          source: "osm",
          minzoom: 0,
          maxzoom: 19
        }
      ]
    };

    addressMap = new window.maplibregl.Map({
      container: "addressMapPreview",
      style: streetStyle,
      center: [125.1716, 6.1164],
      zoom: 13
    });

    addressMap.on("load", () => {
      setMapLoadingState(false);
    });

    addressMap.on("error", () => {
      setMapLoadingState(false);
      setAddressHint("Map tiles failed to load. Manual address + saved pin link still works.", "error");
    });

    addressMap.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    addressMap.on("click", (event) => {
      const { lng, lat } = event.lngLat;
      clearAddressCandidates();
      setMapMarker(lng, lat, false);
      fillAddressFromMap(lng, lat).catch((error) => console.error("Failed to fill address from map", error));
    });

    setAddressHint("Manual address is allowed. For delivery fallback, pin and confirm your exact house location.", "info");
  }

  function setCheckoutFeedback(type, message) {
    if (!checkoutFeedback) {
      return;
    }

    checkoutFeedback.classList.remove("is-error", "is-success", "is-info");

    if (!message) {
      checkoutFeedback.textContent = "";
      checkoutFeedback.classList.add("hidden");
      return;
    }

    checkoutFeedback.textContent = message;
    checkoutFeedback.classList.add(`is-${type || "info"}`);
    checkoutFeedback.classList.remove("hidden");
  }

  function setEmailError(message) {
    if (!emailError || !emailInput) {
      return;
    }

    if (!message) {
      emailError.textContent = "";
      emailError.classList.add("hidden");
      emailInput.classList.remove("input-invalid");
      return;
    }

    emailError.textContent = message;
    emailError.classList.remove("hidden");
    emailInput.classList.add("input-invalid");
  }

  function validateCheckoutInputs() {
    const email = emailInput.value.trim();

    if (!email) {
      setEmailError("Email is required.");
      setCheckoutFeedback("error", "Please enter your email to continue.");
      return false;
    }

    if (!isValidEmail(email)) {
      setEmailError("Enter a valid email address.");
      setCheckoutFeedback("error", "Please fix the email field and try again.");
      return false;
    }

    if (deliveryMethod === "pickup" && !validatePickupDetails()) {
      setCheckoutFeedback("error", "Please complete pickup details before paying.");
      return false;
    }

    if (deliveryMethod === "ship" && !selectedShippingLocation) {
      setCheckoutFeedback("error", "Select your delivery pin on the map before paying.");
      setAddressHint("Pick a delivery point on the map, then confirm the pin.", "error");
      return false;
    }

    if (deliveryMethod === "ship") {
      const missingParts = getMissingAddressParts();
      if (missingParts.length) {
        setCheckoutFeedback("error", `Please complete: ${missingParts.join(", ")}.`);
        setFieldHint(addressPartsHint, `Required before checkout: ${missingParts.join(", ")}.`, "error");
        return false;
      }
      if (!isPostalCodeLikelyValid(readInputValue(postalCodeInput))) {
        setCheckoutFeedback("error", "Postal code format looks incomplete.");
        setFieldHint(postalHint, "Please provide a valid postal code.", "error");
        return false;
      }
      if (!isPhoneLikelyValid(readInputValue(phoneInput))) {
        setCheckoutFeedback("error", "Phone format looks incomplete.");
        setFieldHint(phoneHint, "Please provide a valid contact number.", "error");
        return false;
      }
    }

    if (deliveryMethod === "ship" && !isShippingLocationConfirmed) {
      setCheckoutFeedback("error", "Confirm your map pin before paying.");
      setAddressHint("Click 'Confirm this pin' after placing the marker.", "info");
      return false;
    }

    setEmailError("");
    updateInlineValidationHints();
    return true;
  }

  async function syncUserAndProfile() {
    let user = getCurrentUser();

    if (!user && auth && typeof auth.waitForAuthState === "function") {
      user = await auth.waitForAuthState(5000);
    }

    if (user && isRemoteDbReady() && user.uid) {
      try {
        const profile = await appDb.ensureUserDocument(user);
        if (profile) {
          try { localStorage.setItem("userRole", profile.role || "customer"); } catch (e) {}
          return {
            ...user,
            role: profile.role || "customer"
          };
        }
      } catch (error) {
        console.error("Failed to sync user profile", error);
      }
    }

    if (user) {
      return {
        ...user,
        role: user.role || localStorage.getItem("userRole") || ""
      };
    }

    return null;
  }

  async function loadProductById(productId) {
    const safeId = Number(productId);
    if (!Number.isFinite(safeId) || safeId <= 0) {
      return null;
    }

    if (isRemoteDbReady() && typeof appDb.getProductById === "function") {
      try {
        const remoteProduct = await appDb.getProductById(safeId);
        if (remoteProduct) {
          return remoteProduct;
        }
      } catch (error) {
        console.error("Failed to load product from Firestore", error);
      }
    }

    try {
      const response = await fetch("products.json");
      const list = await response.json();
      if (!Array.isArray(list)) {
        return null;
      }
      return list.find((item) => Number(item?.id) === safeId) || null;
    } catch (error) {
      console.error("Failed to load fallback products.json", error);
      return null;
    }
  }

  let pendingDraft = readJson("pendingOrderDraft", null);
  const resolvedProductId = Number.isFinite(requestedProductId) && requestedProductId > 0
    ? requestedProductId
    : 0;

  if (!resolvedProductId) {
    cartSummary.innerHTML = "<p>Missing product_id in URL. Open checkout using checkout.html?product_id=YOUR_ID.</p>";
    payBtn.disabled = true;
    return;
  }

  let deliveryMethod = "ship";
  let product = null;
  let quantity = Number(localStorage.getItem("cartQuantity")) || 1;
  let remoteCartLoaded = false;
  let activePaymentSessionId = null;
  let stopPaymentSessionWatch = null;
  let paymentFinalizing = false;
  let payButtonLoading = false;
  let addressMap = null;
  let addressMapMarker = null;
  let addressMapDebounce = null;
  let selectedShippingLocation = null;
  let selectedShippingSnapshot = null;
  let addressSearchResults = [];
  let isShippingLocationConfirmed = false;
  let locateRequestSeq = 0;
  let isGeolocationLoading = false;
  const geolocationUnsupported = !(window.navigator && "geolocation" in window.navigator);
  const DEFAULT_DELIVERY_PIN_KEY = "checkoutDefaultDeliveryPin";
  const SAVED_ADDRESS_SLOTS_KEY = "checkoutSavedAddressSlots";
  let pickupReference = createPickupReference();

  function setPayButtonLoading(isLoading, label, options) {
    payButtonLoading = Boolean(isLoading);

    if (payButtonLoading) {
      payBtn.disabled = true;
      payBtn.innerText = label || "Processing...";
      payBtn.classList.add("is-loading");
      return;
    }

    payBtn.classList.remove("is-loading");
    if (!options?.preserveLabel) {
      renderCart();
    }
  }

  function setRadioValue(id) {
    if (!id) return;
    const target = document.getElementById(id);
    if (target && target.type === "radio") {
      target.checked = true;
    }
  }

  function getShippingOption() {
    const selected = document.querySelector('input[name="shipping"]:checked');
    return selected ? selected.id : "standard_shipping";
  }

  function getShippingFee() {
    if (deliveryMethod === "pickup") return 0;
    return getShippingOption() === "express_shipping" ? 150 : 70;
  }

  function getPaymentMethod() {
    const selected = document.querySelector('input[name="payment"]:checked');
    return selected ? selected.id : "cash_on_delivery";
  }

  function updateDeliveryUI() {
    if (deliveryMethod === "pickup") {
      pickupBtn.classList.add("active");
      shipBtn.classList.remove("active");
      pickupSection.classList.remove("hidden");
      shippingSection.classList.add("hidden");
      syncPickupReferenceDisplay();
      setPickupHint("Set your pickup date and time, then keep the pickup reference.", "info");
      return;
    }

    shipBtn.classList.add("active");
    pickupBtn.classList.remove("active");
    shippingSection.classList.remove("hidden");
    pickupSection.classList.add("hidden");
    if (addressMap && typeof addressMap.resize === "function") {
      setTimeout(() => addressMap.resize(), 60);
    }
    setPickupHint("", "info");
  }

  async function persistCartState() {
    if (!product) return;

    localStorage.setItem("cartProductId", String(product.id));
    localStorage.setItem("cartQuantity", String(quantity));

    const user = getCurrentUser();
    if (!isRemoteDbReady() || !user?.uid) {
      return;
    }

    try {
      await appDb.setCart(user.uid, buildOrderDraft());
    } catch (error) {
      console.error("Failed to persist cart in Firestore", error);
    }
  }

  function getAvailableStock() {
    const stock = Number(product?.stock);
    if (Number.isFinite(stock)) {
      return Math.max(0, stock);
    }

    return null;
  }

  function renderCart() {
    const stock = getAvailableStock();

    if (Number.isFinite(stock) && stock <= 0) {
      quantity = 1;
    }

    if (Number.isFinite(stock) && stock > 0 && quantity > stock) {
      quantity = stock;
    }

    const shippingFee = getShippingFee();
    const subtotal = product.price * quantity;
    const total = subtotal + shippingFee;

    const shippingLabel = deliveryMethod === "pickup"
      ? "Pickup"
      : getShippingOption() === "express_shipping"
        ? "Express Shipping"
        : "Standard Shipping";

    const stockText = Number.isFinite(stock)
      ? stock > 0
        ? `In stock: ${stock}`
        : "Out of stock"
      : "Stock not tracked";

    cartSummary.innerHTML = `
      <div class="summary-item">
        <img src="${product.image}" alt="${product.name}" />
        <div class="summary-details">
          <div class="summary-title">${product.name}</div>
          <div class="summary-sub">Size: ${product.size}</div>
          <div class="summary-sub">${stockText}</div>
          <div class="qty-control">
            <button id="minusBtn" type="button">-</button>
            <span id="qtyText">${quantity}</span>
            <button id="plusBtn" type="button">+</button>
          </div>
        </div>
        <div class="summary-price">${formatMoney(product.price)}</div>
      </div>

      <div class="summary-line">
        <span>Subtotal</span>
        <span>${formatMoney(subtotal)}</span>
      </div>
      <div class="summary-line">
        <span>${shippingLabel}</span>
        <span>${formatMoney(shippingFee)}</span>
      </div>
      <div class="summary-line">
        <span>Payment</span>
        <span>${formatPayment(getPaymentMethod())}</span>
      </div>
      <div class="total">
        <span>Total</span>
        <span>${formatMoney(total)}</span>
      </div>
    `;

    const minusBtn = document.getElementById("minusBtn");
    const plusBtn = document.getElementById("plusBtn");

    if (minusBtn) {
      minusBtn.disabled = quantity <= 1;
      minusBtn.addEventListener("click", () => {
        if (quantity > 1) {
          quantity -= 1;
          renderCart();
          persistCartState().catch((error) => console.error("Failed to persist cart", error));
        }
      });
    }

    if (plusBtn) {
      plusBtn.disabled = Number.isFinite(stock) ? quantity >= stock : false;
      plusBtn.addEventListener("click", () => {
        if (Number.isFinite(stock) && quantity >= stock) {
          return;
        }

        quantity += 1;
        renderCart();
        persistCartState().catch((error) => console.error("Failed to persist cart", error));
      });
    }

    if (payButtonLoading) {
      return;
    }

    if (Number.isFinite(stock) && stock <= 0) {
      payBtn.disabled = true;
      payBtn.innerText = "Out of stock";
    } else {
      payBtn.disabled = false;
      payBtn.innerText = "Pay now";
    }
  }

  function buildOrderDraft() {
    const shippingFee = getShippingFee();
    const unitPrice = Number(product.price) || 0;
    const totalPrice = unitPrice * quantity + shippingFee;
    const isPickup = deliveryMethod === "pickup";

    return {
      productId: product.id,
      productName: product.name,
      productSize: product.size,
      productImage: product.image,
      quantity,
      unitPrice,
      shippingFee,
      shippingOption: getShippingOption(),
      paymentMethod: getPaymentMethod(),
      deliveryMethod,
      totalPrice,
      contactEmail: emailInput.value.trim() || getCurrentUser()?.email || "",
      orderNotes: orderNotesInput?.value?.trim() || "",
      shippingAddress: isPickup ? null : getShippingAddressPayload(),
      shippingLocation: isPickup ? null : (selectedShippingLocation ? { ...selectedShippingLocation } : null),
      shippingLocationSnapshot: isPickup ? null : (selectedShippingSnapshot ? { ...selectedShippingSnapshot } : null),
      shippingLocationConfirmed: isPickup ? false : Boolean(isShippingLocationConfirmed),
      pickupDetails: isPickup ? getPickupPayload() : null
    };
  }

  function savePendingDraft() {
    const draft = buildOrderDraft();
    localStorage.setItem("pendingOrderDraft", JSON.stringify(draft));
    pendingDraft = draft;
  }

  function showAuthPrompt() {
    const productId = product?.id || resolvedProductId;
    authSigninLink.href = `signin.html?from=checkout&product_id=${productId}`;
    authCreateLink.href = `create-account.html?from=checkout&product_id=${productId}`;
    authPrompt.classList.remove("hidden");
  }

  function hideAuthPrompt() {
    authPrompt.classList.add("hidden");
  }

  function stopPaymentWatcher() {
    if (stopPaymentSessionWatch) {
      stopPaymentSessionWatch();
      stopPaymentSessionWatch = null;
    }
  }

  function hideQrPaymentModal(options) {
    const keepPayDisabled = Boolean(options?.keepPayDisabled);
    const keepFinalizingState = Boolean(options?.keepFinalizingState);

    qrPaymentModal.classList.add("hidden");
    qrPaymentImage.src = "";
    if (qrPaymentOpenScanBtn) {
      qrPaymentOpenScanBtn.href = "#";
    }
    qrPaymentStatus.textContent = "Waiting for scan...";

    stopPaymentWatcher();

    if (!keepFinalizingState) {
      paymentFinalizing = false;
      activePaymentSessionId = null;
    }

    setPayButtonLoading(false, null, { preserveLabel: keepPayDisabled });
  }

  function buildQrScanUrl(sessionId) {
    const scanUrl = new URL("payment-scan.html", window.location.href);
    scanUrl.search = "";
    scanUrl.searchParams.set("session", sessionId);
    return scanUrl.toString();
  }

  function showOrderComplete(order) {
    hideQrPaymentModal({ keepPayDisabled: true });
    setCheckoutFeedback("success", "Purchase successful. Your order is now pending.");
    orderCompleteText.innerText = `Order complete. Total: ${formatMoney(order.totalPrice)}`;
    if (pickupCompleteInfo) {
      const pickupDetails = order?.pickupDetails || null;
      if (order?.deliveryMethod === "pickup" && pickupDetails) {
        pickupCompleteInfo.textContent = `Pickup reference ${pickupDetails.reference} | ${pickupDetails.pickupDate || "No date"} | ${pickupDetails.pickupTimeSlot || "No slot"}`;
        pickupCompleteInfo.classList.remove("hidden");
        if (pickupClaimWrap && pickupClaimQrImage) {
          const claimPayload = `PICKUP_CLAIM|ORDER:${order?.id || "N/A"}|REF:${pickupDetails.reference || ""}|EMAIL:${order?.contactEmail || order?.email || ""}`;
          pickupClaimQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(claimPayload)}`;
          pickupClaimWrap.classList.remove("hidden");
        }
      } else {
        pickupCompleteInfo.textContent = "";
        pickupCompleteInfo.classList.add("hidden");
        if (pickupClaimWrap && pickupClaimQrImage) {
          pickupClaimQrImage.removeAttribute("src");
          pickupClaimWrap.classList.add("hidden");
        }
      }
    }
    orderComplete.classList.remove("hidden");
    playOrderConfetti();
    updateCheckoutProgress();
    payBtn.disabled = true;
    payBtn.innerText = "Order complete";
    hideAuthPrompt();
  }

  async function renderUserStatus() {
    const user = getCurrentUser();

    if (!user) {
      userStatus.innerHTML = `<a href="signin.html?from=checkout&product_id=${resolvedProductId}" class="signin">Sign in</a>`;
      return;
    }

    const adminLink = user.role === "admin" ? `<a href="admin.html" class="cartBtn">Admin</a>` : "";

    userStatus.innerHTML = `
      <span class="email">${user.email}</span>
      ${adminLink}
      <a href="profile.html" class="cartBtn">Profile</a>
      <button id="logoutBtn" type="button">Log out</button>
      <a href="orders.html" class="cartBtn">Order history</a>
    `;

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          if (auth && auth.isConfigured()) {
            await auth.signOut();
          } else {
            localStorage.removeItem("currentUser");
            localStorage.removeItem("userRole");
          }
        } catch (error) {
          console.error("Failed to sign out", error);
          localStorage.removeItem("currentUser");
          localStorage.removeItem("userRole");
        }

        window.location.reload();
      });
    }

    emailInput.value = user.email;

    if (isRemoteDbReady() && user.uid && typeof appDb.getUserProfile === "function") {
      try {
        const profile = await appDb.getUserProfile(user.uid);
        if (profile?.profile) {
          applyShippingAddress(profile.profile);
        }
      } catch (error) {
        console.error("Failed to load profile details", error);
      }
    }

    if (isRemoteDbReady() && user.uid && !remoteCartLoaded) {
      try {
        const remoteCart = await appDb.getCart(user.uid);
        remoteCartLoaded = true;

        if (remoteCart && Number(remoteCart.productId) === product.id) {
          quantity = Math.max(1, Number(remoteCart.quantity) || 1);
          deliveryMethod = remoteCart.deliveryMethod === "pickup" ? "pickup" : "ship";
          setRadioValue(remoteCart.shippingOption);
          setRadioValue(remoteCart.paymentMethod);
          if (orderNotesInput) {
            orderNotesInput.value = remoteCart.orderNotes || "";
          }
          if (remoteCart.pickupDetails) {
            applyPickupPayload(remoteCart.pickupDetails);
          }
          if (
            remoteCart.shippingLocation
            && Number.isFinite(Number(remoteCart.shippingLocation.lng))
            && Number.isFinite(Number(remoteCart.shippingLocation.lat))
          ) {
            selectedShippingLocation = {
              lng: toFixedCoordinate(remoteCart.shippingLocation.lng),
              lat: toFixedCoordinate(remoteCart.shippingLocation.lat)
            };
            isShippingLocationConfirmed = Boolean(remoteCart.shippingLocationConfirmed);
            if (remoteCart.shippingLocationSnapshot?.imageUrl && remoteCart.shippingLocationSnapshot?.mapUrl) {
              selectedShippingSnapshot = {
                embedUrl: remoteCart.shippingLocationSnapshot.embedUrl
                  ? String(remoteCart.shippingLocationSnapshot.embedUrl)
                  : String(remoteCart.shippingLocationSnapshot.imageUrl),
                imageUrl: String(remoteCart.shippingLocationSnapshot.imageUrl),
                mapUrl: String(remoteCart.shippingLocationSnapshot.mapUrl)
              };
            }
          }
          updateDeliveryUI();
          renderCart();
        }
      } catch (error) {
        console.error("Failed to load remote cart", error);
      }
    }

    updateCheckoutProgress();
  }

  function tryApplyDefaultPinFallback() {
    if (selectedShippingLocation || deliveryMethod !== "ship") {
      return;
    }

    const saved = loadDefaultDeliveryPin();
    if (
      !saved
      || !saved.shippingLocation
      || !Number.isFinite(Number(saved.shippingLocation.lng))
      || !Number.isFinite(Number(saved.shippingLocation.lat))
    ) {
      return;
    }

    if (saved.shippingAddress) {
      applyShippingAddress(saved.shippingAddress);
    }

    selectedShippingLocation = {
      lng: toFixedCoordinate(saved.shippingLocation.lng),
      lat: toFixedCoordinate(saved.shippingLocation.lat)
    };
    if (saved.shippingLocationSnapshot?.mapUrl) {
      selectedShippingSnapshot = {
        embedUrl: String(saved.shippingLocationSnapshot.embedUrl || saved.shippingLocationSnapshot.imageUrl || ""),
        imageUrl: String(saved.shippingLocationSnapshot.imageUrl || ""),
        mapUrl: String(saved.shippingLocationSnapshot.mapUrl)
      };
    }
    isShippingLocationConfirmed = Boolean(saved.shippingLocationConfirmed);
  }

  function placeOrderLocal(draft) {
    const currentUser = getCurrentUser();
    if (!currentUser) return null;

    const users = getUsers();
    const index = users.findIndex((item) => item.email === currentUser.email);

    const order = {
      productId: draft.productId,
      productName: draft.productName,
      productSize: draft.productSize,
      productImage: draft.productImage,
      quantity: draft.quantity,
      unitPrice: draft.unitPrice,
      shippingFee: draft.shippingFee,
      shippingOption: draft.shippingOption,
      paymentMethod: draft.paymentMethod,
      deliveryMethod: draft.deliveryMethod,
      totalPrice: draft.totalPrice,
      shippingLocation: draft.shippingLocation || null,
      shippingLocationSnapshot: draft.shippingLocationSnapshot || null,
      shippingLocationConfirmed: Boolean(draft.shippingLocationConfirmed),
      shippingAddress: draft.shippingAddress || null,
      pickupDetails: draft.pickupDetails || null,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    if (index === -1) {
      currentUser.orders = currentUser.orders || [];
      currentUser.orders.push(order);
      users.push(currentUser);
      saveUsers(users);
      setCurrentUser(currentUser);
    } else {
      users[index].orders = users[index].orders || [];
      users[index].orders.push(order);
      saveUsers(users);
      setCurrentUser(users[index]);
    }

    localStorage.removeItem("pendingOrderDraft");
    pendingDraft = null;
    return order;
  }

  async function placeOrder(draft) {
    const user = getCurrentUser();
    if (!user) return null;

    if (isRemoteDbReady() && user.uid) {
      const order = await appDb.createOrder(user.uid, user.email, draft);
      localStorage.removeItem("cartQuantity");
      localStorage.removeItem("pendingOrderDraft");
      pendingDraft = null;
      return order;
    }

    return placeOrderLocal(draft);
  }

  async function startMockQrPayment(orderDraft) {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("missing_user");
    }

    if (!isRemoteDbReady() || !appDb.createPaymentSession || !appDb.watchPaymentSession) {
      setCheckoutFeedback("info", "Firebase QR service is unavailable. Simulating payment for this demo.");

      const localOrder = await placeOrder(orderDraft);
      if (localOrder) {
        showOrderComplete(localOrder);
      }
      return;
    }

    setPayButtonLoading(true, "Preparing QR...");
    setCheckoutFeedback("info", "Generating QR code. Scan to complete payment.");

    const session = await appDb.createPaymentSession({
      uid: user.uid,
      email: user.email,
      amount: orderDraft.totalPrice,
      currency: "PHP",
      draft: orderDraft,
      source: "checkout_qr"
    });

    if (!session?.id) {
      setPayButtonLoading(false);
      throw new Error("payment_session_failed");
    }

    activePaymentSessionId = session.id;
    const qrUrl = buildQrScanUrl(session.id);
    qrPaymentImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrUrl)}`;
    if (qrPaymentOpenScanBtn) {
      qrPaymentOpenScanBtn.href = qrUrl;
    }
    qrPaymentStatus.textContent = "Waiting for scan...";
    qrPaymentModal.classList.remove("hidden");
    setPayButtonLoading(true, "Waiting for scan...");

    stopPaymentWatcher();

    stopPaymentSessionWatch = appDb.watchPaymentSession(
      session.id,
      async (paymentSession) => {
        if (!paymentSession || paymentFinalizing) {
          return;
        }

        if (paymentSession.status !== "paid" && paymentSession.status !== "completed") {
          return;
        }

        paymentFinalizing = true;
        qrPaymentStatus.textContent = "Scan detected. Finalizing order...";
        setCheckoutFeedback("info", "Payment detected. Finalizing your order...");
        setPayButtonLoading(true, "Finalizing order...");

        try {
          const order = await placeOrder({
            ...orderDraft,
            paymentSessionId: session.id
          });

          if (order) {
            if (appDb.markPaymentSessionCompleted) {
              await appDb.markPaymentSessionCompleted(session.id, order.id).catch((error) => {
                console.error("Failed to mark payment session completed", error);
              });
            }
            showOrderComplete(order);
          }
        } catch (error) {
          paymentFinalizing = false;
          console.error("Failed to finalize QR payment order", error);
          qrPaymentStatus.textContent = "Payment detected but order creation failed. Try again.";
          setCheckoutFeedback("error", "Payment detected but we could not create the order. Please try again.");
          setPayButtonLoading(false);
        }
      },
      (error) => {
        console.error("Payment session listener failed", error);
        qrPaymentStatus.textContent = "Realtime payment listener failed.";
        setCheckoutFeedback("error", "Payment listener failed. Please close this QR modal and try again.");
        setPayButtonLoading(false);
      }
    );
  }

  function setDeliveryMethod(nextMethod) {
    deliveryMethod = nextMethod;
    if (deliveryMethod === "pickup") {
      if (pickupNameInput && !readInputValue(pickupNameInput)) {
        const fullName = [readInputValue(firstNameInput), readInputValue(lastNameInput)].filter(Boolean).join(" ");
        pickupNameInput.value = fullName;
      }
      if (pickupContactInput && !readInputValue(pickupContactInput)) {
        pickupContactInput.value = readInputValue(phoneInput);
      }
      syncPickupReferenceDisplay();
    }
    updateDeliveryUI();
    updateCheckoutProgress();
    renderCart();
    persistCartState().catch((error) => console.error("Failed to persist cart", error));
  }

  clearAddressCandidates();
  setLocationConfirmed(false);
  initializePickupDateConstraints();
  if (saveDefaultPinCheckbox) {
    saveDefaultPinCheckbox.checked = Boolean(loadDefaultDeliveryPin());
  }
  if (savedAddressSlotSelect) {
    savedAddressSlotSelect.value = "home";
  }

  shipBtn.addEventListener("click", () => setDeliveryMethod("ship"));
  pickupBtn.addEventListener("click", () => setDeliveryMethod("pickup"));

  shipToAddressLink.addEventListener("click", (event) => {
    event.preventDefault();
    setDeliveryMethod("ship");
  });

  emailInput.addEventListener("input", () => {
    if (isValidEmail(emailInput.value.trim())) {
      setEmailError("");
    }
    setCheckoutFeedback("", "");
    updateCheckoutProgress();
  });

  if (savedAddressSlotSelect) {
    savedAddressSlotSelect.addEventListener("change", () => {
      applySavedAddressSlot(getActiveSavedAddressSlot());
    });
  }
  if (saveAddressSlotBtn) {
    saveAddressSlotBtn.addEventListener("click", () => {
      saveCurrentAddressToSlot(getActiveSavedAddressSlot());
      persistCartState().catch((error) => console.error("Failed to persist after saving address slot", error));
    });
  }
  if (clearAddressSlotBtn) {
    clearAddressSlotBtn.addEventListener("click", () => {
      clearSavedAddressSlot(getActiveSavedAddressSlot());
    });
  }

  [pickupNameInput, pickupContactInput, pickupDateInput, pickupTimeInput, pickupAgreeCheckbox].forEach((field) => {
    if (!field) return;
    const eventName = field === pickupAgreeCheckbox ? "change" : "input";
    field.addEventListener(eventName, () => {
      if (deliveryMethod === "pickup") {
        validatePickupDetails();
      }
      persistCartState().catch((error) => console.error("Failed to persist pickup details", error));
      updateCheckoutProgress();
    });
  });

  [countryInput, addressLine1Input, cityInput, provinceInput, postalCodeInput, phoneInput].forEach((field) => {
    if (!field) return;
    field.addEventListener("input", () => {
      if (selectedShippingLocation) {
        setLocationConfirmed(false);
      }
      updateInlineValidationHints();
      updateCheckoutProgress();
      if (addressMapDebounce) {
        clearTimeout(addressMapDebounce);
      }
      addressMapDebounce = setTimeout(() => {
        locateTypedAddress().catch((error) => console.error("Failed to auto-locate address", error));
      }, 900);
    });
  });

  if (locateAddressBtn) {
    locateAddressBtn.addEventListener("click", () => {
      locateTypedAddress().catch((error) => console.error("Failed to locate typed address", error));
    });
  }

  if (useSelectedCandidateBtn) {
    useSelectedCandidateBtn.addEventListener("click", () => {
      const picked = getSelectedAddressCandidate();
      if (!picked) {
        setAddressHint("No address candidate selected.", "error");
        return;
      }
      applySearchResult(picked, { successPrefix: "Selected match applied." }).catch((error) => {
        console.error("Failed to apply selected candidate", error);
      });
    });
  }

  if (addressCandidatesSelect) {
    addressCandidatesSelect.addEventListener("change", () => {
      const picked = getSelectedAddressCandidate();
      if (!picked) return;
      applySearchResult(picked, { successPrefix: "Candidate previewed." }).catch((error) => {
        console.error("Failed to preview selected candidate", error);
      });
    });
  }

  if (confirmPinBtn) {
    confirmPinBtn.addEventListener("click", () => {
      if (!selectedShippingLocation) {
        setAddressHint("Pick a point on the map first, then confirm it.", "error");
        return;
      }

      setLocationConfirmed(true);
      playPinSuccessAnimation();
      saveDefaultDeliveryPin();
      const coordsLabel = formatCoordinateLabel(selectedShippingLocation.lng, selectedShippingLocation.lat);
      setAddressHint(`Pin confirmed at ${coordsLabel}.`, "success");
      persistCartState().catch((error) => console.error("Failed to persist cart", error));
    });
  }

  if (useCurrentLocationBtn) {
    if (geolocationUnsupported) {
      useCurrentLocationBtn.disabled = true;
      useCurrentLocationBtn.title = "Geolocation is not supported in this browser.";
      setAddressHint("Geolocation is unavailable here. Use manual search or place the pin on the map.", "info");
    }

    useCurrentLocationBtn.addEventListener("click", () => {
      useCurrentLocation().catch((error) => console.error("Failed to use current location", error));
    });
  }

  if (saveDefaultPinCheckbox) {
    saveDefaultPinCheckbox.addEventListener("change", () => {
      if (saveDefaultPinCheckbox.checked) {
        saveDefaultDeliveryPin();
      } else {
        localStorage.removeItem(DEFAULT_DELIVERY_PIN_KEY);
      }
    });
  }

  authCancelBtn.addEventListener("click", hideAuthPrompt);
  if (qrPaymentCancelBtn) {
    qrPaymentCancelBtn.addEventListener("click", () => {
      hideQrPaymentModal();
      setCheckoutFeedback("info", "QR payment canceled.");
    });
  }

  product = await loadProductById(resolvedProductId);

  if (!product) {
    cartSummary.innerHTML = `<p>Product #${resolvedProductId} was not found.</p>`;
    payBtn.disabled = true;
    return;
  }

  if (pendingDraft && Number(pendingDraft.productId) === Number(product.id)) {
    quantity = Math.max(1, Number(pendingDraft.quantity) || 1);
    deliveryMethod = pendingDraft.deliveryMethod === "pickup" ? "pickup" : "ship";
    setRadioValue(pendingDraft.shippingOption);
    setRadioValue(pendingDraft.paymentMethod);
    if (orderNotesInput) {
      orderNotesInput.value = pendingDraft.orderNotes || "";
    }
    if (pendingDraft.pickupDetails) {
      applyPickupPayload(pendingDraft.pickupDetails);
    }
    if (pendingDraft.shippingAddress) {
      applyShippingAddress(pendingDraft.shippingAddress);
    }
    if (
      pendingDraft.shippingLocation
      && Number.isFinite(Number(pendingDraft.shippingLocation.lng))
      && Number.isFinite(Number(pendingDraft.shippingLocation.lat))
    ) {
      selectedShippingLocation = {
        lng: toFixedCoordinate(pendingDraft.shippingLocation.lng),
        lat: toFixedCoordinate(pendingDraft.shippingLocation.lat)
      };
      isShippingLocationConfirmed = Boolean(pendingDraft.shippingLocationConfirmed);
      if (pendingDraft.shippingLocationSnapshot?.imageUrl && pendingDraft.shippingLocationSnapshot?.mapUrl) {
        selectedShippingSnapshot = {
          embedUrl: pendingDraft.shippingLocationSnapshot.embedUrl
            ? String(pendingDraft.shippingLocationSnapshot.embedUrl)
            : String(pendingDraft.shippingLocationSnapshot.imageUrl),
          imageUrl: String(pendingDraft.shippingLocationSnapshot.imageUrl),
          mapUrl: String(pendingDraft.shippingLocationSnapshot.mapUrl)
        };
      }
    }
  } else {
    quantity = Math.max(1, Number(localStorage.getItem("cartQuantity")) || 1);
  }

  await syncUserAndProfile();
  await renderUserStatus();
  tryApplyDefaultPinFallback();
  initializeAddressMap();
  setLocationConfirmed(isShippingLocationConfirmed);
  if (selectedShippingLocation) {
    setMapMarker(selectedShippingLocation.lng, selectedShippingLocation.lat, true, { preserveConfirmation: true });
    const coordsLabel = formatCoordinateLabel(selectedShippingLocation.lng, selectedShippingLocation.lat);
    if (isShippingLocationConfirmed) {
      setAddressHint(`Using confirmed delivery pin at ${coordsLabel}.`, "success");
    }
  } else {
    locateTypedAddress().catch((error) => console.error("Failed to position address map on load", error));
  }
  updateDeliveryUI();
  syncPickupReferenceDisplay();
  setSavedAddressStatus("Tip: pick Home/School/Work, then save current address + pin for one-click reuse.", "info");
  if (deliveryMethod === "pickup") {
    validatePickupDetails();
  }
  updateInlineValidationHints();
  updateCheckoutProgress();
  renderCart();
  await persistCartState();

  document.querySelectorAll('input[name="shipping"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      renderCart();
      persistCartState().catch((error) => console.error("Failed to persist cart", error));
    });
  });

  document.querySelectorAll('input[name="payment"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      renderCart();
      persistCartState().catch((error) => console.error("Failed to persist cart", error));
    });
  });

  if (resumeOrder && pendingDraft && getCurrentUser()) {
    try {
      setCheckoutFeedback("info", "Resuming your pending checkout...");
      if (pendingDraft.paymentMethod === "gcash") {
        await startMockQrPayment(pendingDraft);
      } else {
        setPayButtonLoading(true, "Resuming order...");
        const resumedOrder = await placeOrder(pendingDraft);
        if (resumedOrder) {
          showOrderComplete(resumedOrder);
          window.history.replaceState({}, "", `checkout.html?product_id=${product.id}`);
        }
      }
    } catch (error) {
      console.error("Failed to resume order", error);
      setPayButtonLoading(false);
      setCheckoutFeedback("error", "We could not complete the resumed order. Please try again.");
    }
  }

  payBtn.addEventListener("click", async () => {
    if (!product || payButtonLoading) return;

    setCheckoutFeedback("", "");
    hideAuthPrompt();

    if (!validateCheckoutInputs()) {
      return;
    }

    let user = getCurrentUser();
    if (!user) {
      user = await syncUserAndProfile();
    }

    if (!user) {
      savePendingDraft();
      showAuthPrompt();
      setCheckoutFeedback("info", "Sign in or create an account to complete your purchase.");
      return;
    }

    const stock = getAvailableStock();
    if (Number.isFinite(stock) && quantity > stock) {
      setCheckoutFeedback("error", "Not enough stock available for the selected quantity.");
      renderCart();
      return;
    }

    const orderDraft = buildOrderDraft();
    setPayButtonLoading(true, "Processing...");
    saveDefaultDeliveryPin();

    try {
      if (saveProfileCheckbox?.checked && isRemoteDbReady() && user.uid && typeof appDb.updateUserProfile === "function") {
        await appDb.updateUserProfile(user.uid, getShippingAddressPayload()).catch((error) => {
          console.error("Failed to save profile from checkout", error);
        });
      }

      if (orderDraft.paymentMethod === "gcash") {
        await startMockQrPayment(orderDraft);
      } else {
        setCheckoutFeedback("info", "Placing your order...");
        const order = await placeOrder(orderDraft);
        if (order) {
          showOrderComplete(order);
        }
      }
    } catch (error) {
      console.error("Failed to place order", error);

      if (error?.code === "out_of_stock" || error?.message === "out_of_stock") {
        setCheckoutFeedback("error", "This product is out of stock now. Please reduce quantity.");
      } else if (error?.code === "product_not_found" || error?.message === "product_not_found") {
        setCheckoutFeedback("error", "This product no longer exists. Select another product.");
      } else if (error?.code === "product_inactive" || error?.message === "product_inactive") {
        setCheckoutFeedback("error", "This product is no longer available.");
      } else {
        setCheckoutFeedback("error", "Failed to place order. Please try again.");
      }

      renderCart();
    } finally {
      if (!orderComplete.classList.contains("hidden")) {
        return;
      }
      if (qrPaymentModal.classList.contains("hidden")) {
        setPayButtonLoading(false);
      }
    }
  });
});
