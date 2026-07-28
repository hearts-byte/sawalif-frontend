// kick-guard.js
// ✨ شاشة الطرد: تُعرض بملء الشاشة (خلفية سوداء) وتمنع أي تفاعل مع الدردشة
// طالما المستخدم مطرود، ولا تختفي إلا عند انتهاء مدة الطرد أو عند قيام
// أحد المشرفين بفك الطرد. تُستدعى checkKickStatusAndUpdateUI() من أي صفحة
// (chat.html، rooms.html) عند التحميل، وأيضًا من داخل مستمع بيانات
// المستخدم الحي (onSnapshot) في main.js حتى يُطرد المستخدم فورًا دون
// الحاجة لتحديث الصفحة.
import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, onSnapshot } from "./firestore-shim.js";

// ✨ اسم مفتاح التخزين المحلي المستخدم لتخزين آخر حالة طرد معروفة، حتى تقرأه
// سكربت متزامن (غير async) في أعلى الصفحة فور تحميلها ويعرض شاشة الطرد
// السوداء فورًا — قبل أن يتم رسم أي محتوى من الدردشة على الشاشة، وبالتالي
// دون أي وميض. هذا الملف (kick-guard.js) نفسه يُبقي هذا الكاش محدّثًا في
// كل مرة يتحقق فيها من Firestore (سواء كان مطرودًا أو لا).
const KICK_CACHE_KEY = 'kickGuardState';

function saveKickCache(isKicked, kickedUntil) {
  try {
    if (!isKicked) {
      localStorage.removeItem(KICK_CACHE_KEY);
    } else {
      localStorage.setItem(KICK_CACHE_KEY, JSON.stringify({ isKicked: true, kickedUntil }));
    }
  } catch (e) { /* تجاهل أخطاء التخزين المحلي (مثل وضع التصفح الخاص) */ }
}

let kickPollInterval = null;
let kickCountdownInterval = null;

function formatRemaining(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return days > 0
    ? `${days} يوم ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function ensureKickStyles() {
  if (document.getElementById('kick-screen-style')) return;
  const style = document.createElement('style');
  style.id = 'kick-screen-style';
  style.textContent = `
    #kickScreenOverlay {
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
    #kickScreenOverlay .kick-screen-icon {
      width: 96px;
      height: 96px;
      margin-bottom: 24px;
    }
    #kickScreenOverlay .kick-screen-title {
      color: #fff;
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 14px;
      font-family: inherit;
    }
    #kickScreenOverlay .kick-screen-remaining {
      color: #9ca3af;
      font-size: 16px;
      margin: 0;
      font-family: inherit;
      direction: rtl;
    }
  `;
  document.head.appendChild(style);
}

function showKickScreen(remainingMs, isPermanent) {
  ensureKickStyles();
  // ✨ منع التمرير خلف الشاشة السوداء كليًا
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  let overlay = document.getElementById('kickScreenOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'kickScreenOverlay';
    overlay.innerHTML = `
      <svg class="kick-screen-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="#e11d48" d="M5 20q-.825 0-1.412-.587Q3 18.825 3 18V8q0-.825.588-1.413Q4.175 6 5 6h14q.825 0 1.413.587Q21 7.175 21 8v10q0 .825-.587 1.413Q19.825 20 19 20Zm7-7Zm-1-4q-.425 0-.712.288Q10 9.575 10 10v4q0 .425.288.712.287.288.712.288.425 0 .713-.288Q12 14.425 12 14v-4q0-.425-.287-.712Q11.425 9 11 9Zm0 0h2v4h-2Zm-5 7h14V8H5Zm2-9h10V8H7Z"/>
      </svg>
      <p class="kick-screen-title">تم طردك</p>
      <p class="kick-screen-remaining" id="kickRemainingText"></p>
    `;
    document.body.appendChild(overlay);
  }

  const remainingEl = overlay.querySelector('#kickRemainingText');

  if (kickCountdownInterval) {
    clearInterval(kickCountdownInterval);
    kickCountdownInterval = null;
  }

  if (isPermanent) {
    if (remainingEl) remainingEl.textContent = 'الطرد دائم';
  } else {
    let msLeft = remainingMs;
    const updateText = () => {
      if (remainingEl) remainingEl.textContent = `المتبقي: ${formatRemaining(msLeft)}`;
    };
    updateText();
    kickCountdownInterval = setInterval(async () => {
      msLeft -= 1000;
      if (msLeft <= 0) {
        clearInterval(kickCountdownInterval);
        kickCountdownInterval = null;
        // ✨ انتهت مدة الطرد: نفك الطرد تلقائيًا في قاعدة البيانات ونخفي الشاشة
        await unkickCurrentUser();
        saveKickCache(false);
        hideKickScreen();
        return;
      }
      updateText();
    }, 1000);
  }

  // ✨ الزوار (visitors) ليس لديهم مستمع فوري (onSnapshot) كالمستخدمين
  // المسجّلين، لذلك نتحقق دوريًا أثناء ظهور الشاشة لاكتشاف فك الطرد من
  // أحد المشرفين دون الحاجة لانتظار انتهاء المدة أو إعادة تحميل الصفحة.
  if (!kickPollInterval) {
    kickPollInterval = setInterval(() => {
      checkKickStatusAndUpdateUI();
    }, 15000);
  }
}

function hideKickScreen() {
  const overlay = document.getElementById('kickScreenOverlay');
  if (overlay) overlay.remove();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  if (kickCountdownInterval) { clearInterval(kickCountdownInterval); kickCountdownInterval = null; }
  if (kickPollInterval) { clearInterval(kickPollInterval); kickPollInterval = null; }
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

async function unkickCurrentUser() {
  const currentUserId = localStorage.getItem('chatUserId');
  if (!currentUserId) return;
  try {
    const found = await getCurrentUserDocRef(currentUserId);
    if (!found) return;
    await updateDoc(found.ref, { isKicked: false, kickedUntil: null, kickedBy: null });
  } catch (e) {
    console.error('خطأ أثناء فك الطرد تلقائيًا بعد انتهاء المدة:', e);
  }
}

// ✨ الدالة الرئيسية: تُستدعى عند تحميل أي صفحة من صفحات الدردشة، وأيضًا
// من داخل مستمع Firestore الحي لبيانات المستخدم المسجَّل، للتحقق من حالة
// الطرد الفعلية وإظهار/إخفاء شاشة الطرد وفقًا لها.
export async function checkKickStatusAndUpdateUI() {
  const currentUserId = localStorage.getItem('chatUserId');
  if (!currentUserId) return;

  try {
    const found = await getCurrentUserDocRef(currentUserId);
    if (!found) return;
    const userData = found.snap.data();

    const isKicked = userData.isKicked || false;
    const kickedUntil = userData.kickedUntil;

    if (!isKicked) {
      saveKickCache(false);
      hideKickScreen();
      return;
    }

    // انتهت مدة الطرد المؤقت بالفعل: نفكه تلقائيًا ونتجاهل عرض الشاشة
    if (kickedUntil !== 'permanent' && typeof kickedUntil === 'number' && kickedUntil <= Date.now()) {
      await updateDoc(found.ref, { isKicked: false, kickedUntil: null, kickedBy: null });
      saveKickCache(false);
      hideKickScreen();
      return;
    }

    saveKickCache(true, kickedUntil);
    const isPermanent = kickedUntil === 'permanent';
    const remainingMs = isPermanent ? 0 : (kickedUntil - Date.now());
    showKickScreen(remainingMs, isPermanent);
  } catch (e) {
    console.error('خطأ في التحقق من حالة الطرد:', e);
  }
}

// ✨ يمنع تفعيل أكثر من مستمع حي واحد في نفس الصفحة (لو تم استدعاء
// watchKickStatusLive من أكثر من مكان — مثل main.js و rooms.js معًا).
let kickLiveUnsubscribe = null;

// ✨ يشترك في تغييرات حالة الطرد للمستخدم الحالي بشكل حي عبر onSnapshot —
// ويعمل لكل من المستخدمين المسجّلين والزوّار على حد سواء (بعكس مستمع
// auth.onAuthStateChanged في main.js الذي يعمل فقط للمسجّلين). بمجرد أن
// يتحوّل isKicked من false إلى true (أي لحظة ضغط أحد المشرفين على زر
// "طرد")، تتم إعادة تحميل الصفحة بالكامل فورًا حتى تظهر شاشة الطرد
// السوداء مباشرة عند الشخص المطرود دون أي تأخير، بدل انتظار استطلاع دوري
// (كان الزوار تحديدًا ينتظرون حتى 15 ثانية سابقًا).
export async function watchKickStatusLive() {
  if (kickLiveUnsubscribe) return; // مُفعَّل بالفعل
  const currentUserId = localStorage.getItem('chatUserId');
  if (!currentUserId) return;

  try {
    const found = await getCurrentUserDocRef(currentUserId);
    if (!found) return;

    // ✨ نبدأ من الحالة الفعلية الحالية حتى لا يُفسَّر أول استدعاء للمستمع
    // بعد إعادة تحميل الصفحة (والتي ستُطلق snapshot أولي بنفس القيمة)
    // على أنه "طرد جديد" فتدخل الصفحة في حلقة إعادة تحميل لا نهائية.
    let previousIsKicked = found.snap.data().isKicked || false;

    kickLiveUnsubscribe = onSnapshot(found.ref, (snap) => {
      const data = snap.data();
      if (!data) return;
      const isKicked = data.isKicked || false;

      if (isKicked && !previousIsKicked) {
        // ✨ لازم نحفظ الحالة في الكاش قبل إعادة التحميل مباشرة: سكربت
        // متزامن في أعلى الصفحة (chat.html / rooms.html) يقرأ هذا الكاش
        // فورًا قبل رسم أي شيء ليعرض الشاشة السوداء مباشرة. لو أعدنا
        // التحميل بدون تحديث الكاش أولًا، ستُقرأ الحالة القديمة (غير
        // مطرود) عند إعادة التحميل، فتظهر واجهة الدردشة للحظة قبل أن
        // يكتشف الفحص غير المتزامن (بعد تحميل باقي السكربتات) أنه مطرود.
        saveKickCache(true, data.kickedUntil);
        window.location.reload();
        return;
      }

      previousIsKicked = isKicked;
      // بقية الحالات (فك الطرد، أو لا تغيير) تُحدَّث بدون إعادة تحميل
      checkKickStatusAndUpdateUI();
    });
  } catch (e) {
    console.error('خطأ في الاشتراك الحي بحالة الطرد:', e);
  }
}
