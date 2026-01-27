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

// Refresh token helper
async function refreshAccessToken() {
  try {
    const sessionData = localStorage.getItem(sessionKey);
    if (!sessionData) return false;
    
    const session = JSON.parse(sessionData);
    if (!session.refresh_token) return false;
    
    const res = await fetch(`${backendBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    
    if (!res.ok) return false;
    
    const data = await res.json();
    if (data.token && data.session) {
      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem(sessionKey, JSON.stringify(data.session));
      return true;
    }
    return false;
  } catch (e) {
    console.error("Token refresh failed:", e);
    return false;
  }
}

async function api(path, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${backendBaseUrl}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (res.status === 401) {
      // Try to refresh token
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the request with new token
        const newToken = localStorage.getItem(tokenKey);
        headers.Authorization = `Bearer ${newToken}`;
        const retryRes = await fetch(`${backendBaseUrl}${path}`, { ...options, headers });
        const retryText = await retryRes.text();
        const retryData = retryText ? JSON.parse(retryText) : {};
        if (retryRes.ok) return retryData;
      }
      // Refresh failed - clear tokens
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(sessionKey);
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }
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
      // Token is invalid even after refresh attempt - show Login
      accountLinks.forEach(link => {
        link.href = "login.html";
        link.textContent = "Login";
      });
    }
  }
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
