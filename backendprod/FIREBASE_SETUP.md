# Firebase Setup

## 1. Enable services
1. Enable Authentication: Email/Password.
2. Enable Firestore Database.
3. (Optional for emails) Install Firebase Extension: Trigger Email.

## 2. Configure web app
1. Open [Website/firebase-config.js](Website/firebase-config.js).
2. Replace all `REPLACE_WITH_*` values with your Firebase web app config.

## 3. Deploy Firestore rules and indexes
1. Install Firebase CLI and login.
2. Run:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## 4. Set admin role
1. In Firestore, open `users/{uid}` for your admin account.
2. Set `role` to `admin`.

## 5. Deploy Cloud Functions (optional backend hardening)
1. From project root:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## 6. Email receipts and status updates
1. If using Trigger Email extension, keep `mail` collection writes enabled.
2. Frontend and Cloud Functions both enqueue mail docs in `mail`.

## 7. Mock QR payment flow
1. Checkout creates a `payment_sessions/{sessionId}` doc for GCash mock payment.
2. QR points to `payment-scan.html?session={sessionId}`.
3. Opening that URL marks session as paid, and checkout listens in realtime.
4. Ensure Firestore rules allow writes to `payment_sessions` from scanned devices.

## Notes
- Frontend currently supports fallback local mode if Firebase is not configured.
- With Firebase configured, cart/orders/products/admin are Firestore-backed.
- Realtime updates are enabled for user order history and admin dashboard.
