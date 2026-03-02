document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.authService;
  const appDb = window.appDb;

  const userPanel = document.getElementById("profileUserPanel");
  const profileForm = document.getElementById("profileForm");
  const profileFeedback = document.getElementById("profileFeedback");

  const profileFirstName = document.getElementById("profileFirstName");
  const profileLastName = document.getElementById("profileLastName");
  const profilePhone = document.getElementById("profilePhone");
  const profileCountry = document.getElementById("profileCountry");
  const profileCity = document.getElementById("profileCity");
  const profileProvince = document.getElementById("profileProvince");
  const profilePostalCode = document.getElementById("profilePostalCode");
  const profileAddress1 = document.getElementById("profileAddress1");
  const profileAddress2 = document.getElementById("profileAddress2");
  const profileMapPreview = document.getElementById("profileMapPreview");
  const profileMapHint = document.getElementById("profileMapHint");
  const profileLocateBtn = document.getElementById("profileLocateBtn");

  let profileMap = null;
  let profileMarker = null;
  let profileMapDebounce = null;

  function setFeedback(type, message) {
    if (!profileFeedback) return;
    profileFeedback.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      profileFeedback.textContent = "";
      profileFeedback.classList.add("hidden");
      return;
    }
    profileFeedback.textContent = message;
    profileFeedback.classList.add(`is-${type || "info"}`);
    profileFeedback.classList.remove("hidden");
  }

  function readValue(el) {
    return typeof el?.value === "string" ? el.value.trim() : "";
  }

  function getPayload() {
    return {
      firstName: readValue(profileFirstName),
      lastName: readValue(profileLastName),
      phone: readValue(profilePhone),
      country: readValue(profileCountry),
      city: readValue(profileCity),
      province: readValue(profileProvince),
      postalCode: readValue(profilePostalCode),
      addressLine1: readValue(profileAddress1),
      addressLine2: readValue(profileAddress2)
    };
  }

  function applyPayload(profile) {
    if (!profile || typeof profile !== "object") return;
    if (profileFirstName) profileFirstName.value = profile.firstName || "";
    if (profileLastName) profileLastName.value = profile.lastName || "";
    if (profilePhone) profilePhone.value = profile.phone || "";
    if (profileCountry) profileCountry.value = profile.country || "";
    if (profileCity) profileCity.value = profile.city || "";
    if (profileProvince) profileProvince.value = profile.province || "";
    if (profilePostalCode) profilePostalCode.value = profile.postalCode || "";
    if (profileAddress1) profileAddress1.value = profile.addressLine1 || "";
    if (profileAddress2) profileAddress2.value = profile.addressLine2 || "";
  }

  function setMapHint(message, type) {
    if (!profileMapHint) return;
    profileMapHint.classList.remove("is-error", "is-success", "is-info");
    if (!message) {
      profileMapHint.textContent = "";
      return;
    }
    profileMapHint.textContent = message;
    profileMapHint.classList.add(`is-${type || "info"}`);
  }

  function setMapMarker(lng, lat, shouldCenter) {
    if (!profileMap || !window.maplibregl) return;
    if (!profileMarker) {
      profileMarker = new window.maplibregl.Marker({ color: "#2563eb" }).setLngLat([lng, lat]).addTo(profileMap);
    } else {
      profileMarker.setLngLat([lng, lat]);
    }

    if (shouldCenter) {
      profileMap.flyTo({ center: [lng, lat], zoom: 14, essential: true });
    }
  }

  function readAddressQuery() {
    const parts = [
      readValue(profileAddress1),
      readValue(profileAddress2),
      readValue(profileCity),
      readValue(profileProvince),
      readValue(profilePostalCode),
      readValue(profileCountry)
    ].filter(Boolean);
    return parts.join(", ");
  }

  async function geocodeAddress(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("forward_geocode_failed");
    return response.json();
  }

  async function reverseGeocode(lng, lat) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("reverse_geocode_failed");
    return response.json();
  }

  async function locateTypedAddress() {
    if (!profileMap) return;
    const query = readAddressQuery();
    if (!query) {
      setMapHint("Type address parts before locating.", "error");
      return;
    }

    try {
      setMapHint("Locating address...", "info");
      const rows = await geocodeAddress(query);
      if (!Array.isArray(rows) || !rows.length) {
        setMapHint("No matching map location found.", "error");
        return;
      }
      const lat = Number(rows[0].lat);
      const lon = Number(rows[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setMapHint("Map service returned invalid coordinates.", "error");
        return;
      }
      setMapMarker(lon, lat, true);
      setMapHint("Address located. Click map to refine.", "success");
    } catch (error) {
      console.error("Failed to locate typed profile address", error);
      setMapHint("Address lookup failed.", "error");
    }
  }

  async function applyAddressFromPoint(lng, lat) {
    try {
      const payload = await reverseGeocode(lng, lat);
      const address = payload?.address || {};
      const road = [address.house_number, address.road].filter(Boolean).join(" ");

      if (profileAddress1 && road) profileAddress1.value = road;
      if (profileCity) profileCity.value = address.city || address.town || address.village || address.municipality || profileCity.value;
      if (profileProvince) profileProvince.value = address.state || address.region || profileProvince.value;
      if (profilePostalCode) profilePostalCode.value = address.postcode || profilePostalCode.value;
      if (profileCountry) profileCountry.value = address.country || profileCountry.value;

      setMapHint("Address updated from map click.", "success");
    } catch (error) {
      console.error("Failed to reverse geocode profile map point", error);
      setMapHint("Map point set, but reverse lookup failed.", "error");
    }
  }

  function initializeProfileMap() {
    if (!profileMapPreview || !window.maplibregl) {
      return;
    }

    profileMap = new window.maplibregl.Map({
      container: "profileMapPreview",
      style: "https://demotiles.maplibre.org/style.json",
      center: [125.1716, 6.1164],
      zoom: 11
    });

    profileMap.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    profileMap.on("click", (event) => {
      const { lng, lat } = event.lngLat;
      setMapMarker(lng, lat, false);
      applyAddressFromPoint(lng, lat).catch((error) => console.error("Failed to apply map click address", error));
    });

    setMapHint("Click map to set your saved address.", "info");
  }

  if (!auth || !appDb || !auth.isConfigured() || !appDb.isConfigured()) {
    setFeedback("error", "Profile services are not configured.");
    return;
  }

  let user = auth.getCurrentUser();
  if (!user?.uid && typeof auth.waitForAuthState === "function") {
    user = await auth.waitForAuthState(5000);
  }

  if (!user?.uid) {
    setFeedback("error", "Please sign in first.");
    if (userPanel) {
      userPanel.innerHTML = `<a href="login.html?from=profile" class="signinBtn">Sign in</a>`;
    }
    return;
  }

  if (userPanel) {
    userPanel.innerHTML = `
      <span class="email">${user.email || "Signed in"}</span>
      <a href="orders.html" class="cartBtn">Orders</a>
      <a href="checkout.html" class="cartBtn">Checkout</a>
      <button id="profileLogoutBtn" type="button">Log out</button>
    `;
  }

  const logoutBtn = document.getElementById("profileLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await auth.signOut();
      window.location.href = "login.html?from=profile";
    });
  }

  try {
    const profile = await appDb.getUserProfile(user.uid);
    if (profile?.profile) {
      applyPayload(profile.profile);
    }
  } catch (error) {
    console.error("Failed to load profile", error);
    setFeedback("error", "Failed to load profile details.");
  }

  initializeProfileMap();
  locateTypedAddress().catch((error) => console.error("Failed to position profile map on load", error));

  [profileAddress1, profileCity, profileProvince, profilePostalCode, profileCountry].forEach((field) => {
    if (!field) return;
    field.addEventListener("input", () => {
      if (profileMapDebounce) clearTimeout(profileMapDebounce);
      profileMapDebounce = setTimeout(() => {
        locateTypedAddress().catch((error) => console.error("Failed to auto-locate profile address", error));
      }, 900);
    });
  });

  if (profileLocateBtn) {
    profileLocateBtn.addEventListener("click", () => {
      locateTypedAddress().catch((error) => console.error("Failed to locate profile address", error));
    });
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await appDb.updateUserProfile(user.uid, getPayload());
      setFeedback("success", "Profile saved. Checkout will autofill this information.");
    } catch (error) {
      console.error("Failed to save profile", error);
      setFeedback("error", "Failed to save profile.");
    }
  });
});
