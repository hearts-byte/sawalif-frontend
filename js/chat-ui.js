import { getPrivateChatId, sendPrivateMessage, setupPrivateMessagesListener } from './chat-firestore.js';
import { db, serverTimestamp, auth } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  deleteDoc
} from "./firestore-shim.js";
import {
  createUserWithEmailAndPassword
} from "./auth-shim.js";
import { RANK_IMAGE_MAP, storeUserPermissions } from './constants.js';
import { showCommandsModal } from './chat-commands-modal.js';
import { checkMuteStatusAndUpdateUI } from './main.js';
import { uploadFileToCloudinary } from './cloudinary-utils.js';

// في ملف js/chat-ui.js
// ... (الاستيرادات)
 
// دالة شاملة لتحديث رتبة المستخدم في كل مكان بالواجهة
export function updateUserRankInUI(userId, newRank) {
    // 1. تحديث الرسائل الموجودة في الدردشة
    const userMessages = document.querySelectorAll(`.message-item[data-sender-id="${userId}"]`);
    userMessages.forEach(messageElement => {
        const rankImage = messageElement.querySelector('.rank-icon');
        if (rankImage) {
            rankImage.src = RANK_IMAGE_MAP[newRank] || 'images/default-rank.png';
            rankImage.alt = newRank;
        }
    });
 
    // 2. تحديث قائمة المتصلين
    const onlineUserItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (onlineUserItem) {
        const rankImage = onlineUserItem.querySelector('.user-rank-image-small');
        if (rankImage) {
            rankImage.src = RANK_IMAGE_MAP[newRank] || 'images/default-rank.png';
            rankImage.alt = newRank;
        }
    }
 
    // 3. تحديث المودال إذا كان مفتوحًا
    if (window.userInfoModal && window.userInfoModal.dataset.userId === userId) {
        const rankImage = window.userInfoModal.querySelector('.user-rank-image-modal');
        if (rankImage) {
            rankImage.src = RANK_IMAGE_MAP[newRank] || 'images/default-rank.png';
            rankImage.alt = newRank;
        }
    }
}
 
// ... (بقية الكود في chat-ui.js)

export async function loadComponent(id, file) {
  const res = await fetch(file);
  const html = await res.text();
  document.getElementById(id).innerHTML = html;
}

// ✨ تحميل عدة مكونات HTML بالتوازي (Promise.all) بدلاً من التحميل المتتابع
// كل عنصر في components هو { id, file }. يتم جلب كل الملفات في نفس الوقت،
// ثم إدراجها في الـ DOM بنفس ترتيب المصفوفة بعد اكتمال جميع الطلبات.
export async function loadComponents(components) {
  const htmls = await Promise.all(
    components.map(({ file }) => fetch(file).then(res => res.text()))
  );
  components.forEach(({ id }, index) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = htmls[index];
  });
}

let currentOpenMenu = null;
let minimizedPrivateChat = null;
export let activeQuoteData = null;
export let currentOpenPrivateChatId = null;

function displayActiveQuoteBubble(senderName, content) {
  const chatContainer = document.querySelector('.chat-container');
  let quoteBubble = document.querySelector('.active-quote-bubble');

  if (!quoteBubble) {
    quoteBubble = document.createElement('div');
    quoteBubble.classList.add('active-quote-bubble');
    quoteBubble.innerHTML = `
      <div class="quote-content-wrapper">
        <div class="quote-sender-name"></div>
        <div class="quote-text-preview"></div>
      </div>
      <button class="close-quote-btn">&times;</button>
    `;
    chatContainer.appendChild(quoteBubble);

    quoteBubble.querySelector('.close-quote-btn').addEventListener('click', () => {
      hideActiveQuoteBubble();
    });
  }

  quoteBubble.querySelector('.quote-sender-name').textContent = senderName;
  quoteBubble.querySelector('.quote-text-preview').textContent = content.split('\n')[0].substring(0, 50) + (content.length > 50 ? '...' : '');

  quoteBubble.style.display = 'flex';
}

export function hideActiveQuoteBubble() {
  const quoteBubble = document.querySelector('.active-quote-bubble');
  if (quoteBubble) {
    quoteBubble.style.display = 'none';
  }
  activeQuoteData = null;
}

window.userInfoModal = null;

// في ملف js/chat-ui.js
// ... (الكود السابق)

export function createUserInfoModal(targetElement, userData, allUsersAndVisitorsData) {
  if (userInfoModal) {
    userInfoModal.remove();
    userInfoModal = null;
  }

  const currentUserId = localStorage.getItem('chatUserId');
  const isCurrentUser = (userData.id === currentUserId);
  const isSystemUser = (userData.id === 'system');

  let isTargetUserVisitor = false;
  const targetUserDataFull = allUsersAndVisitorsData.find(user => user.id === userData.id);
  if (targetUserDataFull && targetUserDataFull.rank === 'زائر') {
    isTargetUserVisitor = true;
  }

  let viewerIsVisitor = false;
  if (currentUserId) {
    const viewerData = allUsersAndVisitorsData.find(user => user.id === currentUserId);
    if (viewerData && viewerData.rank === 'زائر') {
      viewerIsVisitor = true;
    }
  } else {
    viewerIsVisitor = true;
  }

  userInfoModal = document.createElement('div');
  userInfoModal.classList.add('user-info-modal');
  userInfoModal.setAttribute('data-user-id', userData.id);
  userInfoModal.innerHTML = `
    <div class="modal-content">
      <span class="close-button">&times;</span>
      <div class="user-profile-header">
        <img src="${userData.innerImage || 'images/Interior.png'}" alt="صورة الخلفية" class="profile-header-image">
        <div class="overlay"></div>
      </div>
      <img src="${userData.avatar || 'images/default-user.png'}" alt="${userData.name || userData.username}" class="user-avatar-large">
      <div class="user-info-group">
        <div class="user-name-display">${userData.name || userData.username}</div>
        ${userData.rank ? `<p class="user-rank-info"> <img src="${RANK_IMAGE_MAP[userData.rank] || 'images/default-rank.png'}" alt="${userData.rank}" class="user-rank-image-modal" title="${userData.rank}"/></p>` : ''}
        <p class="user-age-gender-info">
          ${userData.age ? `العمر: ${userData.age}` : ''}
          ${userData.age && userData.gender ? ' | ' : ''}
          ${userData.gender ? `الجنس: ${userData.gender}` : ''}
        </p>
        <div class="modal-buttons">
          <button class="modal-button view-profile"><i class="fa-solid fa-user"></i> عرض الملف الشخصي</button>
          <button class="modal-button start-private"><i class="fa-solid fa-envelope"></i> رسالة</button>
          <button class="modal-button commands-btn"><i class="fa-solid fa-list"></i> الأوامر</button>
        </div>
      </div>
    </div>
  `;

  userInfoModal.addEventListener('click', (event) => {
    if (event.target === userInfoModal) {
      hideUserInfoModal();
    }
  });

  const viewProfileButton = userInfoModal.querySelector('.modal-button.view-profile');
  if (viewProfileButton) {
    // ✨ إضافة معالج الحدث (event listener) لزر "عرض الملف الشخصي"
    // سيتم تشغيل هذا الكود الآن لكل المستخدمين، بما فيهم النظام
    viewProfileButton.addEventListener('click', (event) => {
      event.stopPropagation();
      hideUserInfoModal();
      window.showViewProfileModal(userData, window.allUsersAndVisitorsData);
    });
  }

  const commandsButton = userInfoModal.querySelector('.modal-button.commands-btn');
  if (commandsButton) {
    if (isCurrentUser) {
      commandsButton.style.display = 'none';
    } else {
      commandsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        hideUserInfoModal();
        showCommandsModal(userData);
      });
    }
  }

  userInfoModal.querySelector('.user-name-display').textContent = userData.name || userData.username;

  document.body.appendChild(userInfoModal);

  if (targetElement) {
    const targetRect = targetElement.getBoundingClientRect();
    const modalWidth = userInfoModal.offsetWidth;
    const modalHeight = userInfoModal.offsetHeight;
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let modalLeft = targetRect.left;
    let modalTop = targetRect.bottom + padding;
    if (modalLeft + modalWidth > viewportWidth - padding) {
      modalLeft = viewportWidth - modalWidth - padding;
    }
    if (modalLeft < padding) {
      modalLeft = padding;
    }
    if (modalTop + modalHeight > viewportHeight - padding) {
      modalTop = targetRect.top - modalHeight - padding;
      if (modalTop < padding) {
        modalTop = padding;
      }
    }
    userInfoModal.style.left = `${modalLeft}px`;
    userInfoModal.style.top = `${modalTop}px`;
    userInfoModal.style.transform = 'none';
  } else {
    userInfoModal.style.left = '50%';
    userInfoModal.style.top = '50%';
    userInfoModal.style.transform = 'translate(-50%, -50%)';
  }

  userInfoModal.style.visibility = 'visible';
  userInfoModal.classList.add('show');

  document.addEventListener('click', handleUserInfoModalOutsideClick);

  userInfoModal.querySelector('.close-button').addEventListener('click', (event) => {
    event.stopPropagation();
    hideUserInfoModal();
  });

  const startPrivateButton = userInfoModal.querySelector('.modal-button.start-private');
  if (startPrivateButton) {
    if (isCurrentUser || viewerIsVisitor || isTargetUserVisitor) {
      startPrivateButton.style.display = 'none';
    } else {
      startPrivateButton.style.display = 'block';
      startPrivateButton.addEventListener('click', (event) => {
        event.stopPropagation();
        createAndShowPrivateChatDialog(userData);
        hideUserInfoModal();
      });
    }
  }
}

function handleUserInfoModalOutsideClick(event) {
  const isClickedInsideModal = window.userInfoModal && window.userInfoModal.contains(event.target);
  const isClickedOnMessageUserElement = event.target.closest('.chat-message .user-avatar') || event.target.closest('.chat-message .message-name');
  const isClickedOnOnlineUserAvatar = event.target.closest('.user-item .user-avatar-small');
  if (window.userInfoModal && !isClickedInsideModal && !isClickedOnMessageUserElement && !isClickedOnOnlineUserAvatar) {
    hideUserInfoModal();
  }
}

export function hideUserInfoModal() {
  if (window.userInfoModal) {
    const modalToClose = window.userInfoModal;
    modalToClose.classList.remove('show');
    const handler = function() {
      if (!modalToClose.classList.contains('show')) {
        modalToClose.remove();
        document.removeEventListener('click', handleUserInfoModalOutsideClick);
        modalToClose.removeEventListener('transitionend', handler);
      }
    };
    modalToClose.addEventListener('transitionend', handler, { once: true });
    window.userInfoModal = null;
  }
}

export function hideAllModals() {
  hideUserInfoModal();
}

let privateChatDialog = null;

// js/chat-ui.js

// ... (الكود السابق لا يتغير)

export const privateChatDialogHTML = `
<div class="private-chat-header">
  <div class="private-user-info"><img src="images/default-user.png" alt="" class="private-chat-avatar">
    <span class="private-chat-username"></span>
  </div>
  <div class="header-buttons">
    <button class="minimize-private-chat-btn" title="تصغير">_</button>
    <button class="close-private-chat-btn" title="إغلاق">&times;</button>
  </div>
</div>
<div class="private-chat-messages"></div>
<div class="input-bar" id="private-chat-input-bar">
    <button class="btn icon-btn send-btn" id="private-send-btn"><i class="fas fa-paper-plane"></i></button>
    <div class="input-field-container">
        <input type="text" id="private-message-input" placeholder="اكتب رسالتك..." />
        <input type="file" id="private-image-upload-input" style="display: none;" />
    </div>
    <button class="btn icon-btn emoji-btn-circle" id="private-emoji-btn"><i class="far fa-grin-alt"></i></button>
    <div class="plus-button-container">
        <button class="btn icon-btn plus-btn-circle" id="private-plus-btn-toggle">
            <i class="fas fa-plus"></i>
        </button>
    </div>
</div>
`;

// ... (بقية الكود)

function minimizePrivateChatDialog(targetUserData) {
  if (privateChatDialog) {
    privateChatDialog.style.display = 'none';
    minimizedPrivateChat = targetUserData;
    showMinimizedChatAvatar(targetUserData);
  }
}

function showMinimizedChatAvatar(userData, showNotification = false) {
  const bottomBar = document.querySelector('.bottom-bar');
  if (!bottomBar) return;
  let minimizedAvatar = document.querySelector(`.minimized-chat-avatar[data-user-id="${userData.id}"]`);
  if (!minimizedAvatar) {
    minimizedAvatar = document.createElement('div');
    minimizedAvatar.classList.add('minimized-chat-avatar');
    minimizedAvatar.setAttribute('data-user-id', userData.id);
    minimizedAvatar.title = `محادثة مع ${userData.name}`;
    minimizedAvatar.innerHTML = `<img src="${userData.avatar}" alt="${userData.name}">`;
    minimizedAvatar.addEventListener('click', () => {
      restorePrivateChatDialog(userData);
    });
    bottomBar.appendChild(minimizedAvatar);
  }
  if (showNotification) {
    minimizedAvatar.classList.add('has-new-messages');
  } else {
    minimizedAvatar.classList.remove('has-new-messages');
  }
}

function restorePrivateChatDialog(userData) {
  if (privateChatDialog) {
    privateChatDialog.style.display = 'flex';
    minimizedPrivateChat = null;
    hideMinimizedChatAvatar(userData.id);
    const minimizedAvatar = document.querySelector(`.minimized-chat-avatar[data-user-id="${userData.id}"]`);
    if (minimizedAvatar) {
      minimizedAvatar.classList.remove('has-new-messages');
    }
  }
}

function hideMinimizedChatAvatar(userId) {
  const minimizedAvatar = document.querySelector(`.minimized-chat-avatar[data-user-id="${userId}"]`);
  if (minimizedAvatar) {
    minimizedAvatar.remove();
  }
}

// في ملف js/chat-ui.js
// ... (بقية الكود) ...

// js/chat-ui.js

// ... (الكود السابق)

// في ملف js/chat-ui.js



// في ملف js/chat-ui.js

// في ملف js/chat-ui.js

export async function createAndShowPrivateChatDialog(targetUserData) {
    const existingDialog = document.getElementById('privateChatDialog');
    if (existingDialog) {
        existingDialog.remove();
    }
    
    if (minimizedPrivateChat && minimizedPrivateChat.id !== targetUserData.id) {
        hideMinimizedChatAvatar(minimizedPrivateChat.id);
    }
    
    if (minimizedPrivateChat && minimizedPrivateChat.id === targetUserData.id) {
        restorePrivateChatDialog(targetUserData);
        return;
    }
    
    currentOpenPrivateChatId = targetUserData.id;
    updatePrivateButtonNotification(false);
    const minimizedAvatar = document.querySelector(`.minimized-chat-avatar[data-user-id="${targetUserData.id}"]`);
    if (minimizedAvatar) {
        minimizedAvatar.classList.remove('has-new-messages');
    }
    if (privateChatDialog) {
        hidePrivateChatDialog();
    }
    
    privateChatDialog = document.createElement('div');
    privateChatDialog.classList.add('private-chat-dialog');
    privateChatDialog.id = 'privateChatDialog';
    document.body.appendChild(privateChatDialog);
    privateChatDialog.innerHTML = privateChatDialogHTML;
    setTimeout(() => {
        privateChatDialog.classList.add('show');
    }, 10);

    const avatarElement = privateChatDialog.querySelector('.private-chat-avatar');
    const usernameElement = privateChatDialog.querySelector('.private-chat-username');
    const privateChatMessagesBox = privateChatDialog.querySelector('.private-chat-messages');

    if (avatarElement) avatarElement.src = targetUserData.avatar;
    if (usernameElement) usernameElement.textContent = targetUserData.name;

    privateChatDialog.querySelector('.close-private-chat-btn').addEventListener('click', () => {
        hidePrivateChatDialog();
    });
    privateChatDialog.querySelector('.minimize-private-chat-btn').addEventListener('click', () => {
        minimizePrivateChatDialog(targetUserData);
    });

    const privateChatInput = privateChatDialog.querySelector('#private-message-input');
    const privateChatSendBtn = privateChatDialog.querySelector('#private-send-btn');
    const privateEmojiButton = privateChatDialog.querySelector('#private-emoji-btn');
    const privatePlusButton = privateChatDialog.querySelector('#private-plus-btn-toggle');
    const privateImageUpload = privateChatDialog.querySelector('#private-image-upload-input');
    
    const currentUserId = localStorage.getItem('chatUserId');
    
    if (currentUserId) {
        // ✨ هذا هو التعديل الجديد
        privateChatMessagesBox.innerHTML = '';
        const loaderElement = document.createElement('div');
        loaderElement.classList.add('private-chat-loader');
        privateChatMessagesBox.appendChild(loaderElement);
        loaderElement.style.display = 'block';

        // استخدام متغير لتتبع أول رسالة
        let isFirstMessageLoaded = false;
        
        // تعديل setupPrivateMessagesListener لإخفاء الدائرة عند تحميل أول رسالة
        const unsubscribe = setupPrivateMessagesListener(currentUserId, targetUserData.id, privateChatMessagesBox);
        
        const observer = new MutationObserver((mutationsList, observer) => {
            // التحقق من وجود عناصر رسائل داخل الصندوق
            const hasMessages = privateChatMessagesBox.querySelector('.private-message-item');
            if (hasMessages && !isFirstMessageLoaded) {
                loaderElement.style.display = 'none';
                isFirstMessageLoaded = true;
                observer.disconnect(); // إيقاف المراقبة بعد إخفاء الدائرة
            }
        });
        
        observer.observe(privateChatMessagesBox, { childList: true });
        
        checkMuteStatusAndUpdateUI(privateChatInput, privateChatSendBtn, privateEmojiButton, privatePlusButton, privateImageUpload);
    } else {
        console.error('معرف المستخدم الحالي غير موجود لفتح الدردشة الخاصة.');
        privateChatMessagesBox.innerHTML = '<div style="text-align: center; padding: 20px; color: red;">الرجاء تسجيل الدخول لبدء محادثة خاصة.</div>';
        return;
    }
    
    // ... (بقية الدالة) ...

    // دالة إرسال الرسالة الخاصة
    const handlePrivateMessageSend = async (messageText, imageUrl = null) => {
        if ((!messageText || messageText.trim() === '') && !imageUrl) return;
        
        try {
            const senderId = localStorage.getItem('chatUserId');
            const senderName = localStorage.getItem('chatUserName');
            const senderAvatar = localStorage.getItem('chatUserAvatar');
            
            await sendPrivateMessage(senderId, senderName, senderAvatar, targetUserData.id, messageText, imageUrl);
            
            privateChatInput.value = '';
        } catch (error) {
            console.error("فشل إرسال الرسالة الخاصة:", error);
            alert("فشل إرسال الرسالة الخاصة.");
        }
    };

    // ربط زر الإرسال والنقر على Enter
    privateChatSendBtn.addEventListener('click', () => handlePrivateMessageSend(privateChatInput.value.trim()));
    privateChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handlePrivateMessageSend(privateChatInput.value.trim());
        }
    });

    // 1. ربط زر الإيموجي (بشكل مبدأي)
    privateEmojiButton.addEventListener('click', () => {
        alert('هنا سيتم فتح نافذة اختيار الإيموجي!');
    });

    // 2. ربط زر الزائد (+) لرفع الصور
    privatePlusButton.addEventListener('click', () => {
        privateImageUpload.click();
    });

    privateImageUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const uploadProgressContainer = document.getElementById('upload-progress-container');
        const progressFill = document.getElementById('progress-fill');
        if (uploadProgressContainer && progressFill) {
            uploadProgressContainer.style.display = 'flex';
            progressFill.style.width = '0%';
        }
        
        try {
            const imageUrl = await uploadFileToCloudinary(file, (progress) => {
                if (progressFill) {
                    progressFill.style.width = `${progress}%`;
                }
            });

            if (imageUrl) {
                await handlePrivateMessageSend('', imageUrl);
            }
        } catch (error) {
            console.error('فشل رفع الصورة في الخاص:', error);
            alert('فشل رفع الصورة. يرجى المحاولة مرة أخرى.');
        } finally {
            if (uploadProgressContainer) {
                uploadProgressContainer.style.display = 'none';
            }
            privateImageUpload.value = '';
        }
    });



    // --- نهاية الكود المحدث ---

    hideUserInfoModal();
}


export function hidePrivateChatDialog() {
  if (privateChatDialog) {
    privateChatDialog.classList.remove('show');
    const messagesBoxElement = privateChatDialog.querySelector('.private-chat-messages');
    if (messagesBoxElement && messagesBoxElement._privateChatUnsubscribe) {
      messagesBoxElement._privateChatUnsubscribe();
      messagesBoxElement._privateChatUnsubscribe = null;
    }
    privateChatDialog.addEventListener('transitionend', () => {
      if (privateChatDialog) {
        privateChatDialog.remove();
        privateChatDialog = null;
        minimizedPrivateChat = null;
        currentOpenPrivateChatId = null;
      }
    }, { once: true });
  }
}



export function createMessageElement(messageData) {
  const messageItem = document.createElement('div');
  messageItem.classList.add('message-item');
  messageItem.setAttribute('data-id', messageData.id);

  const currentUserId = localStorage.getItem('chatUserId');
  const currentUserName = localStorage.getItem('chatUserName');

  let customMessageClass = '';
  if (messageData.type === 'join') {
    messageData.text = `انضم ${messageData.user} إلى الغرفة!`;
    customMessageClass = 'join-message-text';
  }

  let userNameClass = '';
  let avatarGradientClass = '';
  switch (messageData.avatarColor) {
    case 'red': userNameClass = 'name-red'; avatarGradientClass = 'gradient-pink'; break;
    case 'blue': userNameClass = 'name-blue'; avatarGradientClass = 'gradient-purple'; break;
    case 'green': userNameClass = 'name-green'; avatarGradientClass = 'gradient-green'; break;
    case 'gold': userNameClass = 'name-gold'; avatarGradientClass = 'gradient-gold'; break;
    default: userNameClass = ''; avatarGradientClass = 'gradient-purple';
  }

  let profileImageSrc = '';
  if (messageData.avatar) {
    profileImageSrc = messageData.avatar;
  } else if (messageData.userType === 'visitor') {
    profileImageSrc = 'images/default-visitor.png';
  } else {
    profileImageSrc = 'images/default-user.png';
  }

  const starHtml = messageData.hasStar ? '<span class="star-icon">⭐</span>' : '';
  const badgeHtml = messageData.badge ? `<span class="message-badge">${messageData.badge}</span>` : '';

  let rankImageHtml = '';
  const rankImagePath = RANK_IMAGE_MAP[messageData.senderRank];
  if (rankImagePath) {
    rankImageHtml = `<img src="${rankImagePath}" alt="${messageData.senderRank}" class="rank-icon">`;
  }

  const messageInfoDiv = document.createElement('div');
  messageInfoDiv.classList.add('message-info');
  let messageContentHtml = '';

  // ✨ نستخدم mediaType الصريح المخزّن مع الرسالة إن وُجد (رسائل جديدة)،
  // وإلا نرجع للتخمين من امتداد الرابط (توافق مع الرسائل القديمة قبل هذا التحديث).
  function detectMediaType(url, explicitType) {
    if (explicitType) return explicitType === 'music' ? 'audio' : explicitType;
    const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|opus)(\?|$)/i;
    const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i;
    if (AUDIO_EXTENSIONS.test(url)) return 'audio';
    if (VIDEO_EXTENSIONS.test(url)) return 'video';
    return 'image';
  }

  const MEDIA_BADGE_CONFIG = {
    image: { icon: 'fa-image', label: 'صورة', cssClass: 'media-badge-image' },
    video: { icon: 'fa-video', label: 'فيديو', cssClass: 'media-badge-video' },
    audio: { icon: 'fa-music', label: 'صوت', cssClass: 'media-badge-audio' }
  };

  if (messageData.imageUrl) {
    const mediaType = detectMediaType(messageData.imageUrl, messageData.mediaType);
    const config = MEDIA_BADGE_CONFIG[mediaType] || MEDIA_BADGE_CONFIG.image;
    messageContentHtml += `
      <div class="media-badge ${config.cssClass}" onclick="window.showMediaModal('${messageData.imageUrl}', '${mediaType}')">
        <i class="fas ${config.icon}"></i>
        <span>${config.label}</span>
      </div>
    `;
  }

  let messageTextContent = '';
  if (messageData.quoted && messageData.quoted.senderName && messageData.quoted.content) {
    messageTextContent += `
      <div class="quoted-message">
        <div class="quoted-sender-name">${messageData.quoted.senderName}</div>
        <div class="quoted-content">${messageData.quoted.content}</div>
      </div>
    `;
  }

  if (messageData.text) {
    let messageHtml = messageData.text;

    // أولاً: قم بإزالة الأقواس من النص بالكامل.
    const cleanText = messageHtml.replace(/\[|\]/g, '');

    // ثانياً: إذا كان المستخدم الحالي هو المقصود، قم بتلوين اسمه.
    const currentUserId = localStorage.getItem('chatUserId');

    if (messageData.mentions && messageData.mentions.includes(currentUserId)) {
        const mentionedUser = window.allUsersAndVisitorsData.find(user => user.id === currentUserId);
        if (mentionedUser) {
            const escapedName = mentionedUser.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escapedName}`, 'gi');
            messageHtml = cleanText.replace(regex, `<span class="mentioned-user">${mentionedUser.name}</span>`);
        }
    } else {
        // إذا لم يكن هو المقصود، استخدم النص النظيف بدون تلوين.
        messageHtml = cleanText;
    }

    messageTextContent += messageHtml;
}

  if (messageTextContent.length > 0) {
    messageContentHtml += `<div class="message-text ${customMessageClass}">${messageTextContent}</div>`;
  }

  const userLevel = messageData.level || 1;
  let levelColorClass = '';
  if (userLevel >= 50) {
    levelColorClass = 'level-50';
  } else if (userLevel >= 40) {
    levelColorClass = 'level-40';
  } else if (userLevel >= 30) {
    levelColorClass = 'level-30';
  } else if (userLevel >= 20) {
    levelColorClass = 'level-20';
  } else if (userLevel >= 10) {
    levelColorClass = 'level-10';
  } else if (userLevel >= 5) {
    levelColorClass = 'level-5';
  }

  messageItem.innerHTML = `
    <div class="user-avatar ${avatarGradientClass}"
      data-user-id="${messageData.senderId}"
      data-user-name="${messageData.user}"
      data-user-avatar="${profileImageSrc}">
      <img src="${profileImageSrc}" alt="صورة الملف الشخصي" class="profile-image" />
      ${userLevel > 0 ? `<div class="level-badge ${levelColorClass}">${userLevel}</div>` : ''}
    </div>
    <div class="message-info">
      <div class="message-header">
        <div class="message-name ${userNameClass}" 
          data-user-name="${messageData.user}">${rankImageHtml}<strong>${messageData.user}</strong> ${starHtml}
        </div>
      </div>
      ${messageContentHtml}
      ${badgeHtml}
    </div>
    <div class="dots-options">
      <span class="dots">&#8226;&#8226;&#8226;</span>
      <div class="message-options-menu">
        <div class="option-item" data-action="quote">اقتباس</div>
        <div class="option-item" data-action="report">إبلاغ</div>
      </div>
    </div>
  `;

  const messageNameDiv = messageItem.querySelector('.message-header .message-name');
  if (messageNameDiv) {
    messageNameDiv.addEventListener('click', (event) => {
      event.stopPropagation();
      const userName = messageNameDiv.dataset.userName;
      const chatInput = document.querySelector('#input-bar input');
      if (chatInput) {
        chatInput.value += `[${userName}] `;
        chatInput.focus();
      }
    });
  }

  const userAvatarDiv = messageItem.querySelector('.user-avatar');
  if (userAvatarDiv) {
    userAvatarDiv.addEventListener('click', (event) => {
      event.stopPropagation();
      const userId = userAvatarDiv.dataset.userId;
      const fullUserData = window.allUsersAndVisitorsData.find(user => user.id === userId);
      if (fullUserData) {
        createUserInfoModal(userAvatarDiv, fullUserData, window.allUsersAndVisitorsData);
      } else {
        const partialUserData = {
          id: userId,
          name: userAvatarDiv.dataset.userName,
          avatar: userAvatarDiv.dataset.userAvatar
        };
        createUserInfoModal(userAvatarDiv, partialUserData, window.allUsersAndVisitorsData);
      }
    });
  }
  
  const dotsOptionsDiv = messageItem.querySelector('.dots-options');
  if (dotsOptionsDiv) {
    dotsOptionsDiv.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = dotsOptionsDiv.querySelector('.message-options-menu');
      if (currentOpenMenu && currentOpenMenu !== menu) {
        currentOpenMenu.classList.remove('show-options');
      }
      menu.classList.toggle('show-options');
      if (menu.classList.contains('show-options')) {
        currentOpenMenu = menu;
      } else {
        currentOpenMenu = null;
      }
      if (currentOpenMenu) {
        document.addEventListener('click', function closeMenuOnOutsideClick(e) {
          if (!dotsOptionsDiv.contains(e.target) && !menu.contains(e.target) && currentOpenMenu && currentOpenMenu.classList.contains('show-options')) {
            currentOpenMenu.classList.remove('show-options');
            currentOpenMenu = null;
            document.removeEventListener('click', closeMenuOnOutsideClick);
          } else if (!currentOpenMenu || !currentOpenMenu.classList.contains('show-options')) {
            document.removeEventListener('click', closeMenuOnOutsideClick);
          }
        });
      }
    });

    const optionItems = dotsOptionsDiv.querySelectorAll('.option-item');
    optionItems.forEach(item => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = event.target.dataset.action;
        const originalMessageText = messageData.text;
        const senderName = messageData.user;
        const messageId = messageData.id;
        if (action === 'quote') {
          activeQuoteData = {
            id: messageId,
            senderName: senderName,
            content: originalMessageText
          };
          displayActiveQuoteBubble(senderName, originalMessageText);
          document.querySelector('#input-bar input').focus();
        } else if (action === 'report') {
          alert(`سيتم الإبلاغ عن الرسالة: "${originalMessageText}"`);
        }
        const menu = dotsOptionsDiv.querySelector('.message-options-menu');
        menu.classList.remove('show-options');
        currentOpenMenu = null;
      });
    });
  }

  messageItem.addEventListener('dblclick', () => {
    const senderName = messageData.user;
    const content = messageData.text;
    activeQuoteData = {
      id: messageData.id,
      senderName: senderName,
      content: content
    };
    displayActiveQuoteBubble(senderName, content);
    document.querySelector('#input-bar input').focus();
  });

  return messageItem;
}

// في ملف js/chat-ui.js

// ... (الكود السابق) ...

// تأكد أنك تستخدم هذا المسار الصحيح لصورة النظام
// في ملف js/chat-ui.js
// ... (الكود السابق) ...

// تأكد أنك تستخدم هذا المسار الصحيح لصورة النظام
const SYSTEM_AVATAR_PATH = 'default_bot.png'; 

// ✨ الكائن الذي يمثل المستخدم "النظام"
export const SYSTEM_USER = {
    id: 'system',
    username: 'النظام',
    rank: 'ادمن',
    avatar: SYSTEM_AVATAR_PATH,
    innerImage: 'images/Interior.png', // صورة الخلفية
    bio: 'أنا نظام الدردشة الآلي.',
};

export function createSystemMessageElement(messageText) {
  const elem = document.createElement('div');
  elem.classList.add('system-message');
  elem.setAttribute('data-user-id', SYSTEM_USER.id); // إضافة معرف للمستخدم

  const avatar = document.createElement('img');
  avatar.src = SYSTEM_AVATAR_PATH; 
  avatar.classList.add('system-message-avatar');
  avatar.setAttribute('data-user-id', SYSTEM_USER.id); // إضافة معرف للمستخدم
  elem.appendChild(avatar);

  const content = document.createElement('div');
  content.classList.add('system-message-content');
  content.textContent = messageText;
  elem.appendChild(content);

  // ✨ إضافة مستمع النقر على أفاتار النظام
  avatar.addEventListener('click', (event) => {
    event.stopPropagation();
    // استدعاء دالة المودال مع بيانات المستخدم "النظام"
    createUserInfoModal(avatar, SYSTEM_USER, [SYSTEM_USER]);
  });
  
  // ✨ إضافة مستمع نقر لرسالة النظام بأكملها أيضًا
  elem.addEventListener('click', (event) => {
      // منع النقر على الرسالة نفسها من إخفاء المودال إذا كان مفتوحًا
      event.stopPropagation();
  });

  return elem;
}




export function addWelcomeMessageToChat(chatBoxElement) {
  const currentUserName = localStorage.getItem('chatUserName') || 'زائر';
  const welcomeMessageText = `مرحبًا بك يا ${currentUserName} في الدردشة! نتمنى لك وقتًا ممتعًا.`;
  const welcomeMessageElement = createSystemMessageElement(welcomeMessageText);
  chatBoxElement.appendChild(welcomeMessageElement);
}

export function updatePrivateButtonNotification(show) {
  const privateButton = document.querySelector('#top-bar .btn.private');
  if (privateButton) {
    if (show) {
      privateButton.classList.add('has-new-messages');
    } else {
      privateButton.classList.remove('has-new-messages');
    }
  }
}

export function updatePrivateChatNotification(senderId, senderData) {
  const minimizedAvatar = document.querySelector(`.minimized-chat-avatar[data-user-id="${senderId}"]`);
  if (minimizedAvatar) {
    minimizedAvatar.classList.add('has-new-messages');
    updatePrivateButtonNotification(false);
  } else {
    updatePrivateButtonNotification(true);
  }
}

export async function checkAndSendJoinMessage(roomId) {
  const fromRoomsPage = localStorage.getItem('fromRoomsPage');
  const fromRegistrationPage = localStorage.getItem('fromRegistrationPage');
  const lastVisitTimestamp = localStorage.getItem('lastVisitTimestamp');
  const currentTime = new Date().getTime();
  const threeHours = 3 * 60 * 60 * 1000;
  let shouldSend = false;
  if (fromRoomsPage === 'true' || fromRegistrationPage === 'true') {
    shouldSend = true;
    localStorage.removeItem('fromRoomsPage');
    localStorage.removeItem('fromRegistrationPage');
  } else if (lastVisitTimestamp && (currentTime - lastVisitTimestamp >= threeHours)) {
    shouldSend = true;
  }
  if (shouldSend && roomId) {
    const { sendJoinMessage } = await import('./chat-firestore.js');
    await sendJoinMessage(roomId);
  }
  localStorage.setItem('lastVisitTimestamp', currentTime);
}

// ✨ نافذة موحّدة لعرض الصورة/الفيديو/الصوت بمنتصف الشاشة مع زر إغلاق وزر تحميل.
// مبنية بالكامل هنا (بدون اعتماد على أي سكربت خارجي) حتى تعمل فور فتح البادج
// الملوّن بمربع الدردشة.
function buildMediaViewerModal() {
  let overlay = document.getElementById('media-viewer-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'media-viewer-overlay';
  overlay.className = 'media-viewer-overlay';
  overlay.innerHTML = `
    <div class="media-viewer-content"></div>
    <button class="media-viewer-btn media-viewer-download" title="تحميل"><i class="fas fa-download"></i></button>
    <button class="media-viewer-btn media-viewer-close" title="إغلاق"><i class="fas fa-times"></i></button>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.media-viewer-close').addEventListener('click', () => closeMediaModal());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeMediaModal();
  });

  return overlay;
}

function closeMediaModal() {
  const overlay = document.getElementById('media-viewer-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  const contentArea = overlay.querySelector('.media-viewer-content');
  // نوقف تشغيل أي فيديو/صوت عند الإغلاق
  const mediaEl = contentArea.querySelector('video, audio');
  if (mediaEl) mediaEl.pause();
  setTimeout(() => { contentArea.innerHTML = ''; }, 200);
}

window.showMediaModal = function(url, type) {
  const overlay = buildMediaViewerModal();
  const contentArea = overlay.querySelector('.media-viewer-content');
  const downloadBtn = overlay.querySelector('.media-viewer-download');

  let innerHtml = '';
  if (type === 'video') {
    innerHtml = `<video src="${url}" controls autoplay></video>`;
  } else if (type === 'audio') {
    innerHtml = `
      <div class="media-viewer-audio-card">
        <i class="fas fa-music"></i>
        <audio src="${url}" controls autoplay></audio>
      </div>
    `;
  } else {
    innerHtml = `<img src="${url}" alt="صورة مرفقة">`;
  }
  contentArea.innerHTML = innerHtml;
  downloadBtn.onclick = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  overlay.classList.add('show');
};

// ✨ إبقاء الاسم القديم يعمل توافقًا مع أي كود قديم قد ينادي عليه
window.showImageInModal = function(imageUrl) {
  window.showMediaModal(imageUrl, 'image');
};
// js/chat-ui.js
// js/chat-ui.js

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// دالة لإضافة زر التسجيل في الشريط السفلي للزوار
export function addRegistrationButtonToBottomBar(userRank) {
    const bottomBar = document.querySelector('.bottom-bar');
    const existingBtn = document.querySelector('.bottom-bar .registration-btn');

    if (userRank === 'زائر') {
        if (!existingBtn) {
            const registerButton = document.createElement('button');
            registerButton.classList.add('registration-btn');
            registerButton.classList.add('bottom-bar-btn');

            registerButton.innerHTML = `
                <i class="icon fa fa-pen"></i>
                <span class="btn-text">تسجيل</span>
            `;

            registerButton.addEventListener('click', () => {
                showRegistrationModal();
            });

            bottomBar.appendChild(registerButton);
        }
    } else {
        if (existingBtn) {
            existingBtn.remove();
        }
    }
}

export const registerModalHTML = `
<div class="registration-modal-content">
  <span class="close-button">&times;</span>
  <h2>تسجيل مستخدم جديد</h2>
  <form id="registrationForm">
    <div class="form-group">
      <label for="reg-username">اسم المستخدم:</label>
      <input type="text" id="reg-username" name="username" required>
    </div>
    <div class="form-group">
      <label for="reg-password">كلمة المرور:</label>
      <input type="password" id="reg-password" name="password" required>
    </div>
    <div class="form-group">
      <label for="reg-email">البريد الإلكتروني:</label>
      <input type="email" id="reg-email" name="email" required>
    </div>
    <button type="submit" class="register-submit-btn">
      <i class="fas fa-user-plus"></i> تسجيل
    </button>
  </form>
</div>
`;

let registrationModal = null;

// ✨ دالة جديدة لتوليد أربعة أرقام عشوائية
function generateRandomFourDigits() {
  const randomNumber = Math.floor(Math.random() * 9000) + 1000;
  return randomNumber;
}

export function showRegistrationModal() {
  if (registrationModal) {
    registrationModal.remove();
  }

  registrationModal = document.createElement('div');
  registrationModal.classList.add('registration-modal');
  registrationModal.innerHTML = registerModalHTML;
  document.body.appendChild(registrationModal);

  setTimeout(() => {
    registrationModal.classList.add('show');
  }, 10);

  const currentUserName = localStorage.getItem('chatUserName');
  const usernameInput = registrationModal.querySelector('#reg-username');
  const emailInput = registrationModal.querySelector('#reg-email');

  if (usernameInput && currentUserName) {
    usernameInput.value = currentUserName;

    // ✨ تحديث توليد البريد الإلكتروني التلقائي
    const randomDigits = generateRandomFourDigits();
    const defaultEmail = `user_${randomDigits}@gmail.com`;
    emailInput.value = defaultEmail;
  }

  registrationModal.querySelector('.close-button').addEventListener('click', () => {
    hideRegistrationModal();
  });

  registrationModal.addEventListener('click', (event) => {
    if (event.target === registrationModal) {
      hideRegistrationModal();
    }
  });

  registrationModal.querySelector('#registrationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = registrationModal.querySelector('#reg-username').value.trim();
    const email = registrationModal.querySelector('#reg-email').value.trim();
    const password = registrationModal.querySelector('#reg-password').value;

    if (!username || !email || !password) {
      alert('يرجى ملء جميع الحقول.');
      return;
    }

    await handleRegistration(username, email, password);
    hideRegistrationModal();
  });
}

export function hideRegistrationModal() {
  if (registrationModal) {
    registrationModal.classList.remove('show');
    registrationModal.addEventListener('transitionend', () => {
      if (registrationModal) {
        registrationModal.remove();
        registrationModal = null;
      }
    }, { once: true });
  }
}

// دالة التحقق من تكرار اسم المستخدم
async function isUsernameTaken(username) {
  const usersQuery = query(
    collection(db, 'users'),
    where('username', '==', username),
    limit(1)
  );
  const userSnapshot = await getDocs(usersQuery);
  if (!userSnapshot.empty) return true;
  return false;
}

// نسخة محدثة لحفظ كلمة المرور في قاعدة البيانات مباشرة (بدون Firebase Auth)
export async function handleRegistration(registerName, registerEmail, registerPassword) {
  const DEFAULT_USER_AVATAR = 'images/default-user.png';
  const newRank = 'عضو';

  try {
    if (await isUsernameTaken(registerName)) {
      alert('اسم المستخدم مستخدم سابقاً. الرجاء اختيار اسم فريد.');
      return;
    }

    // جلب بيانات المستخدم الزائر الحالية
    const visitorId = localStorage.getItem('chatUserId');
    let visitorData = {};
    if (visitorId) {
      const visitorDocRef = doc(db, 'visitors', visitorId);
      const visitorDocSnap = await getDoc(visitorDocRef);
      if (visitorDocSnap.exists()) {
        visitorData = visitorDocSnap.data();
      }
    }

    // ✨ نستخدم نفس معرّف الزائر الحالي كمعرّف للحساب الجديد بدل توليد UUID
    // جديد. كل الرسائل القديمة التي أرسلها كزائر (وأي محادثات خاصة، منشنات،
    // إعجابات...) مخزّنة بحقل senderId = هذا المعرّف بالذات. لو ولّدنا معرّفاً
    // مختلفاً هنا، تبقى تلك الرسائل تشير لمعرّف زائر لم يعد له وجود (لأننا
    // نحذف مستند الزائر بالأسفل)، فتفقد ربطها الحي ببيانات الحساب.
    // بإبقاء نفس المعرّف، يبقى senderId في كل الرسائل/المحادثات القديمة صالحاً
    // ويشير مباشرة لمستند العضو الجديد داخل users، فتُقرأ منه بياناته الحيّة
    // (الرتبة، المستوى، الأفتار، العمر، الجنس) تلقائياً في كل مكان يعتمد على
    // getUserById/allUsersAndVisitorsData (شريط الرسائل، مودال الملف الشخصي)
    // دون أي حاجة لتعديل مستندات الرسائل القديمة نفسها واحدة واحدة.
const userId = visitorId || generateUUID();

    // دمج بيانات الزائر مع الحساب الجديد، مع حفظ كلمة المرور
    const userDataToSave = {
      username: registerName,
      email: registerEmail,
      password: registerPassword, // ⚠️ يتم الحفظ بشكل صريح هنا
      timestamp: serverTimestamp(),
      userType: 'registered',
      avatar: DEFAULT_USER_AVATAR,
      rank: newRank,
      level: visitorData.level || 1,
      totalExp: visitorData.totalExp || 0,
      currentExp: visitorData.currentExp || 0,
      expToNextLevel: visitorData.expToNextLevel || 200,
      likes: visitorData.likes || [],
      age: visitorData.age || null,
      gender: visitorData.gender || null
    };

    await setDoc(doc(db, 'users', userId), userDataToSave);

    // حذف بيانات الزائر من مجموعة visitors
    if (visitorId) {
      await deleteDoc(doc(db, 'visitors', visitorId));
    }

    // تحديث البيانات في الذاكرة المحلية
    localStorage.setItem('chatUserName', registerName);
    localStorage.setItem('userType', 'registered');
    localStorage.setItem('chatUserId', userId);
    localStorage.setItem('chatUserAvatar', userDataToSave.avatar);
    localStorage.setItem('chatUserRank', newRank);
    // ✨ إعادة حساب الصلاحيات وتخزينها فوراً حسب الرتبة الجديدة (عضو)، بنفس
    // نقطة الحقيقة الوحيدة بـ constants.js. بدون هذا السطر تبقى صلاحيات
    // "زائر" القديمة محفوظة بالخطأ بمفتاح chatUserPermissions إلى حين أول
    // تغيير رتبة لاحق يمر عبر listenForUserRankChanges.
    storeUserPermissions(newRank);

    // توجيه المستخدم
    localStorage.setItem('fromRegistrationPage', 'true');
    window.location.href = 'chat.html';

  } catch (error) {
    console.error("خطأ أثناء تسجيل الحساب:", error);
    alert('حدث خطأ غير متوقع أثناء التسجيل. يرجى إعادة المحاولة.');
  }
}