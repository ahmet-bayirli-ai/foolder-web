// Account Settings Page - wrapped in IIFE to avoid conflicts with site.js
(function() {
'use strict';

const defaultBackendUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:3000"
  : "https://api.foolder.tv";
const backendBaseUrl = window.FOOLDER_BACKEND_URL
  || localStorage.getItem("foolder_backend_url")
  || defaultBackendUrl;

const tokenKey = "foolder_token";
const sessionKey = "foolder_session";

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

// Check authentication on page load
const token = localStorage.getItem(tokenKey);
if (!token) {
  // Preserve QR code parameter when redirecting to login
  const urlParams = new URLSearchParams(window.location.search);
  const qrCode = urlParams.get('qr') || urlParams.get('code');
  if (qrCode) {
    window.location.href = `login.html?qr=${qrCode}`;
  } else {
    window.location.href = "login.html?redirect=account.html";
  }
  throw new Error('Redirecting to login'); // Stop execution
}

// API Helper with automatic token refresh
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
        const retryHeaders = { "Content-Type": "application/json", ...(options.headers || {}) };
        retryHeaders.Authorization = `Bearer ${newToken}`;
        
        // Create retry options with updated headers
        const retryOptions = { ...options, headers: retryHeaders };
        
        const retryRes = await fetch(`${backendBaseUrl}${path}`, retryOptions);
        const retryText = await retryRes.text();
        const retryData = retryText ? JSON.parse(retryText) : {};
        if (retryRes.ok) return retryData;
      }
      // Refresh failed or retry failed - logout
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


function getStoredSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Initialize page
async function init() {
  try {
    // Check for QR Link
    const urlParams = new URLSearchParams(window.location.search);
    const qrCode = urlParams.get('qr') || urlParams.get('code');
    
    if (qrCode) {
        loadingState.textContent = "Linking TV...";
        console.log("QR code detected:", qrCode);
        
        // Wait for the next animation frame so the "Linking TV..." text is rendered before the network request
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        const session = getStoredSession();
        console.log("Stored session:", session ? "Found" : "Not found");
        
        try {
            const result = await api(`/auth/qr-session/${qrCode}/complete-session`, {
                 method: "POST",
                 body: JSON.stringify({ session: session })
            });
            console.log("QR session completed:", result);
            alert("TV Linked Successfully!");
            // Remove query param without reload
            window.history.replaceState({}, document.title, "account.html");
        } catch (e) {
            console.error("QR session error:", e);
            alert("Failed to link TV: " + e.message);
            // Continue to load account page even if linking fails
        }
    }

    console.log("Loading user info...");
    await loadUserInfo();
    console.log("Loading addons...");
    await loadAddons();
    console.log("Loading IPTV URLs...");
    await loadIptvUrls();
    
    console.log("Account page loaded successfully");
    loadingState.classList.add("hidden");
    mainContent.classList.remove("hidden");
  } catch (e) {
    console.error("Failed to load account data:", e);
    // Don't show alert loop if auth fails, api function handles redirect
    const isAuthError =
      e &&
      typeof e === "object" &&
      (
        e.status === 401 ||
        e.statusCode === 401 ||
        (e.response && e.response.status === 401) ||
        (typeof e.message === "string" && e.message.includes("401"))
      );
    if (!isAuthError) {

       loadingState.textContent = "Error loading account data.";
    }
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
    
    // Check for addons that need metadata refresh (migrated from old format)
    const needsRefresh = addons.filter(addon => !addon.logo || addon.name === addon.url);
    
    if (needsRefresh.length > 0) {
      console.log(`Refreshing metadata for ${needsRefresh.length} addon(s)...`);
      
      // Fetch manifests and update in parallel
      await Promise.all(needsRefresh.map(async (addon) => {
        try {
          // Try to fetch manifest - append /manifest.json if not already there
          let manifestUrl = addon.url;
          if (!manifestUrl.endsWith('/manifest.json') && !manifestUrl.includes('manifest.json')) {
            manifestUrl = manifestUrl.endsWith('/') ? `${manifestUrl}manifest.json` : `${manifestUrl}/manifest.json`;
          }
          
          const response = await fetch(manifestUrl);
          if (!response.ok) {
            console.log(`Skipping ${addon.url} - manifest not found`);
            return;
          }
          
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.log(`Skipping ${addon.url} - not a JSON response`);
            return;
          }
          
          const manifest = await response.json();
          if (!manifest.name) {
            console.log(`Skipping ${addon.url} - manifest missing name field`);
            return;
          }
          
          // Update addon with manifest data
          await api(`/user/addons/${encodeURIComponent(addon.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              url: addon.url,
              name: manifest.name,
              description: manifest.description || null,
              logo: manifest.logo || null,
              version: manifest.version || null,
              enabled: addon.enabled !== false
            })
          });
          
          console.log(`Refreshed metadata for ${manifest.name}`);
        } catch (e) {
          console.log(`Skipping ${addon.url} - ${e.message}`);
        }
      }));
      
      // Reload addons after refresh
      const refreshedData = await api("/user/addons");
      addons = refreshedData.addons || refreshedData || [];
    }
    
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
      <div style="display: flex; gap: 12px; align-items: center; flex: 1; min-width: 0;">
        <img src="${addon.logo || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'%3E%3Crect fill=\'%23333\' width=\'40\' height=\'40\'/%3E%3Ctext x=\'20\' y=\'24\' text-anchor=\'middle\' fill=\'%23999\' font-family=\'Arial\' font-size=\'10\'%3E%3F%3C/text%3E%3C/svg%3E'}" 
             alt="${escapeHtml(addon.name)}" 
             style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0;" />
        <div class="item-info">
          <div class="item-name">
            ${escapeHtml(addon.name)}
            <span class="status-badge ${addon.enabled ? 'status-enabled' : 'status-disabled'}">
              ${addon.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div class="item-url">${escapeHtml(addon.url)}</div>
        </div>
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
let currentManifest = null;

addAddonBtn.addEventListener("click", () => {
  editingAddonId = null;
  currentManifest = null;
  document.getElementById("addonModalTitle").textContent = "Add Addon";
  document.getElementById("addonUrl").value = "";
  document.getElementById("addonEnabled").checked = true;
  document.getElementById("addonStatus").classList.add("hidden");
  document.getElementById("addonPreview").style.display = "none";
  document.getElementById("saveAddonBtn").disabled = true;
  showModal(addonModal);
});

function editAddon(id) {
  const addon = addons.find(a => a.id === id);
  if (!addon) return;
  
  editingAddonId = id;
  currentManifest = { name: addon.name, logo: addon.logo, description: addon.description, version: addon.version };
  document.getElementById("addonModalTitle").textContent = "Edit Addon";
  document.getElementById("addonUrl").value = addon.url;
  document.getElementById("addonEnabled").checked = addon.enabled !== false;
  document.getElementById("addonStatus").classList.add("hidden");
  
  // Show preview with existing data
  if (addon.name) {
    document.getElementById("addonPreviewName").textContent = addon.name;
    document.getElementById("addonPreviewDescription").textContent = addon.description || "No description";
    document.getElementById("addonPreviewVersion").textContent = addon.version ? `Version ${addon.version}` : "";
    document.getElementById("addonPreviewIcon").src = addon.logo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect fill='%23333' width='48' height='48'/%3E%3C/svg%3E";
    document.getElementById("addonPreview").style.display = "block";
    document.getElementById("saveAddonBtn").disabled = false;
  }
  
  showModal(addonModal);
}

// Fetch manifest when URL changes
document.getElementById("addonUrl").addEventListener("input", async (e) => {
  const url = e.target.value.trim();
  const saveBtn = document.getElementById("saveAddonBtn");
  const statusEl = document.getElementById("addonStatus");
  const previewEl = document.getElementById("addonPreview");
  
  // Hide preview and disable save if URL is empty
  if (!url) {
    previewEl.style.display = "none";
    saveBtn.disabled = true;
    statusEl.classList.add("hidden");
    currentManifest = null;
    return;
  }
  
  // Check if URL looks like a manifest URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    previewEl.style.display = "none";
    saveBtn.disabled = true;
    statusEl.textContent = "URL must start with http:// or https://";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  // Fetch manifest
  try {
    statusEl.textContent = "Loading addon manifest...";
    statusEl.className = "status";
    statusEl.classList.remove("hidden");
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch manifest: ${response.status}`);
    
    const manifest = await response.json();
    
    // Validate manifest has required fields
    if (!manifest.name) throw new Error("Manifest missing 'name' field");
    
    currentManifest = {
      name: manifest.name,
      description: manifest.description || "No description provided",
      logo: manifest.logo || null,
      version: manifest.version || null
    };
    
    // Update preview
    document.getElementById("addonPreviewName").textContent = currentManifest.name;
    document.getElementById("addonPreviewDescription").textContent = currentManifest.description;
    document.getElementById("addonPreviewVersion").textContent = currentManifest.version ? `Version ${currentManifest.version}` : "";
    document.getElementById("addonPreviewIcon").src = currentManifest.logo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect fill='%23333' width='48' height='48'/%3E%3Ctext x='24' y='28' text-anchor='middle' fill='%23999' font-family='Arial' font-size='12'%3E%3F%3C/text%3E%3C/svg%3E";
    
    previewEl.style.display = "block";
    saveBtn.disabled = false;
    statusEl.classList.add("hidden");
  } catch (e) {
    console.error("Failed to fetch manifest:", e);
    previewEl.style.display = "none";
    saveBtn.disabled = true;
    statusEl.textContent = `Failed to load manifest: ${e.message}`;
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    currentManifest = null;
  }
});

document.getElementById("cancelAddonBtn").addEventListener("click", () => {
  hideModal(addonModal);
});

document.getElementById("saveAddonBtn").addEventListener("click", async () => {
  const url = document.getElementById("addonUrl").value.trim();
  const enabled = document.getElementById("addonEnabled").checked;
  const statusEl = document.getElementById("addonStatus");
  
  if (!url || !currentManifest) {
    statusEl.textContent = "Please enter a valid addon URL";
    statusEl.className = "status error";
    statusEl.classList.remove("hidden");
    return;
  }
  
  try {
    const payload = {
      url,
      name: currentManifest.name,
      description: currentManifest.description,
      logo: currentManifest.logo,
      version: currentManifest.version,
      enabled
    };
    
    if (editingAddonId) {
      await api(`/user/addons/${editingAddonId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/user/addons", {
        method: "POST",
        body: JSON.stringify(payload)
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
})(); // End of IIFE