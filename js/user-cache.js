// js/user-cache.js
//
// كاش موحّد لبيانات المستخدمين والزوار، مبني على Map للوصول بسرعة O(1).
// بدل البحث الخطي O(n) في كل رسالة جديدة عبر:
//     window.allUsersAndVisitorsData.find(u => u.id === someId)
// نستخدم:
//     getUserById(someId)
//
// ملاحظة مهمة: هذا الملف لا يستبدل window.allUsersAndVisitorsData (المصفوفة)
// لأن عشرات الأماكن بالكود الحالي (modals.js, extra-modals.js...) تعتمد على
// كونه Array (findIndex, splice, تعديل مباشر بالعنصر). لذلك أبقينا المصفوفة
// كما هي للتوافق، وأضفنا Map بجانبها تُبنى وتُحدَّث تلقائياً معها، لأن
// عناصر الـ Map ونفس عناصر المصفوفة تشير لنفس الكائنات في الذاكرة (نفس المرجع)،
// فتعديل مستخدم من أي مكان بالكود القديم ينعكس تلقائياً بالـ Map أيضاً.

const usersById = new Map();

/**
 * يستبدل قائمة المستخدمين/الزوار الحالية ويعيد بناء فهرس البحث السريع.
 * استخدم هذه الدالة بدل الكتابة المباشرة على window.allUsersAndVisitorsData
 * عند تحميل/تحديث القائمة كاملة.
 * @param {Array} list
 */
export function setAllUsersAndVisitorsData(list) {
    usersById.clear();
    if (Array.isArray(list)) {
        for (const u of list) {
            if (u && u.id) usersById.set(u.id, u);
        }
    }
    window.allUsersAndVisitorsData = list;
    return list;
}

/**
 * بحث O(1) عن مستخدم بالـ id، بدل allUsersAndVisitorsData.find(u => u.id === id).
 * @param {string} id
 * @returns {object|null}
 */
export function getUserById(id) {
    if (!id) return null;
    return usersById.get(id) || null;
}

/**
 * يسجّل/يحدّث مستخدم واحد بالفهرس (مفيد عند إضافة مستخدم جديد بدون إعادة تحميل الكل).
 * @param {object} user
 */
export function upsertUserInCache(user) {
    if (user && user.id) usersById.set(user.id, user);
}
