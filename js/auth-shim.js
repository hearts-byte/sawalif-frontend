// js/auth-shim.js
// بديل متوافق مع واجهة Firebase Auth (v9 modular) يعمل فوق الباك إند الجديد
// (JWT عبر REST) بدل Firebase Authentication.
// يوفّر: getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
// signInWithEmailAndPassword, signOut, updateProfile, updatePassword,
// reauthenticateWithCredential, EmailAuthProvider, updateEmail, signInAnonymously.

const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || 'http://localhost:4000';

async function apiFetch(path, opts = {}) {
  const token = (typeof window !== 'undefined' && localStorage.getItem('authToken')) || '';
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    const err = new Error((body && body.error && body.error.message) || 'خطأ في الطلب');
    err.code = (body && body.error && body.error.code) || 'auth/error';
    throw err;
  }
  return body;
}

function makeUser(raw) {
  if (!raw) return null;
  return {
    uid: raw.uid,
    email: raw.email || null,
    displayName: raw.displayName || null,
    photoURL: raw.photoURL || null,
    isAnonymous: !!raw.isAnonymous,
  };
}

class AuthShim {
  constructor() {
    this.currentUser = null;
    this._listeners = [];
    this._restored = false;
    this._restore();
  }

  async _restore() {
    const token = localStorage.getItem('authToken');
    const cachedUser = localStorage.getItem('authUser');
    if (token && cachedUser) {
      try {
        this.currentUser = makeUser(JSON.parse(cachedUser));
      } catch (e) {
        this.currentUser = null;
      }
      // تحقق من صلاحية التوكن في الخلفية
      apiFetch('/api/auth/me')
        .then(({ user }) => {
          this.currentUser = makeUser(user);
          localStorage.setItem('authUser', JSON.stringify(this.currentUser));
          this._emit();
        })
        .catch(() => {
          this._clearSession();
          this._emit();
        });
    }
    this._restored = true;
    this._emit();
  }

  _emit() {
    for (const cb of this._listeners) {
      try {
        cb(this.currentUser);
      } catch (e) {
        console.error('[auth-shim] listener error:', e);
      }
    }
  }

  _setSession(user, token) {
    this.currentUser = makeUser(user);
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(this.currentUser));
    this._emit();
  }

  _clearSession() {
    this.currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  }

  onAuthStateChanged(callback) {
    this._listeners.push(callback);
    if (this._restored) callback(this.currentUser);
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  }
}

let _authSingleton = null;

export function getAuth(_app) {
  if (!_authSingleton) _authSingleton = new AuthShim();
  return _authSingleton;
}

export function onAuthStateChanged(auth, callback) {
  return auth.onAuthStateChanged(callback);
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  const { user, token } = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  auth._setSession(user, token);
  return { user: auth.currentUser };
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const { user, token } = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  auth._setSession(user, token);
  return { user: auth.currentUser };
}

export async function signInAnonymously(auth) {
  const { user, token } = await apiFetch('/api/auth/guest', { method: 'POST' });
  auth._setSession(user, token);
  return { user: auth.currentUser };
}

export async function signOut(auth) {
  auth._clearSession();
  auth._emit();
}

// تحديث البروفايل يبقى محلياً (اسم/صورة العرض تُخزَّن أساساً في مجموعة users بـ Firestore)
export async function updateProfile(user, { displayName, photoURL } = {}) {
  if (displayName !== undefined) user.displayName = displayName;
  if (photoURL !== undefined) user.photoURL = photoURL;
  const auth = getAuth();
  if (auth.currentUser && auth.currentUser.uid === user.uid) {
    auth.currentUser = { ...auth.currentUser, ...user };
    localStorage.setItem('authUser', JSON.stringify(auth.currentUser));
  }
}

export async function updatePassword(user, newPassword) {
  await apiFetch('/api/auth/update-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

export async function updateEmail(user, newEmail) {
  const { token } = await apiFetch('/api/auth/update-email', {
    method: 'POST',
    body: JSON.stringify({ newEmail }),
  });
  const auth = getAuth();
  if (token) localStorage.setItem('authToken', token);
  if (auth.currentUser) {
    auth.currentUser.email = newEmail;
    localStorage.setItem('authUser', JSON.stringify(auth.currentUser));
  }
}

export const EmailAuthProvider = {
  credential(email, password) {
    return { email, password };
  },
};

export async function reauthenticateWithCredential(user, credential) {
  await apiFetch('/api/auth/reauthenticate', {
    method: 'POST',
    body: JSON.stringify({ password: credential.password }),
  });
  return { user };
}
