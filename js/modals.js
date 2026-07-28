// js/modals.js

// js/modals.js

import { RANK_IMAGE_MAP } from './constants.js';
import { uploadFileToCloudinary } from './cloudinary-utils.js';
import { updateUserData, addLike, removeLike, SYSTEM_USER, addOrReplaceNotification, acceptFriendRequest, rejectFriendRequest, cleanupOldNotifications } from './chat-firestore.js';
import { db, auth } from './firebase-config.js'; // تأكد من وجود هذا السطر
import { showCommandsModal } from './chat-commands-modal.js';
import { showNotification as showToastNotification } from './ui-helpers.js';
// --- Firebase Auth imports for password change modal ---
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "./auth-shim.js";
import { collection, query, orderBy, onSnapshot, where, getDocs, writeBatch } from "./firestore-shim.js";

// **متغيرات ودوال المودال الرئيسي**
// js/modals.js
// ... (الاستيرادات)
window.notificationsModalUnsubscribe = null;
window.RANK_IMAGE_MAP = RANK_IMAGE_MAP; 
// تعريف المتغيرات الرئيسية
const currentUserId = localStorage.getItem('chatUserId');
const notificationsBadge = document.getElementById('notifications-badge');

// **متغيرات ودوال المودال الرئيسي**
window.editProfileModal = null;
window.editProfileCloseButton = null;
// ... (بقية الكود)

const showLoadingSpinner = (buttonElement) => {
    const icon = buttonElement.querySelector('i');
    if (icon) icon.style.display = 'none';
    let spinner = buttonElement.querySelector('.spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.className = 'spinner';
        buttonElement.appendChild(spinner);
    }
    spinner.style.display = 'block';
};

const hideLoadingSpinner = (buttonElement) => {
    const icon = buttonElement.querySelector('i');
    if (icon) icon.style.display = 'block';
    const spinner = buttonElement.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
};

function createEditProfileModalHTML() {
    const modalHTML = `
        <div id="editProfileModal" class="modal-overlay">
            <div class="edit-profile-container">
                <div class="header-section-new">
                    <img id="profile-modal-inner-image" src="images/Interior.png" alt="صورة خلفية المستخدم" class="inner-profile-background-image">
                    <input type="file" id="innerImageUploadInput" accept="image/*" style="display: none;">
                    <input type="file" id="avatarUploadInput" accept="image/*" style="display: none;">
                    <div class="header-left-actions">
    <span class="header-icon close-profile-modal"><i class="fas fa-times"></i></span>
    <span id="view-profile-button" class="header-icon"><i class="fas fa-eye"></i></span>
    <span class="header-icon change-inner-image"><i class="fas fa-camera"></i></span>
    <span class="header-icon delete-inner-image"><i class="fas fa-trash-alt"></i></span>
</div>
                    <div class="header-right-profile">
                        <div class="user-main-section-wrapper">
                            <div class="likes-and-level">
                                <div class="likes"><span>14</span> <span class="like-icon"><i class="fas fa-thumbs-up"></i></span></div>
                                <div class="level"><span>3</span> <span class="level-icon"><i class="fas fa-star"></i></span></div>
                            </div>
                            <div class="user-main-info">
                                <div class="user-avatar-wrapper">
                                    <img id="profile-modal-avatar" src="https://via.placeholder.com/150/000000/FFFFFF?text=User" alt="صورة المستخدم" />
                                    <div class="avatar-overlay-buttons">
                                        <span class="camera-overlay"><i class="fas fa-camera"></i></span>
                                        <span class="trash-overlay"><i class="fas fa-trash-alt"></i></span>
                                    </div>
                                </div>
                                <div class="user-info-section">
                                    <div class="user-details">
                                        <div class="user-rank-container">
                                            <div class="rank-info">
                                                <img id="profile-modal-rank-image" src="" alt="Rank Image" class="rank-image">
                                                <p class="user-rank" id="profile-modal-user-rank"></p>
                                            </div>
                                        </div>
                                        <div class="user-name-container">
                                            <p class="user-name-display" id="profile-modal-username-display"></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="tabs-container">
                    <button class="tab-button active" data-tab="account">حساب</button>
                    <button class="tab-button" data-tab="gifts">الهدايا</button>
                    <button class="tab-button" data-tab="more">المزيد</button>
                </div>
                <div class="tab-content" id="account-tab-content">
                    <ul class="profile-options-list">
                      <li>
                        <button id="editDetailsButton" class="option-btn">
                            <span class="option-icon"><i class="fas fa-user-edit"></i></span>
                            <span class="option-text">تعديل بياناتك</span>
                        </button>
                      </li>
                      <li>
                        <button id="editInfoButton" class="option-btn">
                            <span class="option-icon"><i class="fas fa-user-edit"></i></span>
                            <span class="option-text">تعديل المعلومات</span>
                        </button>
                      </li>
                      <li>
                        <button id="editStatusButton" class="option-btn">
                            <span class="option-icon"><i class="fas fa-pencil-alt"></i></span>
                            <span class="option-text">تعديل الحالة</span>
                        </button>
                      </li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-palette"></i></span><span class="option-text">تغيير لون او خط الاسم</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-font"></i></span><span class="option-text">تغيير لون او خط الرسالة</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-volume-up"></i></span><span class="option-text">اعدادات الأصوات</span></button></li>
                    </ul>
                </div>
                <div class="tab-content" id="gifts-tab-content" style="display: none;"><p style="color: #333; text-align: center; padding: 20px;">لا توجد هدايا لعرضها حاليًا.</p></div>
                <div class="tab-content" id="more-tab-content" style="display: none;">
                    <ul class="profile-options-list">
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-user-friends"></i></span><span class="option-text">تعديل قائمة الأصدقاء</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-ban"></i></span><span class="option-text">قائمة المحظورين</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-share-alt"></i></span><span class="option-text">إعدادات المشاركة</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-shield-alt"></i></span><span class="option-text">إعدادات الخصوصية</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-globe"></i></span><span class="option-text">اللغة / الموقع</span></button></li>
                        <li><button id="editEmailButton" class="option-btn"><span class="option-icon"><i class="fas fa-envelope"></i></span><span class="option-text">تعديل البريد الإلكتروني</span></button></li>
                        <li>
                            <button id="changePasswordButton" class="option-btn">
                                <span class="option-icon"><i class="fas fa-key"></i></span>
                                <span class="option-text">تغيير رمز حسابك</span>
                            </button>
                        </li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-sign-out-alt"></i></span><span class="option-text">تسجيل الخروج من الحساب</span></button></li>
                        <li><button class="option-btn"><span class="option-icon"><i class="fas fa-trash-alt"></i></span><span class="option-text">حذف عضوية</span></button></li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

const viewProfileBtn = document.getElementById('view-profile-button');
if (viewProfileBtn) {
    viewProfileBtn.addEventListener('click', function() {
        // أغلق مودال التعديل أولاً
        window.hideEditProfileModal();
        // بعد اختفائه، اعرض مودال عرض الملف الشخصي
        setTimeout(() => {
            const currentUserId = localStorage.getItem('chatUserId');
            // ابحث عن بيانات المستخدم الحالي في جميع المستخدمين
            let userData = null;
            if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                userData = window.allUsersAndVisitorsData.find(u => u.id === currentUserId);
            }
            if (userData) {
                window.showViewProfileModal(userData, window.allUsersAndVisitorsData);
            }
        }, 220); // عدل الرقم إذا أردت حسب سرعة الإغلاق/الفتح
    });
}

    window.editProfileModal = document.getElementById('editProfileModal');
    window.editProfileCloseButton = window.editProfileModal ? window.editProfileModal.querySelector('.header-left-actions .close-profile-modal') : null;

    if (window.editProfileCloseButton) {
        window.editProfileCloseButton.addEventListener('click', window.hideEditProfileModal);
    }

    const innerImageUploadInput = document.getElementById('innerImageUploadInput');
    const avatarUploadInput = document.getElementById('avatarUploadInput');
    const changeInnerImageBtn = window.editProfileModal.querySelector('.change-inner-image');
    const deleteInnerImageBtn = window.editProfileModal.querySelector('.delete-inner-image');
    const changeAvatarBtn = window.editProfileModal.querySelector('.avatar-overlay-buttons .camera-overlay');
    const deleteAvatarBtn = window.editProfileModal.querySelector('.avatar-overlay-buttons .trash-overlay');

    if (changeAvatarBtn) changeAvatarBtn.addEventListener('click', () => { avatarUploadInput.click(); });
    if (changeInnerImageBtn) changeInnerImageBtn.addEventListener('click', () => { innerImageUploadInput.click(); });

    if (deleteInnerImageBtn) {
        deleteInnerImageBtn.addEventListener('click', async () => {
            const currentUserId = localStorage.getItem('chatUserId');
            const defaultInnerImage = 'images/Interior.png';
            if (currentUserId) {
                await updateUserData(currentUserId, { innerImage: defaultInnerImage });
                const innerImageElement = document.getElementById('profile-modal-inner-image');
                if (innerImageElement) innerImageElement.src = defaultInnerImage;
                localStorage.setItem('chatUserInnerImage', defaultInnerImage);
                if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                    const currentUserIndex = window.allUsersAndVisitorsData.findIndex(user => user.id === currentUserId);
                    if (currentUserIndex !== -1) window.allUsersAndVisitorsData[currentUserIndex].innerImage = defaultInnerImage;
                }
            }
        });
    }

    if (deleteAvatarBtn) {
        deleteAvatarBtn.addEventListener('click', async () => {
            const currentUserId = localStorage.getItem('chatUserId');
            const defaultAvatar = 'images/default-user.png';
            if (currentUserId) {
                await updateUserData(currentUserId, { avatar: defaultAvatar });
                const profileModalAvatar = document.getElementById('profile-modal-avatar');
                if (profileModalAvatar) profileModalAvatar.src = defaultAvatar;
                const userProfileImage = document.getElementById('user-profile-image');
                if (userProfileImage) userProfileImage.src = defaultAvatar;
                localStorage.setItem('chatUserAvatar', defaultAvatar);
                if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                    const currentUserIndex = window.allUsersAndVisitorsData.findIndex(user => user.id === currentUserId);
                    if (currentUserIndex !== -1) window.allUsersAndVisitorsData[currentUserIndex].avatar = defaultAvatar;
                }
                const modalProfileImageInDropdown = document.getElementById('modal-profile-image');
                if (modalProfileImageInDropdown) modalProfileImageInDropdown.src = defaultAvatar;
            }
        });
    }

    if (innerImageUploadInput) {
        innerImageUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                showLoadingSpinner(deleteInnerImageBtn);
                try {
                    const compressedFile = await compressImage(file, 0.7);
                    const imageUrl = await uploadFileToCloudinary(compressedFile);
                    if (imageUrl) {
                        const currentUserId = localStorage.getItem('chatUserId');
                        if (currentUserId) {
                            await updateUserData(currentUserId, { innerImage: imageUrl });
                            const innerImageElement = document.getElementById('profile-modal-inner-image');
                            if (innerImageElement) innerImageElement.src = imageUrl;
                            localStorage.setItem('chatUserInnerImage', imageUrl);
                            if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                                const currentUserIndex = window.allUsersAndVisitorsData.findIndex(user => user.id === currentUserId);
                                if (currentUserIndex !== -1) window.allUsersAndVisitorsData[currentUserIndex].innerImage = imageUrl;
                            }
                        }
                    } else { alert('فشل رفع الصورة الداخلية.'); }
                } catch (error) {
                    console.error('فشل رفع الصورة الداخلية:', error);
                    alert('حدث خطأ أثناء رفع الصورة الداخلية.');
                } finally {
                    hideLoadingSpinner(deleteInnerImageBtn);
                }
            }
            event.target.value = '';
        });
    }

    if (avatarUploadInput) {
        avatarUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                showLoadingSpinner(deleteAvatarBtn);
                try {
                    const compressedFile = await compressImage(file, 0.7);
                    const imageUrl = await uploadFileToCloudinary(compressedFile);
                    if (imageUrl) {
                        const currentUserId = localStorage.getItem('chatUserId');
                        if (currentUserId) {
                            await updateUserData(currentUserId, { avatar: imageUrl });
                            const profileModalAvatar = document.getElementById('profile-modal-avatar');
                            if (profileModalAvatar) profileModalAvatar.src = imageUrl;
                            const userProfileImage = document.getElementById('user-profile-image');
                            if (userProfileImage) userProfileImage.src = imageUrl;
                            localStorage.setItem('chatUserAvatar', imageUrl);
                            if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                                const currentUserIndex = window.allUsersAndVisitorsData.findIndex(user => user.id === currentUserId);
                                if (currentUserIndex !== -1) window.allUsersAndVisitorsData[currentUserIndex].avatar = imageUrl;
                            }
                            const modalProfileImageInDropdown = document.getElementById('modal-profile-image');
                            if (modalProfileImageInDropdown) modalProfileImageInDropdown.src = imageUrl;
                        }
                    } else { alert('فشل رفع صورة البروفايل.'); }
                } catch (error) {
                    console.error('فشل رفع صورة البروفايل:', error);
                    alert('حدث خطأ أثناء رفع صورة البروفايل.');
                } finally {
                    hideLoadingSpinner(deleteAvatarBtn);
                }
            }
            event.target.value = '';
        });
    }

    // ---- تفعيل مودال تغيير كلمة المرور من تبويب المزيد ----
    const changePasswordButton = document.getElementById('changePasswordButton');
    if (changePasswordButton) {
        changePasswordButton.onclick = showChangePasswordModal;
    }

    // --- منطق التبويبات
    const tabButtons = window.editProfileModal.querySelectorAll('.tabs-container .tab-button');
    const tabContents = window.editProfileModal.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.style.display = 'none');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.style.display = 'none');
            button.classList.add('active');
            const targetTabId = button.getAttribute('data-tab') + '-tab-content';
            const targetTabContent = document.getElementById(targetTabId);
            if (targetTabContent) targetTabContent.style.display = 'block';
        });
    });
    const accountTabContent = document.getElementById('account-tab-content');
    if (accountTabContent) accountTabContent.style.display = 'block';
}

window.hideEditProfileModal = function() {
    if (window.editProfileModal && window.editProfileModal.classList.contains('show')) {
        window.editProfileModal.classList.remove('show');
        document.removeEventListener('click', window.handleEditProfileModalOutsideClick);
    }
};

window.updateEditProfileModalContent = async function(user) {
    if (!window.editProfileModal) {
        console.warn("Edit Profile Modal not yet created when trying to update content.");
        return;
    }
    const profileModalAvatar = document.getElementById('profile-modal-avatar');
    const userNameDisplay = document.getElementById('profile-modal-username-display');
    const userRankDisplay = document.getElementById('profile-modal-user-rank');
    const profileModalRankImage = document.getElementById('profile-modal-rank-image');
    const innerImageElement = document.getElementById('profile-modal-inner-image');
    const isVisitor = user && user.rank === 'زائر';
    const changeInnerImageBtn = window.editProfileModal.querySelector('.change-inner-image');
    const deleteInnerImageBtn = window.editProfileModal.querySelector('.delete-inner-image');
    const changeAvatarBtn = window.editProfileModal.querySelector('.avatar-overlay-buttons .camera-overlay');
    const deleteAvatarBtn = window.editProfileModal.querySelector('.avatar-overlay-buttons .trash-overlay');

    if (changeInnerImageBtn) changeInnerImageBtn.style.display = isVisitor ? 'none' : '';
    if (deleteInnerImageBtn) deleteInnerImageBtn.style.display = isVisitor ? 'none' : '';
    if (changeAvatarBtn) changeAvatarBtn.style.display = isVisitor ? 'none' : '';
    if (deleteAvatarBtn) deleteAvatarBtn.style.display = isVisitor ? 'none' : '';

    if (user) {
        if (profileModalAvatar) profileModalAvatar.src = user.avatar || 'https://i.imgur.com/Uo9V2Yx.png';
        if (userNameDisplay) userNameDisplay.textContent = user.name || 'غير معروف';
        const userRank = user.rank || 'زائر';
        const userLevel = user.level || 1;
        const userLikes = user.likes ? user.likes.length : 0;
        if (userRankDisplay) userRankDisplay.textContent = userRank;
        if (profileModalRankImage) {
            const rankImageSrc = RANK_IMAGE_MAP[userRank] || RANK_IMAGE_MAP['default'];
            profileModalRankImage.src = rankImageSrc;
            profileModalRankImage.alt = userRank ? `${userRank} Image` : 'Default Rank Image';
        }
        const likesElement = window.editProfileModal.querySelector('.likes span');
        if (likesElement) likesElement.textContent = userLikes;
        const levelElement = window.editProfileModal.querySelector('.level span');
        if (levelElement) levelElement.textContent = userLevel;
        if (innerImageElement) innerImageElement.src = user.innerImage || 'images/Interior.png';
    } else {
        if (profileModalAvatar) profileModalAvatar.src = 'https://i.imgur.com/Uo9V2Yx.png';
        if (userNameDisplay) userNameDisplay.textContent = 'زائر';
        if (userRankDisplay) userRankDisplay.textContent = 'زائر';
        if (profileModalRankImage) profileModalRankImage.src = RANK_IMAGE_MAP['default'];
        if (innerImageElement) innerImageElement.src = 'images/Interior.png';
        const likesElement = window.editProfileModal.querySelector('.likes span');
        if (likesElement) likesElement.textContent = '0';
        const levelElement = window.editProfileModal.querySelector('.level span');
        if (levelElement) levelElement.textContent = '1';
    }
};

document.addEventListener('DOMContentLoaded', createEditProfileModalHTML);

// ---- مودال تغيير كلمة المرور الآمن مع Firestore ----
import { doc, getDoc, updateDoc } from "./firestore-shim.js";

export const showChangePasswordModal = () => {
    let changePasswordModal = document.getElementById('changePasswordModal');
    if (!changePasswordModal) {
        const modalHTML = `
            <div id="changePasswordModal" class="change-password-overlay">
                <div class="change-password-modal">
                    <div class="modal-header">
                        <h2>تغيير كلمة المرور</h2>
                        <span class="close-button" id="closeChangePasswordModalBtn">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="changePasswordForm" autocomplete="off">
                            <div class="form-group">
                                <label for="currentPassword">كلمة المرور الحالية:</label>
                                <input type="password" id="currentPassword" required autocomplete="current-password">
                            </div>
                            <div class="form-group">
                                <label for="newPassword">كلمة المرور الجديدة:</label>
                                <input type="password" id="newPassword" required autocomplete="new-password">
                            </div>
                            <div class="form-group">
                                <label for="confirmNewPassword">تأكيد كلمة المرور الجديدة:</label>
                                <input type="password" id="confirmNewPassword" required autocomplete="new-password">
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn save-btn">حفظ</button>
                            </div>
                            <div id="changePasswordAlert" style="margin-top:10px;font-size:15px;min-height:22px;"></div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        changePasswordModal = document.getElementById('changePasswordModal');
        
        // زر الإغلاق
        const closeBtn = document.getElementById('closeChangePasswordModalBtn');
        const hideModal = () => {
            if (changePasswordModal) changePasswordModal.classList.remove('show');
        };
        if (closeBtn) closeBtn.addEventListener('click', hideModal);

        // إغلاق عند الضغط على خلفية المودال فقط
        changePasswordModal.addEventListener('click', (e) => {
            if (e.target === changePasswordModal) hideModal();
        });

        // معالجة إرسال النموذج (Firestore فقط)
        const changePasswordForm = document.getElementById('changePasswordForm');
        const alertDiv = document.getElementById('changePasswordAlert');
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertDiv.textContent = '';
            const currentPassword = document.getElementById('currentPassword').value.trim();
            const newPassword = document.getElementById('newPassword').value.trim();
            const confirmNewPassword = document.getElementById('confirmNewPassword').value.trim();

            if (newPassword.length < 6) {
                alertDiv.textContent = "كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أكثر.";
                alertDiv.style.color = "red";
                return;
            }
            if (newPassword !== confirmNewPassword) {
                alertDiv.textContent = "تأكيد كلمة المرور غير متطابق.";
                alertDiv.style.color = "red";
                return;
            }

            // جلب بيانات المستخدم الحالي من Firestore
            const currentUserId = localStorage.getItem('chatUserId');
            if (!currentUserId) {
                alertDiv.textContent = "يجب أن تسجل دخول أولاً.";
                alertDiv.style.color = "red";
                return;
            }

            // جلب الوثيقة: هل هو زائر أم مستخدم؟
            let userDocRef = doc(db, 'users', currentUserId);
            let userType = localStorage.getItem('userType');
            if (userType === 'visitor') {
                userDocRef = doc(db, 'visitors', currentUserId);
            }

            try {
                const userDocSnap = await getDoc(userDocRef);
                if (!userDocSnap.exists()) {
                    alertDiv.textContent = "تعذر جلب بيانات الحساب.";
                    alertDiv.style.color = "red";
                    return;
                }
                const userData = userDocSnap.data();
                const oldPassword = userData.password || '';
                if (currentPassword !== oldPassword) {
                    alertDiv.textContent = "كلمة المرور الحالية غير صحيحة.";
                    alertDiv.style.color = "red";
                    return;
                }

                // تحديث كلمة المرور في الداتا
                await updateDoc(userDocRef, { password: newPassword });
                alertDiv.textContent = "تم تغيير كلمة المرور بنجاح!";
                alertDiv.style.color = "green";
                setTimeout(() => hideModal(), 1500);

            } catch (error) {
                console.error("خطأ أثناء تغيير كلمة المرور:", error);
                alertDiv.textContent = "حدث خطأ أثناء تغيير كلمة المرور. حاول مرة أخرى.";
                alertDiv.style.color = "red";
            }
        });
    }
    // تهيئة الحقول عند كل إظهار
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    document.getElementById('changePasswordAlert').textContent = '';
    // إظهار المودال
    changePasswordModal.classList.add('show');
};

// -------------------------------------------------------------------
// منطق مودال الإعدادات (إذا كنت ستستخدمه)
// -------------------------------------------------------------------

// المتغيرات العالمية لمودال الإعدادات
window.settingsModal = null;
window.settingsCloseButton = null;

function createSettingsModalHTML() {
    const modalHTML = `
        <div id="settingsModal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>إعدادات التطبيق</h2>
                    <span class="close-button"><i class="fas fa-times"></i></span>
                </div>
                <div class="modal-body">
                    <p style="color: #333;">خيارات الإعدادات هنا.</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    window.settingsModal = document.getElementById('settingsModal');
    window.settingsCloseButton = window.settingsModal ? window.settingsModal.querySelector('.close-button') : null;
    if (window.settingsCloseButton) {
        window.settingsCloseButton.addEventListener('click', window.hideSettingsModal);
    }
}

window.hideSettingsModal = function() {
    if (window.settingsModal && window.settingsModal.classList.contains('show')) {
        window.settingsModal.classList.remove('show');
        document.removeEventListener('click', window.handleSettingsModalOutsideClick);
    }
};

window.handleSettingsModalOutsideClick = function(event) {
    const settingsButton = document.getElementById('settingsButton');
    if (window.settingsModal && !window.settingsModal.contains(event.target) && event.target !== settingsButton) {
        window.hideSettingsModal();
    }
};

document.addEventListener('DOMContentLoaded', createSettingsModalHTML);

// -------------------------------------------------------------------
// منطق مودال معلومات المستوى (Level Info Modal)
// -------------------------------------------------------------------

// دالة لإنشاء هيكل HTML لمودال معلومات// دالة لإنشاء هيكل HTML لمودال معلومات المستوى وإضافته إلى DOM
function createLevelInfoModalHTML() {
    const modalHTML = `
        <div id="level-info-backdrop" class="level-info-backdrop"></div>
        <div id="level-info-modal" class="level-info-modal">
            <div class="modal-content">
                <button class="close-btn">&times;</button>
                <h3>معلومات المستوى</h3>
                <div class="level-info-card">
                    <div class="level-item">
                        <span class="label">الرتبة:</span>
                        <span id="modal-level-rank" class="value"></span>
                    </div>
                    <div class="level-item">
                        <span class="label">المستوى الحالي:</span>
                        <span id="modal-current-level" class="value"></span>
                    </div>
                    <div class="level-item">
                        <span class="label">إجمالي نقاط الخبرة:</span>
                        <span id="modal-total-exp" class="value"></span>
                    </div>
                    <div class="progress-bar-container">
                        <div id="modal-exp-progress" class="progress-bar"></div>
                    </div>
                </div>
                <button class="close-button-footer">إغلاق</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const levelInfoModal = document.getElementById('level-info-modal');
    const closeLevelModalBtn = levelInfoModal.querySelector('.close-btn');
    const closeFooterBtn = levelInfoModal.querySelector('.close-button-footer');

    closeLevelModalBtn.addEventListener('click', hideLevelInfoModal);
    closeFooterBtn.addEventListener('click', hideLevelInfoModal);
}

// دالة لعرض مودال معلومات المستوى وتحديث// دالة لعرض مودال معلومات المستوى وتحديث محتواه
export function showLevelInfoModal(user) {
    const levelInfoModal = document.getElementById('level-info-modal');
    const backdrop = document.getElementById('level-info-backdrop'); // جلب عنصر الخلفية
    if (!levelInfoModal || !backdrop) {
        console.error("Level Info Modal or backdrop not found.");
        return;
    }

    // تحديث المحتوى بناءً على بيانات المستخدم
    document.getElementById('modal-level-rank').textContent = user.levelRank || 'مبتدئ';
    document.getElementById('modal-current-level').textContent = user.level || 1;
    document.getElementById('modal-total-exp').textContent = user.totalExp || 0;
    document.getElementById('modal-exp-progress').style.width = `${user.expProgress || 0}%`;

    // عرض المودال والخلفية
    backdrop.classList.add('show');
    levelInfoModal.classList.add('show');
}

// دالة لإخفاء مودال معلومات المستوى
export function hideLevelInfoModal() {
    const levelInfoModal = document.getElementById('level-info-modal');
    const backdrop = document.getElementById('level-info-backdrop'); // جلب عنصر الخلفية
    if (levelInfoModal && backdrop) {
        levelInfoModal.classList.remove('show');
        backdrop.classList.remove('show');
    }
}

// استدعاء دالة إنشاء الهيكل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', createLevelInfoModalHTML);

window.g_viewProfileModal = null;

function createViewProfileModalHTML() {
    const modalHTML = `
        <div id="viewProfileModal" class="modal-overlay">
            <div class="edit-profile-container">
                <div class="header-section-new">
                    <img id="view-profile-modal-inner-image" src="images/Interior.png" alt="صورة خلفية المستخدم" class="inner-profile-background-image">
                  <div class="header-left-actions" style="flex-direction: row-reverse;">
    <span class="header-icon edit-profile-btn" style="display:none;"><i class="fas fa-edit"></i></span>
    <span class="header-icon menu-profile-modal"><i class="fas fa-bars"></i></span>
    <span class="header-icon close-profile-modal"><i class="fas fa-times"></i></span>
</div>
                    <div class="header-right-profile">
                        <div class="user-main-section-wrapper">
                         <div class="likes-and-level">
    <div id="view-profile-likes" class="likes" data-user-id="">
        <span>-</span> <span class="like-icon"><i class="fas fa-thumbs-up"></i></span>
    </div>
    <div class="level">
        <span>-</span> <span class="level-icon"><i class="fas fa-star"></i></span>
    </div>
                            </div>
                            <div class="user-main-info">
                                <div class="user-avatar-wrapper">
                                    <img id="view-profile-modal-avatar" src="https://via.placeholder.com/150/000000/FFFFFF?text=User" alt="صورة المستخدم" />
                                </div>
                                <div class="user-info-section">
                                    <div class="user-details">
                                        <div class="user-rank-container">
                                            <div class="rank-info">
                                                <img id="view-profile-modal-rank-image" src="" alt="Rank Image" class="rank-image">
                                                <p class="user-rank" id="view-profile-modal-user-rank"></p>
                                            </div>
                                        </div>
                                        <div class="user-name-container">
                                            <p class="user-name-display" id="view-profile-modal-username-display"></p>
                                        </div>
                                        <p class="user-status-display" id="view-profile-modal-status-display"></p>
                                    </div>
                                </div>
                            </div>
                            
                            <div id="view-profile-music-container" style="padding: 10px 20px; text-align: center; display: none;">
                                <audio id="view-profile-music-player" controls style="width: 100%; height: 35px;"></audio>
                                <p id="view-profile-music-message" style="color: #999; font-size: 11px; margin-top: 5px;">موسيقى الملف الشخصي</p>
                            </div>
                            </div>
                    </div>
                </div>
                <div class="tabs-container">
    <button class="tab-button active" data-tab="account">حساب</button>
    <button class="tab-button" data-tab="more">المعلومات</button>
    <button class="tab-button" data-tab="gifts">الهدايا</button>
</div>
              <div class="tab-content" id="view-account-tab-content">
    <ul class="profile-details-list">
        <li>
            <span class="detail-label">العمر:</span>
            <span class="detail-value" id="view-profile-age"></span>
        </li>
        <li>
            <span class="detail-label">الجنس:</span>
            <span class="detail-value" id="view-profile-gender"></span>
        </li>
        <li>
            <span class="detail-label">المستوى:</span>
            <span class="detail-value" id="view-profile-level"></span>
        </li>
    </ul>
</div>
<div class="tab-content" id="view-more-tab-content" style="display: none;">
    <p class="user-info-text" id="view-profile-info"></p>
    <p class="no-info-text" id="no-view-profile-info-message" style="display: none; color: #777; text-align: center; padding: 20px;">لا توجد معلومات إضافية لعرضها.</p>
</div>
<div class="tab-content" id="view-gifts-tab-content" style="display: none;">
    <p style="color: #333; text-align: center; padding: 20px;">لا توجد هدايا لعرضها حاليًا.</p>
</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
// ... (بقية الدالة كما كانت)


    window.g_viewProfileModal = document.getElementById('viewProfileModal');
    const closeButton = window.g_viewProfileModal.querySelector('.close-profile-modal');
    if (closeButton) {
        closeButton.addEventListener('click', window.hideViewProfileModal);
    }
    
    const menuBtn = window.g_viewProfileModal.querySelector('.menu-profile-modal');
if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        // اجلب بيانات المستخدم المعروض حالياً
        const currentProfileUserId = window.g_viewProfileModal.getAttribute('data-user-id');
        let userData = null;
        if (window.g_viewProfileModal._currentUserData) {
            userData = window.g_viewProfileModal._currentUserData;
        } else if (window.allUsersAndVisitorsData && currentProfileUserId) {
            userData = window.allUsersAndVisitorsData.find(u => u.id === currentProfileUserId);
        }
        showCommandsModal(userData || {}, null);
    });
}

const editBtn = window.g_viewProfileModal.querySelector('.edit-profile-btn');
if (editBtn) {
    editBtn.addEventListener('click', function() {
        const mode = editBtn.getAttribute('data-edit-mode');
        if (mode === 'self') {
            // فتح مودال تعديل ملفك الشخصي
            window.hideViewProfileModal();
            setTimeout(() => {
                if (!window.editProfileModal) createEditProfileModalHTML();
                window.editProfileModal.classList.add('show');
                if (window.updateEditProfileModalContent && window.g_viewProfileModal._currentUserData) {
                    window.updateEditProfileModalContent(window.g_viewProfileModal._currentUserData);
                }
            }, 220);
        } else if (mode === 'admin') {
        console.log('زر القلم الإداري ضُغط');
        window.hideViewProfileModal();
        setTimeout(() => {
            showAdminEditUserModal(window.g_viewProfileModal._currentUserData);
        }, 220);
    }
});
}
    // منطق التبويبات (Tabs)
    const tabButtons = window.g_viewProfileModal.querySelectorAll('.tabs-container .tab-button');
    const tabContents = window.g_viewProfileModal.querySelectorAll('.tab-content');

    tabContents.forEach(content => content.style.display = 'none');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.style.display = 'none');

            button.classList.add('active');
            const targetTabId = 'view-' + button.getAttribute('data-tab') + '-tab-content';
            const targetTabContent = document.getElementById(targetTabId);
            if (targetTabContent) {
                targetTabContent.style.display = 'block';
            }
        });
    });

    const accountTabContent = document.getElementById('view-account-tab-content');
    if (accountTabContent) {
        accountTabContent.style.display = 'block';
    }
}

// تأكد من أنك قمت باستيراد دالة addLike من ملف chat-firestore.js
// import { addLike } from './chat-firestore.js';

// في ملف js/modals.js
// تأكد من استيراد كلتا الدالتين
window.showViewProfileModal = function(userData, allUsersAndVisitorsData) {
    if (!window.g_viewProfileModal) {
        // تأكد من أنك قمت بتعديل دالة createViewProfileModalHTML أولاً لإضافة مشغل الصوت!
        createViewProfileModalHTML();
    }
    
    // ✨ خطوة 1: إيقاف أي موسيقى سابقة لضمان عدم التداخل
    window.hideViewProfileModal(); 
    
    window.g_viewProfileModal._currentUserData = userData;
    window.g_viewProfileModal.setAttribute('data-user-id', userData.id || '');

    const targetUser = allUsersAndVisitorsData.find(user => user.id === userData.id);

    if (targetUser) {
        // تحديث المعلومات الأساسية للملف الشخصي
        document.getElementById('view-profile-modal-avatar').src = targetUser.avatar || 'images/default-user.png';
        document.getElementById('view-profile-modal-username-display').textContent = targetUser.name || 'غير معروف';
        document.getElementById('view-profile-modal-user-rank').textContent = targetUser.rank || 'زائر';
        document.getElementById('view-profile-modal-rank-image').src = RANK_IMAGE_MAP[targetUser.rank] || 'images/default-rank.png';
        document.getElementById('view-profile-modal-inner-image').src = targetUser.innerImage || 'images/Interior.png';
        document.getElementById('view-profile-modal-status-display').textContent = targetUser.statusText || '';
        
        // ✨ خطوة 2: منطق الأغنية الجديدة
                // ✨ خطوة 2: منطق الأغنية الجديدة مع تقرير الكونسول ✨
        const musicPlayer = document.getElementById('view-profile-music-player');
        const musicContainer = document.getElementById('view-profile-music-container');
        const musicMessage = document.getElementById('view-profile-music-message');

        if (musicPlayer && musicContainer) {
            if (targetUser.musicUrl) {
                musicPlayer.src = targetUser.musicUrl;
                if (musicMessage) musicMessage.textContent = `موسيقى ملف ${targetUser.name || 'هذا المستخدم'}`;
                musicContainer.style.display = 'block';
                musicPlayer.load(); // تحميل الأغنية

                // محاولة التشغيل التلقائي مع التعامل مع الحظر
                musicPlayer.play().then(() => {
                    console.log(`✅ تم تشغيل الموسيقى بنجاح للمستخدم: ${targetUser.name || targetUser.id}`);
                }).catch(e => {
                    // رسالة تفيد بأن المتصفح حظر التشغيل التلقائي
                    console.warn(`⚠️ فشل التشغيل التلقائي للموسيقى للمستخدم ${targetUser.name || targetUser.id}. السبب: ${e.name} - يتطلب تفاعل من المستخدم.`, e);
                }); 
            } else {
                musicPlayer.src = '';
                musicContainer.style.display = 'none';
                console.log(`ℹ️ لا يوجد رابط موسيقى للملف الشخصي للمستخدم: ${targetUser.name || targetUser.id}`);
            }
        }
        // ✨ نهاية منطق الأغنية الجديدة

        // ✨ نهاية منطق الأغنية الجديدة
        
        // تحديث معلومات الإعجابات والمستوى
        const likesElement = document.querySelector('#viewProfileModal .likes span');
        const levelElement = document.querySelector('#viewProfileModal .level span');
        const likesContainer = document.querySelector('#viewProfileModal .likes');
        const likeIcon = document.querySelector('#viewProfileModal .like-icon i');

        const likes = targetUser.likes ? targetUser.likes.length : 0;
        const level = targetUser.level || 1;
        likesElement.textContent = likes;
        levelElement.textContent = level;

        const currentUserId = localStorage.getItem('chatUserId');
        const hasLiked = targetUser.likes && targetUser.likes.includes(currentUserId);
        
        // إزالة مستمع الحدث السابق لتجنب التكرار
        likesContainer.removeEventListener('click', likesContainer._listener);

        if (currentUserId && currentUserId !== targetUser.id) {
            likesContainer.style.cursor = 'pointer';

            if (hasLiked) {
                likesContainer.classList.add('already-liked');
                likeIcon.classList.remove('fa-regular');
                likeIcon.classList.add('fa-solid');
            } else {
                likesContainer.classList.remove('already-liked');
                likeIcon.classList.remove('fa-solid');
                likeIcon.classList.add('fa-regular');
            }

            const newListener = async () => {
                const likedUserId = targetUser.id;
                const userIndex = allUsersAndVisitorsData.findIndex(u => u.id === likedUserId);

                if (hasLiked) {
                    const didRemove = await removeLike(currentUserId, likedUserId);
                    if (didRemove) {
                        if (userIndex !== -1) {
                            const likeIndex = allUsersAndVisitorsData[userIndex].likes.indexOf(currentUserId);
                            if (likeIndex > -1) {
                                allUsersAndVisitorsData[userIndex].likes.splice(likeIndex, 1);
                            }
                        }
                        likesElement.textContent = likes - 1;
                        likesContainer.classList.remove('already-liked');
                        likeIcon.classList.remove('fa-solid');
                        likeIcon.classList.add('fa-regular');
                        likesContainer.removeEventListener('click', likesContainer._listener);
                        showViewProfileModal(userData, allUsersAndVisitorsData);
                    }
                } else {
                    const didLike = await addLike(currentUserId, likedUserId);
                    if (didLike) {
                        if (userIndex !== -1) {
                            if (!allUsersAndVisitorsData[userIndex].likes) {
                                allUsersAndVisitorsData[userIndex].likes = [];
                            }
                            allUsersAndVisitorsData[userIndex].likes.push(currentUserId);
                        }
                        likesElement.textContent = likes + 1;
                        likesContainer.classList.add('already-liked');
                        likeIcon.classList.remove('fa-regular');
                        likeIcon.classList.add('fa-solid');
                        likesContainer.removeEventListener('click', likesContainer._listener);

                        // ✨ إرسال إشعار "أعجب بملفك الشخصي" باسم وصورة الشخص الذي أعجب، وليس النظام.
                        // ✨ يحلّ محل أي إشعار إعجاب سابق من نفس هذا الشخص تحديدًا (وليس كل
                        // الإعجابات) حتى لا يتكرر الإشعار لو ألغى إعجابه ثم أعجب مرة أخرى.
                        const likerData = (window.allUsersAndVisitorsData || allUsersAndVisitorsData).find(u => u.id === currentUserId);
                        if (likerData) {
                            const likerSender = {
                                id: likerData.id,
                                username: likerData.name,
                                avatar: likerData.avatar,
                                rank: likerData.rank
                            };
                            addOrReplaceNotification('أعجب بملفك الشخصي', likerSender, likedUserId, 'like', { scopeToSender: true });
                        }

                        showViewProfileModal(userData, allUsersAndVisitorsData);
                    }
                }
            };
            
            likesContainer.addEventListener('click', newListener);
            likesContainer._listener = newListener;
            
        } else {
            likesContainer.style.cursor = 'default';
        }
        
        // ** إضافة الكود الجديد لتحديث محتوى تبويب "حساب" **
        document.getElementById('view-profile-age').textContent = targetUser.age || 'غير محدد';
        document.getElementById('view-profile-gender').textContent = targetUser.gender || 'غير محدد';
        document.getElementById('view-profile-level').textContent = targetUser.level || 1;

        // ** إضافة الكود الجديد لتحديث محتوى تبويب "المعلومات" **
        const userbioElement = document.getElementById('view-profile-info');
        const noInfoMessageElement = document.getElementById('no-view-profile-info-message');
        if (userbioElement && noInfoMessageElement) {
            if (targetUser.bio && targetUser.bio.trim() !== '') {
                userbioElement.textContent = targetUser.bio;
                userbioElement.style.display = 'block';
                noInfoMessageElement.style.display = 'none';
            } else {
                userbioElement.textContent = '';
                userbioElement.style.display = 'none';
                noInfoMessageElement.style.display = 'block';
            }
        }

    } else {
        console.error('بيانات المستخدم غير موجودة للعرض.');
        return;
    }

    // كود إخفاء زر الثلاثة خطوط إذا الملف المعروض هو حسابي
    const menuBtn = window.g_viewProfileModal.querySelector('.menu-profile-modal');
    // currentUserId تم تعريفه سابقاً
    if (menuBtn) {
        if (userData.id === currentUserId) {
            menuBtn.style.display = "none";
        } else {
            menuBtn.style.display = "";
        }
    }

// جلب زر القلم
// تعريف دالة مقارنة الرتب
function isMyRankHigher(myRank, targetRank) {
    const order = [
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
    const myIndex = order.indexOf(myRank);
    const targetIndex = order.indexOf(targetRank);
    // الأقل في الفهرس = أعلى رتبة
    return myIndex !== -1 && targetIndex !== -1 && myIndex < targetIndex;
}

// جلب زر القلم
const editBtn = window.g_viewProfileModal.querySelector('.edit-profile-btn');
const currentUserData = allUsersAndVisitorsData.find(u => u.id === currentUserId) || {};

if (editBtn) {
    if (userData.id === currentUserId) {
        // ملفي الشخصي (زر التعديل العادي)
        editBtn.style.display = "";
        editBtn.setAttribute('data-edit-mode', 'self');
    } else if (
        (currentUserData.rank === "المالك" || currentUserData.rank === "اونر اداري") &&
        isMyRankHigher(currentUserData.rank, userData.rank)
    ) {
        // أنا مالك أو اونر اداري ورُتبتي أعلى من العضو المعروض
        editBtn.style.display = "";
        editBtn.setAttribute('data-edit-mode', 'admin');
    } else {
        editBtn.style.display = "none";
        editBtn.removeAttribute('data-edit-mode');
    }
}

    window.g_viewProfileModal.classList.add('show');
    document.addEventListener('click', window.handleViewProfileModalOutsideClick);
};

// ... (تأكد من إضافة دالة addLike في chat-firestore.js وتحديث الـ HTML كما هو موضح في الرد السابق)

// في ملف js/modals.js

window.hideViewProfileModal = function() {
    if (window.g_viewProfileModal) {
        // ✨ إيقاف الأغنية عند إغلاق المودال ✨
        const musicPlayer = document.getElementById('view-profile-music-player');
        if (musicPlayer) {
            musicPlayer.pause();
            musicPlayer.currentTime = 0; // إرجاعها إلى البداية
        }
        
        window.g_viewProfileModal.classList.remove('show');
        document.removeEventListener('click', window.handleViewProfileModalOutsideClick);
    }
};

window.handleViewProfileModalOutsideClick = function(event) {
    if (window.g_viewProfileModal && !window.g_viewProfileModal.contains(event.target) && !event.target.closest('.user-info-modal')) {
        window.hideViewProfileModal();
    }
};

document.addEventListener('DOMContentLoaded', createViewProfileModalHTML);

/**
 * تضغط صورة قبل رفعها.
 * @param {File} imageFile - ملف الصورة الأصلي (من حقل الإدخال).
 * @param {number} quality - جودة الصورة بعد الضغط (بين 0 و 1).
 * @returns {Promise<Blob>} - وعد (Promise) يعيد ملف الصورة المضغوطة.
 */
function compressImage(imageFile, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // يمكنك تعديل حجم الصورة هنا إذا أردت
                // حاليًا، نستخدم الحجم الأصلي
                canvas.width = img.width;
                canvas.height = img.height;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // تحويل الصورة إلى blob مع الجودة المطلوبة
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // Blob هو ملف الصورة المضغوطة
                            resolve(blob);
                        } else {
                            reject(new Error('فشل ضغط الصورة.'));
                        }
                    },
                    'image/jpeg', // يمكنك استخدام 'image/png' إذا كنت تفضل
                    quality
                );
            };
            img.onerror = (error) => reject(error);
            img.src = event.target.result;
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(imageFile);
    });
}

// js/modals.js

// ... (باقي الكود)

/**
 * Creates and shows the notifications modal.
 */
// في ملف modals.js
// ... (الكود السابق)
export function showNotificationsModal() {
    if (window.notificationsModal) {
        return;
    }

    window.notificationsModal = document.createElement('div');
    window.notificationsModal.className = 'notifications-modal modal-overlay';
    window.notificationsModal.innerHTML = `
        <div class="notifications-container">
            <div class="modal-header-new">
                <h3>الإشعارات</h3>
                <button class="close-btn">&times;</button>
            </div>
            <div class="notifications-content">
                <div class="private-chat-loader" style="display:block;"></div>
                <div class="empty-state" style="display:none;">
                    <img src="nodata.png" alt="لا توجد إشعارات" class="empty-state-image">
                    <p>لا يوجد إشعارات حاليًا.</p>
                </div>
                <div class="notifications-list"></div>
            </div>
        </div>
    `;

    document.body.appendChild(window.notificationsModal);

    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) {
        const btnRect = notificationsBtn.getBoundingClientRect();
        const modalElement = window.notificationsModal;
        const modalWidth = 320;
        const shiftLeft = -145;

        modalElement.style.top = `${btnRect.bottom + 10}px`;
        modalElement.style.left = `${btnRect.right - modalWidth - shiftLeft}px`;
    }

    const notificationsList = window.notificationsModal.querySelector('.notifications-list');
    const emptyState = window.notificationsModal.querySelector('.empty-state');
    // ✨ مؤشر التحميل: نفس الكلاس المستخدم في نافذة الخاص (private-chat-loader)
    // يظهر لحين وصول أول استجابة من Firestore، بدل ظهور "لا يوجد إشعارات" فوراً
    // بشكل مضلّل قبل أن تُحمّل البيانات فعلياً.
    const loaderElement = window.notificationsModal.querySelector('.private-chat-loader');
    
    const currentUserId = localStorage.getItem('chatUserId');

    const notificationsQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', currentUserId),
        orderBy('timestamp', 'desc')
    );

    // ✨ فتح الملف الشخصي لمرسل الإشعار عند الضغط على صورته/اسمه، سواء كان
    // المرسل هو "النظام" أو مستخدم حقيقي.
    function openNotificationSenderProfile(notification) {
        const senderId = notification.senderId || 'system';
        const baseList = Array.isArray(window.allUsersAndVisitorsData) ? window.allUsersAndVisitorsData : [];
        let targetUser = baseList.find(u => u.id === senderId);

        if (!targetUser) {
            // لا تتوفر بيانات هذا المرسل ضمن قائمة المستخدمين (مثال: حساب النظام)،
            // لذلك يتم بناء بيانات كافية لعرض نافذة الملف الشخصي بالمعلومات المخزنة في الإشعار نفسه.
            targetUser = {
                id: senderId,
                name: notification.senderName || SYSTEM_USER.username,
                avatar: notification.senderAvatar || SYSTEM_USER.avatar,
                rank: notification.senderRank || SYSTEM_USER.rank,
                innerImage: SYSTEM_USER.innerImage,
                bio: senderId === 'system' ? SYSTEM_USER.bio : '',
                likes: [],
                level: 1
            };
        }

        const listForModal = baseList.some(u => u.id === targetUser.id) ? baseList : [...baseList, targetUser];

        if (typeof window.showViewProfileModal === 'function') {
            window.showViewProfileModal(targetUser, listForModal);
        }
    }

    // ✨ إصلاح: كنا سابقًا نتجاهل أي استجابة تصل من الكاش المحلي فقط
    // وننتظر استجابة "مؤكدة" من الخادم قبل إخفاء مؤشر التحميل. المشكلة أن
    // هذه الاستجابة المؤكدة قد لا تصل أبدًا في بعض الحالات (خصوصًا للحسابات
    // الجديدة التي ليس لها كاش محلي "دافئ" لهذا الاستعلام بعد) دون أي خطأ
    // يظهر في الكونسول، فيبقى مؤشر التحميل يدور إلى الأبد. الحل: نعرض أول
    // استجابة تصل فورًا (تمامًا مثل مستمع شارة الإشعارات listenForUnreadNotifications
    // الذي يعمل بدون مشاكل)، وأي تحديث لاحق من الخادم سيُعاد رسمه تلقائيًا
    // فوق نفس القائمة دون أي أثر يُذكر للمستخدم.

    // ✨ شبكة أمان إضافية: لو تعطّل الاستماع بالكامل لأي سبب (مثل خطأ شبكة
    // صامت)، لا يبقى مؤشر التحميل ظاهرًا للأبد — يُخفى تلقائيًا بعد 8 ثوانٍ
    // كحد أقصى بغض النظر عمّا يحدث.
    const loaderSafetyTimeout = setTimeout(() => {
        if (loaderElement) loaderElement.style.display = 'none';
    }, 8000);

    window.notificationsModalUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        clearTimeout(loaderSafetyTimeout);
        if (loaderElement) loaderElement.style.display = 'none';

        notificationsList.innerHTML = ''; 
        const unreadNotifications = [];
        
        if (snapshot.empty) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            snapshot.forEach((doc) => {
                const notification = doc.data();
                const notificationElement = document.createElement('div');
                // ✨ ملاحظة: الإشعار يبقى معروضاً دائماً هنا (سواء "unread" أو بدونها)
                // ولا يُحذف أو يُخفى بمجرد قراءته أو إغلاق النافذة؛ فقط تُحدَّث حالة
                // "read" في Firestore، وتبقى بيانات الإشعار كما هي ليظهر مرة أخرى
                // في أي فتح لاحق للنافذة.
                notificationElement.className = `notification-item ${notification.read ? '' : 'unread'}`;
                const timestamp = notification.timestamp ? notification.timestamp.toDate().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
                
                const senderName = notification.senderName || 'النظام';
                const senderAvatar = notification.senderAvatar || SYSTEM_USER.avatar;
                const senderRank = notification.senderRank || SYSTEM_USER.rank;

                notificationElement.innerHTML = `
                   <div class="notification-sender-info" style="cursor:pointer;">
                       <img src="${senderAvatar}" alt="صورة ${senderName}" class="notification-avatar">
                       <span class="notification-sender">${senderName}</span>
                       <span class="notification-rank">${senderRank}</span>
                   </div>
                   <p class="notification-text">${notification.text}</p>
                   <span class="notification-timestamp">${timestamp}</span>
                `;

                const senderInfoEl = notificationElement.querySelector('.notification-sender-info');
                if (senderInfoEl) {
                    senderInfoEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openNotificationSenderProfile(notification);
                    });
                }

                notificationsList.appendChild(notificationElement);

                if (!notification.read) {
                    unreadNotifications.push(doc.ref);
                }
            });

            if (unreadNotifications.length > 0) {
                const batch = writeBatch(db);
                unreadNotifications.forEach(ref => {
                    batch.update(ref, { read: true });
                });
                batch.commit();
            }
        }
    }, (error) => {
        console.error("خطأ في جلب الإشعارات:", error);
        clearTimeout(loaderSafetyTimeout);
        if (loaderElement) loaderElement.style.display = 'none';
    });


    const closeBtn = window.notificationsModal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            hideNotificationsModal();
        });
    }

    setTimeout(() => {
        document.addEventListener('click', handleNotificationsModalOutsideClick);
    }, 100);

    setTimeout(() => {
        if (window.notificationsModal) {
            window.notificationsModal.classList.add('show');
        }
    }, 10);
}


// ... (الكود التالي)

// Add this to the hide function to prevent memory leaks
// في دالة hideNotificationsModal في modals.js
export function hideNotificationsModal() {
    if (window.notificationsModal && window.notificationsModal.classList.contains('show')) {
        window.notificationsModal.classList.remove('show');
        
        // إلغاء الاشتراك في المستمع لمنع التكرار
        if (window.notificationsModalUnsubscribe) {
            window.notificationsModalUnsubscribe();
            window.notificationsModalUnsubscribe = null;
        }

        window.notificationsModal.addEventListener('transitionend', () => {
            if (window.notificationsModal) {
                window.notificationsModal.remove();
                window.notificationsModal = null;
            }
        }, { once: true });
        document.removeEventListener('click', handleNotificationsModalOutsideClick);
    }
}

// ... (نهاية دالة hideNotificationsModal)


// دالة جديدة للاستماع إلى الإشعارات غير المقروءة

// ... (بقية الكود)
window.handleNotificationsModalOutsideClick = function(event) {
    const notificationsBtn = document.getElementById('notifications-btn');
    if (window.notificationsModal && !window.notificationsModal.contains(event.target) && !notificationsBtn.contains(event.target)) {
        hideNotificationsModal();
    }
};

// ... (نهاية دالة hideNotificationsModal)


// دالة جديدة للاستماع إلى الإشعارات غير المقروءة بشكل مستمر
export function listenForUnreadNotifications() {
    const currentUserId = localStorage.getItem('chatUserId');
    const notificationsBadge = document.getElementById('notifications-badge');

    if (!currentUserId || !notificationsBadge) {
        return;
    }

    // ✨ لا يوجد سيرفر خلفي مجدوَل لحذف الإشعارات الأقدم من 24 ساعة، لذلك
    // نشغّل التنظيف من هنا (يعمل مرة عند كل تحميل لصفحة الدردشة لأي مستخدم
    // نشط، وهذا يكفي عمليًا لإبقاء الإشعارات القديمة تُحذف تلقائيًا).
    cleanupOldNotifications(currentUserId);

    const unreadQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', currentUserId),
        where('read', '==', false)
    );

    onSnapshot(unreadQuery, (snapshot) => {
        if (snapshot.size > 0) {
            notificationsBadge.classList.add('show');
        } else {
            notificationsBadge.classList.remove('show');
        }
    });
}

// ... (نهاية الدوال)

// استدعاء المستمع الجديد عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    listenForUnreadNotifications();
});


// ============================================================
// ✨ نافذة "صداقة": تعرض طلبات الصداقة الواردة للمستخدم الحالي،
// بنفس نمط نافذة الإشعارات تمامًا (نفس التصميم والسلوك)، مع فارق
// أن كل عنصر هنا يعرض زر قبول وزر رفض بدل نص إشعار فقط.
// ============================================================

window.friendRequestsModalUnsubscribe = null;

// ✨ حالة "المشاهدة" لطلبات الصداقة تُخزَّن الآن كحقل seen على مستند الطلب
// نفسه في Firestore (تمامًا مثل حقل read في الإشعارات)، بدل التخزين محليًا
// في localStorage. هذا يضمن أن الدائرة الحمراء تبقى مخفية بشكل صحيح بعد
// المشاهدة حتى لو سجّل المستخدم الخروج ثم دخل مرة أخرى (localStorage.clear()
// عند الخروج كان يمسح حالة "المشاهدة" القديمة فتظهر الدائرة الحمراء من جديد
// وكأن الطلب لم يُشاهَد أبدًا).
async function markFriendRequestsSeen(docSnaps) {
    const unseen = docSnaps.filter(d => !d.data().seen);
    if (unseen.length === 0) return;
    try {
        const batch = writeBatch(db);
        unseen.forEach(d => batch.update(d.ref, { seen: true }));
        await batch.commit();
    } catch (e) {
        console.error('خطأ في تحديث حالة مشاهدة طلبات الصداقة:', e);
    }
}

export function showFriendRequestsModal() {
    if (window.friendRequestsModal) {
        return;
    }

    window.friendRequestsModal = document.createElement('div');
    window.friendRequestsModal.className = 'notifications-modal friend-requests-modal modal-overlay';
    window.friendRequestsModal.innerHTML = `
        <div class="notifications-container">
            <div class="modal-header-new">
                <h3>طلبات الصداقة</h3>
                <button class="close-btn">&times;</button>
            </div>
            <div class="notifications-content">
                <div class="private-chat-loader" style="display:block;"></div>
                <div class="empty-state" style="display:none;">
                    <img src="nodata.png" alt="لا توجد طلبات صداقة" class="empty-state-image">
                    <p>لا توجد طلبات صداقة حاليًا.</p>
                </div>
                <div class="friend-requests-list"></div>
            </div>
        </div>
    `;

    document.body.appendChild(window.friendRequestsModal);

    const friendBtn = document.getElementById('friend-btn');
    if (friendBtn) {
        const btnRect = friendBtn.getBoundingClientRect();
        const modalElement = window.friendRequestsModal;
        const modalWidth = 320;
        const shiftLeft = -145;

        modalElement.style.top = `${btnRect.bottom + 10}px`;
        modalElement.style.left = `${btnRect.right - modalWidth - shiftLeft}px`;
    }

    const requestsList = window.friendRequestsModal.querySelector('.friend-requests-list');
    const emptyState = window.friendRequestsModal.querySelector('.empty-state');
    // ✨ نفس مؤشر التحميل المستخدم في نافذة الإشعارات، يظهر لحين وصول أول استجابة مؤكدة
    const loaderElement = window.friendRequestsModal.querySelector('.private-chat-loader');

    const currentUserId = localStorage.getItem('chatUserId');

    // ✨ ملاحظة: بدون orderBy هنا عمداً — دمج where + orderBy على مجموعة جديدة
    // مثل friendRequests يتطلب إنشاء فهرس مركّب (composite index) في Firestore
    // لا يكون موجوداً تلقائياً، وبدونه يفشل الاستعلام بصمت (رسالة الخطأ فقط
    // بالـ Console) فتظهر النافذة فارغة تماماً (فقط الشريط العلوي). لتفادي هذا
    // الاعتماد، نجلب النتائج بدون ترتيب من Firestore ثم نرتبها يدويًا بالأسفل.
    const requestsQuery = query(
        collection(db, 'friendRequests'),
        where('toId', '==', currentUserId)
    );

    // ✨ فتح الملف الشخصي لمرسل طلب الصداقة عند الضغط على صورته/اسمه
    function openRequestSenderProfile(request) {
        const senderId = request.fromId;
        const baseList = Array.isArray(window.allUsersAndVisitorsData) ? window.allUsersAndVisitorsData : [];
        let targetUser = baseList.find(u => u.id === senderId);

        if (!targetUser) {
            targetUser = {
                id: senderId,
                name: request.fromName || 'مستخدم',
                avatar: request.fromAvatar || 'images/default-user.png',
                rank: request.fromRank || 'زائر',
                bio: '',
                likes: [],
                level: 1
            };
        }

        const listForModal = baseList.some(u => u.id === targetUser.id) ? baseList : [...baseList, targetUser];

        if (typeof window.showViewProfileModal === 'function') {
            window.showViewProfileModal(targetUser, listForModal);
        }
    }

    // ✨ إصلاح نفس مشكلة نافذة الإشعارات: لا ننتظر استجابة "مؤكدة" من الخادم
    // (قد لا تصل أبدًا في بعض الحالات) — نعرض أول استجابة تصل مباشرة، مع
    // شبكة أمان (timeout) تخفي مؤشر التحميل مهما حصل.
    const loaderSafetyTimeout = setTimeout(() => {
        if (loaderElement) loaderElement.style.display = 'none';
    }, 8000);

    window.friendRequestsModalUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
        clearTimeout(loaderSafetyTimeout);
        if (loaderElement) loaderElement.style.display = 'none';

        requestsList.innerHTML = '';

        // ✨ ترتيب يدوي من الأحدث للأقدم بدل orderBy في الاستعلام (انظر الملاحظة أعلاه)
        const sortedDocs = snapshot.docs.slice().sort((a, b) => {
            const aTime = a.data().timestamp ? a.data().timestamp.toMillis() : 0;
            const bTime = b.data().timestamp ? b.data().timestamp.toMillis() : 0;
            return bTime - aTime;
        });

        // ✨ فور عرض الطلبات في النافذة (سواء قُبلت أو رُفضت أو تُركت معلّقة)
        // نعتبرها "مشاهَدة" ونخفي الدائرة الحمراء فورًا، بدل انتظار قبول/رفض.
        markFriendRequestsSeen(sortedDocs);
        const friendBadgeEl = document.getElementById('friend-badge');
        if (friendBadgeEl) friendBadgeEl.classList.remove('show');

        if (sortedDocs.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            sortedDocs.forEach((docSnap) => {
                const request = docSnap.data();
                const requestId = docSnap.id;

                const requestElement = document.createElement('div');
                requestElement.className = 'notification-item friend-request-item';

                const senderName = request.fromName || 'مستخدم';
                const senderAvatar = request.fromAvatar || 'images/default-user.png';

                requestElement.innerHTML = `
                   <div class="notification-sender-info" style="cursor:pointer;">
                       <img src="${senderAvatar}" alt="صورة ${senderName}" class="notification-avatar">
                       <span class="notification-sender">${senderName}</span>
                   </div>
                   <div class="friend-request-actions">
                       <button class="friend-request-btn accept-btn" title="قبول"><i class="fas fa-check"></i></button>
                       <button class="friend-request-btn reject-btn" title="رفض"><i class="fas fa-times"></i></button>
                   </div>
                `;

                const senderInfoEl = requestElement.querySelector('.notification-sender-info');
                if (senderInfoEl) {
                    senderInfoEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openRequestSenderProfile(request);
                    });
                }

                const acceptBtn = requestElement.querySelector('.accept-btn');
                const rejectBtn = requestElement.querySelector('.reject-btn');

                // ✨ عند القبول: يصير الطرفان صديقين (يُضاف كل منهما لقائمة أصدقاء
                // الآخر)، ثم يختفي الطلب من هذه القائمة تلقائيًا بحذفه من Firestore.
                if (acceptBtn) {
                    acceptBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        acceptBtn.disabled = true;
                        rejectBtn.disabled = true;
                        const ok = await acceptFriendRequest(requestId, request.fromId, request.toId || currentUserId);
                        if (ok) {
                            showToastNotification(`أصبحت الآن صديقًا مع ${senderName}.`, 'success');
                        } else {
                            acceptBtn.disabled = false;
                            rejectBtn.disabled = false;
                            showToastNotification('حدث خطأ أثناء قبول طلب الصداقة.', 'error');
                        }
                    });
                }

                // ✨ عند الرفض: يُحذف الطلب فقط ويختفي من القائمة، ولا يترتب عليه أي أثر آخر.
                if (rejectBtn) {
                    rejectBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        acceptBtn.disabled = true;
                        rejectBtn.disabled = true;
                        const ok = await rejectFriendRequest(requestId);
                        if (!ok) {
                            acceptBtn.disabled = false;
                            rejectBtn.disabled = false;
                            showToastNotification('حدث خطأ أثناء رفض طلب الصداقة.', 'error');
                        }
                    });
                }

                requestsList.appendChild(requestElement);
            });
        }
    }, (error) => {
        console.error('خطأ في جلب طلبات الصداقة:', error);
        clearTimeout(loaderSafetyTimeout);
        if (loaderElement) loaderElement.style.display = 'none';
    });

    const closeBtn = window.friendRequestsModal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            hideFriendRequestsModal();
        });
    }

    setTimeout(() => {
        document.addEventListener('click', handleFriendRequestsModalOutsideClick);
    }, 100);

    setTimeout(() => {
        if (window.friendRequestsModal) {
            window.friendRequestsModal.classList.add('show');
        }
    }, 10);
}

export function hideFriendRequestsModal() {
    if (window.friendRequestsModal && window.friendRequestsModal.classList.contains('show')) {
        window.friendRequestsModal.classList.remove('show');

        if (window.friendRequestsModalUnsubscribe) {
            window.friendRequestsModalUnsubscribe();
            window.friendRequestsModalUnsubscribe = null;
        }

        window.friendRequestsModal.addEventListener('transitionend', () => {
            if (window.friendRequestsModal) {
                window.friendRequestsModal.remove();
                window.friendRequestsModal = null;
            }
        }, { once: true });
        document.removeEventListener('click', handleFriendRequestsModalOutsideClick);
    }
}

window.handleFriendRequestsModalOutsideClick = function(event) {
    const friendBtn = document.getElementById('friend-btn');
    if (window.friendRequestsModal && !window.friendRequestsModal.contains(event.target) && friendBtn && !friendBtn.contains(event.target)) {
        hideFriendRequestsModal();
    }
};

// ✨ يستمع باستمرار لطلبات الصداقة الواردة للمستخدم الحالي، ويظهر/يخفي
// نفس الدائرة الحمراء المستخدمة في زر الإشعارات فوق زر "صداقة".
export function listenForPendingFriendRequests() {
    const currentUserId = localStorage.getItem('chatUserId');
    const friendBadge = document.getElementById('friend-badge');

    if (!currentUserId || !friendBadge) {
        return;
    }

    const pendingQuery = query(
        collection(db, 'friendRequests'),
        where('toId', '==', currentUserId)
    );

    onSnapshot(pendingQuery, (snapshot) => {
        // ✨ الدائرة الحمراء تظهر فقط لو فيه طلب لم يُشاهَد بعد (حقل seen في
        // Firestore نفسه لا يزال false)، حتى لو بقي الطلب معلّقًا بدون قبول
        // أو رفض. هذا الحقل يبقى صحيحًا حتى بعد تسجيل الخروج والدخول مجددًا،
        // بعكس الاعتماد السابق على localStorage الذي يُمسح عند الخروج.
        const hasUnseenRequest = snapshot.docs.some(d => !d.data().seen);
        if (hasUnseenRequest) {
            friendBadge.classList.add('show');
        } else {
            friendBadge.classList.remove('show');
        }
    });
}

// استدعاء المستمع الجديد عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    listenForPendingFriendRequests();
});

function showAdminEditUserModal(userData) {
    // إزالة أي مودال إداري قديم
    let adminModal = document.getElementById('adminEditUserModal');
    if (adminModal) adminModal.remove();

    // بناء المودال
    const modalHTML = `
    <div id="adminEditUserModal" class="modal-overlay show">
      <div class="edit-profile-container">
        <div class="header-section-new">
          <img src="${userData.innerImage || 'images/Interior.png'}" class="inner-profile-background-image" alt="" />
          <input type="file" id="admin-inner-image-upload" accept="image/*" style="display:none;">
          <input type="file" id="admin-avatar-upload" accept="image/*" style="display:none;">
          <div class="header-left-actions">
            <span class="header-icon close-profile-modal"><i class="fas fa-times"></i></span>
            <span class="header-icon change-inner-image"><i class="fas fa-camera"></i></span>
            <span class="header-icon delete-inner-image"><i class="fas fa-trash-alt"></i></span>
          </div>
          <div class="header-right-profile">
            <div class="user-main-section-wrapper">
              <div class="user-main-info">
                <div class="user-avatar-wrapper" style="position:relative;">
                  <img id="admin-user-avatar" src="${userData.avatar || 'images/default-user.png'}" alt="صورة المستخدم" />
                  <div class="avatar-overlay-buttons" style="position:absolute;right:0;bottom:0;">
                    <span class="camera-overlay" style="cursor:pointer;"><i class="fas fa-camera"></i></span>
                    <span class="trash-overlay" style="cursor:pointer;"><i class="fas fa-trash-alt"></i></span>
                  </div>
                </div>
                <div class="user-info-section">
                  <div class="user-details">
                    <div class="user-rank-container">
                      <div class="rank-info">
                        <img src="${window.RANK_IMAGE_MAP && window.RANK_IMAGE_MAP[userData.rank] ? window.RANK_IMAGE_MAP[userData.rank] : 'images/default-rank.png'}" class="rank-image" alt="صورة الرتبة" />
                        <p class="user-rank">${userData.rank || ""}</p>
                      </div>
                    </div>
                    <div class="user-name-container">
                      <p class="user-name-display">${userData.name || ""}</p>
                    </div>
                    <p class="user-status-display">${userData.statusText || ""}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="admin-actions-container" style="padding:20px;display:flex;flex-direction:column;gap:16px;">
          <button class="admin-action-btn" id="admin-change-status-btn"><i class="fas fa-pen"></i> تغيير الحالة</button>
          <button class="admin-action-btn" id="admin-change-name-btn"><i class="fas fa-user-edit"></i> تغيير الاسم</button>
          <button class="admin-action-btn" id="admin-change-password-btn"><i class="fas fa-key"></i> تغيير كلمة المرور</button>
          <button class="admin-action-btn" id="admin-change-email-btn"><i class="fas fa-envelope"></i> تغيير البريد الإلكتروني</button>
          <button class="admin-action-btn" id="admin-change-rank-btn"><i class="fas fa-user-shield"></i> تغيير الرتبة</button>
        </div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // زر الإغلاق
    document.querySelector("#adminEditUserModal .close-profile-modal").onclick = function() {
      document.getElementById('adminEditUserModal').remove();
    };

    // عناصر الإدخال
    const innerImageUploadInput = document.getElementById('admin-inner-image-upload');
    const avatarUploadInput = document.getElementById('admin-avatar-upload');
    const changeInnerImageBtn = document.querySelector('#adminEditUserModal .change-inner-image');
    const deleteInnerImageBtn = document.querySelector('#adminEditUserModal .delete-inner-image');
    const changeAvatarBtn = document.querySelector('#adminEditUserModal .avatar-overlay-buttons .camera-overlay');
    const deleteAvatarBtn = document.querySelector('#adminEditUserModal .avatar-overlay-buttons .trash-overlay');

    // زر رفع صورة البروفايل
    if (changeAvatarBtn) changeAvatarBtn.addEventListener('click', () => { avatarUploadInput.click(); });

    // زر رفع الصورة الداخلية
    if (changeInnerImageBtn) changeInnerImageBtn.addEventListener('click', () => { innerImageUploadInput.click(); });

    // حذف الصورة الداخلية
    if (deleteInnerImageBtn) {
        deleteInnerImageBtn.addEventListener('click', async () => {
            const defaultInnerImage = 'images/Interior.png';
            await updateUserData(userData.id, { innerImage: defaultInnerImage });
            const innerImageElement = document.querySelector('#adminEditUserModal .inner-profile-background-image');
            if (innerImageElement) innerImageElement.src = defaultInnerImage;
            userData.innerImage = defaultInnerImage;
            if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
                if (idx !== -1) window.allUsersAndVisitorsData[idx].innerImage = defaultInnerImage;
            }
        });
    }

    // حذف صورة البروفايل
    if (deleteAvatarBtn) {
        deleteAvatarBtn.addEventListener('click', async () => {
            const defaultAvatar = 'images/default-user.png';
            await updateUserData(userData.id, { avatar: defaultAvatar });
            const avatarImg = document.getElementById('admin-user-avatar');
            if (avatarImg) avatarImg.src = defaultAvatar;
            userData.avatar = defaultAvatar;
            if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
                if (idx !== -1) window.allUsersAndVisitorsData[idx].avatar = defaultAvatar;
            }
        });
    }

    // رفع صورة داخلية
    if (innerImageUploadInput) {
        innerImageUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                showLoadingSpinner(deleteInnerImageBtn);
                try {
                    const compressedFile = await compressImage(file, 0.7);
                    const imageUrl = await uploadFileToCloudinary(compressedFile);
                    if (imageUrl) {
                        await updateUserData(userData.id, { innerImage: imageUrl });
                        const innerImageElement = document.querySelector('#adminEditUserModal .inner-profile-background-image');
                        if (innerImageElement) innerImageElement.src = imageUrl;
                        userData.innerImage = imageUrl;
                        if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                            const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
                            if (idx !== -1) window.allUsersAndVisitorsData[idx].innerImage = imageUrl;
                        }
                    } else {
                        alert('فشل رفع الصورة الداخلية.');
                    }
                } catch (error) {
                    console.error('فشل رفع الصورة الداخلية:', error);
                    alert('حدث خطأ أثناء رفع الصورة الداخلية.');
                } finally {
                    hideLoadingSpinner(deleteInnerImageBtn);
                }
            }
            event.target.value = '';
        });
    }

    // رفع صورة البروفايل
    if (avatarUploadInput) {
        avatarUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                showLoadingSpinner(deleteAvatarBtn);
                try {
                    const compressedFile = await compressImage(file, 0.7);
                    const imageUrl = await uploadFileToCloudinary(compressedFile);
                    if (imageUrl) {
                        await updateUserData(userData.id, { avatar: imageUrl });
                        const avatarImg = document.getElementById('admin-user-avatar');
                        if (avatarImg) avatarImg.src = imageUrl;
                        userData.avatar = imageUrl;
                        if (window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                            const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
                            if (idx !== -1) window.allUsersAndVisitorsData[idx].avatar = imageUrl;
                        }
                    } else {
                        alert('فشل رفع صورة البروفايل.');
                    }
                } catch (error) {
                    console.error('فشل رفع صورة البروفايل:', error);
                    alert('حدث خطأ أثناء رفع صورة البروفايل.');
                } finally {
                    hideLoadingSpinner(deleteAvatarBtn);
                }
            }
            event.target.value = '';
        });
    }

    // أزرار الإدارة: تحديث البيانات مباشرة
    // زر تغيير الحالة
    const changeStatusBtn = document.getElementById('admin-change-status-btn');
    if (changeStatusBtn) {
changeStatusBtn.onclick = function() {
    showAdminInputModal({
        title: "تغيير الحالة",
        label: "أدخل الحالة الجديدة:",
        value: userData.statusText || "",
        type: "text",
        maxLength: 80,
        onSave: async (newStatus) => {
            await updateUserData(userData.id, { statusText: newStatus });
            userData.statusText = newStatus;
            const statusElem = document.querySelector('#adminEditUserModal .user-status-display');
            if (statusElem) statusElem.textContent = newStatus;
            const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
            if (idx !== -1) window.allUsersAndVisitorsData[idx].statusText = newStatus;
        }
    });
};
}
// زر تغيير الاسم
const changeNameBtn = document.getElementById('admin-change-name-btn');
    if (changeNameBtn) {
changeNameBtn.onclick = function() {
    showAdminInputModal({
        title: "تغيير الاسم",
        label: "أدخل الاسم الجديد:",
        value: userData.name || "",
        type: "text",
        maxLength: 32,
        onSave: async (newName) => {
            await updateUserData(userData.id, { username: newName });
            userData.username = newName;
            const nameElem = document.querySelector('#adminEditUserModal .user-name-display');
            if (nameElem) nameElem.textContent = newName;
            const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
            if (idx !== -1) window.allUsersAndVisitorsData[idx].username = newName;
        }
    });
};
}
// زر تغيير كلمة المرور
const changePasswordBtn = document.getElementById('admin-change-password-btn');
    if (changePasswordBtn) {
changePasswordBtn.onclick = function() {
    showAdminInputModal({
        title: "تغيير كلمة المرور",
        label: "أدخل كلمة المرور الجديدة:",
        value: "",
        type: "password",
        maxLength: 64,
        onSave: async (newPass) => {
            await updateUserData(userData.id, { password: newPass });
            alert('تم تغيير كلمة المرور بنجاح.');
        }
    });
};
}
// زر تغيير البريد الإلكتروني
const changeEmailBtn = document.getElementById('admin-change-email-btn');
    if (changeEmailBtn) {
changeEmailBtn.onclick = function() {
    showAdminInputModal({
        title: "تغيير البريد الإلكتروني",
        label: "أدخل البريد الإلكتروني الجديد:",
        value: userData.email || "",
        type: "email",
        maxLength: 100,
        onSave: async (newEmail) => {
            await updateUserData(userData.id, { email: newEmail });
            userData.email = newEmail;
            const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
            if (idx !== -1) window.allUsersAndVisitorsData[idx].email = newEmail;
        }
    });
};
}
// زر تغيير الرتبة
const changeRankBtn = document.getElementById('admin-change-rank-btn');
    if (changeRankBtn) {
changeRankBtn.onclick = function() {
    const ranks = [
        "اونر اداري", "اونر", "سوبر اداري", "مشرف", "سوبر ادمن", "ادمن",
        "بريميوم", "بلاتينيوم", "ملكي", "ذهبي", "برونزي", "عضو"
    ];
    showAdminInputModal({
        title: "تغيير الرتبة",
        label: "اختر الرتبة الجديدة:",
        value: userData.rank || "",
        options: ranks,
        onSave: async (selectedRank) => {
            await updateUserData(userData.id, { rank: selectedRank });
            userData.rank = selectedRank;
            const rankImg = document.querySelector('#adminEditUserModal .rank-image');
            if (rankImg) rankImg.src = window.RANK_IMAGE_MAP && window.RANK_IMAGE_MAP[selectedRank] ? window.RANK_IMAGE_MAP[selectedRank] : 'images/default-rank.png';
            const rankTxt = document.querySelector('#adminEditUserModal .user-rank');
            if (rankTxt) rankTxt.textContent = selectedRank;
            const idx = window.allUsersAndVisitorsData.findIndex(u => u.id === userData.id);
            if (idx !== -1) window.allUsersAndVisitorsData[idx].rank = selectedRank;
        }
    });
};
}
}
function showAdminInputModal({
    title = "إدخال جديد",
    label = "",
    value = "",
    type = "text",
    onSave = () => {},
    placeholder = "",
    maxLength = 100,
    options = null // إذا كانت الرتبة، حط مصفوفة رتب هنا
}) {
    let modal = document.getElementById('adminInputMiniModal');
    if (modal) modal.remove();

    let inputFieldHtml = "";
    if (Array.isArray(options)) {
        inputFieldHtml = `
            <select id="adminMiniInputField" style="width:96%;padding:8px;border-radius:5px;border:1px solid #aaa;margin-bottom:15px;">
                ${options.map(opt => `<option value="${opt}" ${opt === value ? "selected" : ""}>${opt}</option>`).join('')}
            </select>
        `;
    } else {
        inputFieldHtml = `
            <input id="adminMiniInputField" type="${type}" value="${value}" 
                placeholder="${placeholder}" maxlength="${maxLength}" 
                style="width:96%;padding:8px;border-radius:5px;border:1px solid #aaa;margin-bottom:15px;"/>
        `;
    }

    const modalHTML = `
        <div id="adminInputMiniModal" class="modal-overlay show" style="z-index:2002;">
            <div class="modal-strip" style="max-width:580px;width:96%;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-btn" id="closeAdminInputMiniModal">&times;</button>
                </div>
                <div class="modal-content-area">
                    <label style="margin-bottom:8px;display:block;">${label}</label>
                    ${inputFieldHtml}
                    <div style="text-align:left;">
                        <button id="adminMiniSaveBtn" style="background:#6a1b9a;color:#fff;padding:7px 18px;border:none;border-radius:6px;cursor:pointer;">حفظ</button>
                    </div>
                    <div id="adminMiniModalMsg" style="margin-top:10px;font-size:14px;color:red;"></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('closeAdminInputMiniModal').onclick = () => {
        document.getElementById('adminInputMiniModal').remove();
    };

    document.getElementById('adminMiniSaveBtn').onclick = async () => {
        const inputValue = Array.isArray(options) 
            ? document.getElementById('adminMiniInputField').value
            : document.getElementById('adminMiniInputField').value.trim();

        if (!inputValue) {
            document.getElementById('adminMiniModalMsg').textContent = "الرجاء إدخال قيمة.";
            return;
        }
        await onSave(inputValue);
        document.getElementById('adminInputMiniModal').remove();
    };
}