// js/image-viewer-modal.js
// نافذة تكبير الصور عند الضغط على أي صورة داخل الرسائل.
// تم فصل هذا الكود من main.js لأنه مستقل تماماً ولا يعتمد على أي متغيرات مشتركة.

export function createAndAppendImageModal() {
    if (document.getElementById('image-modal')) return;
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'image-modal';
    modalOverlay.className = 'image-modal-overlay';
    const modalContent = document.createElement('div');
    modalContent.className = 'image-modal-content';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'close-image-modal';
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '&times;';
    const downloadBtn = document.createElement('a');
    downloadBtn.id = 'download-image-btn';
    downloadBtn.className = 'download-btn';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    const imageElement = document.createElement('img');
    imageElement.id = 'modal-image';
    imageElement.src = '';
    imageElement.alt = 'صورة مكبرة';
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(downloadBtn);
    modalContent.appendChild(imageElement);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    closeBtn.addEventListener('click', closeImageModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeImageModal();
    });
}

export function openImageModal(imageSrc) {
    const modalOverlay = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const downloadBtn = document.getElementById('download-image-btn');
    if (modalOverlay && modalImage && downloadBtn) {
        modalImage.src = imageSrc;
        downloadBtn.href = imageSrc;
        downloadBtn.download = imageSrc.split('/').pop();
        modalOverlay.style.display = 'flex';
    }
}

export function closeImageModal() {
    const modalOverlay = document.getElementById('image-modal');
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
        document.getElementById('modal-image').src = '';
    }
}

// تسجيل الأحداث تلقائياً عند استيراد الملف (نفس السلوك الأصلي بالضبط)
document.addEventListener('DOMContentLoaded', createAndAppendImageModal);
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
        const messageItem = e.target.closest('.message-item');
        if (messageItem) {
            const imageSrc = e.target.src;
            if (imageSrc) openImageModal(imageSrc);
        }
    }
});
