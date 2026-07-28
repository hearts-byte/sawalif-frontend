// js/main.js
// الكود الصحيح
import { 
    loadComponent, loadComponents, createAndShowPrivateChatDialog, createUserInfoModal, updatePrivateButtonNotification, hideUserInfoModal, checkAndSendJoinMessage, 
    createSystemMessageElement, createMessageElement, addRegistrationButtonToBottomBar 
} from './chat-ui.js';
import { 
    loadInitialMessages, loadMoreMessages, listenForNewMessages, getSafeCursorDoc,
    sendMessage, getPrivateChatContacts, getAllUsersAndVisitors, getUserData, setupPrivateMessageNotificationListener, sendJoinMessage, deleteChatRoomMessages, sendSystemMessage, getChatRooms, listenForUserRankChanges, updateUserData, listenForCurrentUserFriends
} from './chat-firestore.js';
import { RANK_ORDER, RANK_IMAGE_MAP, getStoredUserPermissions } from './constants.js';
import { showLevelInfoModal, showNotificationsModal, hideNotificationsModal, listenForUnreadNotifications, showFriendRequestsModal, hideFriendRequestsModal, listenForPendingFriendRequests } from './modals.js';
import { uploadFileToCloudinary } from './cloudinary-utils.js';
import { auth, db } from './firebase-config.js';
import { doc, onSnapshot, updateDoc, getDoc, deleteDoc, query, where, and, or, collection, getDocs } from "./firestore-shim.js";
import { showNotification, scrollToBottom } from './ui-helpers.js';
import './image-viewer-modal.js'; // نافذة تكبير الصور (تسجّل أحداثها تلقائياً عند التحميل)
import { setAllUsersAndVisitorsData, getUserById } from './user-cache.js';
import { checkKickStatusAndUpdateUI, watchKickStatusLive } from './kick-guard.js';
import { checkBanStatusAndUpdateUI, watchBanStatusLive } from './ban-guard.js';

// ✨ دالة موحّدة للتحكم في ظهور أزرار الشريط العلوي حسب الرتبة (خاص، إبلاغ...).
// بدل تشتيت المنطق في أكثر من مكان (وإنشاء عناصر جديدة تظهر فجأة)، هذه الدالة فقط
// تضبط data-attributes على <html>، والـ CSS هو من يتحكم بالعرض/الإخفاء فعليًا.
// كما تخزّن النتيجة في localStorage حتى يقرأها سكربت صغير في chat.html *قبل* أول رسم
// للصفحة في الزيارة القادمة، فتظهر الأزرار من البداية بشكلها الصحيح دون أي وميض.
// ✨ لم تعد هذه الدالة تفحص الرتبة أو تحسب الصلاحيات؛ الفحص صار مرة واحدة
// فقط في script.js (storeUserPermissions) عند الدخول، أو عند ترقية الرتبة
// (listenForUserRankChanges أدناه، الذي يعيد تحميل الصفحة). هنا فقط نقرأ
// النتيجة الجاهزة ونطبّقها كـ data-attributes يتحكم بها الـ CSS.
function applyTopBarPermissions() {
    const { canSeePrivateChatButton, canSeeReportButton } = getStoredUserPermissions();
    document.documentElement.dataset.canPrivate = canSeePrivateChatButton ? '1' : '0';
    document.documentElement.dataset.canReport = canSeeReportButton ? '1' : '0';
}

export let allUsersAndVisitorsData = [];
let privateChatModal = null;
let onlineUsersModal = null;
let searchModal = null;
let profileDropdownMenu = null;
let profileButton = null;
let cachedRooms = null;
let currentRoomId;
let messagesUnsubscriber = null;
let isLoadingMoreMessages = false;
// إضافة المتغيرات هنا لتعريفها عالميًا
let chatUserId = null;
let chatUserName = null;
let chatUserAvatar = null;
// js/main.js
let userType = null;

// js/main.js
 
let isReloading = false;
 

auth.onAuthStateChanged(user => {
    if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        onSnapshot(userDocRef, (docSnap) => {
            const userData = docSnap.data();
            if (userData) {
                // ✨ التحقق من حالة الحظر ثم الطرد أولًا: إذا كان المستخدم
                // محظورًا أو مطرودًا الآن، تظهر الشاشة المناسبة فورًا.
                checkBanStatusAndUpdateUI();
                checkKickStatusAndUpdateUI();

                // تحديث الواجهة العامة
                const mainMessageInput = document.getElementById('message-input');
                const mainSendButton = document.querySelector('.send-btn');
                const mainEmojiButton = document.querySelector('.emoji-btn-circle');
                const mainPlusButton = document.getElementById('plus-btn-toggle');
                const mainImageUpload = document.getElementById('image-upload-input');
                checkMuteStatusAndUpdateUI(mainMessageInput, mainSendButton, mainEmojiButton, mainPlusButton, mainImageUpload);

                // ✨ تحديث الواجهة الخاصة إذا كانت مفتوحة
                const privateChatInput = document.querySelector('.private-chat-input');
                if (privateChatInput) {
                    const privateChatSendBtn = document.querySelector('.private-chat-send-btn');
                    const privateEmojiButton = null;
                    const privatePlusButton = null;
                    const privateImageUpload = null;
                    checkMuteStatusAndUpdateUI(privateChatInput, privateChatSendBtn, privateEmojiButton, privatePlusButton, privateImageUpload);
                }

                if (userData.needsRefresh && !isReloading) {
                    isReloading = true;
                    if (userData.rank) {
                        localStorage.setItem('chatUserRank', userData.rank);
                    }
                    updateDoc(userDocRef, {
                        needsRefresh: false
                    }).then(() => {
                        console.log("تم تحديث بيانات المستخدم بنجاح.");
                    }).catch((error) => {
                        console.error("خطأ في إعادة تعيين حقل التحديث:", error);
                        window.location.reload();
                    });
                }
            }
        });
    }
});



async function fetchUsersWithRetry(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await getAllUsersAndVisitors(true);
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000)); // انتظر ثانية وأعد المحاولة
        }
    }
}

function hideOnlineUsersModal() {
    if (onlineUsersModal) {
        onlineUsersModal.remove();
        onlineUsersModal = null;
        document.removeEventListener('click', handleOnlineUsersModalOutsideClick);
    }
}

function handlePrivateChatModalOutsideClick(event) {
    const privateButton = document.querySelector('.top-bar .btn.private');
    const isClickInsidePrivateModal = privateChatModal && privateChatModal.contains(event.target);
    const isClickOnPrivateButton = privateButton && privateButton.contains(event.target);
    const isClickInsideUserInfoModal = window.userInfoModal && window.userInfoModal.contains(event.target);
    if (privateChatModal && privateChatModal.classList.contains('show') && !isClickInsidePrivateModal && !isClickOnPrivateButton && !isClickInsideUserInfoModal) {
        hidePrivateChatModal();
    }
}

function hidePrivateChatModal() {
    if (privateChatModal) {
        privateChatModal.classList.remove('show');
        privateChatModal.addEventListener('transitionend', () => {
            if (privateChatModal) {
                privateChatModal.remove();
                privateChatModal = null;
            }
        }, { once: true });
        document.removeEventListener('click', handlePrivateChatModalOutsideClick);
    }
}

function hideSearchModal() {
    if (searchModal) {
        searchModal.remove();
        searchModal = null;
    }
}

function hideProfileDropdown() {
    if (profileDropdownMenu && profileDropdownMenu.classList.contains('show')) {
        profileDropdownMenu.classList.remove('show');
        document.removeEventListener('click', handleProfileDropdownOutsideClick);
    }
}

function hideAllOpenModals() {
    if (typeof hideUserInfoModal === 'function') hideUserInfoModal();
    if (typeof hideOnlineUsersModal === 'function') hideOnlineUsersModal();
    if (typeof hidePrivateChatModal === 'function') hidePrivateChatModal();
    if (typeof hideSearchModal === 'function') hideSearchModal();
    if (typeof window.hideEditProfileModal === 'function') window.hideEditProfileModal();
    if (typeof hideProfileDropdown === 'function') hideProfileDropdown();
    if (typeof hideNotificationsModal === 'function') hideNotificationsModal();
    if (typeof hideFriendRequestsModal === 'function') hideFriendRequestsModal();
}

async function createPrivateChatModal(buttonElement) {
    if (privateChatModal && privateChatModal.classList.contains('show')) {
        return; 
    }

    hideAllOpenModals();

    if (privateChatModal) {
        privateChatModal.remove();
        privateChatModal = null;
    }

    privateChatModal = document.createElement('div');
    privateChatModal.classList.add('private-chat-modal-strip');
    privateChatModal.innerHTML = `
       <div class="modal-header">
    <h3>الرسائل الخاصة</h3>
    <button class="delete-all-btn"><i class="fas fa-trash-alt"></i></button>
</div>
        <ul class="private-chat-list">
            <div class="spinner-container">
                <div class="loading-spinner"></div>
            </div>
        </ul>
    `;
    document.body.appendChild(privateChatModal);

    const buttonRect = buttonElement.getBoundingClientRect();
    const modalWidth = 200;
    const topBarElement = document.querySelector('.top-bar');
    const inputBarElement = document.querySelector('.bottom-bar');
    const topBarHeight = topBarElement ? topBarElement.offsetHeight : 0;
    const inputBarHeight = inputBarElement ? inputBarElement.offsetHeight : 0;
    const padding = 5;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let modalLeft = buttonRect.right - modalWidth;
    let modalTop = buttonRect.bottom + padding;

    if (modalLeft < padding) modalLeft = padding;
    if (modalLeft + modalWidth > viewportWidth - padding) modalLeft = viewportWidth - modalWidth - padding;
    if (modalTop < topBarHeight + padding) modalTop = topBarHeight + padding;

    const maxModalHeight = viewportHeight - modalTop - inputBarHeight - (2 * padding);
    privateChatModal.style.maxHeight = `${maxModalHeight}px`;
    privateChatModal.style.overflowY = 'auto';

    privateChatModal.style.left = `${modalLeft}px`;
    privateChatModal.style.top = `${modalTop}px`;
    privateChatModal.classList.add('show');
    privateChatModal.querySelector('.delete-all-btn').addEventListener('click', () => {
    showDeleteAllConfirmationModal(deleteAllPrivateChats);
});

    document.addEventListener('click', handlePrivateChatModalOutsideClick);

    const currentUserId = localStorage.getItem('chatUserId');
    if (currentUserId) {
        try {
            const ulElement = privateChatModal.querySelector('.private-chat-list');
            const contacts = await getPrivateChatContacts(currentUserId);
            ulElement.innerHTML = '';
            if (contacts.length === 0) {
                ulElement.innerHTML = `
                    <li class="empty-chat-message">
                        <img src="nodata.png" alt="صندوق رسائل فارغ" class="empty-chat-icon">
                        <p>صندوق رسائلك فارغ</p>
                    </li>
                `;
            } else {
                contacts.sort((a, b) => b.unreadCount - a.unreadCount);
                contacts.forEach(contact => {
                    const li = document.createElement('li');
                    li.setAttribute('data-user-id', contact.id);
                    const unreadBadge = contact.unreadCount > 0 ? `<span class="unread-count">${contact.unreadCount}</span>` : '';
                    li.innerHTML = `
    <img src="${contact.avatar || 'images/default-user.png'}" alt="${contact.name}" class="user-avatar-small">
    <span class="user-name">${contact.name}</span>
    ${unreadBadge}
    <span class="delete-contact-btn" data-user-id="${contact.id}">&times;</span>
`;
                    li.addEventListener('click', () => {
                        hidePrivateChatModal();
                        createAndShowPrivateChatDialog(contact);
                    });
                    ulElement.appendChild(li);
                });
            }

            ulElement.querySelectorAll('.delete-contact-btn').forEach(deleteBtn => {
                deleteBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    const contactIdToDelete = deleteBtn.getAttribute('data-user-id');
                    const currentUserId = localStorage.getItem('chatUserId');
                    if (!currentUserId || !contactIdToDelete) {
                        console.error("معرف المستخدم أو جهة الاتصال غير موجود.");
                        return;
                    }
                    try {
                        const chatQuery = query(collection(db, 'privateChats'), 
                                                or(
                                                    and(where('senderId', '==', currentUserId), where('receiverId', '==', contactIdToDelete)),
                                                    and(where('senderId', '==', contactIdToDelete), where('receiverId', '==', currentUserId))
                                                ));
                        const chatSnapshot = await getDocs(chatQuery);
                        if (!chatSnapshot.empty) {
                            const chatDoc = chatSnapshot.docs[0];
                            await deleteDoc(doc(db, 'privateChats', chatDoc.id));
                        }
                        const listItem = deleteBtn.closest('li');
                        if (listItem) {
                            listItem.remove();
                            console.log(`تم حذف المحادثة بنجاح: ${contactIdToDelete}`);
                            const ulElement = privateChatModal.querySelector('.private-chat-list');
                            const remainingItems = ulElement.querySelectorAll('li:not(.empty-chat-message)');
                            if (remainingItems.length === 0) {
                                ulElement.innerHTML = `
                                    <li class="empty-chat-message">
                                        <img src="nodata.png" alt="صندوق رسائل فارغ" class="empty-chat-icon">
                                        <p>صندوق رسائلك فارغ</p>
                                    </li>
                                `;
                            }
                        }
                    } catch (error) {
                        console.error("خطأ في حذف المحادثة:", error);
                        alert("فشل حذف المحادثة. يرجى التأكد من صلاحيات الحذف.");
                    }
                });
            });

        } catch (error) {
            console.error('خطأ في جلب جهات الاتصال الخاصة:', error);
            const ulElement = privateChatModal.querySelector('.private-chat-list');
            ulElement.innerHTML = `<li style="text-align: center; padding: 10px; color: red;">فشل تحميل جهات الاتصال.</li>`;
        }
    } else {
        const ulElement = privateChatModal.querySelector('.private-chat-list');
        ulElement.innerHTML = `<li style="text-align: center; padding: 10px; color: red;">الرجاء تسجيل الدخول لعرض المحادثات الخاصة.</li>`;
    }
}


function handleOnlineUsersModalOutsideClick(event) {
    const onlineUsersButton = document.querySelector('#online-users-btn');
    const isClickInsideOnlineUsersModal = onlineUsersModal && onlineUsersModal.contains(event.target);
    const isClickInsideUserInfoModal = window.userInfoModal && window.userInfoModal.contains(event.target);
    const isClickOnOnlineUsersButton = onlineUsersButton && onlineUsersButton.contains(event.target);
    if (onlineUsersModal && !isClickInsideOnlineUsersModal && !isClickOnOnlineUsersButton && !isClickInsideUserInfoModal) {
        hideOnlineUsersModal();
        document.removeEventListener('click', handleOnlineUsersModalOutsideClick);
    }
}

async function createOnlineUsersModal(buttonElement) {
    hideAllOpenModals();
    if (onlineUsersModal) {
        onlineUsersModal.remove();
        onlineUsersModal = null;
    }
    onlineUsersModal = document.createElement('div');
    onlineUsersModal.classList.add('online-users-modal');
    const currentUserName = localStorage.getItem('chatUserName') || 'زائر';
    onlineUsersModal.innerHTML = `
        <div class="modal-header new-header-buttons">
            <div class="header-buttons-container">
                <button class="header-btn" id="friends-btn"><i class="fa-solid fa-user-group"></i> الأصدقاء</button>
                <button class="header-btn" id="visitors-btn"><i class="fa-solid fa-users"></i> الزوار</button>
                <button class="header-btn" id="search-btn"><i class="fa-solid fa-magnifying-glass"></i> بحث</button>
            </div>
            <button class="close-btn">&times;</button>
        </div>
        <div class="modal-content-area"></div>
    `;
    document.body.appendChild(onlineUsersModal);

    const modalContentArea = onlineUsersModal.querySelector('.modal-content-area');
    const friendsBtn = onlineUsersModal.querySelector('#friends-btn');
    const visitorsBtn = onlineUsersModal.querySelector('#visitors-btn');
    const searchBtn = onlineUsersModal.querySelector('#search-btn');
    const updateActiveButton = (activeButton) => {
        [friendsBtn, visitorsBtn, searchBtn].forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
    };
    if (modalContentArea) {
        await fetchAndDisplayOnlineUsers(modalContentArea, currentUserName);
        updateActiveButton(visitorsBtn);
    }
    onlineUsersModal.style.display = 'flex';
    if (friendsBtn) friendsBtn.addEventListener('click', () => { updateActiveButton(friendsBtn); if (modalContentArea) fetchAndDisplayFriendsList(modalContentArea, currentUserName); });
    if (visitorsBtn) visitorsBtn.addEventListener('click', () => { updateActiveButton(visitorsBtn); if (modalContentArea) fetchAndDisplayOnlineUsers(modalContentArea, currentUserName); });
    if (searchBtn) searchBtn.addEventListener('click', () => { updateActiveButton(searchBtn); if (modalContentArea) showSearchInterface(modalContentArea, currentUserName); });
    onlineUsersModal.querySelector('.close-btn').addEventListener('click', () => hideOnlineUsersModal());
    document.addEventListener('click', handleOnlineUsersModalOutsideClick);
}

// ✨ دالة عرض مشتركة بين تبويب "الأصدقاء" وتبويب "الزوار": تُجمّع المستخدمين
// حسب الرتبة بنفس الترتيب، وتبني كل صف بنفس التصميم بالضبط — حتى يتطابق
// حجم/شكل عناصر القائمة في التبويبين تمامًا.
function renderUsersGroupedByRank(listElement, users) {
    listElement.innerHTML = '';
    const groupedUsers = {};
    users.forEach(user => {
        const rank = user.rank || 'زائر';
        if (!groupedUsers[rank]) groupedUsers[rank] = [];
        groupedUsers[rank].push(user);
    });
    const sortedRanks = RANK_ORDER.filter(rank => groupedUsers[rank]);
    const otherRanks = Object.keys(groupedUsers).filter(rank => !RANK_ORDER.includes(rank));
    sortedRanks.push(...otherRanks.sort());
    sortedRanks.forEach(rank => {
        const usersInRank = groupedUsers[rank];
        if (usersInRank && usersInRank.length > 0) {
            const rankHeader = document.createElement('div');
            rankHeader.classList.add('rank-header');
            rankHeader.setAttribute('data-rank', rank);
            let iconHtml = '';
            switch(rank) {
                case 'المالك': iconHtml = '<i class="fas fa-crown"></i>'; break;
                case 'اونر اداري': iconHtml = '<i class="fas fa-gavel"></i>'; break;
                case 'اونر': iconHtml = '<i class="fas fa-star"></i>'; break;
                case 'سوبر اداري': iconHtml = '<i class="fas fa-shield-alt"></i>'; break;
                case 'مشرف': iconHtml = '<i class="fas fa-user-tie"></i>'; break;
                case 'سوبر ادمن': iconHtml = '<i class="fas fa-user-shield"></i>'; break;
                case 'ادمن': iconHtml = '<i class="fas fa-user-cog"></i>'; break;
                case 'بريميوم': iconHtml = '<i class="fas fa-gem"></i>'; break;
                case 'بلاتينيوم': iconHtml = '<i class="fas fa-medal"></i>'; break;
                case 'ملكي': iconHtml = '<i class="fas fa-chess-king"></i>'; break;
                case 'ذهبي': iconHtml = '<i class="fas fa-money-bill-wave"></i>'; break;
                case 'برونزي': iconHtml = '<i class="fas fa-medal"></i>'; break;
                case 'عضو': iconHtml = '<i class="fas fa-user"></i>'; break;
                case 'زائر': iconHtml = '<i class="fas fa-ghost"></i>'; break;
                default: iconHtml = '<i class="fas fa-users"></i>';
            }
            rankHeader.innerHTML = `${iconHtml}<h3>${rank}</h3>`;
            listElement.appendChild(rankHeader);
            usersInRank.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            usersInRank.forEach(user => {
                const userItemDiv = document.createElement('div');
                userItemDiv.classList.add('user-item');
                const rankImageSrc = RANK_IMAGE_MAP[user.rank] || RANK_IMAGE_MAP['default'];
                userItemDiv.innerHTML = `
                    <img src="${user.avatar || 'images/default-user.png'}" alt="${user.name}" class="user-avatar-small">
                    <div class="user-main-info">
                        <span class="user-name">${user.name}</span>
                        <span class="user-status">${user.statusText || ''}</span>
                    </div>
                    <div class="user-rank-box">
                        <img src="${rankImageSrc}" alt="${user.rank}" class="user-rank-image" title="${user.rank}" />
                    </div>
                `;

                const userAvatarElement = userItemDiv.querySelector('.user-avatar-small');
                if (userAvatarElement) {
                    userAvatarElement.addEventListener('click', (event) => {
                        event.stopPropagation();
                        createUserInfoModal(userAvatarElement, user, window.allUsersAndVisitorsData);
                    });
                }
                listElement.appendChild(userItemDiv);
            });
        }
    });
}

// ✨ نافذة "الأصدقاء" داخل نافذة المتصلين: تعرض فقط قائمة أصدقاء المستخدم
// الحالي الفعليين (المخزّنين في حقل friends على مستند المستخدم/الزائر بعد
// قبول طلب صداقة)، وليس كل المستخدمين المتصلين. نفس تجميع/ترتيب الرتب
// المستخدم في تبويب الزوار (عبر renderUsersGroupedByRank).
async function fetchAndDisplayFriendsList(modalContentArea, currentUserName) {
    modalContentArea.innerHTML = `
        <div class="welcome-message-box">
            قائمة أصدقائك يا ${currentUserName} 👥
        </div>
        <div class="online-users-list">
            <div class="spinner-container">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;
    const friendsListEl = modalContentArea.querySelector('.online-users-list');
    try {
        const currentUserId = localStorage.getItem('chatUserId');
        const [currentUserData, allUsers] = await Promise.all([
            getUserData(currentUserId),
            getAllUsersAndVisitors(true)
        ]);

        const friendIds = (currentUserData && currentUserData.friends) || [];

        if (friendIds.length === 0) {
            friendsListEl.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">لا يوجد لديك أصدقاء بعد.</div>`;
            return;
        }

        // ✨ نطابق معرّفات الأصدقاء مع قائمة كل المستخدمين/الزوار المُطبّعة
        // (بها name/avatar/rank موحّدة)، ونتجاهل أي معرّف لم يعد له حساب موجود.
        const friends = friendIds
            .map(id => allUsers.find(u => u.id === id))
            .filter(Boolean);

        if (friends.length === 0) {
            friendsListEl.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">لا يوجد لديك أصدقاء بعد.</div>`;
            return;
        }

        renderUsersGroupedByRank(friendsListEl, friends);
    } catch (error) {
        console.error("خطأ في جلب قائمة الأصدقاء:", error);
        friendsListEl.innerHTML = `<div style="text-align: center; padding: 20px; color: red;">فشل تحميل قائمة الأصدقاء.</div>`;
    }
}

async function fetchAndDisplayOnlineUsers(modalContentArea, currentUserName) {
    modalContentArea.innerHTML = `
        <div class="welcome-message-box">
            أهلاً وسهلاً بك معنا، ${currentUserName} يسعد مساءك بكل خير 🌙
        </div>
        <div class="online-users-list">
            <div class="spinner-container">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;
    const onlineUsersList = modalContentArea.querySelector('.online-users-list');
    try {
        // ✨ نجلب البيانات دائماً بطلب جديد من Firestore عند فتح القائمة (forceRefresh = true)
        // بدل الاعتماد على الكاش الذي قد يكون مُعبأ مسبقاً من تحميل الصفحة، حتى تظهر
        // حالة التحميل فعلياً وتكون القائمة محدثة كل مرة.
        const users = await getAllUsersAndVisitors(true);
        if (users.length === 0) {
            onlineUsersList.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">لا يوجد مستخدمون متصلون حالياً.</div>`;
            return;
        }
        renderUsersGroupedByRank(onlineUsersList, users);
    } catch (error) {
        console.error("خطأ في جلب المستخدمين المتصلين:", error);
        onlineUsersList.innerHTML = `<div style="text-align: center; padding: 20px; color: red;">فشل تحميل قائمة المستخدمين.</div>`;
    }
}

async function fetchAndDisplayRooms(modalContentArea) {
    modalContentArea.innerHTML = `
        <div class="welcome-message-box">اختر غرفة للانضمام إليها.</div>
        <div class="rooms-list"><div style="text-align: center; padding: 20px; color: #888;">جاري تحميل الغرف...</div></div>
    `;
    const roomsList = modalContentArea.querySelector('.rooms-list');
    if (!roomsList) {
        console.error("خطأ: لم يتم العثور على عنصر قائمة الغرف.");
        return;
    }
    try {
        const rooms = await getChatRooms();
        roomsList.innerHTML = '';
        if (rooms.length === 0) {
            roomsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">لا توجد غرف متاحة حالياً.</div>`;
        } else {
            rooms.forEach(room => {
    const roomItemDiv = document.createElement('div');
    roomItemDiv.classList.add('room-item');
    roomItemDiv.setAttribute('data-room-id', room.id);
    roomItemDiv.setAttribute('data-locked', room.locked ? "true" : "false");
    roomItemDiv.innerHTML = `
        <div class="room-info">
            <span class="room-name">${room.name}</span>
            <span class="room-user-count"><i class="fas fa-users"></i> ${room.userCount || 0}</span>
            ${room.locked ? '<span class="room-lock-icon"><i class="fas fa-lock"></i></span>' : ''}
        </div>
    `;

    roomItemDiv.addEventListener('click', () => {
    if (room.locked) {
        showRoomsPasswordModal(room.id, room.name, room.password);
    } else {
        localStorage.setItem('lastVisitedRoomId', room.id);
        window.location.href = `chat.html?roomId=${room.id}`;
    }
});
roomsList.appendChild(roomItemDiv);
});
        }
    } catch (error) {
        console.error("خطأ في جلب الغرف:", error);
        roomsList.innerHTML = `<div style="text-align: center; padding: 20px; color: red;">فشل تحميل قائمة الغرف.</div>`;
    }
}

function showSearchInterface(modalContentArea) {
    modalContentArea.innerHTML = `
        <div class="search-input-container">
            <input type="text" id="user-search-input" placeholder="ابحث بالاسم..." />
            <button id="clear-search-btn">&times;</button>
        </div>
        <div class="search-results-list online-users-list">
            <div style="text-align: center; padding: 20px; color: #888;">ابدأ الكتابة للبحث عن المستخدمين...</div>
        </div>
    `;
    const searchInput = modalContentArea.querySelector('#user-search-input');
    const searchResultsList = modalContentArea.querySelector('.search-results-list');
    const clearSearchBtn = modalContentArea.querySelector('#clear-search-btn');
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchResultsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">ابدأ الكتابة للبحث عن المستخدمين...</div>`;
        clearSearchBtn.style.display = 'none';
    });
    searchInput.addEventListener('input', async (event) => {
        const searchTerm = event.target.value.toLowerCase().trim();
        if (searchTerm.length > 0) clearSearchBtn.style.display = 'block';
        else clearSearchBtn.style.display = 'none';
        if (searchTerm.length < 2) {
            searchResultsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">الرجاء إدخال حرفين على الأقل للبحث.</div>`;
            return;
        }
        searchResultsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">جاري البحث عن "${searchTerm}"...</div>`;
        try {
            const allUsers = await getAllUsersAndVisitors();
            const filteredUsers = allUsers.filter(user =>
                user.name.toLowerCase().includes(searchTerm)
            );
            searchResultsList.innerHTML = '';
            if (filteredUsers.length === 0) {
                searchResultsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">لا يوجد مستخدمون يطابقون بحثك.</div>`;
            } else {
                filteredUsers.forEach(user => {
                    const userItemDiv = document.createElement('div');
                    userItemDiv.classList.add('user-item');
const rankImageSrc = RANK_IMAGE_MAP[user.rank] || RANK_IMAGE_MAP['default'];
userItemDiv.innerHTML = `
    <img src="${user.avatar || 'images/default-user.png'}" alt="${user.name}" class="user-avatar-small">
    <div class="user-main-info">
        <span class="user-name">${user.name}</span>
        <span class="user-status">${user.statusText || ''}</span>
    </div>
    <div class="user-rank-box">
        <img src="${rankImageSrc}" alt="${user.rank}" class="user-rank-image" title="${user.rank}" />
    </div>
`;
const userAvatarElement = userItemDiv.querySelector('.user-avatar-small');
if (userAvatarElement) {
    userAvatarElement.addEventListener('click', (event) => {
        event.stopPropagation();
        createUserInfoModal(userAvatarElement, user, window.allUsersAndVisitorsData);
    });
}
searchResultsList.appendChild(userItemDiv);
                });
            }
        } catch (error) {
            console.error("خطأ في البحث عن المستخدمين:", error);
            searchResultsList.innerHTML = `<div style="text-align: center; padding: 20px; color: red;">فشل البحث عن المستخدمين.</div>`;
        }
    });
}

function handleProfileDropdownOutsideClick(event) {
    if (profileDropdownMenu && profileDropdownMenu.classList.contains('show') && !profileDropdownMenu.contains(event.target) && !profileButton.contains(event.target)) {
        hideProfileDropdown();
    }
}

function showRoomsPasswordModal(roomId, roomName, roomPassword) {
    // إذا المودال موجود مسبقاً، احذفه أولاً
    let existingModal = document.getElementById('jsRoomsPasswordModal');
    if (existingModal) existingModal.remove();

    // أنشئ عناصر المودال
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'jsRoomsPasswordModal';
    modal.innerHTML = `
        <div class="modal-content password-modal-content">
            <span class="close" id="closeJsPasswordModal">&times;</span>
            <h4 style="margin-bottom:15px;color:#7c3aed;">الغرفة مغلقة: ${roomName}</h4>
            <form id="jsRoomPasswordForm" autocomplete="off">
                <div class="form-group" style="margin-bottom:10px;">
                    <label for="jsEnterRoomPassword">أدخل كلمة المرور للغرفة</label>
                    <input type="password" id="jsEnterRoomPassword" name="jsEnterRoomPassword" maxlength="40" autocomplete="current-password" placeholder="كلمة المرور" required>
                </div>
                <button type="submit" class="submit-btn">دخول</button>
            </form>
            <div id="jsPasswordModalMsg" class="modal-msg"></div>
        </div>
    `;
    document.body.appendChild(modal);

    // حدث إغلاق المودال
    document.getElementById('closeJsPasswordModal').onclick = function() {
        modal.remove();
    };

    // حدث إرسال كلمة المرور
    document.getElementById('jsRoomPasswordForm').onsubmit = function(e) {
        e.preventDefault();
        const msgDiv = document.getElementById('jsPasswordModalMsg');
        msgDiv.textContent = '';
        const enteredPassword = document.getElementById('jsEnterRoomPassword').value.trim();
        if (!enteredPassword) {
            msgDiv.textContent = 'يرجى إدخال كلمة المرور.';
            return;
        }
        if (enteredPassword === roomPassword) {
            modal.remove();
            localStorage.setItem('lastVisitedRoomId', roomId);
            window.location.href = `chat.html?roomId=${roomId}`;
        } else {
            msgDiv.textContent = 'كلمة المرور غير صحيحة!';
        }
    };
}

// ✨ أنواع رسائل النظام الخاصة بالكتم/الطرد/الحظر لا تُعرض عند تحميل
// السجل (عند فتح الغرفة أو تحديث الصفحة) — تظهر فقط لحظة حدوثها مباشرة
// عبر المستمع اللحظي في chat-firestore.js (listenForNewMessages)، وتختفي
// تلقائيًا بعد أي تحديث للصفحة لأن renderMessages تتجاهلها هنا.
const HIDDEN_HISTORY_SYSTEM_TYPES = ['mute', 'mute-main', 'mute-private', 'kick', 'ban'];

export function renderMessages(docs, clear = false) {
    const chatBox = document.querySelector('#chat-box .chat-box');
    if (!chatBox) return;

    // ✨ حفظ موضع التمرير الحالي قبل إضافة الرسائل الجديدة.
    // ✨ هذا مهم عند تحميل رسائل قديمة لمنع القفز المفاجئ.
    const isAtBottom = (chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 1);
    const oldScrollHeight = chatBox.scrollHeight;

    // ✨ إذا كان 'clear' صحيحاً، امسح كل الرسائل الموجودة.
    if (clear) {
        chatBox.innerHTML = '';
    }

    docs.forEach(docSnap => {
        const msgData = { id: docSnap.id, ...docSnap.data() };

        // ✨ تجاهل رسائل نظام الكتم/الطرد/الحظر عند التحميل من السجل
        if (msgData.isSystemMessage && HIDDEN_HISTORY_SYSTEM_TYPES.includes(msgData.type)) {
            return;
        }

        const senderData = getUserById(msgData.senderId);
        
        // ✨ هذا الشرط مهم: يجب التأكد من عدم إضافة الرسائل المكررة.
        // ✨ إذا كانت الرسالة موجودة مسبقًا، لا تفعل شيئاً.
        const existingElement = chatBox.querySelector(`[data-id="${msgData.id}"]`);
        if (existingElement) {
            return;
        }

        if (!msgData.isSystemMessage) {
            msgData.userType = senderData?.rank === 'زائر' ? 'visitor' : 'registered';
            msgData.senderRank = senderData?.rank || 'زائر';
            msgData.level = senderData?.level || 1;
            // ✨ نفس فكرة تحديث الرتبة/المستوى: نأخذ الأفتار الحالي لصاحب
            // الرسالة بدل الأفتار المجمّد وقت الإرسال، حتى تظهر رسائله
            // القديمة (وقت ما كان زائر مثلاً) بأفتار العضوية الحالي بعد
            // أي تحديث للصفحة، بدل ما تبقى عالقة على أفتار الزائر القديم.
            if (senderData?.avatar) {
                msgData.avatar = senderData.avatar;
            }
        }
        
        const elem = msgData.isSystemMessage ?
            createSystemMessageElement(msgData.text) :
            createMessageElement(msgData);

        if (clear) {
            // ✨ عند التحميل الأولي، أضف الرسائل في النهاية.
            chatBox.appendChild(elem);
        } else {
            // ✨ عند تحميل رسائل أقدم، أضفها في البداية.
            chatBox.insertBefore(elem, chatBox.firstChild);
        }
    });

    // ✨ بعد إضافة الرسائل الجديدة، اضبط موضع التمرير.
    setTimeout(() => {
        if (clear) {
            // ✨ عند التحميل الأولي، مرر للأسفل.
            chatBox.scrollTop = chatBox.scrollHeight;
        } else if (!isAtBottom) {
            // ✨ عند تحميل المزيد من الرسائل القديمة، حافظ على موضع التمرير.
            chatBox.scrollTop = chatBox.scrollHeight - oldScrollHeight;
        }
    }, 0);
}

// في ملف main.js
// ... (بقية الكود) ...
async function showDeleteAllConfirmationModal(onConfirm) {
    let confirmationModal = document.querySelector('.confirmation-modal');
    if (!confirmationModal) {
        confirmationModal = document.createElement('div');
        confirmationModal.classList.add('confirmation-modal');
        confirmationModal.innerHTML = `
            <p>هل أنت متأكد من أنك تريد حذف جميع جهات الاتصال والمحادثات؟</p>
            <div class="modal-buttons">
                <button class="confirm-btn">تأكيد</button>
                <button class="cancel-btn">إلغاء</button>
            </div>
        `;
        document.body.appendChild(confirmationModal);
    }

    confirmationModal.style.display = 'block';

    const confirmBtn = confirmationModal.querySelector('.confirm-btn');
    const cancelBtn = confirmationModal.querySelector('.cancel-btn');

    confirmBtn.onclick = async (event) => {
        event.stopPropagation(); // ✨ منع إغلاق المودال
        await onConfirm();
        confirmationModal.style.display = 'none';
    };

    cancelBtn.onclick = (event) => {
        event.stopPropagation(); // ✨ منع إغلاق المودال
        confirmationModal.style.display = 'none';
    };
}


async function deleteAllPrivateChats() {
    const currentUserId = localStorage.getItem('chatUserId');
    if (!currentUserId) {
        console.error("معرف المستخدم غير موجود.");
        return;
    }

    try {
        const chatQuery = query(collection(db, 'privateChats'), 
                                or(
                                    where('senderId', '==', currentUserId),
                                    where('receiverId', '==', currentUserId)
                                ));
        const chatSnapshot = await getDocs(chatQuery);
        
        const deletePromises = [];
        chatSnapshot.forEach(docSnap => {
            deletePromises.push(deleteDoc(doc(db, 'privateChats', docSnap.id)));
        });
        
        await Promise.all(deletePromises);

        // ✨ تحديث واجهة المستخدم بعد الحذف
        const ulElement = privateChatModal.querySelector('.private-chat-list');
        ulElement.innerHTML = `
            <li class="empty-chat-message">
                <img src="nodata.png" alt="صندوق رسائل فارغ" class="empty-chat-icon">
                <p>صندوق رسائلك فارغ</p>
            </li>
        `;
        console.log("تم حذف جميع المحادثات بنجاح.");

    } catch (error) {
        console.error("خطأ في حذف جميع المحادثات:", error);
        alert("فشل حذف المحادثات. يرجى المحاولة مرة أخرى.");
    }
}


// دالة جديدة للتحقق من حالة الكتم وتحديث واجهة المستخدم
 
export async function checkMuteStatusAndUpdateUI() {
    const currentUserId = localStorage.getItem('chatUserId');
    if (!currentUserId) return;

    // عناصر واجهة المستخدم للدردشة العامة
    const mainMessageInput = document.getElementById('message-input');
    const mainSendButton = document.querySelector('.send-btn');
    const mainEmojiButton = document.querySelector('.emoji-btn-circle');
    const mainPlusButton = document.getElementById('plus-btn-toggle');
    const mainImageUpload = document.getElementById('image-upload-input');

    // عناصر واجهة المستخدم للدردشة الخاصة
    const privateMessageInput = document.getElementById('private-message-input');
    const privateSendButton = document.getElementById('private-send-btn');
    const privateEmojiButton = document.getElementById('private-emoji-btn');
    // 👇🏻 هذا هو السطر الذي يجب تعديله. يجب أن يتطابق مع الـ ID الفعلي.
    const privatePlusButton = document.getElementById('private-plus-btn-toggle'); 
    const privateImageUpload = document.getElementById('private-image-upload');
    
    // تأكد من أن الكود لا ينهار إذا لم يتم العثور على أي عنصر
    if (!mainMessageInput && !privateMessageInput) {
        console.error('فشل في العثور على أي من حقول إدخال الدردشة.');
        return;
    }

    try {
        let userDocRef = doc(db, "users", currentUserId);
        let userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            userDocRef = doc(db, "visitors", currentUserId);
            userDocSnap = await getDoc(userDocRef);
        }

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const isMuted = userData.isMuted || false;
            const mutedUntil = userData.mutedUntil;
            // ✨ كتم الدردشة الرئيسية فقط (يبقى بإمكان المستخدم الدردشة الخاصة)
            const isMutedMain = userData.isMutedMain || false;
            const mutedMainUntil = userData.mutedMainUntil;
            // ✨ كتم الدردشة الخاصة فقط (يبقى بإمكان المستخدم الدردشة العامة)
            const isMutedPrivate = userData.isMutedPrivate || false;
            const mutedPrivateUntil = userData.mutedPrivateUntil;

            let isMutedNow = isMuted;
            if (isMuted && mutedUntil !== 'permanent' && mutedUntil < Date.now()) {
                await updateDoc(userDocRef, { isMuted: false, mutedUntil: null });
                isMutedNow = false;
            }

            let isMutedMainNow = isMutedMain;
            if (isMutedMain && mutedMainUntil !== 'permanent' && mutedMainUntil < Date.now()) {
                await updateDoc(userDocRef, { isMutedMain: false, mutedMainUntil: null });
                isMutedMainNow = false;
            }

            let isMutedPrivateNow = isMutedPrivate;
            if (isMutedPrivate && mutedPrivateUntil !== 'permanent' && mutedPrivateUntil < Date.now()) {
                await updateDoc(userDocRef, { isMutedPrivate: false, mutedPrivateUntil: null });
                isMutedPrivateNow = false;
            }

            const applyMuteRestrictions = (input, send, emoji, plus, image) => {
                if (input) {
                    input.disabled = true;
                    input.placeholder = 'الدردشة مقفلة';
                    input.value = '';
                }
                if (send) send.disabled = true;
                if (emoji) emoji.disabled = true;
                if (plus) plus.disabled = true;
                if (image) image.disabled = true;
            };

            const removeMuteRestrictions = (input, send, emoji, plus, image) => {
                if (input) {
                    input.disabled = false;
                    input.placeholder = 'اكتب هنا...';
                }
                if (send) send.disabled = false;
                if (emoji) emoji.disabled = false;
                if (plus) plus.disabled = false;
                if (image) image.disabled = false;
            };

            // ✨ الدردشة العامة تُقفل إذا كان المستخدم مكتومًا كتمًا كاملاً أو
            // مكتومًا في الرئيسية فقط. الدردشة الخاصة تُقفل إذا كان مكتومًا
            // كتمًا كاملاً أو مكتومًا في الخاصة فقط. كل نوع كتم يعمل بشكل
            // مستقل عن الآخر تمامًا.
            if (isMutedNow || isMutedMainNow) {
                applyMuteRestrictions(mainMessageInput, mainSendButton, mainEmojiButton, mainPlusButton, mainImageUpload);
            } else {
                removeMuteRestrictions(mainMessageInput, mainSendButton, mainEmojiButton, mainPlusButton, mainImageUpload);
            }

            if (isMutedNow || isMutedPrivateNow) {
                applyMuteRestrictions(privateMessageInput, privateSendButton, privateEmojiButton, privatePlusButton, privateImageUpload);
            } else {
                removeMuteRestrictions(privateMessageInput, privateSendButton, privateEmojiButton, privatePlusButton, privateImageUpload);
            }
        }
    } catch (error) {
        console.error("خطأ في التحقق من حالة الكتم:", error);
    }
}

function updateConnectionStatus(isOnline) {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.querySelector('.send-btn');
    const emojiButton = document.querySelector('.emoji-btn-circle');
    const plusButton = document.getElementById('plus-btn-toggle');
    const imageUpload = document.getElementById('image-upload-input');

    if (messageInput && sendButton) {
        if (isOnline) {
            messageInput.disabled = false;
            sendButton.disabled = false;
            messageInput.placeholder = 'اكتب هنا...';
            // قد تحتاج إلى تفعيل الأزرار الأخرى أيضًا
            if (emojiButton) emojiButton.disabled = false;
            if (plusButton) plusButton.disabled = false;
            if (imageUpload) imageUpload.disabled = false;

            // إظهار رسالة للمستخدم
            
        } else {
            messageInput.disabled = true;
            sendButton.disabled = true;
            messageInput.placeholder = 'غير متصل بالإنترنت ⚠️';
            // تعطيل الأزرار الأخرى
            if (emojiButton) emojiButton.disabled = true;
            if (plusButton) plusButton.disabled = true;
            if (imageUpload) imageUpload.disabled = true;

            // إظهار رسالة تحذير
            
        }
    }
}

//js/main.js

//js/main.js

/**
 * دالة لإنشاء وإضافة نافذة رفع الأغاني المنبثقة.
 * هذه الدالة يجب أن يتم استدعاؤها مرة واحدة فقط عند تحميل الصفحة.
 */
function createAndAppendMusicUploadModal() {
    if (document.getElementById('music-upload-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'music-upload-modal';
    modal.className = 'upload-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-btn" id="close-music-modal">&times;</span>
            <div id="upload-ui-container" class="ui-container active">
                <label for="music-upload-input" class="custom-file-upload">
                    <i class="fas fa-file-audio"></i> اختر ملف صوتي
                </label>
                <input type="file" id="music-upload-input" accept="audio/*" style="display: none;">
            </div>
            
            <div id="new-progress-bar-container" class="new-progress-bar-container ui-container">
                <div id="new-progress-bar" class="new-progress-bar"></div>
            </div>

            <div id="audio-preview-container" class="audio-preview-container ui-container">
                <audio id="music-player" controls></audio>
                <div class="preview-buttons">
                    <button id="delete-music-btn" class="delete-btn">حذف</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.width = '320px';
        modalContent.style.height = '160px';
    }

    const uploadUI = document.getElementById('upload-ui-container');
    const newProgressUI = document.getElementById('new-progress-bar-container');
    const audioPreviewUI = document.getElementById('audio-preview-container');
    const musicPlayer = document.getElementById('music-player');
    const deleteBtn = document.getElementById('delete-music-btn');
    const musicUploadInput = document.getElementById('music-upload-input');

    const setUIState = (state) => {
        const containers = [uploadUI, newProgressUI, audioPreviewUI];
        containers.forEach(container => container.classList.remove('active'));
        if (state === 'upload') {
            uploadUI.classList.add('active');
        } else if (state === 'progress') {
            newProgressUI.classList.add('active');
        } else if (state === 'preview') {
            audioPreviewUI.classList.add('active');
        }
    };
    
    const saveMusicUrlToFirestore = async (url) => {
        const currentUserId = localStorage.getItem('chatUserId');
        if (!currentUserId) {
            console.error('فشل في حفظ الرابط: User ID غير موجود.');
            return;
        }

        try {
            await updateUserData(currentUserId, { musicUrl: url });
            console.log('تم حفظ رابط الملف الصوتي في Firestore بنجاح:', url);
        } catch (error) {
            console.error('فشل حفظ الرابط في Firestore:', error);
        }
    };

    deleteBtn.addEventListener('click', async () => {
        const currentUserId = localStorage.getItem('chatUserId');
        const confirmDelete = confirm('هل أنت متأكد من حذف الملف الصوتي؟');
        if (confirmDelete && currentUserId) {
            try {
                await updateUserData(currentUserId, { musicUrl: null });
                console.log('تم حذف رابط الملف الصوتي من Firestore.');
                setUIState('upload');
            } catch (error) {
                console.error('فشل حذف الرابط من Firestore:', error);
            }
        }
    });

    musicUploadInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setUIState('progress');

        try {
            const musicUrl = await uploadFileToCloudinary(file, (progress) => {
                document.getElementById('new-progress-bar').style.width = `${progress}%`;
            });

            if (musicUrl) {
                musicPlayer.src = musicUrl;
                setUIState('preview');
                await saveMusicUrlToFirestore(musicUrl);
            }
        } catch (error) {
            console.error('فشل رفع الأغنية:', error);
            setUIState('upload');
            alert('فشل رفع الأغنية. يرجى المحاولة مرة أخرى.');
        }
    });

    document.getElementById('close-music-modal').addEventListener('click', () => {
    // 🚨 التعديل الرئيسي هنا: إيقاف تشغيل مشغل الصوت
    if (!musicPlayer.paused) { // للتأكد من أنها لا تعمل بالفعل
         musicPlayer.pause();
    }
    
    modal.style.display = 'none';
});

    
    // ✨ وظيفة جديدة: لجلب الرابط المحفوظ عند فتح النافذة
    const loadSavedMusicUrl = async () => {
        const currentUserId = localStorage.getItem('chatUserId');
        if (currentUserId) {
            try {
                const userDocRef = doc(db, 'users', currentUserId);
                const userDocSnap = await getDoc(userDocRef);
                const userData = userDocSnap.data();
                if (userData && userData.musicUrl) {
                    musicPlayer.src = userData.musicUrl;
                    setUIState('preview');
                } else {
                    setUIState('upload');
                }
            } catch (error) {
                console.error('حدث خطأ أثناء جلب الرابط:', error);
                setUIState('upload');
            }
        } else {
            setUIState('upload');
        }
    };

    // ✨ استدعاء الدالة هنا لتهيئة الحالة عند الإنشاء
    loadSavedMusicUrl();
}

/**
 * دالة لإظهار النافذة المنبثقة لرفع الأغاني.
 * هذه هي الدالة التي يجب استدعاؤها عند الضغط على الزر.
 */
window.showMusicUploadModal = function() {
    createAndAppendMusicUploadModal();
    const musicModal = document.getElementById('music-upload-modal');
    if (musicModal) {
        musicModal.style.display = 'flex';
        // ✨ استدعاء الدالة عند إظهار المودال لضمان التحقق من الرابط المحفوظ
        // لا نحتاج لهذه الخطوة الآن لأننا نزيل السطر setUIState('upload')
    }
};



document.addEventListener('DOMContentLoaded', async () => {
    window.addEventListener('online', () => {
    console.log('أنت الآن متصل بالإنترنت!');
    // يمكنك إضافة وظائف هنا لتحديث الواجهة، مثل إظهار رسالة "متصل"
    updateConnectionStatus(true);
});

window.addEventListener('offline', () => {
    console.log('لقد فقدت الاتصال بالإنترنت!');
    // يمكنك إضافة وظائف هنا لتحديث الواجهة، مثل إظهار رسالة "غير متصل"
    updateConnectionStatus(false);
});

    //js/main.js.
updateConnectionStatus(navigator.onLine);

    try {
    // حاول جلب كل المستخدمين والزوار (سيُستخدم الكاش الموجود مسبقاً إن كان لا يزال صالحاً)
    // ملاحظة: نمرّرها عبر setAllUsersAndVisitorsData بدل التعيين المباشر حتى يُبنى
    // فهرس البحث السريع (Map) المستخدم في getUserById() لكل رسالة واردة.
    setAllUsersAndVisitorsData(await getAllUsersAndVisitors());
} catch (error) {
    // إذا فشل الاتصال، لا تفعل شيئاً حالياً
    console.error("خطأ في جلب البيانات: قد يكون هناك مشكلة في الاتصال.");
}

let chatUserId = localStorage.getItem('chatUserId');
    let chatUserName = localStorage.getItem('chatUserName');
    let chatUserAvatar = localStorage.getItem('chatUserAvatar');
    let userType = localStorage.getItem('userType');
let isOnline = navigator.onLine; // تحقق من حالة الاتصال بالإنترنت

// إذا لم يكن هناك معرف للمستخدم في localStorage، قم بإعادة التوجيه مباشرة
if (!chatUserId) {
    window.location.href = 'index.html';
    return;
}

// إذا كان الاتصال متاحًا (online)
if (isOnline) {
    // ابحث عن المستخدم في البيانات التي تم جلبها
    const userData = window.allUsersAndVisitorsData?.find(user => user.id === chatUserId);

    // إذا لم يتم العثور على بيانات المستخدم، يعني أن الحساب محذوف.
    if (!userData) {
        console.warn('الحساب غير موجود في قاعدة البيانات. يتم إعادة التوجيه.');
        localStorage.clear(); // مسح كل بيانات المستخدم
        window.location.href = 'index.html';
        return;
    }
}

    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('roomId');
    const lastVisitedRoomId = localStorage.getItem('lastVisitedRoomId');
    currentRoomId = roomIdFromUrl || lastVisitedRoomId;
    if (!currentRoomId) {
        window.location.href = 'rooms.html';
        return;
    }
    localStorage.setItem('lastVisitedRoomId', currentRoomId);


    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer) {
        document.body.innerHTML = '<div style="text-align: center; color: red; padding-top: 50px;">خطأ: لم يتم العثور على عنصر "chat-container". تأكد من وجوده في ملف HTML (chat.html).</div>';
        return;
    }

// ... (بقية الكود لا يتغير) ..
    try {
        // ✨ المكونات الأربعة (top-bar, chat-box, input-bar, bottom-bar) أصبحت
        // مضمّنة مباشرة داخل chat.html، فلم تعد هناك حاجة لجلبها عبر fetch()
        // عند كل تحميل للصفحة — هذا يزيل 4 طلبات شبكة كانت تؤخر ظهور واجهة الدردشة.
        const currentUserId = localStorage.getItem('chatUserId');
        // ✨ ابدأ تحميل أول صفحة رسائل فوراً بمجرد جهوزية chat-box،
        // بالتوازي مع باقي إعداد الواجهة (أزرار، قوائم، مودالات...) بدل
        // انتظار كل تلك الإعدادات أولاً. هذا يقلل زمن ظهور الرسائل بشكل كبير.
        const initialMessagesPromise = loadInitialMessages(currentRoomId, renderMessages);
        const currentUserData = window.allUsersAndVisitorsData.find(user => user.id === currentUserId);
        let currentUserRank = currentUserData ? currentUserData.rank : 'زائر';
        // ✨ زر الإبلاغ أصبح موجودًا مسبقًا في chat.html (مخفيًا افتراضيًا عبر CSS)
        // بدل إنشائه هنا بالـ JS، فلا داعي لإدراجه في الـ DOM الآن — فقط نحدّث الحالة
        // من الصلاحيات الجاهزة (بدون أي فحص رتبة جديد):
        applyTopBarPermissions();
        // (تم تحميل chat-box و input-bar بالفعل ضمن loadComponents أعلاه)
        const plusButtonToggle = document.querySelector('#input-bar .plus-btn-circle');
        const imageUploadInput = document.getElementById('image-upload-input');
        let optionsMenu = null;
        let currentUploadTask = null;
        function createAndAppendUploadProgressBar() {
            const uploadProgressContainer = document.createElement('div');
            uploadProgressContainer.id = 'upload-progress-container';
            uploadProgressContainer.className = 'upload-progress-container';
            uploadProgressContainer.style.display = 'none';
            uploadProgressContainer.innerHTML = `
                <div class="progress-bar"><div id="progress-fill" class="progress-fill"></div></div>
                <button id="cancel-upload-btn" class="cancel-upload-btn">&times;</button>
            `;
            document.body.appendChild(uploadProgressContainer);
        }
        function createOptionsMenu() {
            optionsMenu = document.createElement('div');
            optionsMenu.classList.add('options-menu');
            optionsMenu.innerHTML = `
                <button class="btn option-btn" id="music-btn" title="مشاركة أغنية"><i class="fas fa-music"></i></button>
                <button class="btn option-btn" id="upload-media-btn" title="رفع صورة / فيديو / صوت"><i class="fas fa-cloud-upload-alt"></i></button>
            `;
            const uploadMediaButton = optionsMenu.querySelector('#upload-media-btn');
            uploadMediaButton.addEventListener('click', () => {
                imageUploadInput.click();
                optionsMenu.classList.remove('show-menu');
            });
            const musicButton = optionsMenu.querySelector('#music-btn');
    musicButton.addEventListener('click', () => {
        // ✨ هذا هو التعديل: نفتح النافذة المنبثقة الجديدة
        document.getElementById('music-upload-modal').style.display = 'flex';
        optionsMenu.classList.remove('show-menu');
    });

    // ✨ هذا هو الكود الجديد الذي يضيف منطق الرفع
    const musicUploadInput = document.getElementById('music-upload-input');
    if (musicUploadInput) {
        musicUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const progressContainer = document.getElementById('music-progress-container');
            const progressFill = document.getElementById('music-progress-fill');

            progressContainer.style.display = 'flex';
            progressFill.style.width = '0%';

            try {
                // استخدم نفس دالة رفع الملفات إلى Cloudinary
                const musicUrl = await uploadFileToCloudinary(file, (progress) => {
                    progressFill.style.width = `${progress}%`;
                });

                if (musicUrl) {
                    const messageText = `🎶 أغنية جديدة 🎶`; // يمكنك تخصيص النص
                    await sendMessage(messageText, currentRoomId, musicUrl, 'music');
                    scrollToBottom();
                }
            } catch (error) {
                console.error('فشل رفع الأغنية:', error);
                alert('فشل رفع الأغنية. يرجى المحاولة مرة أخرى.');
            } finally {
                // إخفاء المودال بعد اكتمال الرفع أو فشله
                document.getElementById('music-upload-modal').style.display = 'none';
                musicUploadInput.value = '';
                progressContainer.style.display = 'none';
                progressFill.style.width = '0%';
            }
        });
    }

    plusButtonToggle.parentElement.appendChild(optionsMenu);
}

        function hideOptionsMenu() {
            if (optionsMenu) optionsMenu.classList.remove('show-menu');
        }
        createAndAppendUploadProgressBar();
        if (plusButtonToggle && imageUploadInput) {
            plusButtonToggle.addEventListener('click', (event) => {
                event.stopPropagation();
                if (!optionsMenu) createOptionsMenu();
                optionsMenu.classList.toggle('show-menu');
            });
            document.addEventListener('click', (event) => {
                if (optionsMenu && !optionsMenu.contains(event.target) && !plusButtonToggle.contains(event.target)) hideOptionsMenu();
            });
            imageUploadInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (!file) return;
                // ✨ تحديد نوع الوسائط من نوع الملف نفسه (image/video/audio) بدل تخمينه
                // لاحقًا من الرابط، حتى تظهر الرسالة بالشكل الصحيح فورًا.
                let mediaType = 'image';
                if (file.type.startsWith('video/')) mediaType = 'video';
                else if (file.type.startsWith('audio/')) mediaType = 'audio';
                else if (!file.type.startsWith('image/')) {
                    // ✨ ما دام لم نعد نقيّد نوع الملف من نافذة الاختيار (حتى يفتح "الملفات"
                    // بدل معرض الصور مباشرة)، نتحقق من النوع هنا ونرفض غير المدعوم.
                    alert('نوع الملف غير مدعوم. الرجاء اختيار صورة أو فيديو أو ملف صوتي.');
                    imageUploadInput.value = '';
                    return;
                }
                const uploadProgressContainer = document.getElementById('upload-progress-container');
                const progressFill = document.getElementById('progress-fill');
                const cancelUploadBtn = document.getElementById('cancel-upload-btn');
                if (!uploadProgressContainer || !progressFill || !cancelUploadBtn) {
                    console.error('لم يتم العثور على عناصر شريط التقدم. حدث خطأ في إنشاء العنصر.');
                    return;
                }
                uploadProgressContainer.style.display = 'flex';
                progressFill.style.width = '0%';
                const handleCancel = () => {
                    if (currentUploadTask) currentUploadTask.abort();
                    uploadProgressContainer.style.display = 'none';
                    imageUploadInput.value = '';
                    currentUploadTask = null;
                    cancelUploadBtn.removeEventListener('click', handleCancel);
                };
                cancelUploadBtn.addEventListener('click', handleCancel);
                try {
                    currentUploadTask = new XMLHttpRequest();
                    const imageUrl = await new Promise((resolve, reject) => {
                        uploadFileToCloudinary(file, (progress) => {
                            progressFill.style.width = `${progress}%`;
                        }).then(resolve).catch(reject);
                    });
                    if (imageUrl) {
                        const messageText = '';
                        await sendMessage(messageText, currentRoomId, imageUrl, mediaType);
                        scrollToBottom();
                    }
                } catch (error) {
                    console.error('فشل إرسال الملف:', error);
                    alert('فشل إرسال الملف. يرجى المحاولة مرة أخرى.');
                } finally {
                    uploadProgressContainer.style.display = 'none';
                    imageUploadInput.value = '';
                    currentUploadTask = null;
                    cancelUploadBtn.removeEventListener('click', handleCancel);
                }
            });
        }
        // (تم تحميل bottom-bar بالفعل ضمن loadComponents أعلاه)
        
        createAndAppendMusicUploadModal();
        
if (chatUserId) checkAndSendJoinMessage(currentRoomId); // لا حاجة لانتظارها، ستظهر عبر المستمع اللحظي أول ما تُرسل

// --- انتظار اكتمال تحميل أول صفحة رسائل (بدأ تحميلها مبكراً بالتوازي مع إعداد الواجهة) ---
await initialMessagesPromise;

checkMuteStatusAndUpdateUI();
checkKickStatusAndUpdateUI();
checkBanStatusAndUpdateUI();
// ✨ مستمع حي (onSnapshot) يعمل للمسجّلين والزوّار معًا: يعيد تحميل الصفحة
// فورًا لحظة الطرد أو الحظر، بدل انتظار استطلاع دوري كل 15 ثانية.
watchKickStatusLive();
watchBanStatusLive();

// --- الاستماع اللحظي للرسائل الجديدة فقط ---

if (messagesUnsubscriber) messagesUnsubscriber();
// ✨ نمرر أحدث رسالة تم تحميلها (window._messagesPagination.messages[0])
// حتى يبدأ المستمع اللحظي من بعدها فقط، بدل تحميل كل تاريخ الغرفة.
const latestLoadedMsgDoc = getSafeCursorDoc(window._messagesPagination?.messages || []);
messagesUnsubscriber = listenForNewMessages(currentRoomId, latestLoadedMsgDoc);
listenForUserRankChanges();
listenForCurrentUserFriends();

addRegistrationButtonToBottomBar(currentUserRank); // قم بتمرير الرتبة هنا
// --- تحميل المزيد عند التمرير للأعلى ---
let isLoadingMoreMessages = false;
const chatBox = document.querySelector('#chat-box .chat-box');
if (chatBox) {
    chatBox.addEventListener('scroll', async () => {
        if (chatBox.scrollTop <= 0 && !isLoadingMoreMessages) {
            isLoadingMoreMessages = true;
            await loadMoreMessages(renderMessages);
            isLoadingMoreMessages = false;
        }
    });
}

if (chatUserId) setupPrivateMessageNotificationListener(chatUserId);
profileButton = document.getElementById('profileButton');
        async function createAndAppendProfileDropdown() {
            profileDropdownMenu = document.createElement('div');
            profileDropdownMenu.id = 'profileDropdownMenu';
            profileDropdownMenu.classList.add('profile-dropdown-menu');
            let currentUserRank = 'زائر';
            const currentUserId = localStorage.getItem('chatUserId');
            if (currentUserId) {
                try {
                    const allUsersAndVisitors = await getAllUsersAndVisitors();
                    const currentUserData = allUsersAndVisitors.find(user => user.id === currentUserId);
                    if (currentUserData && currentUserData.rank) currentUserRank = currentUserData.rank;
                } catch (error) {
                    console.error("خطأ في جلب رتبة المستخدم:", error);
                }
            }
            const rankImageSrc = RANK_IMAGE_MAP[currentUserRank] || RANK_IMAGE_MAP['default'];
            profileDropdownMenu.innerHTML = `
                <div class="profile-dropdown-content">
                    <div class="profile-header">
                        <img id="modal-profile-image" src="${localStorage.getItem('chatUserAvatar') || 'https://i.imgur.com/Uo9V2Yx.png'}" alt="صورة المستخدم">
                        <div class="profile-info">
                            <div class="profile-rank-display">
                                <span class="rank-text">${currentUserRank}</span>
                                <img src="${rankImageSrc}" alt="${currentUserRank}" class="rank-icon" title="${currentUserRank}" />
                            </div>
                            <p id="modal-username-display">${chatUserName || 'زائر'}</p>
                        </div>
                    </div>
                    <div class="profile-buttons-section">
                        <button class="modal-button level-info-btn">معلومات المستوى <i class="icon fa-solid fa-chart-column"></i></button>
                        <button class="modal-button wallet-btn">المحفظة <i class="icon fa-solid fa-wallet"></i></button>
                        <button class="modal-button edit-account-btn" id="editProfileButton">تعديل الحساب <i class="icon fa-solid fa-user-gear"></i></button>
                        <button class="modal-button leave-room-btn">الخروج من الغرفة <i class="icon fa-solid fa-arrow-right-from-bracket"></i></button>
                        <button class="modal-button logout">الخروج من الحساب <i class="icon fa-solid fa-right-from-bracket"></i></button>
                    </div>
                </div>
            `;
            document.body.appendChild(profileDropdownMenu);
            const levelInfoBtn = profileDropdownMenu.querySelector('.modal-button.level-info-btn');
            if (levelInfoBtn) {
                levelInfoBtn.addEventListener('click', async () => {
                    const currentUserId = localStorage.getItem('chatUserId');
                    if (currentUserId) {
                        try {
                            const userData = await getUserData(currentUserId);
                            if (userData) {
                                const expToNextLevel = userData.expToNextLevel || 1000;
                                const expProgress = Math.floor((userData.currentExp / expToNextLevel) * 100);
                                const userLevelData = {
                                    levelRank: userData.rank || 'مبتدئ',
                                    level: userData.level || 1,
                                    totalExp: userData.totalExp || 0,
                                    expProgress: expProgress
                                };
                                showLevelInfoModal(userLevelData);
                            } else {
                                alert('لم يتم العثور على بيانات المستخدم.');
                            }
                        } catch (error) {
                            alert('حدث خطأ أثناء جلب معلومات المستوى.');
                        }
                    } else {
                        alert('يجب تسجيل الدخول لعرض معلومات المستوى.');
                    }
                    hideProfileDropdown();
                });
            }
            const walletButton = profileDropdownMenu.querySelector('.modal-button.wallet-btn');
            if (walletButton) {
                walletButton.addEventListener('click', () => {
                    alert('سيتم فتح صفحة المحفظة!');
                    hideProfileDropdown();
                });
            }
            const leaveRoomButton = profileDropdownMenu.querySelector('.modal-button.leave-room-btn');
            if (leaveRoomButton) {
                leaveRoomButton.addEventListener('click', () => {
                    localStorage.removeItem('lastVisitedRoomId');
                    window.location.href = 'rooms.html';
                    hideProfileDropdown();
                });
            }
            const logoutButton = profileDropdownMenu.querySelector('.modal-button.logout');
            if (logoutButton) {
                logoutButton.addEventListener('click', () => {
                    localStorage.clear();
                    window.location.href = 'index.html';
                    hideProfileDropdown();
                });
            }
        }
        createAndAppendProfileDropdown();
        if (profileButton) {
            profileButton.addEventListener('click', (event) => {
                event.stopPropagation();
                hideAllOpenModals();
                if (profileDropdownMenu) {
                    profileDropdownMenu.classList.add('show');
                    const buttonRect = profileButton.getBoundingClientRect();
                    profileDropdownMenu.style.top = `${buttonRect.bottom + window.scrollY + 5}px`;
                    const dropdownWidth = profileDropdownMenu.offsetWidth;
                    const windowWidth = window.innerWidth;
                    let desiredRight = windowWidth - buttonRect.right - window.scrollX;
                    if (desiredRight + dropdownWidth > windowWidth) desiredRight = windowWidth - dropdownWidth - 10;
                    profileDropdownMenu.style.right = `${desiredRight}px`;
                    profileDropdownMenu.style.left = 'auto';
                    document.addEventListener('click', handleProfileDropdownOutsideClick);
                }
            });
        }
        if (currentUserId) {
            try {
                const allUsersAndVisitors = await getAllUsersAndVisitors();
                const currentUserData = allUsersAndVisitors.find(user => user.id === currentUserId);
                if (currentUserData) {
                    applyTopBarPermissions();
                }
            } catch (error) {
                console.error('خطأ في جلب بيانات المستخدم أو إدارة ظهور الأزرار:', error);
            }
        }
        const userProfileImage = document.getElementById('user-profile-image');
        if (userProfileImage) {
            userProfileImage.src = chatUserAvatar || 'https://i.imgur.com/Uo9V2Yx.png';
            userProfileImage.style.display = 'block';
        }
        
        const refreshButton = document.querySelector('#top-bar .btn.refresh');
        if (refreshButton) refreshButton.addEventListener('click', () => window.location.reload());
        const privateButton = document.querySelector('#top-bar .btn.private');
        if (privateButton) {
            privateButton.addEventListener('click', (event) => {
                event.stopPropagation();
                createPrivateChatModal(privateButton);
            });
        }
        const onlineUsersButton = document.querySelector('#online-users-btn');
        if (onlineUsersButton) {
            onlineUsersButton.addEventListener('click', (event) => {
                event.stopPropagation();
                createOnlineUsersModal(onlineUsersButton);
            });
        }
        const notificationsBtn = document.getElementById('notifications-btn');
if (notificationsBtn) {
    notificationsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        showNotificationsModal();
    });
}

if (currentUserId) {
    listenForUnreadNotifications();
    listenForPendingFriendRequests();
}

        const friendBtn = document.getElementById('friend-btn');
        if (friendBtn) {
            friendBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                showFriendRequestsModal();
            });
        }

        const editProfileButton = document.getElementById('editProfileButton');
        if (editProfileButton) {
            editProfileButton.addEventListener('click', async (event) => {
                event.preventDefault(); 
                event.stopPropagation(); 
                if (typeof hideProfileDropdown === 'function') hideProfileDropdown();
                hideAllOpenModals(); 
                const currentUserId = localStorage.getItem('chatUserId');
                let currentUserData = null;
                if (currentUserId && window.allUsersAndVisitorsData && Array.isArray(window.allUsersAndVisitorsData)) {
                    currentUserData = window.allUsersAndVisitorsData.find(user => user.id === currentUserId);
                }
                if (typeof window.hideEditProfileModal === 'function' && window.editProfileModal) {
                    window.editProfileModal.classList.add('show');
                    document.addEventListener('click', window.handleEditProfileModalOutsideClick);
                    if (typeof window.updateEditProfileModalContent === 'function') {
                        window.updateEditProfileModalContent(currentUserData);
                    }
                }
            });
        }
        const messageInput = document.querySelector('#input-bar input');
        const sendButton = document.querySelector('#input-bar .send-btn');
        
        // main.js
// ... (الاستيرادات الأخرى)

// ... (بقية الكود)

const handleMessageSend = async () => {
    if (!navigator.onLine) {
        showNotification('لا يمكن إرسال الرسالة. أنت غير متصل بالإنترنت.', 'error');
        return; // توقف عن تنفيذ الدالة
    }

    const messageText = messageInput.value.trim();
    if (!messageText) return;

    // ... بقية الكود لإرسال الرسال

 // في ملف main.js، داخل دالة handleMessageSend
    if (messageText.toLowerCase() === '/clear') {
        messageInput.value = '';

        if (!getStoredUserPermissions().canClearRoom) {
            showNotification('عذراً، لا تملك صلاحية لتنظيف الغرفة.', 'error');
            return;
        }

        try {
            // 1. إلغاء الاشتراك من المستمع مؤقتاً
            if (messagesUnsubscriber) {
                messagesUnsubscriber();
                messagesUnsubscriber = null;
            }

            // 2. حذف جميع الرسائل من قاعدة البيانات
            await deleteChatRoomMessages(currentRoomId);

            // ✨ هذا هو التعديل الأساسي: مسح الواجهة فوراً
            const chatBox = document.querySelector('#chat-box .chat-box');
            if (chatBox) {
                chatBox.innerHTML = ''; // مسح الرسائل من الواجهة
                const chatUserName = localStorage.getItem('chatUserName') || 'مستخدم مجهول';
                const confirmationMessageText = `تم تنظيف الغرفة من قبل ${chatUserName}`;
                const elem = createSystemMessageElement(confirmationMessageText);
                chatBox.appendChild(elem); // إضافة رسالة النظام فوراً
            }

            // 3. إرسال رسالة نظام نوعها clear (ليراها المستخدمون الآخرون)
            const chatUserName = localStorage.getItem('chatUserName') || 'مستخدم مجهول';
            const confirmationMessage = `تم تنظيف الغرفة من قبل ${chatUserName}`;
            await sendSystemMessage({ text: confirmationMessage, type: 'clear' }, currentRoomId);

            // 4. إعادة الاشتراك في المستمع
            messagesUnsubscriber = listenForNewMessages(currentRoomId);

        } catch (error) {
            showNotification('فشل تنظيف الدردشة.', 'error');
        }
        return;
    }
    // ... (بقية الكود)


    // كود إرسال الرسائل العادية
    messageInput.value = '';
    try {
        await sendMessage(messageText, currentRoomId, null);
        scrollToBottom();
    } catch (error) {
        alert('فشل إرسال الرسالة. يرجى المحاولة مرة أخرى.');
    }
};

        if (messageInput && sendButton && currentUserId) {
            sendButton.addEventListener('click', handleMessageSend);
            messageInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMessageSend();
                }
            });
        }
    } catch (error) {
        if (chatContainer) {
            chatContainer.innerHTML = `<div style="text-align: center; color: red; padding-top: 50px;">
                                           <p>عذرًا، حدث خطأ أثناء تحميل مكونات الدردشة الأساسية.</p>
                                           <p>الرجاء التأكد من وجود ملفات HTML في مساراتها الصحيحة (components/).</p>
                                           <p>تفاصيل الخطأ: ${error.message}</p>
                                         </div>`;
        } else {
            document.body.innerHTML = `<div style="text-align: center; color: red; padding-top: 50px;">
                                           <p>خطأ فادح: فشل تحميل مكونات التطبيق. يرجى مراجعة Console لمزيد من التفاصيل.</p>
                                         </div>`;
        }
    }
    document.addEventListener('click', (event) => {});
});

window.sendMessage = sendMessage;