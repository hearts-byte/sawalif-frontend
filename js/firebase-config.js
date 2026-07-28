// js/firebase-config.js
// تم استبدال Firebase بالكامل بباك إند Node.js + Express + Socket.io + MongoDB.
// هذا الملف يحافظ على نفس الواجهة (db, auth, serverTimestamp) حتى تعمل بقية
// ملفات المشروع دون أي تعديل إضافي.

// عنوان الباك إند الجديد — عدّله حسب بيئة النشر (dev/production)
window.__API_BASE__ = window.__API_BASE__ || 'http://localhost:4000';
window.__SOCKET_BASE__ = window.__SOCKET_BASE__ || window.__API_BASE__;

import { getFirestoreDB, serverTimestamp as _serverTimestamp } from './firestore-shim.js';
import { getAuth } from './auth-shim.js';

export const db = getFirestoreDB();
export const serverTimestamp = _serverTimestamp;
export const auth = getAuth();
