// js/firestore-shim.js
// بديل متوافق مع واجهة Firebase Firestore (v9 modular) يعمل فوق
// الباك إند الجديد (Express REST + Socket.io) بدل Firebase.
// يوفّر نفس التوابع المستخدمة في المشروع: collection, doc, getDoc, getDocs,
// addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, and, or,
// orderBy, limit, startAfter, serverTimestamp, arrayUnion, arrayRemove,
// increment, writeBatch — بنفس التوقيعات تقريباً حتى لا نُضطر لتعديل باقي الملفات.

const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || 'http://localhost:4000';
const SOCKET_BASE = (typeof window !== 'undefined' && window.__SOCKET_BASE__) || API_BASE;

function authHeader() {
  const token = (typeof window !== 'undefined' && localStorage.getItem('authToken')) || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
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
    err.code = body && body.error && body.error.code;
    throw err;
  }
  return body;
}

// ---------- Socket.io lazy singleton ----------
let _socketPromise = null;
function getSocket() {
  if (_socketPromise) return _socketPromise;
  _socketPromise = new Promise((resolve, reject) => {
    function initWithIO(io) {
      const token = (typeof window !== 'undefined' && localStorage.getItem('authToken')) || '';
      const socket = io(SOCKET_BASE, { auth: { token }, transports: ['websocket', 'polling'] });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (e) => console.warn('[firestore-shim] socket connect_error:', e.message));
    }
    if (typeof window !== 'undefined' && window.io) {
      initWithIO(window.io);
    } else {
      // تحميل socket.io-client من الباك إند مباشرة (يُقدَّم تلقائياً من مكتبة socket.io على السيرفر)
      const script = document.createElement('script');
      script.src = `${SOCKET_BASE}/socket.io/socket.io.js`;
      script.onload = () => initWithIO(window.io);
      script.onerror = (e) => reject(e);
      document.head.appendChild(script);
    }
  });
  return _socketPromise;
}

let _watchCounter = 0;
function nextWatchId() {
  _watchCounter += 1;
  return `w${Date.now()}_${_watchCounter}`;
}

// ---------- Sentinels ----------
export function serverTimestamp() {
  return { __op: 'serverTimestamp' };
}
export function arrayUnion(...values) {
  return { __op: 'arrayUnion', values };
}
export function arrayRemove(...values) {
  return { __op: 'arrayRemove', values };
}
export function increment(n = 1) {
  return { __op: 'increment', value: n };
}

// ---------- References ----------
// db مجرّد "مؤشّر" رمزي — لا حاجة لحالة حقيقية، فقط لتمرير نفس التوقيع القديم
export function getFirestoreDB() {
  return { __type: 'db' };
}

export function collection(db, path, ...rest) {
  const full = [path, ...rest].filter(Boolean).join('/');
  return { __type: 'collection', path: full };
}

export function doc(dbOrCollectionRef, path, id) {
  // doc(db, "col", "id")
  if (path !== undefined && id !== undefined) {
    return { __type: 'doc', col: path, id };
  }
  // doc(collectionRef, "id")
  if (dbOrCollectionRef && dbOrCollectionRef.__type === 'collection' && typeof path === 'string') {
    return { __type: 'doc', col: dbOrCollectionRef.path, id: path };
  }
  // doc(db, "col") -> معرّف تلقائي (نادر الاستخدام هنا)
  if (typeof path === 'string' && id === undefined) {
    return { __type: 'doc', col: path, id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }
  throw new Error('[firestore-shim] doc(): توقيع غير مدعوم');
}

// ---------- Query constraints ----------
export function where(field, op, value) {
  return { __ctype: 'where', field, op, value };
}
export function orderBy(field, dir = 'asc') {
  return { __ctype: 'orderBy', field, dir };
}
export function limit(n) {
  return { __ctype: 'limit', n };
}
export function startAfter(val) {
  // يدعم تمرير قيمة مباشرة أو DocumentSnapshot (نأخذ منه id كتبسيط)
  const v = val && val.__isDocSnapshot ? val.id : val;
  return { __ctype: 'startAfter', val: v };
}
export function and(...constraints) {
  return { __ctype: 'compound', op: 'and', items: constraints.map(toNode) };
}
export function or(...constraints) {
  return { __ctype: 'compound', op: 'or', items: constraints.map(toNode) };
}
function toNode(c) {
  if (c.__ctype === 'where') return { field: c.field, op: c.op, value: c.value };
  if (c.__ctype === 'compound') return { op: c.op, items: c.items };
  throw new Error('[firestore-shim] and/or: قيد غير مدعوم داخلها');
}

export function query(collectionRef, ...constraints) {
  const spec = {
    col: collectionRef.path,
    filterTree: { op: 'and', items: [] },
    orders: [],
    lim: null,
    startAfterVal: undefined,
  };
  for (const c of constraints) {
    if (c.__ctype === 'where') {
      spec.filterTree.items.push({ field: c.field, op: c.op, value: c.value });
    } else if (c.__ctype === 'compound') {
      spec.filterTree.items.push({ op: c.op, items: c.items });
    } else if (c.__ctype === 'orderBy') {
      spec.orders.push({ field: c.field, dir: c.dir });
    } else if (c.__ctype === 'limit') {
      spec.lim = c.n;
    } else if (c.__ctype === 'startAfter') {
      spec.startAfterVal = c.val;
    }
  }
  return { __type: 'query', ...spec };
}

function encodeSpec(spec) {
  const json = JSON.stringify({
    filterTree: spec.filterTree,
    orders: spec.orders,
    lim: spec.lim,
    startAfterVal: spec.startAfterVal,
  });
  return btoa(unescape(encodeURIComponent(json)));
}

function asQuery(refOrQuery) {
  if (refOrQuery.__type === 'query') return refOrQuery;
  if (refOrQuery.__type === 'collection') {
    return { __type: 'query', col: refOrQuery.path, filterTree: { op: 'and', items: [] }, orders: [], lim: null, startAfterVal: undefined };
  }
  throw new Error('[firestore-shim] مرجع غير صالح للاستعلام');
}

// ---------- Snapshot helpers ----------
function makeDocSnapshot(col, id, result) {
  const exists = !!result;
  return {
    id,
    __isDocSnapshot: true,
    exists: () => exists,
    data: () => (exists ? result.data : undefined),
    ref: { __type: 'doc', col, id },
  };
}

function makeQuerySnapshot(col, results) {
  const docs = results.map((r) => makeDocSnapshot(col, r.id, r));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb) => docs.forEach(cb),
  };
}

// ---------- CRUD ----------
export async function getDoc(docRef) {
  const body = await apiFetch(`/api/db/${encodeURIComponent(docRef.col)}/doc/${encodeURIComponent(docRef.id)}`);
  return makeDocSnapshot(docRef.col, docRef.id, body.result);
}

export async function getDocs(refOrQuery) {
  const q = asQuery(refOrQuery);
  const qs = encodeSpec(q);
  const body = await apiFetch(`/api/db/${encodeURIComponent(q.col)}/docs?q=${encodeURIComponent(qs)}`);
  return makeQuerySnapshot(q.col, body.results);
}

export async function addDoc(collectionRef, data) {
  const body = await apiFetch(`/api/db/${encodeURIComponent(collectionRef.path)}/docs`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
  return { __type: 'doc', col: collectionRef.path, id: body.id };
}

export async function setDoc(docRef, data, options = {}) {
  await apiFetch(`/api/db/${encodeURIComponent(docRef.col)}/doc/${encodeURIComponent(docRef.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ data, merge: !!options.merge }),
  });
}

export async function updateDoc(docRef, data) {
  await apiFetch(`/api/db/${encodeURIComponent(docRef.col)}/doc/${encodeURIComponent(docRef.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ data }),
  });
}

export async function deleteDoc(docRef) {
  await apiFetch(`/api/db/${encodeURIComponent(docRef.col)}/doc/${encodeURIComponent(docRef.id)}`, {
    method: 'DELETE',
  });
}

// ---------- Realtime (onSnapshot) ----------
export function onSnapshot(refOrQuery, onNext, onError) {
  let unsub = false;
  let watchId = null;

  (async () => {
    try {
      const socket = await getSocket();
      if (unsub) return;
      watchId = nextWatchId();

      if (refOrQuery.__type === 'doc') {
        socket.on(`snapshot:${watchId}`, (payload) => {
          onNext(makeDocSnapshot(refOrQuery.col, refOrQuery.id, payload.result));
        });
        socket.emit('watch:doc', { watchId, col: refOrQuery.col, id: refOrQuery.id });
      } else {
        const q = asQuery(refOrQuery);
        socket.on(`snapshot:${watchId}`, (payload) => {
          onNext(makeQuerySnapshot(q.col, payload.results));
        });
        socket.emit('watch:query', {
          watchId,
          col: q.col,
          spec: { filterTree: q.filterTree, orders: q.orders, lim: q.lim, startAfterVal: q.startAfterVal },
        });
      }
    } catch (err) {
      console.error('[firestore-shim] onSnapshot error:', err);
      if (onError) onError(err);
    }
  })();

  return function unsubscribe() {
    unsub = true;
    if (!watchId) return;
    getSocket().then((socket) => {
      socket.emit('unwatch', { watchId });
      socket.off(`snapshot:${watchId}`);
    });
  };
}

// ---------- writeBatch ----------
export function writeBatch(db) {
  const ops = [];
  return {
    set(docRef, data, options = {}) {
      ops.push({ type: 'set', col: docRef.col, id: docRef.id, data, merge: !!options.merge });
    },
    update(docRef, data) {
      ops.push({ type: 'update', col: docRef.col, id: docRef.id, data });
    },
    delete(docRef) {
      ops.push({ type: 'delete', col: docRef.col, id: docRef.id });
    },
    async commit() {
      await apiFetch('/api/db/batch', { method: 'POST', body: JSON.stringify({ ops }) });
    },
  };
}

// ---------- runTransaction (تبسيط: قراءة/كتابة غير ذرية عبر REST) ----------
export async function runTransaction(db, updateFunction) {
  const tx = {
    async get(docRef) {
      return getDoc(docRef);
    },
    set(docRef, data, options) {
      return setDoc(docRef, data, options);
    },
    update(docRef, data) {
      return updateDoc(docRef, data);
    },
    delete(docRef) {
      return deleteDoc(docRef);
    },
  };
  return updateFunction(tx);
}
