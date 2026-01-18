const defaultBackendUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:3000"
  : "https://api.foolder.com";
const backendBaseUrl = window.FOOLDER_BACKEND_URL
  || localStorage.getItem("foolder_backend_url")
  || defaultBackendUrl;

const tokenKey = "foolder_token";
const sessionKey = "foolder_session";

const loginSection = document.getElementById("loginSection");
const codeSection = document.getElementById("codeSection");
const statusEl = document.getElementById("status");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");

const tvCodeInput = document.getElementById("tvCodeInput");
const tvCodeBtn = document.getElementById("tvCodeBtn");

function showStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
}

function setView(isLoggedIn) {
  if (isLoggedIn) {
    loginSection.classList.add("hidden");
    codeSection.classList.remove("hidden");
  } else {
    loginSection.classList.remove("hidden");
    codeSection.classList.add("hidden");
  }
}

async function api(path, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${backendBaseUrl}${path}`, { ...options, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const hint = text && text.trim().startsWith("<")
      ? "Server returned HTML. Backend may be outdated."
      : "Invalid JSON response from server.";
    throw new Error(hint);
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function getStoredSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return Boolean(localStorage.getItem(tokenKey)) && Boolean(getStoredSession());
}

setView(isLoggedIn());

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

    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (data.token) localStorage.setItem(tokenKey, data.token);
    if (data.session) localStorage.setItem(sessionKey, JSON.stringify(data.session));

    showStatus("Signed in. Enter the TV code.", "success");
    setView(true);
  } catch (e) {
    showStatus(e.message, "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
});

tvCodeBtn.addEventListener("click", async () => {
  try {
    const code = tvCodeInput.value.trim();
    if (!code) {
      showStatus("Enter the TV code shown on your device", "error");
      return;
    }

    const session = getStoredSession();
    if (!session?.access_token) {
      showStatus("Session missing. Please sign in again.", "error");
      setView(false);
      return;
    }

    tvCodeBtn.disabled = true;
    tvCodeBtn.textContent = "Linking...";

    const lookup = await api(`/auth/qr-code/${encodeURIComponent(code)}`);
    const sessionId = lookup.sessionId;
    if (!sessionId) throw new Error("Invalid code");

    await api(`/auth/qr-session/${sessionId}/complete-session`, {
      method: "POST",
      body: JSON.stringify({ session })
    });

    showStatus("TV linked successfully!", "success");
    tvCodeInput.value = "";
  } catch (e) {
    showStatus(e.message || "Failed to link TV", "error");
  } finally {
    tvCodeBtn.disabled = false;
    tvCodeBtn.textContent = "Continue";
  }
});
