// ban-guard.js
// ✨ شاشة الحظر: تُعرض بملء الشاشة (خلفية سوداء) وتمنع أي تفاعل مع الدردشة
// نهائيًا طالما المستخدم محظور، ولا تختفي أبدًا إلا عند قيام أحد المشرفين
// بفك الحظر يدويًا (لا يوجد انتهاء مدة تلقائي، على عكس الطرد). تُستدعى
// checkBanStatusAndUpdateUI() من أي صفحة (chat.html، rooms.html) عند
// التحميل، وأيضًا من داخل مستمع بيانات المستخدم الحي (onSnapshot) في
// main.js حتى يُحظر المستخدم فورًا دون الحاجة لتحديث الصفحة.
import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, onSnapshot } from "./firestore-shim.js";

// ✨ نفس فكرة كاش الطرد بالضبط: نخزّن آخر حالة حظر معروفة في localStorage
// حتى يقرأها سكربت متزامن في أعلى الصفحة فور تحميلها ويعرض شاشة الحظر
// فورًا دون أي وميض لمحتوى الدردشة.
const BAN_CACHE_KEY = 'banGuardState';

function saveBanCache(isBanned) {
  try {
    if (!isBanned) {
      localStorage.removeItem(BAN_CACHE_KEY);
    } else {
      localStorage.setItem(BAN_CACHE_KEY, JSON.stringify({ isBanned: true }));
    }
  } catch (e) { /* تجاهل أخطاء التخزين المحلي (مثل وضع التصفح الخاص) */ }
}

let banPollInterval = null;

function ensureBanStyles() {
  if (document.getElementById('ban-screen-style')) return;
  const style = document.createElement('style');
  style.id = 'ban-screen-style';
  style.textContent = `
    #banScreenOverlay {
      position: fixed;
      inset: 0;
      background: #000;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      text-align: center;
      padding: 24px;
    }
    #banScreenOverlay .ban-screen-icon {
      width: 96px;
      height: 96px;
      margin-bottom: 24px;
    }
    #banScreenOverlay .ban-screen-title {
      color: #fff;
      font-size: 30px;
      font-weight: 700;
      margin: 0 0 12px;
      font-family: inherit;
    }
    #banScreenOverlay .ban-screen-subtitle {
      color: #9ca3af;
      font-size: 16px;
      margin: 0;
      font-family: inherit;
      direction: rtl;
    }
  `;
  document.head.appendChild(style);
}

function showBanScreen() {
  ensureBanStyles();
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  let overlay = document.getElementById('banScreenOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'banScreenOverlay';
    overlay.innerHTML = `
      <svg class="ban-screen-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="#e11d48" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm0 2c1.85 0 3.55.607 4.929 1.636L5.636 16.93A7.96 7.96 0 0 1 4 12c0-4.418 3.582-8 8-8Zm0 16c-1.85 0-3.55-.607-4.929-1.636L18.364 7.07A7.96 7.96 0 0 1 20 12c0 4.418-3.582 8-8 8Z"/>
      </svg>
      <p class="ban-screen-title">محظور</p>
      <p class="ban-screen-subtitle">لا يمكنك الدخول إلى الدردشة حتى يتم فك الحظر عنك</p>
    `;
    document.body.appendChild(overlay);
  }

  // ✨ الزوار (visitors) ليس لديهم مستمع فوري (onSnapshot) كالمستخدمين
  // المسجّلين، لذلك نتحقق دوريًا أثناء ظهور الشاشة لاكتشاف فك الحظر من
  // أحد المشرفين دون الحاجة لإعادة تحميل الصفحة.
  if (!banPollInterval) {
    banPollInterval = setInterval(() => {
      checkBanStatusAndUpdateUI();
    }, 15000);
  }
}

function hideBanScreen() {
  const overlay = document.getElementById('banScreenOverlay');
  if (overlay) overlay.remove();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  if (banPollInterval) { clearInterval(banPollInterval); banPollInterval = null; }
}

async function getCurrentUserDocRef(currentUserId) {
  let ref = doc(db, "users", currentUserId);
  let snap = await getDoc(ref);
  if (!snap.exists()) {
    ref = doc(db, "visitors", currentUserId);
    snap = await getDoc(ref);
  }
  return snap.exists() ? { ref, snap } : null;
}

// ✨ الدالة الرئيسية: تُستدعى عند تحميل أي صفحة من صفحات الدردشة، وأيضًا
// من داخل مستمع Firestore الحي لبيانات المستخدم المسجَّل، للتحقق من حالة
// الحظر الفعلية وإظهار/إخفاء شاشة الحظر وفقًا لها.
export async function checkBanStatusAndUpdateUI() {
  const currentUserId = localStorage.getItem('chatUserId');
  if (!currentUserId) return;

  try {
    const found = await getCurrentUserDocRef(currentUserId);
    if (!found) return;
    const userData = found.snap.data();

    const isBanned = userData.isBanned || false;

    if (!isBanned) {
      saveBanCache(false);
      hideBanScreen();
      return;
    }

    saveBanCache(true);
    showBanScreen();
  } catch (e) {
    console.error('خطأ في التحقق من حالة الحظر:', e);
  }
}

// ✨ يمنع تفعيل أكثر من مستمع حي واحد في نفس الصفحة (لو تم استدعاء
// watchBanStatusLive من أكثر من مكان — مثل main.js و rooms.js معًا).
let banLiveUnsubscribe = null;

// ✨ يشترك في تغييرات حالة الحظر للمستخدم الحالي بشكل حي عبر onSnapshot —
// ويعمل لكل من المستخدمين المسجّلين والزوّار على حد سواء. بمجرد أن يتحوّل
// isBanned من false إلى true (أي لحظة ضغط أحد المشرفين على زر "حظر")، تتم
// إعادة تحميل الصفحة بالكامل فورًا حتى تظهر شاشة الحظر مباشرة عند الشخص
// المحظور دون أي تأخير، بدل انتظار استطلاع دوري.
export async function watchBanStatusLive() {
  if (banLiveUnsubscribe) return; // مُفعَّل بالفعل
  const currentUserId = localStorage.getItem('chatUserId');
  if (!currentUserId) return;

  try {
    const found = await getCurrentUserDocRef(currentUserId);
    if (!found) return;

    // ✨ نبدأ من الحالة الفعلية الحالية حتى لا يُفسَّر أول snapshot بعد
    // إعادة التحميل على أنه "حظر جديد" فتدخل الصفحة في حلقة إعادة تحميل.
    let previousIsBanned = found.snap.data().isBanned || false;

    banLiveUnsubscribe = onSnapshot(found.ref, (snap) => {
      const data = snap.data();
      if (!data) return;
      const isBanned = data.isBanned || false;

      if (isBanned && !previousIsBanned) {
        // ✨ نفس الفكرة تمامًا مثل كاش الطرد: نحفظ الحالة في الكاش قبل
        // إعادة التحميل حتى يقرأها السكربت المتزامن في أعلى الصفحة فورًا
        // ويعرض الشاشة السوداء مباشرة، بدل ظهور واجهة الدردشة أولًا ثم
        // الشاشة بعدها.
        saveBanCache(true);
        window.location.reload();
        return;
      }

      previousIsBanned = isBanned;
      checkBanStatusAndUpdateUI();
    });
  } catch (e) {
    console.error('خطأ في الاشتراك الحي بحالة الحظر:', e);
  }
}
