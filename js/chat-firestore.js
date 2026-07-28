// chat-firestore.js
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  limit,
  startAfter
} from "./firestore-shim.js";
import { db } from './firebase-config.js';
import {
  createMessageElement,
  createSystemMessageElement,
  addWelcomeMessageToChat,
  activeQuoteData,
  hideActiveQuoteBubble,
  updatePrivateButtonNotification,
  updatePrivateChatNotification,
  currentOpenPrivateChatId, updateUserRankInUI
} from './chat-ui.js';
import { RANK_ORDER, storeUserPermissions, storeUserFriends } from './constants.js';
import { getUserById } from './user-cache.js';


// استبدل 'YOUR_APPLICATION_ID' و 'YOUR_SEARCH_ONLY_API_KEY' بمفاتيحك الخاصة
// ⚠️ تحقق من لوحة تحكم Algolia إن هذا المفتاح مقيّد فعلياً كـ "Search-only API Key"
// (وليس Admin API Key). مفتاح البحث فقط آمن للكشف بالمتصفح لأنه بحكم تصميمه
// لا يقدر يعدّل أو يحذف بيانات، لكن لو صار بالغلط Admin key فهذا يعطي أي زائر
// صلاحية كاملة على فهرس Algolia.
const client = algoliasearch('BLAEWYZHN7', '333bd6343b1c40d06652372ae8fbe83f');
const index = client.initIndex('users'); // تأكد من أن اسم الفهرس هو نفسه الذي أنشأته

// في ملف js/chat-firestore.js
// ... (الاستيرادات)
// ...
 
// دالة المستمع التي تراقب التغييرات في Firestore
// في ملف chat-firestore.js
// دالة لتهريب الأحرف الخاصة في التعبير المنتظم
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& تعني السلسلة المجدولة بالكامل
}

 
// ⚠️ ملاحظة أداء: هذا المستمع يفتح onSnapshot على مجموعة "users" كاملة حتى
// يقدر يبلّغ كل المتصلين إذا تغيّرت رتبة أي مستخدم آخر أثناء الشات (مزامنة حيّة).
// هذا يعني أن أول تحميل يدفع قراءة واحدة لكل مستند مستخدم (تكلفة متأصلة بـ Firestore
// لأي مستمع على مستوى Collection، ما فيه طريقة لتفاديها إذا كنتوا تبون بث حي للجميع).
// إذا صار عدد المستخدمين كبير جداً (آلاف)، الحل الجذري هو مستند ملخص صغير
// (مثل rooms/{roomId}/meta/rankUpdates) تكتبونه عند كل تغيير رتبة وتستمعون له
// بدل مجموعة users كاملة. هذا يحتاج تعديل بالـ backend/الكتابة عند تغيير الرتبة،
// فتركناه كما هو حالياً وما غيّرنا نطاق المستمع حتى ما نكسر ميزة المزامنة الحية.
export function listenForUserRankChanges() {
    const usersCollectionRef = collection(db, "users");
    const currentUserId = localStorage.getItem('chatUserId');
 
    onSnapshot(usersCollectionRef, (querySnapshot) => {
        querySnapshot.docChanges().forEach((change) => {
            if (change.type === "modified") {
                const userData = change.doc.data();
                const userId = change.doc.id;
 
                // تحديث الكاش المحلي
                const userInCache = getUserById(userId);
                if (userInCache) {
                    userInCache.rank = userData.rank;
                }
 
                // ✨ إذا كان المستخدم المحدث هو أنت (تمت ترقيتك/تخفيضك): هذا هو
                // الاستثناء الوحيد اللي يعيد فحص الرتبة بعد الدخول. نحسب الصلاحيات
                // الجديدة مرة واحدة ونخزّنها، ثم نعيد تحميل الصفحة فورًا حتى تظهر
                // كل الأزرار المفروضة على الرتبة الجديدة مباشرة.
                if (userId === currentUserId) {
                    const previousRank = localStorage.getItem('chatUserRank');
                    localStorage.setItem('chatUserRank', userData.rank);
                    sessionStorage.setItem('chatUserRank', userData.rank);
                    storeUserPermissions(userData.rank);
                    if (previousRank !== userData.rank) {
                        window.location.reload();
                        return;
                    }
                }
 
                // استدعاء دالة التحديث الشاملة
                updateUserRankInUI(userId, userData.rank);
            }
        });
    });
}
 
// ... (بقية الكود في chat-firestore.js)

export async function getChatRooms() {
  try {
    const roomsCol = collection(db, 'rooms');
    const roomsSnapshot = await getDocs(roomsCol);
    const roomsList = roomsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return roomsList;
  } catch (error) {
    console.error("Error getting rooms:", error);
    throw error;
  }
}

// ... (الكود السابق)
 
// ✨ إصلاح: تعطي أول مستند "مؤكد" (تم تخزينه فعلياً على السيرفر) من مصفوفة
// مستندات. الرسالة التي أُرسلت للتو قد تظهر محلياً قبل أن يؤكد السيرفر
// وقتها (serverTimestamp لسا "معلّق")، واستخدام هذا النوع من المستندات
// كنقطة بداية/نهاية لاستعلام (startAfter) يسبب خطأ Firestore:
// "uncommitted server timestamp". هذه الدالة تتجاوز أي مستند معلّق
// وتُرجع أقرب مستند مؤكد فعلياً.
export function getSafeCursorDoc(docsArray) {
  if (!docsArray || docsArray.length === 0) return null;
  for (const d of docsArray) {
    if (!d.metadata || !d.metadata.hasPendingWrites) {
      return d;
    }
  }
  return null;
}

export async function fetchRoomMessages(roomId, pageSize = 50, lastDoc = null) {
  const messagesCol = collection(db, 'rooms', roomId, 'messages');
  let q = query(messagesCol, orderBy('timestamp', 'desc'), limit(pageSize));
  if (lastDoc) {
    q = query(messagesCol, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(pageSize));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs;
}
 
// ✨ عدد الرسائل التي تُحمّل أول ما تفتح الغرفة (بدل 50)
const INITIAL_MESSAGES_COUNT = 15;
// ✨ عدد الرسائل التي تُحمّل عند التمرير لأعلى لجلب رسائل أقدم
const LOAD_MORE_MESSAGES_COUNT = 20;

export async function loadInitialMessages(roomId, renderMessages) {
  const docs = await fetchRoomMessages(roomId, INITIAL_MESSAGES_COUNT);
  // ✨ إصلاح: docs.reverse() كانت تُعدّل نفس المصفوفة (docs) بالمكان، وبما أن
  // "messages" بالأسفل كانت تشير لنفس المصفوفة (مرجع وليس نسخة)، كان ترتيبها
  // ينقلب أيضاً من الأحدث-أولاً إلى الأقدم-أولاً بعد هذا السطر. هذا كان يجعل
  // messages[0] (المُستخدَم في main.js كحد فاصل لبدء المستمع اللحظي) يشير خطأً
  // لأقدم رسالة بدل أحدث رسالة، فيتسبب أحياناً بإعادة معالجة رسائل قديمة (مثل
  // رسالة الكتم) عبر المستمع اللحظي بعد كل تحديث للصفحة. الحل: نستخدم نسخة
  // منفصلة للعرض بدل التعديل على المصفوفة الأصلية.
  window._messagesPagination = {
    messages: docs,
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore: docs.length === INITIAL_MESSAGES_COUNT,
    roomId: roomId
  };
  renderMessages([...docs].reverse(), true);
}
 
export async function loadMoreMessages(renderMessages) {
  const pagination = window._messagesPagination;
  if (!pagination || !pagination.hasMore || !pagination.lastDoc) return;
  const docs = await fetchRoomMessages(pagination.roomId, LOAD_MORE_MESSAGES_COUNT, pagination.lastDoc);
  if (docs.length === 0) {
    pagination.hasMore = false;
    return;
  }
  pagination.lastDoc = docs.length > 0 ? (getSafeCursorDoc([...docs].reverse()) || pagination.lastDoc) : pagination.lastDoc;
  pagination.messages = docs.concat(pagination.messages);
  renderMessages(docs.reverse(), false);
}
 
// ... (بقية الكود)

// في ملف chat-firestore.js
// ... (الاستيرادات)

let unsubscribeFromMessages = null;

export function listenForNewMessages(roomId, afterDoc = null) {
    if (unsubscribeFromMessages) {
        unsubscribeFromMessages();
    }
    const chatBox = document.querySelector('#chat-box .chat-box');
    const messagesCol = collection(db, 'rooms', roomId, 'messages');

    // ✨ بدل الاستماع لكل رسائل الغرفة من البداية (وهذا كان يسبب بطء التحميل
    // وتحميل عدد ضخم من الرسائل)، نستمع فقط للرسائل الأحدث من آخر رسالة
    // تم تحميلها مسبقاً عبر loadInitialMessages. هذا يحل أيضاً مشكلة فقدان
    // أي رسالة تصل بالضبط في اللحظة بين تحميل الصفحة الأولى وربط المستمع،
    // لأننا لم نعد نتجاهل أول لقطة (snapshot) بشكل كامل كما في السابق.
    let q = query(messagesCol, orderBy('timestamp', 'asc'));
    if (afterDoc) {
        q = query(messagesCol, orderBy('timestamp', 'asc'), startAfter(afterDoc));
    }

    unsubscribeFromMessages = onSnapshot(q, snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const messageData = { id: change.doc.id, ...change.doc.data() };

                // ✨ تجنّب تكرار نفس الرسالة إذا كانت موجودة أصلاً في الواجهة
                if (chatBox.querySelector(`[data-id="${messageData.id}"]`)) {
                    return;
                }

                const senderData = getUserById(messageData.senderId);

                if (!messageData.isSystemMessage) {
                    messageData.userType = senderData?.rank === 'زائر' ? 'visitor' : 'registered';
                    messageData.senderRank = senderData?.rank || 'زائر';
                    messageData.level = senderData?.level || 1;
                    // ✨ نفس فكرة تحديث الرتبة/المستوى: نأخذ الأفتار الحالي
                    // لصاحب الرسالة بدل الأفتار المجمّد وقت الإرسال (مهم بعد
                    // تحوّل زائر إلى عضو، حتى تنسجم رسائله الجديدة مع القديمة).
                    if (senderData?.avatar) {
                        messageData.avatar = senderData.avatar;
                    }
                }

                if (messageData.isSystemMessage && messageData.type === 'clear') {
                    chatBox.innerHTML = '';
                    const elem = createSystemMessageElement(messageData.text);
                    chatBox.appendChild(elem);
                    return;
                }

                const elem = messageData.isSystemMessage ?
                    createSystemMessageElement(messageData.text) :
                    createMessageElement(messageData);
                chatBox.appendChild(elem);
            } else if (change.type === 'removed') {
                const messageElement = chatBox.querySelector(`[data-id="${change.doc.id}"]`);
                if (messageElement) {
                    messageElement.remove();
                }
            }
        });
        setTimeout(() => {
            if (chatBox && chatBox.scrollHeight > chatBox.clientHeight) {
                chatBox.scrollTop = chatBox.scrollHeight;
            }
        }, 100);
    }, error => {
        console.error('Error listening to messages:', error);
        chatBox.innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Failed to load messages.</div>';
    });

    return unsubscribeFromMessages;
}

// ... (بقية الكود)


// ... (بقية الدوال)


export async function updateUserExperience(userId) {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    const userData = userDoc.data();
    if (userData.userType === 'registered') {
      let { level, totalExp, currentExp, expToNextLevel } = userData;
      const expGain = 10;
      currentExp = (currentExp || 0) + expGain;
      totalExp = (totalExp || 0) + expGain;
      level = level || 1;
      expToNextLevel = expToNextLevel || 200;

      if (currentExp >= expToNextLevel) {
        level++;
        currentExp = currentExp - expToNextLevel;
        expToNextLevel = 200 + (level * 100);
        const notificationText = `رائع! لقد وصلت إلى مستوى الخبرة  ${level}!`;
        await addNotification(notificationText, SYSTEM_USER, userId);
      }

      await updateDoc(userRef, {
        level,
        totalExp,
        currentExp,
        expToNextLevel,
      });
      return { level, totalExp, currentExp, expToNextLevel };
    }
  }
  return null;
}

export async function sendMessage(messageText, roomId, imageUrl = null, mediaType = null) {
  if ((!messageText || messageText.trim() === '') && !imageUrl) {
    if (!activeQuoteData) {
      return;
    }
  }
  const currentUserId = localStorage.getItem('chatUserId');
  if (!currentUserId) {
    console.error('No user ID found.');
    alert('Please login to send messages.');
    return;
  }

  let userData, currentUserName, currentUserAvatar, currentUserRank, currentUserLevel;
  let userDoc = await getDoc(doc(db, 'users', currentUserId));

  if (userDoc.exists()) {
    userData = userDoc.data();
    currentUserName = userData.username;
    currentUserAvatar = userData.avatar;
    currentUserRank = userData.rank || 'عضو';
    currentUserLevel = userData.level || 1;
    await updateUserExperience(currentUserId);
  } else {
    userDoc = await getDoc(doc(db, 'visitors', currentUserId));
    if (userDoc.exists()) {
      userData = userDoc.data();
      currentUserName = userData.name;
      currentUserAvatar = userData.avatar;
      currentUserRank = userData.rank || 'زائر';
      currentUserLevel = 1;
    } else {
      console.error('User not found.');
      alert('Account not found. Please login again.');
      return;
    }
  }

  // في دالة sendMessage بملف chat-firestore.js
// هذا الكود يتأكد من أن الرسالة النهائية لا تحتوي على الأقواس

// ... (الكود السابق) ...

// هذا الجزء هو المسؤول عن حذف الأقواس من الرسالة قبل إرسالها لقاعدة البيانات
const mentionRegex = /\[(.*?)\]/g;
const mentionedNames = [];
let match;
while ((match = mentionRegex.exec(messageText)) !== null) {
  mentionedNames.push(match[1]);
}

const cleanMessageText = messageText.replace(mentionRegex, (match, p1) => p1);

const newMessage = {
    user: currentUserName,
    senderId: currentUserId,
    avatar: currentUserAvatar,
    text: cleanMessageText ? cleanMessageText.trim() : '',
    type: 'chat',
    timestamp: serverTimestamp(),
    userNum: '100',
    senderRank: currentUserRank,
    level: currentUserLevel
  };

  if (imageUrl) {
    newMessage.imageUrl = imageUrl;
    // ✨ نوع الوسائط الصريح (image/video/audio/music) بدل الاعتماد فقط على تخمين
    // الامتداد لاحقًا عند العرض — أدق وأسهل بالصيانة.
    if (mediaType) {
      newMessage.mediaType = mediaType;
    }
  }
  if (activeQuoteData) {
    newMessage.quoted = {
      senderName: activeQuoteData.senderName,
      content: activeQuoteData.content
    };
  }
  
  // ✨ بداية الكود الجديد للمنشن
  // ✨ الكود المحدث
try {
  const mentionRegex = /\[(.*?)\]/g;
  const mentionedUserIds = [];
  let match;

  while ((match = mentionRegex.exec(messageText)) !== null) {
    const mentionedName = match[1];

    // البحث عن المستخدم في الكاش المحلي أولاً (يشمل الزوار)
    // في دالة sendMessage بملف chat-firestore.js
const mentionedUser = window.allUsersAndVisitorsData.find(user => user.name === mentionedName);
if (mentionedUser) {
  mentionedUserIds.push(mentionedUser.id);
} else {
      // إذا لم يتم العثور عليه في الكاش، قم بالبحث في Algolia
      try {
        const { hits } = await index.search(mentionedName, {
          attributesToRetrieve: ['objectID'],
          hitsPerPage: 1
        });
        if (hits.length > 0) {
          mentionedUserIds.push(hits[0].objectID);
        }
      } catch (error) {
        console.error("Failed to search for mention in Algolia:", error);
      }
    }
  }

  // إذا تم العثور على أي منشن، أضف حقل 'mentions' إلى الرسالة
  if (mentionedUserIds.length > 0) {
    newMessage.mentions = mentionedUserIds;
  }
} catch (error) {
  console.error('Error processing mentions:', error);
}

  // ✨ نهاية الكود الجديد

  try {
    const messagesCol = collection(db, 'rooms', roomId, 'messages');
    await addDoc(messagesCol, newMessage);
    console.log('Message sent successfully!');
    hideActiveQuoteBubble();
  } catch (e) {
    console.error('Error sending message: ', e);
    alert('Failed to send message. Please try again.');
  }
}


export async function sendSystemMessage(message, roomId) {
  if (!roomId || !message) return;
  const messagesCollectionRef = collection(db, 'rooms', roomId, 'messages');
  let newMessage;
  if (typeof message === 'string') {
    // دعم النمط القديم: فقط نص
    newMessage = {
      text: message,
      timestamp: serverTimestamp(),
      isSystemMessage: true
    };
  } else if (typeof message === 'object') {
    // دعم النمط الجديد: كائن رسالة
    newMessage = {
      ...message,
      timestamp: serverTimestamp(),
      isSystemMessage: true
    };
  } else {
    return;
  }
  try {
    await addDoc(messagesCollectionRef, newMessage);
  } catch (error) {
    console.error("Failed to send system message:", error);
    throw error;
  }
}

let cachedUsersAndVisitors = null;
let cachedUsersTimestamp = 0;
const CACHE_DURATION = 60 * 1000;

// في ملف chat-firestore.js
// ... (الكود السابق) ...

export async function getAllUsersAndVisitors(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedUsersAndVisitors && (now - cachedUsersTimestamp < CACHE_DURATION)) {
    return cachedUsersAndVisitors;
  }
  const onlineUsers = new Map();
  const usersSnapshot = await getDocs(collection(db, 'users'));
  
  // 1. إضافة musicUrl للمستخدمين المسجلين
  usersSnapshot.forEach(docSnap => {
    const userData = docSnap.data();
    onlineUsers.set(docSnap.id, {
      id: docSnap.id,
      name: userData.username,
      avatar: userData.avatar || 'https://i.imgur.com/Uo9V2Yx.png',
      innerImage: userData.innerImage || 'images/Interior.png',
      rank: userData.rank || 'عضو',
      level: userData.level || 1,
      likes: userData.likes || [],
      gender: userData.gender || 'غير محدد',
      age: userData.age || '',
      statusText: userData.statusText || '',
      bio: userData.bio || '',
      email: userData.email || '',
      // ✨ إضافة حقل musicUrl هنا ✨
      musicUrl: userData.musicUrl || null 
    });
  });
  
  const visitorsSnapshot = await getDocs(collection(db, 'visitors'));
  
  // 2. إضافة musicUrl للزوار (إذا كان متوفراً في وثيقة الزائر)
  visitorsSnapshot.forEach(docSnap => {
    const visitorData = docSnap.data();
    if (!onlineUsers.has(docSnap.id)) {
      onlineUsers.set(docSnap.id, {
        id: docSnap.id,
        name: visitorData.name,
        avatar: visitorData.avatar || 'https://i.imgur.com/Uo9V2Yx.png',
        innerImage: visitorData.innerImage || 'images/Interior.png',
        rank: visitorData.rank || 'زائر',
        level: 1,
        likes: [],
        gender: visitorData.gender || 'غير محدد',
        age: visitorData.age || '',
        statusText: visitorData.statusText || '',
        bio: visitorData.bio || '',
        email: visitorData.email || '',
        // ✨ إضافة حقل musicUrl هنا ✨
        musicUrl: visitorData.musicUrl || null 
      });
    }
  });


  // ✨ إضافة حساب النظام يدوياً إلى القائمة.
  // تم جلبه من `chat-ui.js` لضمان وجود البيانات.
  const systemUser = {
      id: 'system',
      name: 'النظام',
      avatar: 'default_bot.png',
      innerImage: 'images/Interior.png',
      rank: 'ادمن',
      level: 1,
      likes: [],
      gender: '',
      age: '',
      statusText: 'أنا نظام الدردشة الآلي.',
      bio: 'أنا نظام الدردشة الآلي.'
  };

  onlineUsers.set(systemUser.id, systemUser);
  
  cachedUsersAndVisitors = Array.from(onlineUsers.values());
  cachedUsersTimestamp = now;
  return cachedUsersAndVisitors;
}


export async function getUserData(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    } else {
      const visitorRef = doc(db, 'visitors', userId);
      const visitorDoc = await getDoc(visitorRef);
      if (visitorDoc.exists()) {
        return { id: visitorDoc.id, ...visitorDoc.data() };
      }
      return null;
    }
  } catch (error) {
    console.error("Error getting user data:", error);
    return null;
  }
}

export async function updateUserData(userId, dataToUpdate) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      console.error("User not found.");
      return false;
    }
    const oldUserData = userDoc.data();

    if (dataToUpdate.username !== undefined && dataToUpdate.username !== oldUserData.username) {
      const notificationText = `تم تغيير اسمك من "${oldUserData.username}" إلى "${dataToUpdate.username}".`;
      await addNotification(notificationText, SYSTEM_USER, userId);
    }

    if (dataToUpdate.rank !== undefined && dataToUpdate.rank !== oldUserData.rank) {
      const notificationText = `تهانينا! لقد تم ترقيتك إلى رتبة "${dataToUpdate.rank}".`;
      await addOrReplaceNotification(notificationText, SYSTEM_USER, userId, 'rank');
    }

    await updateDoc(userRef, dataToUpdate);
    console.log("User data updated successfully:", dataToUpdate);
    return true;
  } catch (error) {
    console.error("Error updating user data:", error);
    return false;
  }
}

export async function manuallyUpdateUserLevel(userId, newLevel) {
  if (newLevel < 1) {
    console.error("Level must be at least 1.");
    return;
  }
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      level: newLevel,
      currentExp: 0,
      expToNextLevel: 200 + (newLevel * 100)
    });
    console.log(`User level updated to ${newLevel}!`);
  } catch (error) {
    console.error("Error updating level:", error);
  }
}

export function getPrivateChatId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

// js/chat-firestore.js

// ... (الكود السابق لا يتغير)

export async function sendPrivateMessage(senderId, senderName, senderAvatar, receiverId, messageText, imageUrl = null, quotedData = null) {
  // تعديل: السماح بإرسال صورة بدون نص
  if ((!messageText || messageText.trim() === '') && !imageUrl) {
    return;
  }
  const chatId = getPrivateChatId(senderId, receiverId);
  const privateChatRef = doc(db, 'privateChats', chatId);
  const messagesCol = collection(privateChatRef, 'messages');

  const newMessage = {
    senderId,
    senderName,
    senderAvatar,
    receiverId,
    text: messageText ? messageText.trim() : '', // التأكد من وجود نص أو سلسلة فارغة
    timestamp: serverTimestamp(),
    type: 'private',
  };

  // إضافة: تضمين رابط الصورة إذا وجد
  if (imageUrl) {
    newMessage.imageUrl = imageUrl;
  }

  if (quotedData) {
    newMessage.quoted = quotedData;
  }
  try {
    await addDoc(messagesCol, newMessage);
    const unreadCounterField = `unreadCount_${receiverId}`;
    await setDoc(privateChatRef, {
      senderId,
      receiverId,
      lastMessageTimestamp: serverTimestamp(),
      [unreadCounterField]: increment(1)
    }, { merge: true });
    console.log(`Private message sent to ${chatId}!`);
  } catch (e) {
    console.error('Error sending private message: ', e);
    alert('Failed to send private message.');
  }
}

// ... (بقية الكود لا يتغير)

// في ملف js/chat-firestore.js
// ... (الكود السابق) ...

export function setupPrivateMessagesListener(currentUserId, targetUserId, messagesBoxElement, clearPrevious = true) {
  // ✨ تم إزالة clearPrevious وإضافة متغير لتتبع أول جلب للبيانات
  let isFirstPrivateSnapshot = true;
  if (messagesBoxElement._privateChatUnsubscribe) {
    messagesBoxElement._privateChatUnsubscribe();
    messagesBoxElement._privateChatUnsubscribe = null;
  }
  const chatId = getPrivateChatId(currentUserId, targetUserId);
  const messagesCol = collection(db, 'privateChats', chatId, 'messages');
  const messagesQuery = query(messagesCol, orderBy('timestamp', 'asc'));

  const unsubscribe = onSnapshot(messagesQuery, snapshot => {
    // إذا كانت هذه أول مرة يتم فيها جلب البيانات، قم بمسح الصندوق
    if (isFirstPrivateSnapshot) {
      messagesBoxElement.innerHTML = '';
      if (snapshot.empty) {
        messagesBoxElement.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"></div>';
      }
      isFirstPrivateSnapshot = false;
    }
    snapshot.docChanges().forEach(change => {
      const messageData = change.doc.data();
      const isSentByMe = messageData.senderId === currentUserId;
      messageData.id = change.doc.id;
      if (change.type === 'added') {
        const existingMessageElement = messagesBoxElement.querySelector(`.private-message-item[data-id="${messageData.id}"]`);
        if (!existingMessageElement) {
          const messageElement = document.createElement('div');
          messageElement.classList.add('private-message-item');
          messageElement.setAttribute('data-id', messageData.id);
          messageElement.classList.add(isSentByMe ? 'sent' : 'received');

          if (messageData.imageUrl) {
            const imageElement = document.createElement('img');
            imageElement.src = messageData.imageUrl;
            imageElement.alt = 'Uploaded image';
            imageElement.classList.add('private-chat-image'); 
            messageElement.appendChild(imageElement);
          } else if (messageData.text) {
            messageElement.textContent = messageData.text;
          }

          messagesBoxElement.appendChild(messageElement);
        }
        if (!isSentByMe) {
          const senderData = {
            id: messageData.senderId,
            name: messageData.senderName,
            avatar: messageData.senderAvatar
          };
          updatePrivateChatNotification(messageData.senderId, senderData);
        }
      } else if (change.type === 'modified') {
        const existingPrivateMessage = messagesBoxElement.querySelector(`.private-message-item[data-id="${messageData.id}"]`);
        if (existingPrivateMessage) {
          if (messageData.imageUrl) {
            existingPrivateMessage.innerHTML = `<img src="${messageData.imageUrl}" alt="Uploaded image" class="private-chat-image">`;
          } else {
            existingPrivateMessage.textContent = messageData.text;
          }
        }
      } else if (change.type === 'removed') {
        const existingPrivateMessage = messagesBoxElement.querySelector(`.private-message-item[data-id="${messageData.id}"]`);
        if (existingPrivateMessage) {
          existingPrivateMessage.remove();
        }
      }
    });

    resetUnreadCount(currentUserId, targetUserId);
    updatePrivateButtonNotification();

    messagesBoxElement.scrollTop = messagesBoxElement.scrollHeight;
  }, error => {
    console.error("Error getting private messages: ", error);
    messagesBoxElement.innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Failed to load private messages.</div>';
  });
  messagesBoxElement._privateChatUnsubscribe = unsubscribe;
}

export async function getPrivateChatContacts(currentUserId) {
  const contacts = new Map();
  const chatDocs = [];

  const senderQuery = query(collection(db, 'privateChats'), where('senderId', '==', currentUserId));
  const senderSnapshot = await getDocs(senderQuery);
  senderSnapshot.forEach(doc => chatDocs.push(doc));

  const receiverQuery = query(collection(db, 'privateChats'), where('receiverId', '==', currentUserId));
  const receiverSnapshot = await getDocs(receiverQuery);
  receiverSnapshot.forEach(doc => chatDocs.push(doc));

  chatDocs.forEach(docSnap => {
    const data = docSnap.data();
    const targetUserId = data.senderId === currentUserId ? data.receiverId : data.senderId;
    const unreadCount = data[`unreadCount_${currentUserId}`] || 0;
    if (targetUserId) {
      contacts.set(targetUserId, {
        id: targetUserId,
        unreadCount
      });
    }
  });

  const contactDetailsPromises = Array.from(contacts.keys()).map(async (userId) => {
    let userRef = doc(db, 'users', userId);
    let userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return { ...contacts.get(userId), name: userDoc.data().username, avatar: userDoc.data().avatar };
    } else {
      userRef = doc(db, 'visitors', userId);
      userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        return { ...contacts.get(userId), name: userDoc.data().name, avatar: userDoc.data().avatar };
      }
    }
    return null;
  });

  const detailedContacts = await Promise.all(contactDetailsPromises);
  return detailedContacts.filter(contact => contact !== null);
}

export function setupPrivateMessageNotificationListener(currentUserId) {
  if (!currentUserId) {
    console.warn('Cannot set up private message notification listener: User ID is missing.');
    return;
  }
  const privateChatsCol = collection(db, 'privateChats');
  onSnapshot(privateChatsCol, snapshot => {
    let totalUnreadCount = 0;
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const unreadCount = data[`unreadCount_${currentUserId}`] || 0;
      const otherUserId = docSnap.id.replace(currentUserId, '').replace('_', '');
      if (unreadCount > 0 && currentOpenPrivateChatId !== otherUserId) {
        totalUnreadCount += unreadCount;
      }
    });
    updatePrivateButtonNotification(totalUnreadCount > 0);
  }, error => {
    console.error('Error listening to private chat updates:', error);
  });
}

export async function resetUnreadCount(currentUserId, otherUserId) {
    const chatDocId = [currentUserId, otherUserId].sort().join('_');
    const chatDocRef = doc(db, 'privateChats', chatDocId);
    
    // ✨ الكود الجديد: جلب المستند أولاً للتحقق من وجوده
    const docSnap = await getDoc(chatDocRef);

    // إذا كان المستند موجودًا، قم بالتحديث. وإلا، لا تفعل شيئًا.
    if (docSnap.exists()) {
        const updateField = `unreadCount_${currentUserId}`;
        try {
            await updateDoc(chatDocRef, {
                [updateField]: 0
            });
            console.log("تم إعادة تعيين عدد الرسائل غير المقروءة بنجاح.");
        } catch (error) {
            console.error("Error resetting unread count:", error);
            // يمكنك هنا إضافة معالجة أخرى للأخطاء إذا لزم الأمر
        }
    } else {
        console.log("لا يوجد مستند محادثة لإعادة تعيين عدد الرسائل غير المقروءة.");
    }
}

export async function sendJoinMessage(roomId) {
  const currentUserName = localStorage.getItem('chatUserName');
  const currentUserId = localStorage.getItem('chatUserId');
  const currentUserAvatar = localStorage.getItem('chatUserAvatar');
  const currentUserRank = localStorage.getItem('chatUserRank') || 'زائر';

  if (!currentUserName || !currentUserId) {
    console.error('No user data found for join message.');
    return;
  }

  const joinMessage = {
    user: currentUserName,
    senderId: currentUserId,
    avatar: currentUserAvatar,
    text: `انضم ${currentUserName} إلى الغرفة!`,
    type: 'join',
    timestamp: serverTimestamp(),
    senderRank: currentUserRank
  };

  try {
    const messagesCol = collection(db, 'rooms', roomId, 'messages');
    await addDoc(messagesCol, joinMessage);
    console.log('Join message sent successfully.');
  } catch (e) {
    console.error('Error sending join message: ', e);
  }
}

export async function deleteChatRoomMessages(roomId) {
  if (!roomId) {
    console.error('Room ID missing for message deletion.');
    return;
  }
  try {
    const chatRoomRef = collection(db, 'rooms', roomId, 'messages');
    const querySnapshot = await getDocs(chatRoomRef);
    if (querySnapshot.empty) {
      console.log('No messages to delete in this room.');
      return;
    }
    const batch = writeBatch(db);
    querySnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    console.log(`All messages deleted from room: ${roomId}`);
  } catch (error) {
    console.error('Failed to delete room messages:', error);
    throw error;
  }
}

export async function addLike(likerId, likedUserId) {
  if (likerId === likedUserId) {
    console.warn('Cannot like your own profile.');
    return false;
  }
  const userRef = doc(db, 'users', likedUserId);
  try {
    await updateDoc(userRef, {
      likes: arrayUnion(likerId)
    });
    console.log(`Liked user ${likedUserId} successfully.`);
    return true;
  } catch (error) {
    console.error('Failed to add like:', error);
    return false;
  }
}

export async function removeLike(likerId, likedUserId) {
  const userRef = doc(db, 'users', likedUserId);
  try {
    await updateDoc(userRef, {
      likes: arrayRemove(likerId)
    });
    console.log(`Unliked user ${likedUserId} successfully.`);
    return true;
  } catch (error) {
    console.error('Failed to remove like:', error);
    return false;
  }
}

// في ملف chat-firestore.js

// ... (الاستيرادات) ...

// ✨ كائن يمثل المستخدم "النظام"
export const SYSTEM_USER = {
  id: 'system',
  username: 'النظام',
  rank: 'ادمن',
  avatar: 'default_bot.png',
  innerImage: 'images/Interior.png',
  bio: 'أنا نظام الدردشة الآلي.',
  userType: 'system', // لتحديد نوع الحساب
  timestamp: serverTimestamp()
};
 
// ✨ دالة جديدة لإنشاء حساب النظام إذا لم يكن موجودًا

// ✨ استدعاء الدالة عند تحميل التطبيق أو ملف Firestore
// يمكن استدعاؤها في main.js أو في بداية chat-firestore.js

 
// ... (بقية الكود) ...


export async function addNotification(text, sender, recipientId, category = null) {
    try {
        const payload = {
            text: text,
            timestamp: serverTimestamp(),
            senderId: sender.id,
            senderName: sender.username,
            senderAvatar: sender.avatar || null,
            senderRank: sender.rank || null,
            recipientId: recipientId,
            read: false
        };
        // ✨ "الفئة" تُستخدم لاحقًا لتحديد أي إشعارات قديمة يجب حذفها عند
        // إضافة إشعار جديد من نفس النوع (مثل: رفع الرتبة، الإعجاب بالبروفايل،
        // الكتم) حتى يبدو الإشعار الجديد وكأنه "حلّ محل" القديم بدل تكراره.
        if (category) payload.category = category;
        await addDoc(collection(db, 'notifications'), payload);
        console.log("Notification added successfully.");
    } catch (error) {
        console.error("Error adding notification: ", error);
    }
}

// ✨ يحذف كل الإشعارات السابقة لنفس المستلم ونفس "الفئة" (وبنفس المُرسل لو
// مُرِّر senderId، مثل حالة الإعجاب بالبروفايل حيث يجب أن يبقى إعجاب كل شخص
// منفصلاً عن إعجاب غيره). تُستخدم وحدها عند إلغاء أثر إشعار سابق دون إرسال
// إشعار جديد بدلاً عنه (مثال: فك الكتم).
export async function deleteNotificationsByCategory(recipientId, category, senderId = null) {
    try {
        const clauses = [
            where('recipientId', '==', recipientId),
            where('category', '==', category)
        ];
        if (senderId) clauses.push(where('senderId', '==', senderId));
        const q = query(collection(db, 'notifications'), ...clauses);
        const snap = await getDocs(q);
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    } catch (error) {
        console.error('خطأ في حذف الإشعارات القديمة بنفس الفئة:', error);
    }
}

// ✨ يحذف أي إشعار سابق بنفس الفئة (وبنفس المُرسل إن طُلب) ثم يضيف الإشعار
// الجديد بدلاً عنه — يُستخدم لإشعارات رفع الرتبة والإعجاب بالبروفايل والكتم
// حتى لا تتراكم إشعارات متكررة لنفس الحدث.
export async function addOrReplaceNotification(text, sender, recipientId, category, { scopeToSender = false } = {}) {
    await deleteNotificationsByCategory(recipientId, category, scopeToSender ? sender.id : null);
    await addNotification(text, sender, recipientId, category);
}

// ✨ حذف تلقائي للإشعارات الأقدم من 24 ساعة: لا يوجد سيرفر خلفي (Cloud
// Function) في هذا المشروع، لذلك يتم تشغيل هذا التنظيف من جهاز المستخدم نفسه
// في كل مرة يُفتح فيها أي مستمع متعلق بإشعاراته (شارة الإشعارات أو نافذة
// الإشعارات) — يكفي هذا عمليًا لأن أي مستخدم نشط سيُشغّله بشكل متكرر.
export async function cleanupOldNotifications(recipientId) {
    if (!recipientId) return;
    try {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', recipientId)
        );
        const snap = await getDocs(q);
        const expiredDocs = snap.docs.filter(d => {
            const ts = d.data().timestamp;
            return ts && typeof ts.toMillis === 'function' && ts.toMillis() < oneDayAgo;
        });
        if (expiredDocs.length === 0) return;
        const batch = writeBatch(db);
        expiredDocs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    } catch (error) {
        console.error('خطأ في حذف الإشعارات المنتهية (أقدم من 24 ساعة):', error);
    }
}

// ===================== نظام طلبات الصداقة =====================

// ✨ يحاول جلب مرجع مستند المستخدم سواء كان مسجّلاً (users) أو زائرًا (visitors).
// يرجع null إن لم يوجد المستخدم في أي منهما.
export async function getUserOrVisitorRef(userId) {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) return userRef;

    const visitorRef = doc(db, 'visitors', userId);
    const visitorSnap = await getDoc(visitorRef);
    if (visitorSnap.exists()) return visitorRef;

    return null;
}

/**
 * إرسال طلب صداقة من المستخدم الحالي إلى مستخدم آخر.
 * @param {{id:string, name:string, avatar:string, rank:string}} currentUser بيانات المرسل
 * @param {string} targetUserId معرف المستخدم المُستهدف
 * @returns {Promise<{success:boolean, message:string}>}
 */
export async function sendFriendRequest(currentUser, targetUserId) {
    try {
        if (!currentUser || !currentUser.id || !targetUserId) {
            return { success: false, message: 'تعذر تحديد المستخدم.' };
        }
        if (currentUser.id === targetUserId) {
            return { success: false, message: 'لا يمكنك إضافة نفسك كصديق.' };
        }

        // تحقق: هل هما صديقان بالفعل؟
        const targetRef = await getUserOrVisitorRef(targetUserId);
        if (targetRef) {
            const targetSnap = await getDoc(targetRef);
            const targetFriends = (targetSnap.exists() && targetSnap.data().friends) || [];
            if (targetFriends.includes(currentUser.id)) {
                return { success: false, message: 'أنتما صديقان بالفعل.' };
            }
        }

        const requestData = {
            fromId: currentUser.id,
            fromName: currentUser.name || 'مستخدم',
            fromAvatar: currentUser.avatar || null,
            fromRank: currentUser.rank || 'زائر',
            toId: targetUserId,
            timestamp: serverTimestamp(),
            // ✨ نفس فكرة حقل "read" في الإشعارات: يُخزَّن في Firestore مع الطلب
            // نفسه (وليس في localStorage الخاص بالمتصفح) حتى تبقى حالة "تمت
            // مشاهدته" مرتبطة بالحساب نفسه وتظهر بشكل صحيح حتى بعد تسجيل
            // الخروج والدخول مرة أخرى (أو من أي جهاز آخر).
            seen: false
        };

        // ✨ تحقق: هل يوجد طلب سابق مُرسَل من قبل الحالي لنفس الشخص؟ بدل رفض
        // الإرسال المكرر برسالة خطأ، نحدّث الطلب الموجود (يرفع توقيته ليظهر
        // كأحدث طلب) بدل إنشاء مستند مكرر جديد.
        const existingQuery = query(
            collection(db, 'friendRequests'),
            where('fromId', '==', currentUser.id),
            where('toId', '==', targetUserId)
        );
        const existingSnap = await getDocs(existingQuery);
        if (!existingSnap.empty) {
            await updateDoc(doc(db, 'friendRequests', existingSnap.docs[0].id), requestData);
            return { success: true, message: 'تم إرسال طلب الصداقة بنجاح.' };
        }

        // ✨ لا داعي للتحقق مما إذا كان الطرف الآخر أرسل لك طلبًا بالفعل — نسمح
        // بإرسال الطلب بشكل طبيعي في الحالتين، ويصير الطرفان صديقين بمجرد أن
        // يقبل أحدهما طلب الآخر من نافذة طلبات الصداقة.
        await addDoc(collection(db, 'friendRequests'), requestData);

        return { success: true, message: 'تم إرسال طلب الصداقة بنجاح.' };
    } catch (error) {
        console.error('Error sending friend request:', error);
        return { success: false, message: 'حدث خطأ أثناء إرسال طلب الصداقة.' };
    }
}

/**
 * قبول طلب صداقة: يضيف كل مستخدم لقائمة أصدقاء الآخر، ثم يحذف الطلب من الطلبات المعلّقة.
 * @param {string} requestId معرف مستند الطلب في friendRequests
 * @param {string} fromId معرف مُرسل الطلب
 * @param {string} toId معرف مستلم الطلب (المستخدم الحالي)
 * @returns {Promise<boolean>}
 */
export async function acceptFriendRequest(requestId, fromId, toId) {
    try {
        const fromRef = await getUserOrVisitorRef(fromId);
        const toRef = await getUserOrVisitorRef(toId);

        if (fromRef) {
            await updateDoc(fromRef, { friends: arrayUnion(toId) });
        }
        if (toRef) {
            await updateDoc(toRef, { friends: arrayUnion(fromId) });
        }

        await deleteDoc(doc(db, 'friendRequests', requestId));

        // ✨ إذا كان الطرفان قد أرسل كل منهما طلب صداقة للآخر (طلبان متبادلان)،
        // بمجرد ما يقبل أحدهما، يجب حذف الطلب المعاكس أيضًا لأنهما أصبحا
        // صديقين بالفعل — وإلا يبقى الطلب الآخر معلّقًا وكأن شيئًا لم يحدث.
        const reverseQuery = query(
            collection(db, 'friendRequests'),
            where('fromId', '==', toId),
            where('toId', '==', fromId)
        );
        const reverseSnap = await getDocs(reverseQuery);
        if (!reverseSnap.empty) {
            await Promise.all(reverseSnap.docs.map(d => deleteDoc(doc(db, 'friendRequests', d.id))));
        }

        return true;
    } catch (error) {
        console.error('Error accepting friend request:', error);
        return false;
    }
}

/**
 * رفض طلب صداقة: يحذف الطلب فقط دون أي أثر آخر (لا يصير الطرفان صديقين).
 * @param {string} requestId معرف مستند الطلب في friendRequests
 * @returns {Promise<boolean>}
 */
export async function rejectFriendRequest(requestId) {
    try {
        await deleteDoc(doc(db, 'friendRequests', requestId));
        return true;
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        return false;
    }
}

/**
 * إلغاء الصداقة بين مستخدمين: يزيل كل واحد من قائمة أصدقاء الآخر.
 * @param {string} userId1 معرف المستخدم الحالي
 * @param {string} userId2 معرف الصديق المُراد إلغاء صداقته
 * @returns {Promise<boolean>}
 */
export async function removeFriend(userId1, userId2) {
    try {
        const ref1 = await getUserOrVisitorRef(userId1);
        const ref2 = await getUserOrVisitorRef(userId2);

        if (ref1) {
            await updateDoc(ref1, { friends: arrayRemove(userId2) });
        }
        if (ref2) {
            await updateDoc(ref2, { friends: arrayRemove(userId1) });
        }

        return true;
    } catch (error) {
        console.error('Error removing friend:', error);
        return false;
    }
}

/**
 * تحقق سريع هل مستخدمان صديقان بالفعل، عبر فحص حقل friends على مستند أحدهما.
 * @param {string} userId معرف المستخدم الحالي
 * @param {string} otherUserId معرف المستخدم الآخر
 * @returns {Promise<boolean>}
 */
export async function checkIsFriend(userId, otherUserId) {
    try {
        const ref = await getUserOrVisitorRef(userId);
        if (!ref) return false;
        const snap = await getDoc(ref);
        const friends = (snap.exists() && snap.data().friends) || [];
        return friends.includes(otherUserId);
    } catch (error) {
        console.error('Error checking friendship status:', error);
        return false;
    }
}

// ✨ نقطة الحقيقة الوحيدة الحيّة لقائمة أصدقاء المستخدم الحالي: تفتح مستمعًا
// واحدًا فقط على مستند المستخدم الحالي (users أو visitors)، وكل مرة يتغيّر
// فيها حقل friends (صداقة جديدة تُقبل، أو إلغاء صداقة) تُحدَّث القيمة فورًا
// في localStorage عبر storeUserFriends. أي زر أو نافذة تحتاج تعرف هل مستخدم
// معيّن صديق تقرأ القيمة الجاهزة مباشرة (isStoredFriend) بدل ما تسوي فحص
// Firestore منفصل وغير متزامن في كل مرة — هذا يمنع وميض الأزرار مثل زر
// "إضافة صديق" في نافذة الأوامر.
export async function listenForCurrentUserFriends() {
    const currentUserId = localStorage.getItem('chatUserId');
    if (!currentUserId) return;
    const ref = await getUserOrVisitorRef(currentUserId);
    if (!ref) return;
    onSnapshot(ref, (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : null;
        storeUserFriends((data && data.friends) || []);
    });
}