const appUrl = "/app/index.html"; // Hosted desktop web build
const backendBaseUrl = "https://cds-estimate-foto-pump.trycloudflare.com";

const tokenKey = "foolder_token";
const statusEl = document.getElementById("loginStatus");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

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

async function refreshAuthStatus() {
  try {
    const data = await api("/me");
    if (statusEl) statusEl.textContent = `Logged in as ${data.user?.username || "user"}`;
    if (logoutBtn) logoutBtn.style.display = "inline-block";
  } catch {
    if (statusEl) statusEl.textContent = "Not logged in.";
    if (logoutBtn) logoutBtn.style.display = "none";
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

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      const username = document.getElementById("loginUser").value.trim();
      const password = document.getElementById("loginPass").value;
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      if (data.token) localStorage.setItem(tokenKey, data.token);
      await refreshAuthStatus();
    } catch (e) {
      if (statusEl) statusEl.textContent = `Login failed: ${e.message}`;
    }
  });
}

if (registerBtn) {
  registerBtn.addEventListener("click", async () => {
    try {
      const username = document.getElementById("registerUser").value.trim();
      const password = document.getElementById("registerPass").value;
      await api("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
      if (statusEl) statusEl.textContent = "Account created. You can log in now.";
    } catch (e) {
      if (statusEl) statusEl.textContent = `Register failed: ${e.message}`;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(tokenKey);
    refreshAuthStatus();
  });
}

refreshAuthStatus();
