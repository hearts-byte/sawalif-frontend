// constants.js
export const RANK_ORDER = [
  "المالك",
  "اونر اداري",
  "اونر",
  "سوبر اداري",
  "مشرف",
  "سوبر ادمن",
  "ادمن",
  "بريميوم",
  "بلاتينيوم",
  "ملكي",
  "ذهبي",
  "برونزي",
  "عضو",
  "زائر"
];

export const RANK_IMAGE_MAP = {
  "المالك": "rank_images/owner.png",
  "اونر اداري": "rank_images/owner_admin.png",
  "اونر": "rank_images/owner2.png",
  "سوبر اداري": "rank_images/super_admin.png",
  "مشرف": "rank_images/supervisor.png",
  "سوبر ادمن": "rank_images/super_admn.png",
  "ادمن": "rank_images/admin.png",
  "بريميوم": "rank_images/premium.png",
  "بلاتينيوم": "rank_images/platinum.png",
  "ملكي": "rank_images/royal.png",
  "ذهبي": "rank_images/gold.png",
  "برونزي": "rank_images/bronze.png",
  "عضو": "rank_images/member.png",
  "زائر": "rank_images/guest.png",
};

export const RANK_PERMISSIONS = {
    "المالك": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: true,
        canAddRoom: true
    },
    "اونر اداري": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: true,
        canAddRoom: true
    },
    "اونر": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "سوبر اداري": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "مشرف": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "سوبر ادمن": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "ادمن": {
        canSeeReportButton: true,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "بريميوم": {
        canSeeReportButton: false,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "بلاتينيوم": {
        canSeeReportButton: false,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "ملكي": {
        canSeeReportButton: false,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "ذهبي": {
        canSeeReportButton: false,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "برونزي": {
        canSeeReportButton: false,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "عضو": {
        canSeeReportButton: false,
        canSeePrivateChatButton: true,
        canClearRoom: false,
        canAddRoom: false
    },
    "زائر": {
        canSeeReportButton: false,
        canSeePrivateChatButton: false,
        canClearRoom: false,
        canAddRoom: false
    }
};

// ✨ صلاحيات مودال "الأوامر" (تبويبات + أوامر إدارية على مستخدم آخر: تحذير،
// كتم، طرد، حظر، تغيير رتبة...). كانت مكررة داخل chat-commands-modal.js
// بمعزل عن RANK_PERMISSIONS أعلاه؛ الآن صارت جزء من نفس نقطة الحقيقة الوحيدة.
export const RANK_ADMIN_ACCESS = {
  'المالك': { tabs: ['account', 'commands', 'room-commands'], commands: ['all'] },
  'اونر اداري': { tabs: ['account', 'commands'], commands: ['all', '-delete-account'] },
  'اونر': { tabs: ['account', 'commands'], commands: ['all', '-change-rank', '-delete-account'] },
  'سوبر اداري': { tabs: ['account', 'commands'], commands: ['warn', 'mute', 'mute-main', 'mute-private', 'kick', 'ban'] },
  'مشرف': { tabs: ['account', 'commands'], commands: ['warn', 'mute', 'mute-main', 'mute-private', 'kick'] },
  'سوبر ادمن': { tabs: ['account', 'commands'], commands: ['warn', 'mute', 'mute-main', 'mute-private'] },
  'ادمن': { tabs: ['account', 'commands'], commands: ['warn'] },
  'بريميوم': { tabs: ['account'], commands: [] },
  'بلاتينيوم': { tabs: ['account'], commands: [] },
  'ملكي': { tabs: ['account'], commands: [] },
  'ذهبي': { tabs: ['account'], commands: [] },
  'برونزي': { tabs: ['account'], commands: [] },
  'عضو': { tabs: ['account'], commands: [] },
  'زائر': { tabs: ['account'], commands: [] }
};

// ✨ نقطة الحقيقة الوحيدة لصلاحيات الرتبة. تُستدعى مرة واحدة فقط (بعد
// التسجيل/تسجيل الدخول في script.js، وعند ترقية الرتبة)، وليس في كل صفحة.
// أي صفحة أخرى (rooms.js, main.js, chat-ui.js, chat-commands-modal.js...)
// يجب أن تقرأ النتيجة المخزّنة بدل ما تعيد الفحص من RANK_PERMISSIONS بنفسها.
export function computeUserPermissions(rank) {
  const safeRank = rank || "زائر";
  const perms = RANK_PERMISSIONS[safeRank] || RANK_PERMISSIONS["زائر"];
  const adminAccess = RANK_ADMIN_ACCESS[safeRank] || RANK_ADMIN_ACCESS["زائر"];
  return {
    rank: safeRank,
    canSeeReportButton: !!perms.canSeeReportButton,
    canSeePrivateChatButton: !!perms.canSeePrivateChatButton,
    canClearRoom: !!perms.canClearRoom,
    canAddRoom: !!perms.canAddRoom,
    tabs: adminAccess.tabs,
    commands: adminAccess.commands
  };
}

// يحسب صلاحيات الرتبة ويخزنها في localStorage تحت مفتاح واحد موحّد
// (chatUserPermissions) حتى تقرأه كل الصفحات بدل ما كل وحدة تسوي حسابها الخاص.
export function storeUserPermissions(rank) {
  const permissions = computeUserPermissions(rank);
  try {
    localStorage.setItem('chatUserPermissions', JSON.stringify(permissions));
  } catch (e) {
    // تجاهل، التخزين تحسين اختياري فقط ولا يوقف تسجيل الدخول
  }
  return permissions;
}

// قراءة الصلاحيات المخزّنة مسبقًا (بدون أي إعادة فحص للرتبة).
// إن لم توجد، أو كانت محفوظة بشكل قديم/ناقص (مثلاً كاش من قبل إضافة
// tabs/commands)، تُحسب من جديد من الرتبة المخزّنة بـ chatUserRank
// وتُستبدل النسخة القديمة، حتى لا يتكرر هذا لاحقًا.
function isValidStoredPermissions(perms) {
  return !!perms
    && Array.isArray(perms.tabs)
    && Array.isArray(perms.commands)
    && typeof perms.canSeeReportButton === 'boolean'
    && typeof perms.canSeePrivateChatButton === 'boolean'
    && typeof perms.canClearRoom === 'boolean'
    && typeof perms.canAddRoom === 'boolean';
}

export function getStoredUserPermissions() {
  try {
    const raw = localStorage.getItem('chatUserPermissions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidStoredPermissions(parsed)) return parsed;
    }
  } catch (e) { /* تجاهل وننتقل للخطة الاحتياطية */ }
  const fallbackRank = localStorage.getItem('chatUserRank') || 'زائر';
  return storeUserPermissions(fallbackRank);
}

// ✨ نفس نمط chatUserPermissions أعلاه، لكن لقائمة أصدقاء المستخدم الحالي:
// نقطة الحقيقة الوحيدة لهذه القائمة، مخزّنة في localStorage تحت مفتاح واحد
// موحّد (chatUserFriends). تُحدَّث حيّاً بمستمع Firestore واحد فقط
// (listenForCurrentUserFriends في chat-firestore.js)، وأي مكان آخر يحتاج
// يعرف هل مستخدم معيّن صديق (مثل زر "إضافة صديق" في نافذة الأوامر) يقرأ من
// هنا مباشرة بدل ما يسوي فحص Firestore خاص به في كل مرة — هذا هو سبب اختفاء
// الوميض: القيمة جاهزة ومتزامنة مسبقًا، وليست بحاجة لانتظار طلب شبكة.
export function storeUserFriends(friendIds) {
  const list = Array.isArray(friendIds) ? friendIds : [];
  try {
    localStorage.setItem('chatUserFriends', JSON.stringify(list));
  } catch (e) {
    // تجاهل، التخزين تحسين اختياري فقط
  }
  return list;
}

export function getStoredUserFriends() {
  try {
    const raw = localStorage.getItem('chatUserFriends');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) { /* تجاهل */ }
  return [];
}

export function isStoredFriend(userId) {
  if (!userId) return false;
  return getStoredUserFriends().includes(userId);
}