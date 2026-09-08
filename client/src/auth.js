// Handoff-token handling for the SIGMA viewer.
//
// The ewocs5 worklist used to launch us with the reviewer's own 24-hour session
// JWT in a query string. That put a long-lived credential into browser history,
// the Referer header, and our own uvicorn access log. We now receive a scoped,
// short-lived handoff token in the URL *fragment*, which browsers never send to
// a server, so it cannot reach an access log.
//
// Installing a single fetch wrapper here means the ~29 existing call sites, and
// any added later, are covered without touching them.

const STORAGE_KEY = 'sigma.handoffToken';

function readTokenFromHash() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return null;
  const token = new URLSearchParams(hash.slice(1)).get('token');
  return token || null;
}

let token = null;

export function initAuth() {
  const fromHash = readTokenFromHash();

  if (fromHash) {
    token = fromHash;
    // Survive a viewer reload without putting the token back in a URL.
    try {
      sessionStorage.setItem(STORAGE_KEY, token);
    } catch { /* private mode — in-memory only, reload will need a fresh launch */ }

    // Drop the fragment from the address bar and from history.
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } else {
    try {
      token = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      token = null;
    }
  }

  installFetchWrapper();
  return token;
}

export function getToken() {
  return token;
}

function installFetchWrapper() {
  if (window.__sigmaFetchWrapped) return;
  window.__sigmaFetchWrapped = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/v1') || url.includes('://') === false && url.startsWith('api/v1');

    if (!isApi || !token) return nativeFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    return nativeFetch(input, { ...init, headers });
  };
}
