import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { products } from "./products.js";

/* ---------------- ADD TO CART ---------------- */

export async function addToCart(productId) {
  const user = auth.currentUser;
  if (!user) return alert("Please log in first");

  const ref = doc(db, "carts", user.uid);
  const snap = await getDoc(ref);
  let items = snap.exists() ? snap.data().items : {};

  items[productId] = (items[productId] || 0) + 1;

  await setDoc(ref, { items });
  alert("Added to cart");
}

/* ---------------- QUANTITY UPDATE ---------------- */

async function updateQuantity(productId, change) {
  const user = auth.currentUser;
  const ref = doc(db, "carts", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  let items = snap.data().items;
  items[productId] += change;

  if (items[productId] <= 0) delete items[productId];

  await setDoc(ref, { items });
  loadCart();
}

/* ---------------- LOAD CART ---------------- */

export function loadCart() {
  onAuthStateChanged(auth, async user => {
    if (!user) return;

    const ref = doc(db, "carts", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    cartList.innerHTML = "";
    let total = 0;

    for (let id in snap.data().items) {
      const qty = snap.data().items[id];
      const product = products.find(p => p.id === id);

      total += product.price * qty;

      cartList.innerHTML += `
        <li>
          ${product.name} - $${product.price}
          <button onclick="changeQty('${id}', -1)">−</button>
          ${qty}
          <button onclick="changeQty('${id}', 1)">+</button>
        </li>
      `;
    }

    totalPrice.innerText = "$" + total;
  });
}

/* expose quantity function */
window.changeQty = updateQuantity;

/* ---------------- CHECKOUT + ORDER HISTORY ---------------- */

export async function checkout() {
  const user = auth.currentUser;
  if (!user) return;

  const cartRef = doc(db, "carts", user.uid);
  const snap = await getDoc(cartRef);
  if (!snap.exists()) return;

  const items = snap.data().items;

  await addDoc(collection(db, "orders"), {
    userId: user.uid,
    items,
    createdAt: new Date().toISOString()
  });

  await deleteDoc(cartRef);
  alert("Checkout complete (demo)");
  window.location.reload();
}

/* ---------------- LOGOUT ---------------- */

export function handleLogout() {
  signOut(auth).then(() => window.location.href = "login.html");
}

/* ---------------- GOOGLE SITES URL SUPPORT ---------------- */

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

/* ---------------- LOAD ORDER HISTORY ---------------- */

export async function loadOrders() {
  onAuthStateChanged(auth, async user => {
    if (!user) return;

    const q = await getDocs(collection(db, "orders"));
    orderList.innerHTML = "";

    q.forEach(docSnap => {
      const order = docSnap.data();
      if (order.userId !== user.uid) return;

      let summary = "";
      for (let id in order.items) {
        const p = products.find(pr => pr.id === id);
        summary += `${p.name} x ${order.items[id]}<br>`;
      }

      orderList.innerHTML += `
        <li>
          <strong>Order</strong><br>
          ${summary}
          <hr>
        </li>
      `;
    });
  });
}
