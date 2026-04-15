// auth.js — Google Sign In + Rate Limiting
// Works on all pages. No external dependencies.

// ── SAFE RATE LIMIT (works even if Google SDK not loaded) ──
function checkRateLimit() {
  try {
    if (isLoggedIn()) return true;
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem('rmi_usage') || '{"date":"","count":0}');
    if (data.date !== today) return true;
    return data.count < 3;
  } catch { return true; }
}

function incrementUsage() {
  try {
    if (isLoggedIn()) return;
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem('rmi_usage') || '{"date":"","count":0}');
    const count = (data.date === today ? data.count : 0) + 1;
    localStorage.setItem('rmi_usage', JSON.stringify({ date: today, count }));
  } catch {}
}

// ── USER STATE ──
function getUser() {
  try { return JSON.parse(localStorage.getItem('rmi_user') || 'null'); }
  catch { return null; }
}

function isLoggedIn() { return !!getUser(); }

// ── RENDER AUTH BUTTON ──
function renderAuthButton() {
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  const user = getUser();
  const pic = localStorage.getItem('rmi_raw_pic');
  const name = localStorage.getItem('rmi_raw_name');
  if (user && name) {
    btn.innerHTML = pic
      ? `<img src="${pic}" style="width:22px;height:22px;border-radius:50%;object-fit:cover"/> ${name.split(' ')[0]}`
      : name.split(' ')[0];
    btn.onclick = signOut;
  } else {
    btn.textContent = 'Sign In with Google';
    btn.onclick = () => {
      if (typeof google !== 'undefined') {
        google.accounts.id.prompt();
      } else {
        alert('Google Sign In is loading. Please try again in a moment.');
      }
    };
  }
}

// ── HANDLE GOOGLE CREDENTIAL RESPONSE ──
function handleCredential(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const user = { id: payload.sub, name: payload.name, loginAt: Date.now() };
    localStorage.setItem('rmi_user', JSON.stringify(user));
    localStorage.setItem('rmi_raw_name', payload.name);
    localStorage.setItem('rmi_raw_pic', payload.picture || '');
    renderAuthButton();
    if (typeof gtag !== 'undefined') gtag('event', 'login', { method: 'Google' });
  } catch (e) { console.error('Auth error:', e); }
}

// ── SIGN OUT ──
function signOut() {
  try { if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect(); } catch {}
  localStorage.removeItem('rmi_user');
  localStorage.removeItem('rmi_raw_name');
  localStorage.removeItem('rmi_raw_pic');
  renderAuthButton();
}

// ── INIT GOOGLE ──
function initGoogleAuth() {
  if (typeof google === 'undefined' || !window.GOOGLE_CLIENT_ID ||
      window.GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE')) return;
  try {
    google.accounts.id.initialize({
      client_id: window.GOOGLE_CLIENT_ID,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
  } catch (e) { console.warn('Google auth init failed:', e); }
}

// ── AUTO INIT ──
document.addEventListener('DOMContentLoaded', () => {
  renderAuthButton();
  // Try init immediately, retry after SDK loads
  initGoogleAuth();
  setTimeout(initGoogleAuth, 2000);
});
