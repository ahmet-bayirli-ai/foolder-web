// QR Code Login Flow
const defaultBackendUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:3000"
  : "https://api.foolder.tv";
const backendBaseUrl = window.FOOLDER_BACKEND_URL
  || localStorage.getItem("foolder_backend_url")
  || defaultBackendUrl;

const tokenKey = "foolder_token";
const sessionKey = "foolder_session";

// UI Elements
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const qrNotice = document.getElementById("qrNotice");
const statusEl = document.getElementById("status");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");

const newEmailInput = document.getElementById("newEmail");
const newPasswordInput = document.getElementById("newPassword");
const signupBtn = document.getElementById("signupBtn");

const toggleSignup = document.getElementById("toggleSignup");
const toggleLogin = document.getElementById("toggleLogin");

// Check for QR session parameter
const urlParams = new URLSearchParams(window.location.search);
let qrSessionId = urlParams.get("qr");
const redirectTarget = urlParams.get("redirect");

let isQrMode = false;

if (qrSessionId) {
  isQrMode = true;
  qrNotice.classList.remove("hidden");
}

// Toggle between login and signup
toggleSignup.addEventListener("click", (e) => {
  e.preventDefault();
  loginForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
  statusEl.classList.add("hidden");
});

toggleLogin.addEventListener("click", (e) => {
  e.preventDefault();
  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  statusEl.classList.add("hidden");
});

// API Helper
async function api(path, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${backendBaseUrl}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Show status message
function showStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
}

// Login handler
loginBtn.addEventListener("click", async () => {
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
      showStatus("Please enter email and password", "error");
      return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";
    
    if (isQrMode) {
      // Complete QR session
      const data = await api(`/auth/qr-session/${qrSessionId}/complete`, {
        method: "POST",
        body: JSON.stringify({ email, password, isRegister: false })
      });
      
      showStatus("Login successful! Return to your TV.", "success");
      
      // Clear inputs
      emailInput.value = "";
      passwordInput.value = "";
      
      // Save token for website use too
      if (data.token) localStorage.setItem(tokenKey, data.token);
      if (data.session) localStorage.setItem(sessionKey, JSON.stringify(data.session));
      
    } else {
      // Normal website login
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      
      // Store token and session data
      if (data.token) localStorage.setItem(tokenKey, data.token);
      if (data.session) localStorage.setItem(sessionKey, JSON.stringify(data.session));
      
      showStatus("Login successful!", "success");
      
      // Redirect after 1 second
      setTimeout(() => {
        window.location.href = redirectTarget ? redirectTarget : "account.html";
      }, 1000);
    }
    
  } catch (e) {
    showStatus(e.message, "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
});

// Signup handler
signupBtn.addEventListener("click", async () => {
  try {
    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value;
    
    if (!email || !password) {
      showStatus("Please enter email and password", "error");
      return;
    }
    
    if (!email.includes('@')) {
      showStatus("Please enter a valid email address", "error");
      return;
    }
    
    if (password.length < 6) {
      showStatus("Password must be at least 6 characters", "error");
      return;
    }
    
    signupBtn.disabled = true;
    signupBtn.textContent = "Creating account...";
    
    if (isQrMode) {
      // Complete QR session with registration
      const data = await api(`/auth/qr-session/${qrSessionId}/complete`, {
        method: "POST",
        body: JSON.stringify({ email, password, isRegister: true })
      });
      
      showStatus("Account created! Return to your TV.", "success");
      
      // Clear inputs
      newEmailInput.value = "";
      newPasswordInput.value = "";
      
      // Save token for website use too
      if (data.token) localStorage.setItem(tokenKey, data.token);
      if (data.session) localStorage.setItem(sessionKey, JSON.stringify(data.session));
      
    } else {
      // Normal website registration
      const reg = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      
      // Store token and session data
      if (reg?.token) {
        localStorage.setItem(tokenKey, reg.token);
        if (reg.session) localStorage.setItem(sessionKey, JSON.stringify(reg.session));
        showStatus("Account created!", "success");
        setTimeout(() => {
          window.location.href = redirectTarget ? redirectTarget : "account.html";
        }, 1000);
      } else {
        showStatus("Account created! Please sign in.", "success");
        // Switch to login form after 1.5 seconds
        setTimeout(() => {
          signupForm.classList.add("hidden");
          loginForm.classList.remove("hidden");
          emailInput.value = email;
          statusEl.classList.add("hidden");
        }, 1500);
      }
    }
    
  } catch (e) {
    showStatus(e.message, "error");
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
});

// Allow Enter key to submit
emailInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") passwordInput.focus();
});

passwordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

newEmailInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") newPasswordInput.focus();
});

newPasswordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") signupBtn.click();
});
