// Account Settings Page
const defaultBackendUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:3000"
  : "https://api.foolder.com";
const backendBaseUrl = window.FOOLDER_BACKEND_URL
  || localStorage.getItem("foolder_backend_url")
  || defaultBackendUrl;

const tokenKey = "foolder_token";
const sessionKey = "foolder_session";

// Check authentication on page load
const token = localStorage.getItem(tokenKey);
if (!token) {
  window.location.href = "login.html?redirect=account.html";
}

// API Helper
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
      ? "Server returned HTML. Please check backend URL configuration."
      : "Invalid JSON response from server.";
    throw new Error(hint);
  }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(sessionKey);
      window.location.href = "login.html?redirect=account.html";
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// State
let currentUser = null;
let addons = [];
let iptvUrls = [];
let editingAddonId = null;
let editingIptvId = null;
let deleteCallback = null;

// UI Elements
const loadingState = document.getElementById("loadingState");
const mainContent = document.getElementById("mainContent");
const userEmailEl = document.getElementById("userEmail");
const accountCreatedEl = document.getElementById("accountCreated");
const addonsListEl = document.getElementById("addonsList");
const iptvListEl = document.getElementById("iptvList");

const changePasswordBtn = document.getElementById("changePasswordBtn");
const logoutBtn = document.getElementById("logoutBtn");
const addAddonBtn = document.getElementById("addAddonBtn");
const addIptvBtn = document.getElementById("addIptvBtn");

// Modals
const passwordModal = document.getElementById("passwordModal");
const addonModal = document.getElementById("addonModal");
const iptvModal = document.getElementById("iptvModal");
const confirmModal = document.getElementById("confirmModal");

// Initialize page
async function init() {
  try {
    await loadUserInfo();
    await loadAddons();
    await loadIptvUrls();
    
    loadingState.classList.add("hidden");
    mainContent.classList.remove("hidden");
  } catch (e) {
    console.error("Failed to load account data:", e);
    alert("Failed to load account information. Please try again.");
  }
}

// Load user information
async function loadUserInfo() {
  try {
    const data = await api("/me");
    currentUser = data.user || data;
    userEmailEl.textContent = currentUser.email || currentUser.username || "Unknown";
    
    if (currentUser.createdAt) {
      const date = new Date(currentUser.createdAt);
      accountCreatedEl.textContent = date.toLocaleDateString();
    } else {
      accountCreatedEl.textContent = "N/A";
    }
  } catch (e) {
    console.error("Failed to load user info:", e);
    userEmailEl.textContent = "Error loading";
    accountCreatedEl.textContent = "N/A";
  }
}

// Load addons
async function loadAddons() {
  try {
    const data = await api("/user/addons");
    addons = data.addons || data || [];
    renderAddons();
  } catch (e) {
    console.error("Failed to load addons:", e);
    addons = [];
    renderAddons();
  }
}

// Render addons list
function renderAddons() {
  if (addons.length === 0) {
    addonsListEl.innerHTML = '<div class="empty-state">No addons configured. Click "Add Addon" to get started.</div>';
    return;
  }
  
  addonsListEl.innerHTML = addons.map(addon => `
    <div class="item" data-addon-id="${escapeHtml(addon.id)}">
      <div class="item-info">
        <div class="item-name">
          ${escapeHtml(addon.name)}
          <span class="status-badge ${addon.enabled ? 'status-enabled' : 'status-disabled'}">
            ${addon.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div class="item-url">${escapeHtml(addon.url)}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-small btnSecondary edit-addon-btn" data-id="${escapeHtml(addon.id)}">Edit</button>
        <button class="btn btn-small btn-danger delete-addon-btn" data-id="${escapeHtml(addon.id)}" data-name="${escapeHtml(addon.name)}">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  addonsListEl.querySelectorAll('.edit-addon-btn').forEach(btn => {
    btn.addEventListener('click', () => editAddon(btn.dataset.id));
  });
  addonsListEl.querySelectorAll('.delete-addon-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteAddon(btn.dataset.id, btn.dataset.name));
  });
}

// Load IPTV URLs
async function loadIptvUrls() {
  try {
    const data = await api("/user/iptv");
    iptvUrls = data.iptvUrls || data.iptv || data || [];
    renderIptvUrls();
  } catch (e) {
    console.error("Failed to load IPTV URLs:", e);
    iptvUrls = [];
    renderIptvUrls();
  }
}

// Render IPTV URLs list
function renderIptvUrls() {
  if (iptvUrls.length === 0) {
    iptvListEl.innerHTML = '<div class="empty-state">No IPTV URLs configured. Click "Add IPTV URL" to get started.</div>';
    return;
  }
  
  iptvListEl.innerHTML = iptvUrls.map(iptv => `
    <div class="item" data-iptv-id="${escapeHtml(iptv.id)}">
      <div class="item-info">
        <div class="item-name">
          ${escapeHtml(iptv.name)}
          <span class="status-badge ${iptv.enabled ? 'status-enabled' : 'status-disabled'}">
            ${iptv.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div class="item-url">${escapeHtml(iptv.url)}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-small btnSecondary edit-iptv-btn" data-id="${escapeHtml(iptv.id)}">Edit</button>
        <button class="btn btn-small btn-danger delete-iptv-btn" data-id="${escapeHtml(iptv.id)}" data-name="${escapeHtml(iptv.name)}">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  iptvListEl.querySelectorAll('.edit-iptv-btn').forEach(btn => {
    btn.addEventListener('click', () => editIptv(btn.dataset.id));
  });
  iptvListEl.querySelectorAll('.delete-iptv-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteIptv(btn.dataset.id, btn.dataset.name));
  });
}

// Utility function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show/hide modal
function showModal(modal) {
  modal.classList.add("active");
}

function hideModal(modal) {
  modal.classList.remove("active");
}

// Change Password Modal
changePasswordBtn.addEventListener("click", () => {
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  document.getElementById("passwordStatus").classList.add("hidden");
  showModal(passwordModal);
});

document.getElementById("cancelPasswordBtn").addEventListener("click", () => {
  hideModal(passwordModal);
});

document.getElementById("savePasswordBtn").addEventListener("click", async () => {
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const statusEl = document.getElementById("passwordStatus");
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    statusEl.textContent = "Please fill in all fields";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  if (newPassword !== confirmPassword) {
    statusEl.textContent = "New passwords don't match";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  if (newPassword.length < 6) {
    statusEl.textContent = "Password must be at least 6 characters";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  try {
    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    
    statusEl.textContent = "Password changed successfully!";
    statusEl.className = "status success";
    statusEl.classList.remove("hidden");
    
    setTimeout(() => {
      hideModal(passwordModal);
    }, 1500);
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (e) {
    // Ignore error
  } finally {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(sessionKey);
    window.location.href = "login.html";
  }
});

// Addon Modal
addAddonBtn.addEventListener("click", () => {
  editingAddonId = null;
  document.getElementById("addonModalTitle").textContent = "Add Addon";
  document.getElementById("addonName").value = "";
  document.getElementById("addonUrl").value = "";
  document.getElementById("addonEnabled").checked = true;
  document.getElementById("addonStatus").classList.add("hidden");
  showModal(addonModal);
});

function editAddon(id) {
  const addon = addons.find(a => a.id === id);
  if (!addon) return;
  
  editingAddonId = id;
  document.getElementById("addonModalTitle").textContent = "Edit Addon";
  document.getElementById("addonName").value = addon.name;
  document.getElementById("addonUrl").value = addon.url;
  document.getElementById("addonEnabled").checked = addon.enabled !== false;
  document.getElementById("addonStatus").classList.add("hidden");
  showModal(addonModal);
}

document.getElementById("cancelAddonBtn").addEventListener("click", () => {
  hideModal(addonModal);
});

document.getElementById("saveAddonBtn").addEventListener("click", async () => {
  const name = document.getElementById("addonName").value.trim();
  const url = document.getElementById("addonUrl").value.trim();
  const enabled = document.getElementById("addonEnabled").checked;
  const statusEl = document.getElementById("addonStatus");
  
  if (!name || !url) {
    statusEl.textContent = "Please fill in all fields";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  try {
    if (editingAddonId) {
      await api(`/user/addons/${editingAddonId}`, {
        method: "PUT",
        body: JSON.stringify({ name, url, enabled })
      });
    } else {
      await api("/user/addons", {
        method: "POST",
        body: JSON.stringify({ name, url, enabled })
      });
    }
    
    await loadAddons();
    hideModal(addonModal);
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
  }
});

// IPTV Modal
addIptvBtn.addEventListener("click", () => {
  editingIptvId = null;
  document.getElementById("iptvModalTitle").textContent = "Add IPTV URL";
  document.getElementById("iptvName").value = "";
  document.getElementById("iptvUrl").value = "";
  document.getElementById("iptvEnabled").checked = true;
  document.getElementById("iptvStatus").classList.add("hidden");
  showModal(iptvModal);
});

function editIptv(id) {
  const iptv = iptvUrls.find(i => i.id === id);
  if (!iptv) return;
  
  editingIptvId = id;
  document.getElementById("iptvModalTitle").textContent = "Edit IPTV URL";
  document.getElementById("iptvName").value = iptv.name;
  document.getElementById("iptvUrl").value = iptv.url;
  document.getElementById("iptvEnabled").checked = iptv.enabled !== false;
  document.getElementById("iptvStatus").classList.add("hidden");
  showModal(iptvModal);
}

document.getElementById("cancelIptvBtn").addEventListener("click", () => {
  hideModal(iptvModal);
});

document.getElementById("saveIptvBtn").addEventListener("click", async () => {
  const name = document.getElementById("iptvName").value.trim();
  const url = document.getElementById("iptvUrl").value.trim();
  const enabled = document.getElementById("iptvEnabled").checked;
  const statusEl = document.getElementById("iptvStatus");
  
  if (!name || !url) {
    statusEl.textContent = "Please fill in all fields";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  try {
    if (editingIptvId) {
      await api(`/user/iptv/${editingIptvId}`, {
        method: "PUT",
        body: JSON.stringify({ name, url, enabled })
      });
    } else {
      await api("/user/iptv", {
        method: "POST",
        body: JSON.stringify({ name, url, enabled })
      });
    }
    
    await loadIptvUrls();
    hideModal(iptvModal);
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
  }
});

// Confirm Delete Modal
function confirmDeleteAddon(id, name) {
  document.getElementById("confirmMessage").textContent = `Are you sure you want to delete the addon "${name}"?`;
  deleteCallback = async () => {
    try {
      await api(`/user/addons/${id}`, { method: "DELETE" });
      await loadAddons();
      hideModal(confirmModal);
    } catch (e) {
      alert("Failed to delete addon: " + e.message);
    }
  };
  showModal(confirmModal);
}

function confirmDeleteIptv(id, name) {
  document.getElementById("confirmMessage").textContent = `Are you sure you want to delete the IPTV URL "${name}"?`;
  deleteCallback = async () => {
    try {
      await api(`/user/iptv/${id}`, { method: "DELETE" });
      await loadIptvUrls();
      hideModal(confirmModal);
    } catch (e) {
      alert("Failed to delete IPTV URL: " + e.message);
    }
  };
  showModal(confirmModal);
}

document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
  if (deleteCallback) deleteCallback();
});

document.getElementById("cancelDeleteBtn").addEventListener("click", () => {
  hideModal(confirmModal);
});

// Close modals on background click
[passwordModal, addonModal, iptvModal, confirmModal].forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideModal(modal);
    }
  });
});

// Initialize on page load
init();
