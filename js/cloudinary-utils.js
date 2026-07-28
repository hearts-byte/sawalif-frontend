const CLOUDINARY_CLOUD_NAME = 'dim8zh0fh';
// قم بتعيين preset مختلف لكل نوع ملف إن لزم الأمر
const CLOUDINARY_IMAGE_UPLOAD_PRESET = 'chat_app_profile_pics'; 
const CLOUDINARY_VIDEO_UPLOAD_PRESET = 'video_uploads'; // يمكنك تغيير هذا إلى preset خاص بالفيديو

/**
 * دالة لرفع ملف (صورة أو فيديو) إلى Cloudinary.
 * @param {File} file الملف المراد رفعه.
 * @param {function(number)=} onProgress دالة لمعالجة تحديثات التقدم (اختيارية).
 * @returns {Promise<string>} رابط الملف بعد الرفع.
 */
//js/cloudinary-utils.js

export function uploadFileToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
        if (!file) {
            console.error("لم يتم تحديد ملف لرفعه.");
            return reject("لم يتم تحديد ملف.");
        }

        const formData = new FormData();
        formData.append('file', file);
        
        let resourceType;
        let uploadPreset;

        // ✨ التعديل: إضافة شرط للتعامل مع ملفات الصوت
        if (file.type.startsWith('image/')) {
            resourceType = 'image';
            uploadPreset = CLOUDINARY_IMAGE_UPLOAD_PRESET;
        } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) { // ✨ التعديل هنا
            resourceType = 'video';
            uploadPreset = CLOUDINARY_VIDEO_UPLOAD_PRESET;
        } else {
            // ✨ التعديل: تغيير رسالة الخطأ لتكون أكثر دقة
            return reject('نوع الملف غير مدعوم. يدعم فقط الصور، الفيديوهات، والأغاني.');
        }

        formData.append('upload_preset', uploadPreset);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);

        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                console.log("تم رفع الملف بنجاح:", data);
                resolve(data.secure_url);
            } else {
                const errorData = JSON.parse(xhr.responseText);
                console.error("فشل رفع الملف إلى Cloudinary:", errorData);
                reject(errorData.error ? errorData.error.message : 'فشل الرفع');
            }
        };

        xhr.onerror = () => {
            console.error("حدث خطأ أثناء الاتصال بـ Cloudinary.");
            reject("حدث خطأ في الشبكة.");
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                if (typeof onProgress === 'function') {
                    onProgress(percentComplete);
                }
            }
        };

        xhr.send(formData);
    });
}
