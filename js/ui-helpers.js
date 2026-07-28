// js/ui-helpers.js
// دوال واجهة صغيرة مستقلة، تم فصلها من main.js لأنها لا تعتمد على أي متغيرات مشتركة.

/**
 * تعرض إشعارًا مؤقتًا في أعلى الصفحة.
 * @param {string} message - نص الرسالة.
 * @param {string} type - نوع الرسالة (e.g., 'error', 'success').
 */
export function showNotification(message, type = 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '5px';
    notification.style.color = '#fff';
    notification.style.zIndex = '1000';
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s ease-in-out';

    if (type === 'error') {
        notification.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
    } else if (type === 'success') {
        notification.style.backgroundColor = 'rgba(40, 167, 69, 0.9)';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.addEventListener('transitionend', () => {
            notification.remove();
        });
    }, 3000);
}

export function scrollToBottom() {
    const chatBox = document.querySelector('.chat-box') ||
                    document.querySelector('.chat-messages') ||
                    document.querySelector('#chat-container');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * ينشئ مودال مرة واحدة فقط ويعيد استخدامه بعدها (بدل تكرار نمط:
 * "getElementById → إذا مو موجود، أنشئ HTML → أضف للـ body" بكل ملف مودالات).
 *
 * @param {string} id - الـ id اللي بيُعطى لعنصر المودال بالـ DOM.
 * @param {function(): string} buildHTML - دالة ترجع HTML للمودال (تُستدعى فقط أول مرة).
 * @param {function(HTMLElement)=} onCreate - دالة اختيارية تُستدعى مرة واحدة بعد
 *        إنشاء المودال لأول مرة، لربط مستمعات الأحداث الثابتة بداخله (مثل زر الإغلاق).
 * @returns {HTMLElement} عنصر المودال (سواء تم إنشاؤه الآن أو كان موجود مسبقاً).
 *
 * مثال استخدام (بدل التكرار اليدوي بكل مودال):
 *   const modal = createOrGetModal('editDetailsModal', () => `<div>...</div>`, (el) => {
 *       el.querySelector('#closeEditDetailsModalBtn').addEventListener('click', () => el.classList.remove('show'));
 *   });
 *   modal.classList.add('show');
 */
export function createOrGetModal(id, buildHTML, onCreate) {
    let modalEl = document.getElementById(id);
    if (!modalEl) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildHTML().trim();
        modalEl = wrapper.firstElementChild;
        document.body.appendChild(modalEl);
        if (typeof onCreate === 'function') onCreate(modalEl);
    }
    return modalEl;
}

/**
 * تنبيه مؤقت بسيط (نجاح/خطأ) بعنصر واحد يُعاد استخدامه بدل إنشاء div جديد كل مرة.
 * نسخة موحّدة تحل محل النسخ المكررة من showCustomAlert بأكثر من ملف.
 * @param {string} message
 * @param {'success'|'error'} type
 */
export function showCustomAlert(message, type = 'success') {
    let alertDiv = document.getElementById('custom-alert');
    if (!alertDiv) {
        alertDiv = document.createElement('div');
        alertDiv.id = 'custom-alert';
        document.body.appendChild(alertDiv);
    }
    alertDiv.className = type === 'error' ? 'custom-alert-error' : 'custom-alert-success';
    alertDiv.textContent = message;
    alertDiv.style.display = 'block';
    setTimeout(() => alertDiv.classList.add('show'), 10);
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => { alertDiv.style.display = 'none'; }, 500);
    }, 3000);
}
