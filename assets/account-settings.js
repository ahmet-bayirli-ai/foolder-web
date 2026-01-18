// Account Settings Page Logic - wrapped in IIFE to avoid variable conflicts
(function() {
  'use strict';
  
  // Use global variables from site.js if available
  const tokenKey = window.tokenKey || "foolder_token";
  const sessionKey = window.sessionKey || "foolder_session";
  const backendUrl = window.backendBaseUrl || (window.FOOLDER_BACKEND_URL
    || localStorage.getItem("foolder_backend_url")
    || ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:3000"
      : "https://api.foolder.tv"));

  // Helper function to escape HTML and prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Check if user is logged in
  function isLoggedIn() {
    const token = localStorage.getItem(tokenKey);
    const session = localStorage.getItem(sessionKey);
    return !!(token && session);
  }

  // Redirect to login if not authenticated
  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
    }
  }

  // Check authentication on page load
  requireAuth();

  // API Helper
  async function api(path, options = {}) {
    const token = localStorage.getItem(tokenKey);
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${backendUrl}${path}`, { ...options, headers });
    
    // Handle 401 unauthorized
    if (res.status === 401) {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(sessionKey);
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
      throw new Error('Authentication required');
    }
    
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // UI Elements
  const profileInfo = document.getElementById('profileInfo');
  const addonsList = document.getElementById('addonsList');
  const iptvList = document.getElementById('iptvList');
  const statusMessage = document.getElementById('statusMessage');

  // Buttons
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const accountLogoutBtn = document.getElementById('accountLogoutBtn');
  const addAddonBtn = document.getElementById('addAddonBtn');
  const addIptvBtn = document.getElementById('addIptvBtn');

  // Modals
  const changePasswordModal = document.getElementById('changePasswordModal');
  const addonModal = document.getElementById('addonModal');
  const iptvModal = document.getElementById('iptvModal');

  // Show status message
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type} show`;
    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 5000);
  }

  // Load user profile
  async function loadProfile() {
    try {
      const data = await api('/me');
      const user = data.user || data;
      
      profileInfo.innerHTML = `
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${user.email || user.username || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Account ID:</span>
          <span class="info-value">${user.id || 'N/A'}</span>
        </div>
      `;
    } catch (e) {
      profileInfo.innerHTML = `<div class="empty-state">Failed to load profile: ${e.message}</div>`;
    }
  }

  // Load addons
  let addonsData = [];
  async function loadAddons() {
    try {
      const data = await api('/user/addons');
      addonsData = Array.isArray(data) ? data : (data.addons || []);
      
      if (addonsData.length === 0) {
        addonsList.innerHTML = '<div class="empty-state">No addons configured</div>';
        return;
      }
      
      addonsList.innerHTML = addonsData.map(addon => `
        <div class="list-item" data-addon-id="${addon.id}">
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(addon.name || 'Unnamed Addon')}</div>
            <div class="list-item-subtitle">${escapeHtml(addon.url || addon.config || '')}</div>
          </div>
          <div class="list-item-actions">
            <button class="btn-icon addon-edit-btn">Edit</button>
            <button class="btn-icon addon-delete-btn">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      // If endpoint doesn't exist, show empty state
      if (e.message.includes('404') || e.message.includes('Not Found')) {
        addonsList.innerHTML = '<div class="empty-state">No addons configured</div>';
      } else {
        addonsList.innerHTML = `<div class="empty-state">Failed to load addons: ${escapeHtml(e.message)}</div>`;
      }
    }
  }

  // Load IPTV URLs
  let iptvData = [];
  async function loadIptv() {
    try {
      const data = await api('/user/iptv');
      iptvData = Array.isArray(data) ? data : (data.iptv || data.urls || []);
      
      if (iptvData.length === 0) {
        iptvList.innerHTML = '<div class="empty-state">No IPTV URLs configured</div>';
        return;
      }
      
      iptvList.innerHTML = iptvData.map(iptv => `
        <div class="list-item" data-iptv-id="${iptv.id}">
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(iptv.name || 'Unnamed IPTV')}</div>
            <div class="list-item-subtitle">${escapeHtml(iptv.url || '')}</div>
          </div>
          <div class="list-item-actions">
            <button class="btn-icon iptv-edit-btn">Edit</button>
            <button class="btn-icon iptv-delete-btn">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      // If endpoint doesn't exist, show empty state
      if (e.message.includes('404') || e.message.includes('Not Found')) {
        iptvList.innerHTML = '<div class="empty-state">No IPTV URLs configured</div>';
      } else {
        iptvList.innerHTML = `<div class="empty-state">Failed to load IPTV URLs: ${escapeHtml(e.message)}</div>`;
      }
    }
  }

  // Change Password Modal
  changePasswordBtn.addEventListener('click', () => {
    changePasswordModal.classList.add('show');
  });

  document.getElementById('cancelPasswordBtn').addEventListener('click', () => {
    changePasswordModal.classList.remove('show');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  });

  document.getElementById('savePasswordBtn').addEventListener('click', async () => {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      showStatus('Please fill in all fields', 'error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showStatus('New passwords do not match', 'error');
      return;
    }
    
    if (newPassword.length < 6) {
      showStatus('New password must be at least 6 characters', 'error');
      return;
    }
    
    try {
      await api('/user/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      
      showStatus('Password changed successfully', 'success');
      changePasswordModal.classList.remove('show');
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    } catch (e) {
      showStatus(`Failed to change password: ${e.message}`, 'error');
    }
  });

  // Logout
  accountLogoutBtn.addEventListener('click', async () => {
    try {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(sessionKey);
      window.location.href = 'login.html';
    }
  });

  // Addon Modal Management
  let currentAddonId = null;

  addAddonBtn.addEventListener('click', () => {
    currentAddonId = null;
    document.getElementById('addonModalTitle').textContent = 'Add Addon';
    document.getElementById('addonName').value = '';
    document.getElementById('addonUrl').value = '';
    addonModal.classList.add('show');
  });

  document.getElementById('cancelAddonBtn').addEventListener('click', () => {
    addonModal.classList.remove('show');
  });

  document.getElementById('saveAddonBtn').addEventListener('click', async () => {
    const name = document.getElementById('addonName').value.trim();
    const url = document.getElementById('addonUrl').value.trim();
    
    if (!name || !url) {
      showStatus('Please fill in all fields', 'error');
      return;
    }
    
    try {
      if (currentAddonId) {
        await api(`/user/addons/${currentAddonId}`, {
          method: 'PUT',
          body: JSON.stringify({ name, url })
        });
        showStatus('Addon updated successfully', 'success');
      } else {
        await api('/user/addons', {
          method: 'POST',
          body: JSON.stringify({ name, url })
        });
        showStatus('Addon added successfully', 'success');
      }
      
      addonModal.classList.remove('show');
      await loadAddons();
    } catch (e) {
      showStatus(`Failed to save addon: ${e.message}`, 'error');
    }
  });

  // Event delegation for addon edit/delete buttons
  addonsList.addEventListener('click', (e) => {
    const listItem = e.target.closest('.list-item');
    if (!listItem) return;
    
    const addonId = listItem.dataset.addonId;
    
    if (e.target.classList.contains('addon-edit-btn')) {
      const addon = addonsData.find(a => String(a.id) === String(addonId));
      if (!addon) return;
      
      currentAddonId = addonId;
      document.getElementById('addonModalTitle').textContent = 'Edit Addon';
      document.getElementById('addonName').value = addon.name || '';
      document.getElementById('addonUrl').value = addon.url || addon.config || '';
      addonModal.classList.add('show');
    } else if (e.target.classList.contains('addon-delete-btn')) {
      if (!confirm('Are you sure you want to delete this addon?')) return;
      
      api(`/user/addons/${addonId}`, { method: 'DELETE' })
        .then(() => {
          showStatus('Addon deleted successfully', 'success');
          return loadAddons();
        })
        .catch(e => {
          showStatus(`Failed to delete addon: ${e.message}`, 'error');
        });
    }
  });

  // IPTV Modal Management
  let currentIptvId = null;

  addIptvBtn.addEventListener('click', () => {
    currentIptvId = null;
    document.getElementById('iptvModalTitle').textContent = 'Add IPTV URL';
    document.getElementById('iptvName').value = '';
    document.getElementById('iptvUrl').value = '';
    iptvModal.classList.add('show');
  });

  document.getElementById('cancelIptvBtn').addEventListener('click', () => {
    iptvModal.classList.remove('show');
  });

  document.getElementById('saveIptvBtn').addEventListener('click', async () => {
    const name = document.getElementById('iptvName').value.trim();
    const url = document.getElementById('iptvUrl').value.trim();
    
    if (!name || !url) {
      showStatus('Please fill in all fields', 'error');
      return;
    }
    
    try {
      if (currentIptvId) {
        await api(`/user/iptv/${currentIptvId}`, {
          method: 'PUT',
          body: JSON.stringify({ name, url })
        });
        showStatus('IPTV URL updated successfully', 'success');
      } else {
        await api('/user/iptv', {
          method: 'POST',
          body: JSON.stringify({ name, url })
        });
        showStatus('IPTV URL added successfully', 'success');
      }
      
      iptvModal.classList.remove('show');
      await loadIptv();
    } catch (e) {
      showStatus(`Failed to save IPTV URL: ${e.message}`, 'error');
    }
  });

  // Event delegation for IPTV edit/delete buttons
  iptvList.addEventListener('click', (e) => {
    const listItem = e.target.closest('.list-item');
    if (!listItem) return;
    
    const iptvId = listItem.dataset.iptvId;
    
    if (e.target.classList.contains('iptv-edit-btn')) {
      const iptv = iptvData.find(i => String(i.id) === String(iptvId));
      if (!iptv) return;
      
      currentIptvId = iptvId;
      document.getElementById('iptvModalTitle').textContent = 'Edit IPTV URL';
      document.getElementById('iptvName').value = iptv.name || '';
      document.getElementById('iptvUrl').value = iptv.url || '';
      iptvModal.classList.add('show');
    } else if (e.target.classList.contains('iptv-delete-btn')) {
      if (!confirm('Are you sure you want to delete this IPTV URL?')) return;
      
      api(`/user/iptv/${iptvId}`, { method: 'DELETE' })
        .then(() => {
          showStatus('IPTV URL deleted successfully', 'success');
          return loadIptv();
        })
        .catch(e => {
          showStatus(`Failed to delete IPTV URL: ${e.message}`, 'error');
        });
    }
  });

  // Close modals on overlay click
  [changePasswordModal, addonModal, iptvModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  });

  // Initialize page
  Promise.all([
    loadProfile(),
    loadAddons(),
    loadIptv()
  ]);
})();
