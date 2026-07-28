import { db, serverTimestamp } from './firebase-config.js';
import { collection, getDocs, query, orderBy, addDoc, doc, getDoc } from "./firestore-shim.js";
import { uploadFileToCloudinary } from './cloudinary-utils.js';
// ✨ لا نفحص الرتبة هنا؛ الفحص صار مرة واحدة فقط في script.js عند الدخول.
// هذه الصفحة فقط تقرأ الصلاحيات الجاهزة المخزّنة.
import { getStoredUserPermissions } from './constants.js';
import { checkKickStatusAndUpdateUI, watchKickStatusLive } from './kick-guard.js';
import { checkBanStatusAndUpdateUI, watchBanStatusLive } from './ban-guard.js';

document.addEventListener('DOMContentLoaded', async () => {
    // ✨ التحقق من حالة الحظر ثم الطرد فور دخول صفحة الغرف.
    checkBanStatusAndUpdateUI();
    checkKickStatusAndUpdateUI();
    // ✨ مستمع حي: يعيد تحميل الصفحة فورًا لحظة الطرد أو الحظر (يعمل
    // للمسجّلين والزوّار معًا)، بدل انتظار استطلاع دوري كل 15 ثانية.
    watchKickStatusLive();
    watchBanStatusLive();

    // ----------------------------------------------------
    // الكود المحدث لجلب وعرض صورة البروفايل
    // ----------------------------------------------------
    const userProfilePicElement = document.getElementById('userProfilePic');
    const modalProfilePic = document.getElementById('modalProfilePic');
    const modalUserName = document.getElementById('modalUserName');
    const modalUserRank = document.getElementById('modalUserRank');

    const userProfilePicUrl = localStorage.getItem('chatUserAvatar');
    const userName = localStorage.getItem('chatUserName');
    const userRank = localStorage.getItem('chatUserRank');
    const defaultAvatar = 'https://via.placeholder.com/100x100.png?text=User';

    if (userProfilePicElement) {
        userProfilePicElement.src = userProfilePicUrl || defaultAvatar;
    }
    if (modalProfilePic) {
        modalProfilePic.src = userProfilePicUrl || defaultAvatar;
        modalUserName.textContent = userName || "زائر";
        modalUserRank.textContent = userRank || "عضو";
    }

    // ----------------------------------------------------
    // وظيفة إظهار/إخفاء مودال المستخدم
    // ----------------------------------------------------
    const profileIcon = document.querySelector('.profile-icon');
    const userModal = document.getElementById('userModal');
    const logoutBtn = document.getElementById('logoutBtn');

    profileIcon.addEventListener('click', (e) => {
        e.stopPropagation(); // منع إغلاق المودال مباشرة بعد فتحه
        userModal.classList.toggle('show');
    });

    // إغلاق المودال عند النقر في أي مكان آخر
    document.addEventListener('click', (e) => {
        if (!userModal.contains(e.target) && !profileIcon.contains(e.target)) {
            userModal.classList.remove('show');
        }
    });

    // وظيفة تسجيل الخروج
    logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
    // ----------------------------------------------------

    const roomListContainer = document.getElementById('room-list');
    const searchInput = document.getElementById('roomSearch');
    let roomsData = [];

    const addRoomBtn = document.getElementById('addRoomBtn');
    const addRoomModal = document.getElementById('addRoomModal');
    const closeAddRoom = document.getElementById('closeAddRoom');
    const addRoomForm = document.getElementById('addRoomForm');
    const addRoomMsg = document.getElementById('addRoomMsg');
    const roomImageFileInput = document.getElementById('roomImageFile');
    const roomImagePreview = document.getElementById('roomImagePreview');
    const imageUploadProgress = document.getElementById('imageUploadProgress');
    const roomLockedCheckbox = document.getElementById('roomLocked');
    const roomPasswordGroup = document.getElementById('roomPasswordGroup');
    const roomPasswordInput = document.getElementById('roomPassword');

    const passwordModal = document.getElementById('passwordModal');
    const closePasswordModal = document.getElementById('closePasswordModal');
    const roomPasswordForm = document.getElementById('roomPasswordForm');
    const enterRoomPasswordInput = document.getElementById('enterRoomPassword');
    const passwordModalMsg = document.getElementById('passwordModalMsg');

    let uploadedImageUrl = "";

    const userPermissions = getStoredUserPermissions();
    if (addRoomBtn) {
        addRoomBtn.style.display = userPermissions.canAddRoom ? 'inline-block' : 'none';
    }

    addRoomBtn.addEventListener('click', () => {
        addRoomModal.classList.add('show');
        addRoomForm.reset();
        addRoomMsg.textContent = '';
        roomImagePreview.innerHTML = "";
        imageUploadProgress.innerHTML = "";
        uploadedImageUrl = "";
        roomPasswordGroup.style.display = "none";
        roomPasswordInput.value = "";
    });
    closeAddRoom.addEventListener('click', () => {
        addRoomModal.classList.remove('show');
    });
    addRoomModal.addEventListener('click', (e) => {
        if (e.target === addRoomModal) addRoomModal.classList.remove('show');
    });

    roomLockedCheckbox.addEventListener('change', () => {
        if (roomLockedCheckbox.checked) {
            roomPasswordGroup.style.display = "block";
        } else {
            roomPasswordGroup.style.display = "none";
            roomPasswordInput.value = "";
        }
    });

    roomImageFileInput.addEventListener('change', async (e) => {
        roomImagePreview.innerHTML = "";
        imageUploadProgress.innerHTML = "";
        uploadedImageUrl = "";
        const file = e.target.files[0];
        if (!file) return;
        imageUploadProgress.textContent = "جاري رفع الصورة...";
        try {
            const url = await uploadFileToCloudinary(file, percent => {
                imageUploadProgress.textContent = `جاري رفع الصورة... ${percent.toFixed(0)}%`;
            });
            uploadedImageUrl = url;
            roomImagePreview.innerHTML = `<img src="${url}" alt="صورة الغرفة"/>`;
            imageUploadProgress.textContent = "تم رفع الصورة بنجاح ✔";
        } catch (err) {
            imageUploadProgress.textContent = "تعذر رفع الصورة، حاول مرة أخرى.";
        }
    });

    addRoomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        addRoomMsg.textContent = '';

        const name = addRoomForm.roomName.value.trim();
        const description = addRoomForm.roomDesc.value.trim();
        const imageUrl = uploadedImageUrl || "";
        const locked = addRoomForm.roomLocked.checked;
        const adminOnly = addRoomForm.roomAdminOnly.checked;
        const password = roomPasswordInput.value.trim();

        if (!name) {
            addRoomMsg.textContent = 'يرجى إدخال اسم الغرفة.';
            return;
        }
        if (locked && !password) {
            addRoomMsg.textContent = 'يرجى إدخال كلمة مرور للغرفة المغلقة.';
            return;
        }

        try {
            await addDoc(collection(db, "rooms"), {
                name,
                description,
                imageUrl,
                locked,
                adminOnly,
                password: locked ? password : "",
                userCount: 1,
                timestamp: serverTimestamp()
            });
            addRoomMsg.style.color = "#388e3c";
            addRoomMsg.textContent = "تمت إضافة الغرفة بنجاح!";
            setTimeout(() => {
                addRoomModal.classList.remove('show');
                fetchRooms();
            }, 800);
        } catch (err) {
            addRoomMsg.style.color = "#d32f2f";
            addRoomMsg.textContent = "حدث خطأ أثناء إضافة الغرفة!";
        }
    });

    async function openPasswordModal(roomId) {
        passwordModal.classList.add('show');
        passwordModalMsg.textContent = '';
        enterRoomPasswordInput.value = '';
        passwordModal.dataset.roomId = roomId;
    }

    closePasswordModal.addEventListener('click', () => {
        passwordModal.classList.remove('show');
    });
    passwordModal.addEventListener('click', (e) => {
        if (e.target === passwordModal) passwordModal.classList.remove('show');
    });

    roomPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        passwordModalMsg.textContent = '';
        const roomId = passwordModal.dataset.roomId;
        const enteredPassword = enterRoomPasswordInput.value.trim();
        if (!enteredPassword) {
            passwordModalMsg.textContent = 'يرجى إدخال كلمة المرور.';
            return;
        }
        try {
            const roomDoc = await getDoc(doc(db, "rooms", roomId));
            if (!roomDoc.exists()) {
                passwordModalMsg.textContent = 'الغرفة غير موجودة.';
                return;
            }
            const roomData = roomDoc.data();
            if (roomData.password === enteredPassword) {
                passwordModal.classList.remove('show');
                localStorage.setItem('lastVisitedRoomId', roomId);
                window.location.href = `chat.html?roomId=${roomId}`;
            } else {
                passwordModalMsg.textContent = 'كلمة المرور غير صحيحة!';
            }
        } catch (error) {
            passwordModalMsg.textContent = 'حدث خطأ أثناء التحقق!';
        }
    });

    function renderRoomCard(room) {
        return `
            <div class="room-card" data-room-id="${room.id}" data-locked="${room.locked}" data-admin-only="${room.adminOnly}" data-password="${room.locked ? '1' : '0'}">
                <div class="room-avatar">
                    <img src="${room.imageUrl || 'https://via.placeholder.com/60x60.png?text=Room'}" alt="صورة الغرفة">
                </div>
                <div class="room-details">
                    <div class="room-title">${room.name}</div>
                    <div class="room-desc">${room.description || ''}</div>
                    <div class="room-icons">
                        <span class="room-icon-group">
                            <i class="fas fa-user"></i>${room.userCount || 1}
                        </span>
                        ${room.locked ? `<span class="room-icon-group room-lock"><i class="fas fa-lock"></i></span>` : ''}
                        ${room.adminOnly ? `<span class="room-icon-group room-admin"><i class="fas fa-crown"></i></span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function renderRooms(rooms) {
        if (rooms.length === 0) {
            roomListContainer.innerHTML = `<div style="text-align:center;color:#888;font-size:1.1em;padding:20px;">لا توجد غرف متاحة حالياً.</div>`;
            return;
        }
        roomListContainer.innerHTML = rooms.map(renderRoomCard).join('');
        Array.from(document.querySelectorAll('.room-card')).forEach(card => {
            card.onclick = async function () {
                const roomId = card.getAttribute('data-room-id');
                const isLocked = card.getAttribute('data-locked') === "true";
                const hasPassword = card.getAttribute('data-password') === "1";
                if (isLocked && hasPassword) {
                    openPasswordModal(roomId);
                } else {
                    localStorage.setItem('lastVisitedRoomId', roomId);
                    window.location.href = `chat.html?roomId=${roomId}`;
                }
            };
        });
    }

    async function fetchRooms() {
        try {
            const q = query(collection(db, "rooms"), orderBy("timestamp", "asc"));
            const snapshot = await getDocs(q);

            roomsData = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    description: data.description,
                    imageUrl: data.imageUrl,
                    userCount: data.userCount || 1,
                    locked: !!data.locked,
                    adminOnly: !!data.adminOnly
                    // ✨ لا نحتفظ بحقل password هنا. كلمة المرور تُجلب فقط لحظة
                    // التحقق منها (انظر roomPasswordForm 'submit' أعلاه، getDoc مباشر
                    // على الغرفة المطلوبة) بدل الاحتفاظ بها بذاكرة كل من يفتح صفحة الغرف.
                    // هذا لا يمنع كون الحقل يصل شبكياً مع باقي مستند الغرفة عند القراءة —
                    // الحل الكامل لهذا يحتاج Firestore Security Rules أو نقل كلمة المرور
                    // لمستند فرعي محمي + التحقق عبر Cloud Function بدل المقارنة بالمتصفح.
                };
            });
            renderRooms(roomsData);
        } catch (error) {
            roomListContainer.innerHTML = `<div style="text-align:center;color:red;font-size:1.1em;padding:20px;">حدث خطأ أثناء تحميل الغرف.</div>`;
        }
    }

    // ✨ ننتظر جلب الغرف ورسمها فعليًا قبل ما نظهر الصفحة، حتى تظهر
    // كاملة دفعة وحدة (بدون أي شاشة/مؤشر تحميل) بدل ما تظهر فاضية
    // وبعدين "تقفز" الغرف فوقها.
    await fetchRooms();
    document.body.classList.add('page-ready');

    searchInput.addEventListener('input', e => {
        const q = e.target.value.trim();
        if (!q) {
            renderRooms(roomsData);
            return;
        }
        const filtered = roomsData.filter(room =>
            room.name.includes(q) || (room.description && room.description.includes(q))
        );
        renderRooms(filtered);
    });
});
