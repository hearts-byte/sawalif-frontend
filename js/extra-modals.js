// js/extra-modals.js

import { updateUserData } from './chat-firestore.js';
import { auth } from './firebase-config.js';
import { updateEmail } from "./auth-shim.js";
// ✨ استخدام النسخة الموحّدة من ui-helpers.js بدل تكرار نفس الدالة هنا.
// ملاحظة: النسخة القديمة المحلية كانت تضيف كلاس 'custom-alert-success' دائماً
// حتى في حالة الخطأ (type === 'error')، فما كان يظهر لون الخطأ الأحمر أبداً.
// النسخة الموحّدة تصحح هذا وتختار الكلاس الصحيح حسب type.
import { showCustomAlert } from './ui-helpers.js';
import { getUserById } from './user-cache.js';

document.addEventListener('DOMContentLoaded', () => {

    // ✨ حماية: التأكد من اكتمال تحميل بيانات المستخدمين والزوار من Firestore
    // قبل السماح لأي زر بالبحث داخل window.allUsersAndVisitorsData.
    // يمنع هذا حدوث خطأ JavaScript صامت (TypeError) إذا ضغط المستخدم
    // على أحد الأزرار قبل اكتمال التحميل.
    const isUserDataReady = () => Array.isArray(window.allUsersAndVisitorsData);

    const getCurrentUserDataSafely = (userId) => {
        if (!isUserDataReady()) {
            showCustomAlert('البيانات لا تزال قيد التحميل، الرجاء المحاولة بعد لحظات.', 'error');
            return null;
        }
        return getUserById(userId);
    };

    const showEditDetailsModal = (user) => {
        let editDetailsModal = document.getElementById('editDetailsModal');
        if (!editDetailsModal) {
            const ageOptions = Array.from({ length: 90 }, (_, i) => i + 10);
            const ageOptionsHTML = ageOptions.map(age => `<option value="${age}">${age}</option>`).join('');
            const modalHTML = `
                <div id="editDetailsModal" class="edit-details-overlay">
                    <div class="edit-details-modal">
                        <div class="modal-header">
                            <h2>تعديل بياناتك</h2>
                            <span class="close-button" id="closeEditDetailsModalBtn">&times;</span>
                        </div>
                        <div class="modal-body">
                            <form id="editDetailsForm">
                                <div class="form-group">
                                    <label for="userGender">الجنس:</label>
                                    <select id="userGender" name="gender">
                                        <option value="ذكر">ذكر</option>
                                        <option value="أنثى">أنثى</option>
                                        <option value="آخر">آخر</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="userAge">العمر:</label>
                                    <select id="userAge" name="age">
                                        ${ageOptionsHTML}
                                    </select>
                                </div>
                                <div class="form-actions">
                                    <button type="submit" class="btn save-btn">حفظ</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            editDetailsModal = document.getElementById('editDetailsModal');
            const closeBtn = document.getElementById('closeEditDetailsModalBtn');
            const hideModal = () => { if (editDetailsModal) editDetailsModal.classList.remove('show'); };
            if (closeBtn) closeBtn.addEventListener('click', hideModal);
            editDetailsModal.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('edit-details-overlay')) hideModal();
            });
            const editDetailsForm = document.getElementById('editDetailsForm');
            editDetailsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentUserId = localStorage.getItem('chatUserId');
                const newGender = document.getElementById('userGender').value;
                const newAge = parseInt(document.getElementById('userAge').value, 10);
                if (currentUserId) {
                    try {
                        await updateUserData(currentUserId, { gender: newGender, age: newAge });
                        showCustomAlert('تم حفظ البيانات بنجاح.');
                        const currentUserIndex = (isUserDataReady() ? window.allUsersAndVisitorsData : []).findIndex(u => u.id === currentUserId);
                        if (currentUserIndex !== -1) {
                            window.allUsersAndVisitorsData[currentUserIndex].gender = newGender;
                            window.allUsersAndVisitorsData[currentUserIndex].age = newAge;
                        }
                        hideModal();
                    } catch (error) {
                        console.error("فشل تحديث البيانات:", error);
                        showCustomAlert('حدث خطأ أثناء حفظ البيانات.', 'error');
                    }
                }
            });
        }
        if (user) {
            document.getElementById('userGender').value = user.gender || 'غير محدد';
            document.getElementById('userAge').value = user.age || '';
        }
        if (editDetailsModal) {
            editDetailsModal.classList.add('show');
        }
    };

    const showEditStatusModal = (user) => {
        let editStatusModal = document.getElementById('editStatusModal');
        if (!editStatusModal) {
            const modalHTML = `
                <div id="editStatusModal" class="edit-status-overlay">
                    <div class="edit-status-modal">
                        <div class="modal-header">
                            <h2>تعديل حالتك</h2>
                            <span class="close-button" id="closeEditStatusModalBtn">&times;</span>
                        </div>
                        <div class="modal-body">
                            <form id="editStatusForm">
                                <div class="form-group">
                                    <label for="userStatus">حالتك:</label>
                                    <input type="text" id="userStatus" name="status" placeholder="اكتب حالتك هنا..." maxlength="30">
                                </div>
                                <div class="form-actions">
                                    <button type="submit" class="btn save-btn">حفظ</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            editStatusModal = document.getElementById('editStatusModal');
            const closeBtn = document.getElementById('closeEditStatusModalBtn');
            const hideModal = () => { if (editStatusModal) editStatusModal.classList.remove('show'); };
            if (closeBtn) closeBtn.addEventListener('click', hideModal);
            editStatusModal.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('edit-status-overlay')) hideModal();
            });
            const editStatusForm = document.getElementById('editStatusForm');
            editStatusForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentUserId = localStorage.getItem('chatUserId');
                const newStatus = document.getElementById('userStatus').value;
                if (currentUserId) {
                    try {
                        await updateUserData(currentUserId, { statusText: newStatus });
                        showCustomAlert('تم حفظ الحالة بنجاح.');
                        const currentUserIndex = (isUserDataReady() ? window.allUsersAndVisitorsData : []).findIndex(u => u.id === currentUserId);
                        if (currentUserIndex !== -1) {
                            window.allUsersAndVisitorsData[currentUserIndex].statusText = newStatus;
                        }
                        hideModal();
                    } catch (error) {
                        console.error("فشل تحديث الحالة:", error);
                        showCustomAlert('حدث خطأ أثناء حفظ الحالة.', 'error');
                    }
                }
            });
        }
        if (user) {
            document.getElementById('userStatus').value = user.statusText || '';
        }
        if (editStatusModal) {
            editStatusModal.classList.add('show');
        }
    };

    const showEditInfoModal = (user) => {
        let editInfoModal = document.getElementById('editInfoModal');
        if (!editInfoModal) {
            const modalHTML = `
                <div id="editInfoModal" class="edit-info-overlay">
                    <div class="edit-info-modal">
                        <div class="modal-header">
                            <h2>تعديل المعلومات</h2>
                            <span class="close-button" id="closeEditInfoModalBtn">&times;</span>
                        </div>
                        <div class="modal-body">
                            <form id="editInfoForm">
                                <div class="form-group">
                                    <textarea id="userBio" name="userBio" placeholder="اكتب نبذة عن نفسك..." maxlength="150"></textarea>
                                </div>
                                <div class="form-actions">
                                    <button type="submit" class="btn save-btn">حفظ</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            editInfoModal = document.getElementById('editInfoModal');
            const closeBtn = document.getElementById('closeEditInfoModalBtn');
            const hideModal = () => { if (editInfoModal) editInfoModal.classList.remove('show'); };
            if (closeBtn) closeBtn.addEventListener('click', hideModal);
            editInfoModal.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('edit-info-overlay')) hideModal();
            });
            const editInfoForm = document.getElementById('editInfoForm');
            editInfoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentUserId = localStorage.getItem('chatUserId');
                const newBio = document.getElementById('userBio').value;
                if (currentUserId) {
                    try {
                        await updateUserData(currentUserId, { bio: newBio });
                        showCustomAlert('تم حفظ المعلومات بنجاح.');
                        const currentUserIndex = (isUserDataReady() ? window.allUsersAndVisitorsData : []).findIndex(u => u.id === currentUserId);
                        if (currentUserIndex !== -1) {
                            window.allUsersAndVisitorsData[currentUserIndex].bio = newBio;
                        }
                        hideModal();
                    } catch (error) {
                        console.error("فشل تحديث المعلومات:", error);
                        showCustomAlert('حدث خطأ أثناء حفظ المعلومات.', 'error');
                    }
                }
            });
        }
        if (user) {
            document.getElementById('userBio').value = user.bio || '';
        }
        if (editInfoModal) {
            editInfoModal.classList.add('show');
        }
    };

    // حذف جميع أكواد تغيير كلمة المرور نهائياً (غير آمنة) 

    const showEditEmailModal = (user) => {
        let editEmailModal = document.getElementById('editEmailModal');
        if (!editEmailModal) {
            const modalHTML = `
                <div id="editEmailModal" class="edit-email-overlay">
                    <div class="edit-email-modal">
                        <div class="modal-header">
                            <h2>تعديل البريد الإلكتروني</h2>
                            <span class="close-button" id="closeEditEmailModalBtn">&times;</span>
                        </div>
                        <div class="modal-body">
                            <form id="editEmailForm">
                                <div class="form-group">
                                    <label for="currentEmail">البريد الإلكتروني الحالي:</label>
                                    <input type="text" id="currentEmail" name="currentEmail" readonly>
                                </div>
                                <div class="form-group">
                                    <label for="newEmail">البريد الإلكتروني الجديد:</label>
                                    <input type="email" id="newEmail" name="newEmail" required>
                                </div>
                                <div class="form-group">
                                    <label for="confirmNewEmail">تأكيد البريد الجديد:</label>
                                    <input type="email" id="confirmNewEmail" name="confirmNewEmail" required>
                                </div>
                                <div class="form-actions">
                                    <button type="submit" class="btn save-btn">حفظ البريد الجديد</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            editEmailModal = document.getElementById('editEmailModal');
            const closeBtn = document.getElementById('closeEditEmailModalBtn');
            const hideModal = () => { if (editEmailModal) editEmailModal.classList.remove('show'); };
            if (closeBtn) closeBtn.addEventListener('click', hideModal);
            editEmailModal.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('edit-email-overlay')) hideModal();
            });
            const editEmailForm = document.getElementById('editEmailForm');
            editEmailForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentUserId = localStorage.getItem('chatUserId');
                const newEmail = document.getElementById('newEmail').value;
                const confirmNewEmail = document.getElementById('confirmNewEmail').value;
                if (newEmail !== confirmNewEmail) {
                    showCustomAlert('البريد الإلكتروني وتأكيده غير متطابقين!', 'error');
                    return;
                }
                if (currentUserId) {
                    try {
    const user = auth.currentUser;
    if (user) {
        await updateEmail(user, newEmail);
        await updateUserData(currentUserId, { email: newEmail });
        const currentUserIndex = (isUserDataReady() ? window.allUsersAndVisitorsData : []).findIndex(u => u.id === currentUserId);
        if (currentUserIndex !== -1) {
            window.allUsersAndVisitorsData[currentUserIndex].email = newEmail;
        }
        showCustomAlert('تم حفظ البريد الإلكتروني بنجاح.');
        hideModal();
    }
} catch (error) {
    console.error("فشل تحديث البريد الإلكتروني:", error);
    if (error.code === 'auth/invalid-email') {
        showCustomAlert('صيغة البريد الإلكتروني غير صحيحة.', 'error');
    } else if (error.code === 'auth/requires-recent-login') {
        showCustomAlert('يجب عليك تسجيل الدخول مرة أخرى لتأكيد التغييرات.', 'error');
    } else if (error.code === 'auth/email-already-in-use') {
         showCustomAlert('هذا البريد الإلكتروني مستخدم بالفعل.', 'error');
    } else {
        showCustomAlert('حدث خطأ أثناء حفظ البريد الإلكتروني.', 'error');
    }
}
}
            });
        }
        if (user) {
            document.getElementById('currentEmail').value = user.email || 'لا يوجد بريد إلكتروني';
            document.getElementById('newEmail').value = '';
            document.getElementById('confirmNewEmail').value = '';
        }
        if (editEmailModal) {
            editEmailModal.classList.add('show');
        }
    };

    const editDetailsButton = document.getElementById('editDetailsButton');
    const editStatusButton = document.getElementById('editStatusButton');
    const editInfoButton = document.getElementById('editInfoButton');
    const editEmailButton = document.getElementById('editEmailButton');

    if (editDetailsButton) {
        editDetailsButton.addEventListener('click', (event) => {
            event.preventDefault();
            const currentUserId = localStorage.getItem('chatUserId');
            if (currentUserId) {
                const currentUserData = getCurrentUserDataSafely(currentUserId);
                if (currentUserData) {
                    showEditDetailsModal(currentUserData);
                }
            }
        });
    }
    if (editStatusButton) {
        editStatusButton.addEventListener('click', (event) => {
            event.preventDefault();
            const currentUserId = localStorage.getItem('chatUserId');
            if (currentUserId) {
                const currentUserData = getCurrentUserDataSafely(currentUserId);
                if (currentUserData) {
                    showEditStatusModal(currentUserData);
                }
            }
        });
    }
    if (editInfoButton) {
        editInfoButton.addEventListener('click', (event) => {
            event.preventDefault();
            const currentUserId = localStorage.getItem('chatUserId');
            if (currentUserId) {
                const currentUserData = getCurrentUserDataSafely(currentUserId);
                if (currentUserData) {
                    showEditInfoModal(currentUserData);
                }
            }
        });
    }
    if (editEmailButton) {
        editEmailButton.addEventListener('click', (event) => {
            event.preventDefault();
            const currentUserId = localStorage.getItem('chatUserId');
            if (currentUserId) {
                const currentUserData = getCurrentUserDataSafely(currentUserId);
                if (currentUserData) {
                    showEditEmailModal(currentUserData);
                }
            }
        });
    }
});