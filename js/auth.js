import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

window.signup = function () {
  createUserWithEmailAndPassword(
    auth,
    emailInput.value,
    passwordInput.value
  )
    .then(() => window.location.href = "index.html")
    .catch(err => alert(err.message));
};

window.login = function () {
  signInWithEmailAndPassword(
    auth,
    emailInput.value,
    passwordInput.value
  )
    .then(() => window.location.href = "index.html")
    .catch(err => alert(err.message));
};
