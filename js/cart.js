import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { products } from "./products.js";

export async function addToCart(productId) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please log in first");
    return;
  }

  const ref = doc(db, "carts", user.uid);
  const snap = await getDoc(ref);
  let items = snap.exists() ? snap.data().items : {};

  items[productId] = (items[productId] || 0) + 1;

  await setDoc(ref, { items });
  alert("Added to cart");
}

export async function loadCart() {
  onAuthStateChanged(auth, async user => {
    if (!user) return;

    const ref = doc(db, "carts", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    let total = 0;
    cartList.innerHTML = "";

    for (let id in snap.data().items) {
      const qty = snap.data().items[id];
      const product = products.find(p => p.id === id);

      total += product.price * qty;
      cartList.innerHTML += `<li>${product.name} x ${qty}</li>`;
    }

    totalPrice.innerText = "$" + total;
  });
}

export async function checkout() {
  const user = auth.currentUser;
  if (!user) return;

  await deleteDoc(doc(db, "carts", user.uid));
  alert("Checkout successful (demo only)");
  window.location.reload();
}

export function handleLogout() {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
}

// 🔗 Handles ?product=lamp from Google Sites
export function autoAddFromURL() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product");
  if (!productId) return;

  onAuthStateChanged(auth, user => {
    if (user) {
      addToCart(productId);
      history.replaceState({}, document.title, "index.html");
    }
  });
}
