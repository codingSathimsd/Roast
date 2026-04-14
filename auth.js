// auth.js — Google Sign In, shared across all pages
// Uses AES-256 encryption via SubtleCrypto (built into browser, no library needed)

// ── GOOGLE SIGN IN ──
function initGoogleAuth() {
  if (typeof google === 'undefined') return;
  google.accounts.id.initialize({
    client_id: window.GOOGLE_CLIENT_ID,
    callback: handleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  renderAuthButton();
}

function renderAuthButton() {
  const user = getUser();
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  if (user) {
    btn.innerHTML = `<img src="${user.picture}" style="width:24px;height:24px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'"/> ${user.name.split(' ')[0]}`;
    btn.onclick = signOut;
    btn.style.gap = '8px';
  } else {
    btn.textContent = 'Sign In with Google';
    btn.onclick = () => google.accounts.id.prompt();
  }
}

async function handleCredential(response) {
  try {
    // Decode JWT payload (not verification — just reading public data)
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const user = {
      id: payload.sub,
      name: payload.name,
      email: await encryptData(payload.email), // AES-256 encrypt email
      picture: payload.picture,
      loginAt: Date.now(),
    };
    localStorage.setItem('rmi_user', JSON.stringify(user));
    localStorage.setItem('rmi_raw_name', payload.name);
    localStorage.setItem('rmi_raw_pic', payload.picture);
    renderAuthButton();
    // GA4 event
    if (typeof gtag !== 'undefined') gtag('event', 'login', { method: 'Google' });
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: user }));
  } catch (e) {
    console.error('Auth error:', e);
  }
}

function signOut() {
  if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
  localStorage.removeItem('rmi_user');
  localStorage.removeItem('rmi_raw_name');
  localStorage.removeItem('rmi_raw_pic');
  renderAuthButton();
  window.dispatchEvent(new CustomEvent('userLoggedOut'));
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('rmi_user') || 'null');
  } catch { return null; }
}

function isLoggedIn() { return !!getUser(); }

// ── AES-256 ENCRYPTION (browser built-in SubtleCrypto) ──
async function getKey() {
  const raw = localStorage.getItem('rmi_enc_key');
  if (raw) {
    const keyData = JSON.parse(raw);
    return crypto.subtle.importKey('jwk', keyData, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem('rmi_enc_key', JSON.stringify(exported));
  return key;
}

async function encryptData(text) {
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch { return btoa(text); }
}

async function decryptData(ciphertext) {
  try {
    const key = await getKey();
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch { return atob(ciphertext); }
}

// ── RATE LIMITING (3 free roasts per day without login) ──
function checkRateLimit() {
  if (isLoggedIn()) return true; // logged in = unlimited
  const today = new Date().toDateString();
  const data = JSON.parse(localStorage.getItem('rmi_usage') || '{}');
  if (data.date !== today) {
    localStorage.setItem('rmi_usage', JSON.stringify({ date: today, count: 0 }));
    return true;
  }
  if (data.count >= 3) return false; // 3 free per day
  return true;
}

function incrementUsage() {
  if (isLoggedIn()) return;
  const today = new Date().toDateString();
  const data = JSON.parse(localStorage.getItem('rmi_usage') || '{}');
  const count = (data.date === today ? data.count : 0) + 1;
  localStorage.setItem('rmi_usage', JSON.stringify({ date: today, count }));
}

// ── INIT ON LOAD ──
window.addEventListener('load', () => {
  if (typeof google !== 'undefined') initGoogleAuth();
});
