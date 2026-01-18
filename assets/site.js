const appUrl = "/app/index.html"; // Hosted desktop web build
const defaultBackendUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:3000"
  : "https://api.foolder.tv";
const backendBaseUrl = window.FOOLDER_BACKEND_URL
  || localStorage.getItem("foolder_backend_url")
  || defaultBackendUrl;

const tokenKey = "foolder_token";
const sessionKey = "foolder_session";

// Check if user is logged in
function isLoggedIn() {
  const token = localStorage.getItem(tokenKey);
  const session = localStorage.getItem(sessionKey);
  return !!(token && session);
}

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

// Check authentication and update nav
async function updateNavigation() {
  const token = localStorage.getItem(tokenKey);
  const accountLinks = document.querySelectorAll('.nav a[href="account.html"]');
  
  if (!token) {
    // Not logged in - change Account link to Login
    accountLinks.forEach(link => {
      link.href = "login.html";
      link.textContent = "Login";
    });
  } else {
    // Verify token is still valid
    try {
      await api("/me");
      // Token is valid - keep Account link
      accountLinks.forEach(link => {
        link.href = "account.html";
        link.textContent = "Account";
      });
    } catch (e) {
      // Token is invalid - clear and show Login
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(sessionKey);
      accountLinks.forEach(link => {
        link.href = "login.html";
        link.textContent = "Login";
      });
    }
  }
}

// Update navigation links based on login state
function updateNavigation(loggedIn) {
  const navLinks = document.querySelectorAll('.nav a');
  navLinks.forEach(link => {
    // Find the login/account link
    if (link.href.includes('login.html') || link.href.includes('account.html')) {
      if (loggedIn) {
        link.textContent = 'Account';
        link.href = 'account.html';
      } else {
        link.textContent = 'Login';
        link.href = 'login.html';
      }
    }
  });
}

const frame = document.getElementById("appFrame");
if (frame) {
  frame.src = appUrl;
}

const path = window.location.pathname.toLowerCase();
document.querySelectorAll(".nav a").forEach(link => {
  const href = link.getAttribute("href") || "";
  if (path.endsWith(href)) {
    link.classList.add("active");
  }
});

// Update navigation on page load
updateNavigation();
