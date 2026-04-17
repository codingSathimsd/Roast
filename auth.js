// auth.js — Google Sign In
// Uses popup approach — works regardless of SDK load timing

var _googleReady = false;

// Called by Google SDK onload
function onGoogleSDKLoad() {
  var clientId = window.GOOGLE_CLIENT_ID || '';
  if (!clientId || clientId.includes('PASTE_YOUR')) return;
  try {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: _onSignIn,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    _googleReady = true;
    _updateBtn();
  } catch(e) { console.warn('Google init:', e); }
}

function _onSignIn(resp) {
  try {
    var b64 = resp.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    var p = JSON.parse(atob(b64));
    localStorage.setItem('rmi_name', p.name || '');
    localStorage.setItem('rmi_pic',  p.picture || '');
    localStorage.setItem('rmi_uid',  p.sub || '');
    _updateBtn();
  } catch(e) { console.error('SignIn error:', e); }
}

function _updateBtn() {
  var btn = document.getElementById('authBtn');
  if (!btn) return;
  var name = localStorage.getItem('rmi_name');
  var pic  = localStorage.getItem('rmi_pic');
  if (name) {
    var img = pic ? '<img src="'+pic+'" style="width:22px;height:22px;border-radius:50%;object-fit:cover"/>' : '👤';
    btn.innerHTML = img + ' ' + name.split(' ')[0];
    btn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2)';
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Sign In with Google';
    btn.style.cssText = 'background:#fff;color:#000;border-color:#fff';
  }
}

function handleAuthClick() {
  var name = localStorage.getItem('rmi_name');
  if (name) {
    // Sign out
    localStorage.removeItem('rmi_name');
    localStorage.removeItem('rmi_pic');
    localStorage.removeItem('rmi_uid');
    try { google.accounts.id.disableAutoSelect(); } catch(e) {}
    _updateBtn();
    return;
  }
  // Sign in
  if (_googleReady) {
    google.accounts.id.prompt(function(notification) {
      if (notification.isSkippedMoment() || notification.isDismissedMoment()) {
        // Fallback to popup
        _googlePopup();
      }
    });
  } else {
    _googlePopup();
  }
}

function _googlePopup() {
  var clientId = window.GOOGLE_CLIENT_ID || '';
  if (!clientId || clientId.includes('PASTE_YOUR')) {
    alert('Google Sign In not configured yet.\n\nOpen config.js and paste your Google Client ID.');
    return;
  }
  var redirectUri = encodeURIComponent(window.location.origin);
  var scope = encodeURIComponent('openid profile email');
  var url = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + redirectUri +
    '&response_type=token id_token' +
    '&scope=' + scope +
    '&nonce=' + Math.random().toString(36).slice(2);
  var popup = window.open(url, 'googleSignIn', 'width=500,height=600,scrollbars=yes');
  if (!popup) alert('Please allow popups for this site to use Google Sign In.');
}

// Rate limit helpers
function checkRateLimit() {
  if (localStorage.getItem('rmi_name')) return true;
  var today = new Date().toDateString();
  try {
    var d = JSON.parse(localStorage.getItem('rmi_usage') || '{}');
    if (d.date !== today) return true;
    return (d.count || 0) < 3;
  } catch(e) { return true; }
}

function incrementUsage() {
  if (localStorage.getItem('rmi_name')) return;
  var today = new Date().toDateString();
  try {
    var d = JSON.parse(localStorage.getItem('rmi_usage') || '{}');
    var count = d.date === today ? (d.count || 0) + 1 : 1;
    localStorage.setItem('rmi_usage', JSON.stringify({ date: today, count: count }));
  } catch(e) {}
}

function isLoggedIn() { return !!localStorage.getItem('rmi_name'); }

// Init on DOM ready
document.addEventListener('DOMContentLoaded', _updateBtn);
