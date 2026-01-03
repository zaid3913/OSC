// قسم المصاريف مع نظام تتبع المصاريف للمخولين من قسم السلف

let expenses = [];
let currentExpenseId = null;
let recipientsList = [];
let currentImageFile = null;
let currentImageUrl = null;
let currentRecipientExpenses = []; // لتخزين مصاريف المخول الحالية للتصدير

// =========== خدمة ImgBB المدمجة ===========
const IMGBB_API_KEY = '1018dd77ec0d31c2ac9727113a9724f1';

class ImgBBService {
    constructor() {
        this.apiKey = IMGBB_API_KEY;
        this.baseUrl = 'https://api.imgbb.com/1/upload';
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    }

    async uploadImage(imageFile, fileName = null) {
        if (!imageFile || !(imageFile instanceof File)) {
            throw new Error('الرجاء تحديد ملف صورة صالح');
        }

        if (imageFile.size > this.maxFileSize) {
            throw new Error(`حجم الملف كبير جداً. الحد الأقصى هو ${this.formatFileSize(this.maxFileSize)}`);
        }

        if (!this.allowedTypes.includes(imageFile.type)) {
            throw new Error('صيغة الملف غير مدعومة. استخدم JPG, PNG, GIF, أو WebP');
        }

        const formData = new FormData();
        formData.append('image', imageFile);
        
        if (fileName) {
            formData.append('name', fileName);
        }

        try {
            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error?.message || 'فشل رفع الصورة');
            }

            return {
                success: true,
                data: {
                    id: result.data.id,
                    url: result.data.url,
                    displayUrl: result.data.display_url,
                    thumbUrl: result.data.thumb.url,
                    mediumUrl: result.data.medium?.url || result.data.thumb.url,
                    deleteUrl: result.data.delete_url,
                    size: result.data.size,
                    width: result.data.width,
                    height: result.data.height,
                    time: result.data.time,
                    expiration: result.data.expiration,
                    fileName: imageFile.name,
                    fileType: imageFile.type,
                    fileSize: imageFile.size,
                    uploadedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('ImgBB Upload Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async deleteImage(deleteUrl) {
        if (!deleteUrl || !deleteUrl.includes('imgbb.com')) {
            console.warn('رابط حذف غير صالح:', deleteUrl);
            return true;
        }

        try {
            const response = await fetch(deleteUrl, {
                method: 'DELETE'
            });
            
            return response.ok || response.status === 200;
        } catch (error) {
            console.error('ImgBB Delete Error:', error);
            return false;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    generateFileName(originalName, expenseId = null) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        const extension = originalName.split('.').pop() || 'jpg';
        const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
        const safeName = nameWithoutExt.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const prefix = expenseId ? `expense_${expenseId}_` : 'receipt_';
        return `${prefix}${safeName}_${timestamp}_${random}.${extension}`.toLowerCase();
    }

    createFirestoreImageData(imageData) {
        if (!imageData) return null;
        return {
            url: imageData.url,
            thumbUrl: imageData.thumbUrl,
            deleteUrl: imageData.deleteUrl,
            fileName: imageData.fileName,
            fileSize: imageData.fileSize,
            fileType: imageData.fileType,
            uploadedAt: imageData.uploadedAt
        };
    }
}

const imgbbService = new ImgBBService();
// =========== نهاية خدمة ImgBB ===========

// =========== دوال إدارة التوثيق ===========

// الانتظار حتى يتم تحميل Firebase Config
function waitForFirebaseConfig(maxAttempts = 30, interval = 200) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        function check() {
            attempts++;

            if (window.firebaseConfig && window.firebaseConfig.db) {
                console.log('✅ Firebase Config جاهز');
                resolve(window.firebaseConfig);
            } else if (attempts >= maxAttempts) {
                reject(new Error('❌ Firebase Config لم يتم تحميله بعد ' + maxAttempts + ' محاولة'));
            } else {
                setTimeout(check, interval);
            }
        }

        check();
    });
}

// التحقق من التوثيق
async function initializeAuth() {
    try {
        if (!window.firebaseConfig) {
            console.error('firebaseConfig غير موجود');
            window.location.href = '../login.html';
            return false;
        }
        
        // التحقق من التوثيق
        const permissions = await window.firebaseConfig.protectPage();
        
        if (!permissions) {
            return false;
        }
        
        // حفظ بيانات المستخدم
        window.currentUser = permissions;
        console.log('✅ تم التوثيق بنجاح للمستخدم:', permissions.email);
        return true;
        
    } catch (error) {
        console.error('خطأ في التوثيق:', error);
        window.location.href = '../login.html';
        return false;
    }
}

// إعداد زر تسجيل الخروج
function setupLogoutButton() {
    // إنشاء زر تسجيل الخروج إذا لم يكن موجوداً
    if (!document.getElementById('logoutBtn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> تسجيل الخروج';
        logoutBtn.className = 'btn btn-logout';
        logoutBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(to right, #e74c3c, #c0392b);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            z-index: 9998;
            font-family: 'Tajawal', sans-serif;
            box-shadow: 0 2px 10px rgba(231, 76, 60, 0.3);
            transition: all 0.3s;
        `;
        
        logoutBtn.addEventListener('mouseenter', () => {
            logoutBtn.style.transform = 'translateY(-2px)';
            logoutBtn.style.boxShadow = '0 5px 15px rgba(231, 76, 60, 0.4)';
        });
        
        logoutBtn.addEventListener('mouseleave', () => {
            logoutBtn.style.transform = 'translateY(0)';
            logoutBtn.style.boxShadow = '0 2px 10px rgba(231, 76, 60, 0.3)';
        });
        
        logoutBtn.addEventListener('click', async () => {
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                try {
                    await window.firebaseConfig.logout();
                } catch (error) {
                    console.error('خطأ في تسجيل الخروج:', error);
                }
            }
        });
        
        document.body.appendChild(logoutBtn);
    }
}

// إعداد معلومات المستخدم
function setupUserInfo() {
    // إنشاء بطاقة معلومات المستخدم إذا لم تكن موجودة
    if (!document.getElementById('userInfoCard') && window.currentUser) {
        const userInfoCard = document.createElement('div');
        userInfoCard.id = 'userInfoCard';
        userInfoCard.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: linear-gradient(to right, #3498db, #2980b9);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            z-index: 9997;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 2px 10px rgba(52, 152, 219, 0.3);
            font-family: 'Tajawal', sans-serif;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
        
        userInfoCard.innerHTML = `
            <i class="fas fa-user-circle" style="font-size: 32px;"></i>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: bold; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${window.currentUser.name}
                </div>
                <div style="font-size: 12px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${window.currentUser.email}
                </div>
                <div style="font-size: 11px; margin-top: 3px;">
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 3px;">
                        ${window.currentUser.role === 'admin' ? 'مدير' : 'مستخدم'}
                    </span>
                </div>
            </div>
        `;
        
        // إضافة animation CSS
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(userInfoCard);
    }
}

// =========== دوال إدارة الصور ===========

// تهيئة رفع الصورة
function initImageUpload() {
    const fileInput = document.getElementById('expenseImage');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const imagePreview = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const browseLink = fileUploadArea.querySelector('.browse-link');

    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    browseLink.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });

    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.style.backgroundColor = '#e3f2fd';
    });

    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.style.backgroundColor = '';
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.style.backgroundColor = '';
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        } else {
            if (window.firebaseConfig && window.firebaseConfig.showMessage) {
                window.firebaseConfig.showMessage('error', 'الرجاء اختيار ملف صورة فقط');
            }
        }
    });

    removeImageBtn.addEventListener('click', () => {
        resetImageUpload();
    });
}

// معالجة ملف الصورة
function handleImageFile(file) {
    if (file.size > 5 * 1024 * 1024) {
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'حجم الملف كبير جداً. الحد الأقصى هو 5MB');
        }
        return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'صيغة الملف غير مدعومة. استخدم JPG, PNG, GIF, أو WebP');
        }
        return;
    }

    currentImageFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const imagePreview = document.getElementById('imagePreview');
        const previewImage = document.getElementById('previewImage');
        const fileUploadArea = document.getElementById('fileUploadArea');
        
        previewImage.src = e.target.result;
        imagePreview.style.display = 'block';
        fileUploadArea.style.display = 'none';
        currentImageUrl = e.target.result;
    };
    reader.readAsDataURL(file);
}

// إعادة تعيين رفع الصورة
function resetImageUpload() {
    const fileInput = document.getElementById('expenseImage');
    const imagePreview = document.getElementById('imagePreview');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const previewImage = document.getElementById('previewImage');
    
    fileInput.value = '';
    previewImage.src = '';
    imagePreview.style.display = 'none';
    fileUploadArea.style.display = 'block';
    
    currentImageFile = null;
    currentImageUrl = null;
}

// رفع الصورة إلى ImgBB
async function uploadExpenseImage(expenseId = null) {
    if (!currentImageFile) {
        return null;
    }

    try {
        showLoading('جاري رفع الصورة إلى السحابة...');
        
        const fileName = imgbbService.generateFileName(currentImageFile.name, expenseId);
        const result = await imgbbService.uploadImage(currentImageFile, fileName);
        
        if (!result.success) {
            throw new Error(result.error || 'فشل رفع الصورة');
        }
        
        return {
            success: true,
            imageData: imgbbService.createFirestoreImageData(result.data)
        };
        
    } catch (error) {
        console.error('خطأ في رفع الصورة:', error);
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', `تعذر رفع الصورة: ${error.message}`);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

// حذف الصورة من ImgBB
async function deleteExpenseImage(imageData) {
    if (!imageData || !imageData.deleteUrl) {
        return true;
    }
    
    try {
        showLoading('جاري حذف الصورة...');
        const success = await imgbbService.deleteImage(imageData.deleteUrl);
        
        if (success) {
            console.log('تم حذف الصورة بنجاح');
            return true;
        } else {
            console.warn('تعذر حذف الصورة من السحابة');
            return false;
        }
        
    } catch (error) {
        console.error('خطأ في حذف الصورة:', error);
        return false;
    }
}

// =========== دوال فتح وإغلاق النماذج ===========

// فتح نموذج إضافة مصروف
function openAddExpenseModal() {
    const today = new Date().toISOString().split('T')[0];
    
    const invoiceNumber = generateInvoiceNumber();
    
    document.getElementById('expenseNumber').value = invoiceNumber;
    document.getElementById('expenseDate').value = today;
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseType').value = '';
    document.getElementById('paymentMethod').value = '';
    document.getElementById('recipient').value = '';
    document.getElementById('employeeName').value = '';
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expenseNotes').value = '';
    
    resetImageUpload();
    
    document.getElementById('modalTitle').textContent = 'تسجيل مصروف جديد';
    document.getElementById('expenseModal').style.display = 'flex';
}

// فتح نموذج تعديل مصروف
function openEditExpenseModal(expenseId) {
    currentExpenseId = expenseId;
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    document.getElementById('modalTitle').textContent = 'تعديل المصروف';
    document.getElementById('expenseNumber').value = expense.expenseNumber || '';
    document.getElementById('expenseDate').value = expense.date ? new Date(expense.date.seconds * 1000).toISOString().split('T')[0] : '';
    document.getElementById('expenseAmount').value = expense.amount || 0;
    document.getElementById('expenseType').value = expense.type || '';
    document.getElementById('paymentMethod').value = expense.paymentMethod || '';
    document.getElementById('recipient').value = expense.recipient || '';
    document.getElementById('employeeName').value = expense.employeeName || '';
    document.getElementById('expenseDescription').value = expense.description || '';
    document.getElementById('expenseNotes').value = expense.notes || '';
    
    if (expense.receiptImage?.thumbUrl) {
        currentImageUrl = expense.receiptImage.thumbUrl;
        
        const imagePreview = document.getElementById('imagePreview');
        const previewImage = document.getElementById('previewImage');
        const fileUploadArea = document.getElementById('fileUploadArea');
        
        previewImage.src = expense.receiptImage.thumbUrl;
        imagePreview.style.display = 'block';
        fileUploadArea.style.display = 'none';
        currentImageFile = null;
    } else {
        resetImageUpload();
    }
    
    document.getElementById('expenseModal').style.display = 'flex';
}

// إغلاق نموذج المصروف
function closeExpenseModal() {
    currentExpenseId = null;
    currentImageFile = null;
    currentImageUrl = null;
    document.getElementById('expenseModal').style.display = 'none';
}

// فتح نموذج تقرير المخولين
async function openRecipientReportModal() {
    await loadRecipientsList();
    updateRecipientFilterOptions();
    
    document.getElementById('employeeReportModal').style.display = 'flex';
}

// إغلاق نموذج التقرير
function closeRecipientReportModal() {
    document.getElementById('employeeReportModal').style.display = 'none';
}

// عرض الصورة كاملة
function showFullImage(imageUrl, imageData = null) {
    // إزالة أي نافذة سابقة
    const oldModal = document.getElementById('expenseImageFullModal');
    if (oldModal) oldModal.remove();
    
    // إنشاء نافذة جديدة
    const modal = document.createElement('div');
    modal.id = 'expenseImageFullModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.95);
        z-index: 99999;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    // معلومات الصورة إذا كانت متوفرة
    let imageInfo = '';
    if (imageData) {
        imageInfo = `
            <div style="
                background: white;
                padding: 15px;
                border-radius: 8px;
                margin-top: 15px;
                text-align: right;
                max-width: 600px;
            ">
                <p style="margin: 5px 0;"><strong>اسم الملف:</strong> ${imageData.fileName || 'غير معروف'}</p>
                <p style="margin: 5px 0;"><strong>الحجم:</strong> ${imgbbService.formatFileSize(imageData.fileSize || 0)}</p>
                <p style="margin: 5px 0;"><strong>النوع:</strong> ${imageData.fileType || 'غير معروف'}</p>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div style="position: relative; max-width: 90%; max-height: 90vh; text-align: center;">
            <button onclick="closeFullImageModal()" 
                    style="
                        position: absolute;
                        top: -50px;
                        right: 0;
                        background: #e74c3c;
                        color: white;
                        border: none;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        cursor: pointer;
                        font-size: 20px;
                        z-index: 100000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                ✕
            </button>
            
            <div style="
                background: white;
                padding: 20px;
                border-radius: 10px;
                max-width: 100%;
                max-height: 80vh;
                overflow: auto;
            ">
                <img src="${imageUrl}" 
                     alt="صورة الوصل الكاملة"
                     style="
                        max-width: 100%;
                        max-height: 60vh;
                        display: block;
                        margin: 0 auto;
                        border-radius: 5px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                     "
                     onload="this.style.opacity='1'"
                     style="opacity: 0; transition: opacity 0.3s;">
                
                ${imageInfo}
                
                <div style="
                    text-align: center;
                    margin-top: 20px;
                    padding: 10px;
                ">
                    <button onclick="window.open('${imageUrl}', '_blank')"
                            style="
                                background: #3498db;
                                color: white;
                                border: none;
                                padding: 10px 20px;
                                border-radius: 5px;
                                cursor: pointer;
                                margin: 5px;
                                font-size: 14px;
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                            ">
                        <i class="fas fa-external-link-alt"></i> فتح في نافذة جديدة
                    </button>
                    
                    <button onclick="downloadImageNow('${imageUrl}')"
                            style="
                                background: #2ecc71;
                                color: white;
                                border: none;
                                padding: 10px 20px;
                                border-radius: 5px;
                                cursor: pointer;
                                margin: 5px;
                                font-size: 14px;
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                            ">
                        <i class="fas fa-download"></i> تحميل الصورة
                    </button>
                    
                    <button onclick="closeFullImageModal()"
                            style="
                                background: #95a5a6;
                                color: white;
                                border: none;
                                padding: 10px 20px;
                                border-radius: 5px;
                                cursor: pointer;
                                margin: 5px;
                                font-size: 14px;
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                            ">
                        <i class="fas fa-times"></i> إغلاق
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // إغلاق بالضغط على ESC
    const closeOnEsc = (e) => {
        if (e.key === 'Escape') closeFullImageModal();
    };
    document.addEventListener('keydown', closeOnEsc);
    
    // إغلاق بالضغط خارج الصورة
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeFullImageModal();
    });
}

// دالة إغلاق نافذة الصورة
function closeFullImageModal() {
    const modal = document.getElementById('expenseImageFullModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// دالة تحميل الصورة
function downloadImageNow(url) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt_${Date.now()}.${url.split('.').pop() || 'jpg'}`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// توليد رقم فاتورة
function generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `EXP-${year}${month}${day}-${random}`;
}

// =========== دوال إدارة المصاريف والمخولين ===========

// تحميل قائمة المخولين من قسم السلف
async function loadRecipientsList() {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        const snapshot = await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'payment')
            .orderBy('recipientName')
            .get();
        
        const recipientsSet = new Set();
        recipientsList = [];
        
        snapshot.forEach(doc => {
            const advance = doc.data();
            if (advance.recipientName && !recipientsSet.has(advance.recipientName)) {
                recipientsSet.add(advance.recipientName);
                recipientsList.push({
                    id: doc.id,
                    name: advance.recipientName,
                    type: advance.type || 'غير محدد',
                    totalAdvances: parseFloat(advance.amount) || 0,
                    remainingAmount: parseFloat(advance.remainingAmount) || parseFloat(advance.amount) || 0
                });
            }
        });
        
        console.log(`تم تحميل ${recipientsList.length} مخول من قسم السلف`);
        
    } catch (error) {
        console.error("Error loading recipients:", error);
    }
}

// تحديث خيارات التصفية للمخولين
function updateRecipientFilterOptions() {
    const employeeFilter = document.getElementById('employeeFilter');
    const reportRecipientFilter = document.getElementById('reportEmployeeFilter');
    
    if (!employeeFilter || !reportRecipientFilter) return;
    
    const currentValue = employeeFilter.value;
    const reportCurrentValue = reportRecipientFilter.value;
    
    employeeFilter.innerHTML = '<option value="">جميع المخولين</option>';
    reportRecipientFilter.innerHTML = '<option value="">جميع المخولين</option>';
    
    recipientsList.forEach(recipient => {
        const option = document.createElement('option');
        option.value = recipient.name;
        option.textContent = `${recipient.name} - ${recipient.type}`;
        employeeFilter.appendChild(option);
        
        const reportOption = document.createElement('option');
        reportOption.value = recipient.name;
        reportOption.textContent = `${recipient.name} - ${recipient.type}`;
        reportRecipientFilter.appendChild(reportOption);
    });
    
    if (currentValue) {
        employeeFilter.value = currentValue;
    }
    if (reportCurrentValue) {
        reportRecipientFilter.value = reportCurrentValue;
    }
}

// تحميل المصاريف للمشروع الحالي
async function loadExpenses() {
    try {
        if (!window.firebaseConfig) {
            await waitForFirebaseConfig();
        }
        
        if (!window.firebaseConfig.projectManager.hasCurrentProject()) {
            redirectToProjects();
            return;
        }
        
        const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
        showLoading('جاري تحميل بيانات المصاريف...');
        
        await loadRecipientsList();
        updateRecipientFilterOptions();
        
        const snapshot = await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('expenses')
            .orderBy('date', 'desc')
            .get();
        
        expenses = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            expenses.push({
                id: doc.id,
                ...data
            });
        });
        
        displayExpenses(expenses);
        updateExpenseSummary();
        hideLoading();
        
    } catch (error) {
        console.error("Error loading expenses:", error);
        hideLoading();
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر تحميل بيانات المصاريف');
        }
    }
}

// دالة مساعدة لتحديث رصيد المشروع
async function updateProjectBalanceDirectly(amount, operation = 'decrease') {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return null;
    }
    
    try {
        // استخدم الدالة المركزية لإعادة الحساب الكامل
        if (window.firebaseConfig.calculateAccurateBalance) {
            return await window.firebaseConfig.calculateAccurateBalance();
        } else if (window.firebaseConfig.updateTotalBalance) {
            return await window.firebaseConfig.updateTotalBalance();
        }
        
        return null;
        
    } catch (error) {
        console.error('خطأ في تحديث رصيد المشروع من المصاريف:', error);
        return null;
    }
}

// إضافة مصروف
async function addExpense(expenseData) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        redirectToProjects();
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري إضافة المصروف...');
        
        let imageUploadResult = null;
        if (currentImageFile) {
            imageUploadResult = await uploadExpenseImage();
            
            if (imageUploadResult && imageUploadResult.success) {
                expenseData.receiptImage = imageUploadResult.imageData;
                expenseData.hasReceipt = true;
            }
        }
        
        expenseData.createdAt = firebase.firestore.Timestamp.now();
        expenseData.updatedAt = firebase.firestore.Timestamp.now();
        
        if (expenseData.date) {
            expenseData.date = firebase.firestore.Timestamp.fromDate(new Date(expenseData.date));
        }
        
        // 1. تحديث رصيد المشروع أولاً (تنقص من الرصيد)
        if (window.firebaseConfig.updateProjectBalance) {
            await window.firebaseConfig.updateProjectBalance(expenseData.amount, 'decrease');
        } else {
            // إذا لم توجد الدالة، استخدم الطريقة المباشرة
            await updateProjectBalanceDirectly(expenseData.amount, 'decrease');
        }
        
        // 2. إضافة المصروف
        const expenseRef = await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('expenses')
            .add(expenseData);
        
        const expenseId = expenseRef.id;
        
        if (imageUploadResult && imageUploadResult.success) {
            await expenseRef.update({
                'receiptImage.expenseId': expenseId,
                'receiptImage.uploadedAt': firebase.firestore.Timestamp.now()
            });
        }
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('success', 'تم إضافة المصروف بنجاح وتقليل الرصيد');
        }
        closeExpenseModal();
        loadExpenses();
        
    } catch (error) {
        console.error("Error adding expense:", error);
        hideLoading();
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر إضافة المصروف');
        }
    }
}

// تحديث مصروف
async function updateExpense(expenseId, expenseData) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري تحديث المصروف...');
        
        const expenseRef = window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('expenses')
            .doc(expenseId);
        
        const currentExpense = await expenseRef.get();
        const currentData = currentExpense.data();
        
        // حساب الفرق في المبلغ للتحديث
        const oldAmount = parseFloat(currentData.amount) || 0;
        const newAmount = parseFloat(expenseData.amount) || 0;
        const amountDifference = newAmount - oldAmount;
        
        let imageUpdateData = null;
        
        if (currentImageFile) {
            if (currentData?.receiptImage?.deleteUrl) {
                await deleteExpenseImage(currentData.receiptImage);
            }
            
            const uploadResult = await uploadExpenseImage(expenseId);
            
            if (uploadResult && uploadResult.success) {
                imageUpdateData = uploadResult.imageData;
                imageUpdateData.expenseId = expenseId;
            }
        } else if (currentImageFile === null && currentImageUrl === null) {
            if (currentData?.receiptImage?.deleteUrl) {
                await deleteExpenseImage(currentData.receiptImage);
            }
            imageUpdateData = null;
            expenseData.hasReceipt = false;
        } else if (currentData?.receiptImage) {
            imageUpdateData = currentData.receiptImage;
        }
        
        if (imageUpdateData !== undefined) {
            expenseData.receiptImage = imageUpdateData;
            expenseData.hasReceipt = !!imageUpdateData;
        }
        
        expenseData.updatedAt = firebase.firestore.Timestamp.now();
        
        if (expenseData.date) {
            expenseData.date = firebase.firestore.Timestamp.fromDate(new Date(expenseData.date));
        }
        
        // تحديث رصيد المشروع إذا تغير المبلغ
        if (amountDifference !== 0) {
            if (window.firebaseConfig.updateProjectBalance) {
                const operation = amountDifference > 0 ? 'decrease' : 'increase';
                await window.firebaseConfig.updateProjectBalance(Math.abs(amountDifference), operation);
            } else {
                await updateProjectBalanceDirectly(Math.abs(amountDifference), 
                    amountDifference > 0 ? 'decrease' : 'increase');
            }
        }
        
        await expenseRef.update(expenseData);
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('success', 'تم تحديث المصروف بنجاح');
        }
        closeExpenseModal();
        loadExpenses();
        
    } catch (error) {
        console.error("Error updating expense:", error);
        hideLoading();
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر تحديث المصروف');
        }
    }
}

// حذف مصروف
async function deleteExpense(expenseId) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return;
    }
    
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;
    
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) {
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري حذف المصروف...');
        
        // إعادة الرصيد عند الحذف (زيادة الرصيد)
        const amount = parseFloat(expense.amount) || 0;
        if (amount > 0) {
            if (window.firebaseConfig.updateProjectBalance) {
                await window.firebaseConfig.updateProjectBalance(amount, 'increase');
            } else {
                await updateProjectBalanceDirectly(amount, 'increase');
            }
        }
        
        if (expense.receiptImage?.deleteUrl) {
            await deleteExpenseImage(expense.receiptImage);
        }
        
        await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('expenses')
            .doc(expenseId)
            .delete();
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('success', 'تم حذف المصروف وإعادة الرصيد بنجاح');
        }
        loadExpenses();
        
    } catch (error) {
        console.error("Error deleting expense:", error);
        hideLoading();
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر حذف المصروف');
        }
    }
}

// توليد تقرير المخول
async function generateRecipientReport() {
    const recipientName = document.getElementById('reportEmployeeFilter').value;
    const month = document.getElementById('reportMonthFilter').value;
    
    if (!recipientName) {
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'الرجاء اختيار مخول لعرض تقريره');
        }
        return;
    }
    
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري توليد التقرير...');
        
        let recipientInfo = {};
        let totalAdvances = 0;
        let totalRefunded = 0;
        let remainingBalance = 0;
        let periodExpenses = 0;
        let recipientExpenses = [];
        
        // =========== 1. حساب السلف والاستردادات ===========
        const advancesSnapshot = await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('advances')
            .where('recipientName', '==', recipientName)
            .where('transactionType', '==', 'payment')
            .get();
        
        advancesSnapshot.forEach(doc => {
            const advance = doc.data();
            const advanceDate = advance.date.toDate ? advance.date.toDate() : new Date(advance.date);
            const advanceYearMonth = `${advanceDate.getFullYear()}-${String(advanceDate.getMonth() + 1).padStart(2, '0')}`;
            
            // إذا كان هناك شهر محدد، نحسب فقط للشهر المحدد
            if (!month || advanceYearMonth === month) {
                recipientInfo = {
                    id: doc.id,
                    name: advance.recipientName,
                    type: advance.type || 'غير محدد',
                    date: advance.date
                };
                totalAdvances += parseFloat(advance.amount || 0);
                totalRefunded += parseFloat(advance.refundedAmount || 0);
                remainingBalance += parseFloat(advance.remainingAmount || advance.amount || 0);
            }
        });
        
        // =========== 2. حساب المصاريف ===========
        const expensesSnapshot = await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('expenses')
            .where('recipient', '==', recipientName)
            .orderBy('date', 'desc')
            .get();
        
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
            const expenseYearMonth = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
            
            // إذا كان هناك شهر محدد، نحسب فقط للشهر المحدد
            if (!month || expenseYearMonth === month) {
                recipientExpenses.push({
                    id: doc.id,
                    ...expense,
                    yearMonth: expenseYearMonth
                });
                
                periodExpenses += parseFloat(expense.amount || 0);
            }
        });
        
        // =========== 3. حساب الصافي ===========
        const netRemainingBalance = remainingBalance - periodExpenses;
        
        // =========== 4. عرض التقرير ===========
        displayRecipientReport(
            recipientInfo, 
            totalAdvances, 
            totalRefunded, 
            remainingBalance,
            periodExpenses,
            netRemainingBalance,
            month,
            recipientExpenses
        );
        
        hideLoading();
        
    } catch (error) {
        console.error("Error generating recipient report:", error);
        hideLoading();
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر توليد التقرير');
        }
    }
}

// عرض تقرير المخول
function displayRecipientReport(
    recipientInfo, 
    totalAdvances, 
    totalRefunded, 
    remainingBalance,
    periodExpenses,
    netRemainingBalance,
    selectedMonth,
    recipientExpenses
) {
    // =========== تخزين البيانات للتصدير ===========
    currentRecipientExpenses = recipientExpenses; // تخزين البيانات للتصدير
    
    const employeeSummary = document.getElementById('employeeSummary');
    const employeeExpensesBody = document.getElementById('employeeExpensesBody');
    
    if (!employeeSummary || !employeeExpensesBody) return;
    
    let periodTitle = 'جميع الأشهر';
    let periodSubtitle = 'جميع السلف والمصاريف للمخول';
    
    if (selectedMonth) {
        const [year, month] = selectedMonth.split('-');
        const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                          "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
        periodTitle = `${monthNames[parseInt(month) - 1]} ${year}`;
        periodSubtitle = `السلف والمصاريف للشهر ${monthNames[parseInt(month) - 1]} ${year} فقط`;
    }
    
    let summaryHTML = '';
    
    // =========== معلومات المخول ===========
    summaryHTML += `
        <div class="period-header">
            <h3>${periodTitle}</h3>
            <p class="period-subtitle">${periodSubtitle}</p>
            ${recipientInfo && recipientInfo.name ? 
                `<p class="recipient-name"><i class="fas fa-user"></i> ${recipientInfo.name}</p>` : 
                `<p class="no-data-warning"><i class="fas fa-exclamation-circle"></i> لا توجد بيانات للمخول في هذه الفترة</p>`
            }
        </div>
    `;
    
    // =========== البطاقات المالية ===========
    summaryHTML += `
        <div class="financial-summary-cards">
            <!-- السلف المدفوعة للفترة -->
            <div class="financial-card">
                <div class="financial-icon">
                    <i class="fas fa-hand-holding-usd"></i>
                </div>
                <div class="financial-content">
                    <h5>السلف المدفوعة</h5>
                    <p>${window.firebaseConfig.formatCurrency(totalAdvances)}</p>
                    <small style="color: #666;">للفترة المحددة</small>
                </div>
            </div>
            
            <!-- المبلغ المسترد للفترة -->
            <div class="financial-card">
                <div class="financial-icon">
                    <i class="fas fa-undo"></i>
                </div>
                <div class="financial-content">
                    <h5>المبلغ المسترد</h5>
                    <p>${window.firebaseConfig.formatCurrency(totalRefunded)}</p>
                    <small style="color: #666;">للفترة المحددة</small>
                </div>
            </div>
            
            <!-- السلف المتبقية للفترة -->
            <div class="financial-card">
                <div class="financial-icon">
                    <i class="fas fa-scale-balanced"></i>
                </div>
                <div class="financial-content">
                    <h5>السلف المتبقية</h5>
                    <p>${window.firebaseConfig.formatCurrency(remainingBalance)}</p>
                    <small style="color: #666;">للفترة المحددة</small>
                </div>
            </div>
        </div>
        
        <div class="expenses-summary-cards">
            <!-- المصاريف للفترة -->
            <div class="financial-card">
                <div class="financial-icon">
                    <i class="fas fa-money-bill-wave"></i>
                </div>
                <div class="financial-content">
                    <h5>المصاريف</h5>
                    <p>${window.firebaseConfig.formatCurrency(periodExpenses)}</p>
                    <small style="color: #666;">للفترة المحددة</small>
                </div>
            </div>
            
            <!-- الصافي للفترة -->
            <div class="financial-card">
                <div class="financial-icon">
                    <i class="fas fa-calculator"></i>
                </div>
                <div class="financial-content">
                    <h5>الصافي المتبقي</h5>
                    <p style="color: ${netRemainingBalance >= 0 ? '#2ecc71' : '#e74c3c'}; 
                              font-weight: bold;">
                        ${window.firebaseConfig.formatCurrency(netRemainingBalance)}
                    </p>
                    <small style="color: #666;">(السلف المتبقية - المصاريف)</small>
                </div>
            </div>
            
            <!-- عدد المعاملات -->
            <div class="financial-card">
                <div class="financial-icon">
                    <i class="fas fa-list-ol"></i>
                </div>
                <div class="financial-content">
                    <h5>عدد المعاملات</h5>
                    <p>${recipientExpenses.length + (totalAdvances > 0 ? 1 : 0)}</p>
                    <small style="color: #666;">سلف + مصاريف</small>
                </div>
            </div>
        </div>
    `;
    
    employeeSummary.innerHTML = summaryHTML;
    
    // =========== جدول المصاريف ===========
    employeeExpensesBody.innerHTML = '';
    
    if (recipientExpenses.length === 0) {
        employeeExpensesBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 30px;">
                    <i class="fas fa-file-invoice-dollar" style="font-size: 36px; color: #ccc; margin-bottom: 10px; display: block;"></i>
                    <p style="color: #666;">لا توجد مصاريف مسجلة ${selectedMonth ? 'لهذا الشهر' : 'لهذا المخول'}</p>
                </td>
            </tr>
        `;
        return;
    }
    
    recipientExpenses.forEach((expense, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${formatDate(expense.date)}</td>
            <td><span class="expense-type-badge type-${expense.type || 'أخرى'}">${expense.type || ''}</span></td>
            <td>${window.firebaseConfig.formatCurrency(expense.amount || 0)}</td>
            <td>${expense.employeeName || ''}</td>
            <td>${expense.description || ''}</td>
            <td>${expense.paymentMethod || ''}</td>
        `;
        employeeExpensesBody.appendChild(tr);
    });
}

// معالجة نموذج المصروف
async function handleExpenseSubmit(e) {
    e.preventDefault();
    
    const expenseData = {
        expenseNumber: document.getElementById('expenseNumber').value.trim(),
        type: document.getElementById('expenseType').value,
        amount: parseFloat(document.getElementById('expenseAmount').value) || 0,
        date: document.getElementById('expenseDate').value,
        paymentMethod: document.getElementById('paymentMethod').value,
        recipient: document.getElementById('recipient').value.trim(),
        employeeName: document.getElementById('employeeName').value.trim(),
        description: document.getElementById('expenseDescription').value.trim(),
        notes: document.getElementById('expenseNotes').value.trim()
    };
    
    if (currentExpenseId) {
        await updateExpense(currentExpenseId, expenseData);
    } else {
        await addExpense(expenseData);
    }
}

// تحديث ملخص المصاريف
function updateExpenseSummary() {
    if (!window.firebaseConfig) return;
    
    let totalExpenses = 0;
    let totalSalaries = 0;
    let totalOther = 0;
    
    expenses.forEach(expense => {
        const amount = parseFloat(expense.amount) || 0;
        totalExpenses += amount;
        
        if (expense.type === 'راتب') {
            totalSalaries += amount;
        } else {
            totalOther += amount;
        }
    });
    
    const totalExpensesEl = document.getElementById('totalExpensesAmount');
    const salariesEl = document.getElementById('salariesAmount');
    const otherExpensesEl = document.getElementById('otherExpensesAmount');
    
    if (totalExpensesEl) totalExpensesEl.textContent = window.firebaseConfig.formatCurrency(totalExpenses);
    if (salariesEl) salariesEl.textContent = window.firebaseConfig.formatCurrency(totalSalaries);
    if (otherExpensesEl) otherExpensesEl.textContent = window.firebaseConfig.formatCurrency(totalOther);
}

// =========== عرض المصاريف في الجدول ===========
function displayExpenses(list) {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 40px;">
                    <i class="fas fa-file-invoice-dollar" style="font-size: 48px; color: #ccc; margin-bottom: 15px; display: block;"></i>
                    <p style="color: #666;">لا يوجد مصاريف مسجلة بعد</p>
                </td>
            </tr>
        `;
        return;
    }
    
    list.forEach((expense, index) => {
        const isRecipient = recipientsList.some(rec => rec.name === expense.recipient);
        
        // إنشاء خلية الصورة
        let imageCell = '<span class="no-receipt">-</span>';
        if (expense.receiptImage && expense.receiptImage.url) {
            const imageUrl = expense.receiptImage.url;
            const thumbUrl = expense.receiptImage.thumbUrl || imageUrl;
            const safeImageData = JSON.stringify(expense.receiptImage)
                .replace(/"/g, '&quot;')
                .replace(/'/g, "&#39;");
            
            imageCell = `
                <div class="receipt-cell">
                    <img src="${thumbUrl}" 
                         class="receipt-thumbnail"
                         onclick="showFullImage('${imageUrl}', ${safeImageData})"
                         title="انقر لعرض الصورة كاملة"
                         style="cursor: pointer; width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;">
                    <div class="image-info">
                        <small>${imgbbService.formatFileSize(expense.receiptImage.fileSize)}</small>
                        <br>
                        <small style="color: #3498db; cursor: pointer;" 
                               onclick="showFullImage('${imageUrl}', ${safeImageData})">
                            <i class="fas fa-expand"></i> عرض
                        </small>
                    </div>
                </div>
            `;
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${expense.expenseNumber || ''}</td>
            <td><span class="expense-type-badge type-${expense.type || 'أخرى'}">${expense.type || ''}</span></td>
            <td>${window.firebaseConfig.formatCurrency(expense.amount || 0)}</td>
            <td>
                <span class="recipient-name">${expense.recipient || ''}</span>
                ${isRecipient ? '<i class="fas fa-user-check recipient-icon" title="مخول من قسم السلف"></i>' : ''}
            </td>
            <td>${expense.employeeName || ''}</td>
            <td>${formatDate(expense.date)}</td>
            <td>${expense.paymentMethod || ''}</td>
            <td>${expense.description || ''}</td>
            <td>${imageCell}</td>
            <td>${expense.notes || ''}</td>
            <td>
                <button class="btn btn-info btn-sm" onclick="openEditExpenseModal('${expense.id}')">
                    <i class="fas fa-edit"></i> تعديل
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteExpense('${expense.id}')">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =========== دوال التصدير إلى Excel ===========

// دالة تصدير المصاريف المفلترة إلى Excel
function exportFilteredExpensesToExcel() {
    console.log('زر التصدير للمصاريف تم النقر عليه');
    
    try {
        // جمع البيانات المفلترة من الجدول المعروض حالياً
        const tableBody = document.getElementById('expensesTableBody');
        if (!tableBody) {
            throw new Error('الجدول غير موجود');
        }
        
        // التحقق من وجود صفوف
        const rows = tableBody.querySelectorAll('tr');
        if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) {
            if (window.firebaseConfig && window.firebaseConfig.showMessage) {
                window.firebaseConfig.showMessage('warning', 'لا توجد بيانات معروضة للتصدير');
            }
            return;
        }
        
        const project = window.firebaseConfig.projectManager.getCurrentProject();
        const reportDate = new Date().toLocaleDateString('ar-IQ');
        const reportTime = new Date().toLocaleTimeString('ar-IQ');
        
        // جمع معلومات التصفية
        const filterInfo = getCurrentFilterInfo();
        
        // تحضير البيانات
        let data = [];
        
        // === رأس التقرير ===
        data.push(['تقرير المصاريف المفلترة']);
        data.push([`المشروع: ${project.name}`]);
        data.push([`تاريخ التصدير: ${reportDate} ${reportTime}`]);
        data.push([`عدد السجلات: ${getVisibleRowCount()} سجل`]);
        data.push(['']); // سطر فارغ
        
        // === معلومات التصفية ===
        data.push(['معلومات التصفية:']);
        if (filterInfo.search) data.push([`- البحث: "${filterInfo.search}"`]);
        if (filterInfo.type) data.push([`- النوع: ${filterInfo.type}`]);
        if (filterInfo.recipient) data.push([`- المخول: ${filterInfo.recipient}`]);
        if (filterInfo.month) {
            const [year, month] = filterInfo.month.split('-');
            const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                              "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            data.push([`- الشهر: ${monthNames[parseInt(month) - 1]} ${year}`]);
        }
        data.push(['']); // سطر فارغ
        
        // === رؤوس الجدول ===
        const tableHeaders = [
            'المسلسل',
            'رقم الفاتورة',
            'نوع المصروف',
            'المبلغ (دينار)',
            'المخول / المستلم',
            'الموظف',
            'التاريخ',
            'طريقة الدفع',
            'الوصف',
            'ملاحظات',
            'صورة الوصل'
        ];
        data.push(tableHeaders);
        
        // === بيانات الجدول المفلتر ===
        let totalAmount = 0;
        let rowIndex = 0;
        
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            
            // تخطي الصفوف الفارغة أو رسائل عدم وجود بيانات
            if (cells.length < 3 || row.querySelector('td[colspan]')) {
                return;
            }
            
            rowIndex++;
            
            // استخراج البيانات من الخلايا
            const amountCell = cells[3];
            let amount = 0;
            
            // استخراج المبلغ من البيانات الأصلية بدلاً من النص المعروض
            const rowDataIndex = Array.from(tableBody.children).indexOf(row);
            if (rowDataIndex >= 0) {
                // البحث عن المصروف المناسب في القائمة المفلترة
                const filteredExpenses = getFilteredExpenses();
                if (filteredExpenses[rowDataIndex]) {
                    amount = parseFloat(filteredExpenses[rowDataIndex].amount || 0);
                }
            }
            
            // إذا لم نتمكن من الحصول على المبلغ من البيانات، استخدم النص المعروض
            if (amount === 0 && amountCell) {
                // الطريقة الآمنة لاستخراج الرقم من النص المعروض
                const amountText = amountCell.textContent || '0';
                
                // استخدام دالة مساعدة لاستخراج الرقم من النص المعروض
                amount = extractNumberFromText(amountText);
            }
            
            // تأكد أن المبلغ ليس NaN
            if (isNaN(amount)) {
                amount = 0;
            }
            
            totalAmount += amount;
            
            // استخراج نوع المصروف من البادج
            const typeBadge = cells[2]?.querySelector('.expense-type-badge');
            const type = typeBadge ? typeBadge.textContent.trim() : (cells[2]?.textContent || '');
            
            // استخراج اسم المخول (دون أيقونة)
            let recipient = cells[4]?.textContent || '';
            // إزالة أيقونة المخول إذا كانت موجودة
            const recipientSpan = cells[4]?.querySelector('.recipient-name');
            if (recipientSpan) {
                recipient = recipientSpan.textContent.trim();
            }
            
            // استخراج معلومات الصورة
            let imageInfo = 'لا يوجد';
            const img = cells[9]?.querySelector('img');
            if (img) {
                imageInfo = 'مرفوعة';
            }
            
            // استخراج التاريخ بشكل آمن
            const dateCell = cells[6];
            let dateText = '-';
            if (dateCell) {
                dateText = dateCell.textContent.trim() || '-';
            }
            
            // استخراج الوصف بشكل آمن
            const descriptionCell = cells[8];
            let description = '-';
            if (descriptionCell) {
                description = descriptionCell.textContent.trim() || '-';
            }
            
            // استخراج الملاحظات بشكل آمن
            const notesCell = cells[10];
            let notes = '-';
            if (notesCell) {
                notes = notesCell.textContent.trim() || '-';
            }
            
            const excelRow = [
                rowIndex, // المسلسل
                cells[1]?.textContent?.trim() || '-', // رقم الفاتورة
                type, // نوع المصروف
                amount, // المبلغ (كرقم)
                recipient, // المخول
                cells[5]?.textContent?.trim() || '-', // الموظف
                dateText, // التاريخ
                cells[7]?.textContent?.trim() || '-', // طريقة الدفع
                description, // الوصف
                notes, // الملاحظات
                imageInfo // حالة الصورة
            ];
            data.push(excelRow);
        });
        
        // === سطور التلخيص ===
        data.push(['']); // سطر فارغ
        data.push(['ملخص البيانات المفلترة:']);
        data.push(['إجمالي المبلغ:', totalAmount]);
        
        // حساب المتوسط بطريقة آمنة
        const averageAmount = rowIndex > 0 ? (totalAmount / rowIndex).toFixed(2) : '0.00';
        data.push(['متوسط المبلغ:', averageAmount]);
        data.push(['عدد المعاملات:', rowIndex]);
        
        // === إنشاء ورقة عمل ===
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // تنسيق الأعمدة
        const wscols = [
            {wch: 8},   // المسلسل
            {wch: 15},  // رقم الفاتورة
            {wch: 12},  // النوع
            {wch: 15},  // المبلغ
            {wch: 20},  // المخول
            {wch: 20},  // الموظف
            {wch: 15},  // التاريخ
            {wch: 12},  // طريقة الدفع
            {wch: 30},  // الوصف
            {wch: 25},  // الملاحظات
            {wch: 12}   // الصورة
        ];
        ws['!cols'] = wscols;
        
        // تنسيق عمود المبالغ كأرقام مع التنسيق المناسب
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        // تنسيق المبالغ في السطور التي تحتوي على بيانات
        // بدءاً من السطر بعد العناوين (الصف الأول من البيانات)
        const dataStartRow = 7; // بعد العناوين والمعلومات
        for (let R = dataStartRow; R <= range.e.r; ++R) {
            const address = XLSX.utils.encode_cell({r:R, c:3}); // العمود الرابع (المبالغ)
            const cell = ws[address];
            
            if (cell && typeof cell.v === 'number') {
                // تأكد أن القيمة رقمية
                cell.t = 'n'; // نوع رقمي
                cell.z = '#,##0.00'; // تنسيق رقمي مع فواصل آلاف
            }
        }
        
        // تنسيق خلية المجموع
        const totalRow = range.e.r - 3; // صف المجموع
        const totalAddress = XLSX.utils.encode_cell({r: totalRow, c: 1}); // خلية المجموع
        if (ws[totalAddress]) {
            ws[totalAddress].t = 'n';
            ws[totalAddress].z = '#,##0.00';
        }
        
        // === إنشاء ملف Excel ===
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المصاريف المفلترة');
        
        // === حفظ الملف ===
        const fileName = `مصاريف_${project.name.replace(/[^\w\u0600-\u06FF]/g, '_')}_${getFilterFileNamePart(filterInfo)}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('success', `تم تصدير ${rowIndex} سجل إلى Excel بنجاح`);
        }
        
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر تصدير البيانات: ' + error.message);
        }
    }
}

// دالة للحصول على المصاريف المفلترة
function getFilteredExpenses() {
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const recipientFilter = document.getElementById('employeeFilter');
    const monthFilter = document.getElementById('monthFilter');
    
    const searchTerm = searchInput.value.toLowerCase();
    const type = typeFilter.value;
    const recipient = recipientFilter.value;
    const month = monthFilter.value;
    
    return expenses.filter(expense => {
        const matchesSearch = !searchTerm || 
            (expense.description && expense.description.toLowerCase().includes(searchTerm)) ||
            (expense.expenseNumber && expense.expenseNumber.toLowerCase().includes(searchTerm)) ||
            (expense.recipient && expense.recipient.toLowerCase().includes(searchTerm));
        
        const matchesType = !type || expense.type === type;
        
        const matchesRecipient = !recipient || expense.recipient === recipient;
        
        let matchesMonth = true;
        if (month && expense.date) {
            const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
            const expenseYearMonth = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
            matchesMonth = expenseYearMonth === month;
        }

        return matchesSearch && matchesType && matchesRecipient && matchesMonth;
    });
}

// دالة تصدير تقرير المخول المفلتر إلى Excel
function exportFilteredRecipientReport() {
    console.log('زر التصدير للتقرير تم النقر عليه');
    
    const recipientName = document.getElementById('reportEmployeeFilter').value;
    const month = document.getElementById('reportMonthFilter').value;
    
    if (!recipientName) {
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'الرجاء اختيار مخول أولاً');
        }
        return;
    }
    
    try {
        // الحصول على البيانات الأصلية من المتغيرات المحلية بدلاً من الجدول
        const recipientExpenses = getRecipientExpensesForCurrentReport();
        
        // التحقق من وجود بيانات
        if (!recipientExpenses || recipientExpenses.length === 0) {
            if (window.firebaseConfig && window.firebaseConfig.showMessage) {
                window.firebaseConfig.showMessage('warning', 'لا توجد بيانات في التقرير للتصدير');
            }
            return;
        }
        
        const project = window.firebaseConfig.projectManager.getCurrentProject();
        const reportDate = new Date().toLocaleDateString('ar-IQ');
        
        // تحضير البيانات
        let data = [];
        
        // رأس التقرير
        data.push(['تقرير المصاريف للمخول']);
        data.push([`المشروع: ${project.name}`]);
        data.push([`المخول: ${recipientName}`]);
        if (month) {
            const [year, monthNum] = month.split('-');
            const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                              "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            data.push([`الفترة: ${monthNames[parseInt(monthNum) - 1]} ${year}`]);
        } else {
            data.push(['الفترة: جميع الأشهر']);
        }
        data.push([`تاريخ التصدير: ${reportDate}`]);
        data.push(['']); // سطر فارغ
        
        // رؤوس الجدول
        const tableHeaders = [
            'المسلسل',
            'التاريخ',
            'نوع المصروف',
            'المبلغ (دينار)',
            'الموظف',
            'الوصف',
            'طريقة الدفع'
        ];
        data.push(tableHeaders);
        
        // جمع البيانات الأصلية
        let totalAmount = 0;
        
        recipientExpenses.forEach((expense, index) => {
            // استخدام البيانات الأصلية مباشرة
            const amount = parseFloat(expense.amount || 0);
            totalAmount += amount;
            
            // تنسيق التاريخ من البيانات الأصلية
            let dateFormatted = '';
            if (expense.date) {
                const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
                dateFormatted = expenseDate.toLocaleDateString('ar-IQ', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            
            const excelRow = [
                index + 1, // المسلسل
                dateFormatted, // التاريخ
                expense.type || '-', // النوع
                amount, // المبلغ (كرقم مباشر)
                expense.employeeName || '-', // الموظف
                expense.description || '-', // الوصف
                expense.paymentMethod || '-'  // طريقة الدفع
            ];
            data.push(excelRow);
        });
        
        // سطور الملخص
        data.push(['']); // سطر فارغ
        data.push(['ملخص التقرير:']);
        data.push(['إجمالي المبلغ:', totalAmount]);
        data.push(['عدد المعاملات:', recipientExpenses.length]);
        
        // حساب المتوسط
        const averageAmount = recipientExpenses.length > 0 ? 
            (totalAmount / recipientExpenses.length).toFixed(2) : '0.00';
        data.push(['متوسط المبلغ:', averageAmount]);
        
        // إنشاء ورقة عمل
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // تنسيق الأعمدة
        const wscols = [
            {wch: 8},   // المسلسل
            {wch: 15},  // التاريخ
            {wch: 12},  // النوع
            {wch: 15},  // المبلغ
            {wch: 20},  // الموظف
            {wch: 30},  // الوصف
            {wch: 12}   // طريقة الدفع
        ];
        ws['!cols'] = wscols;
        
        // تنسيق عمود المبالغ كأرقام مع تنسيق مناسب
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        // تحديد بداية بيانات الجدول (بعد العناوين)
        const dataStartRow = 6; // بعد رأس التقرير والعناوين
        
        for (let R = dataStartRow; R <= range.e.r; ++R) {
            const address = XLSX.utils.encode_cell({r:R, c:3}); // العمود الرابع (المبالغ)
            const cell = ws[address];
            
            if (cell && typeof cell.v === 'number') {
                cell.t = 'n'; // نوع رقمي
                cell.z = '#,##0.00'; // تنسيق رقمي مع فواصل آلاف
            }
        }
        
        // تنسيق خلايا المجموع
        const summaryStartRow = range.e.r - 2; // صف بداية الملخص
        
        // إجمالي المبلغ
        const totalAmountCell = XLSX.utils.encode_cell({r: summaryStartRow, c: 1});
        if (ws[totalAmountCell]) {
            ws[totalAmountCell].t = 'n';
            ws[totalAmountCell].z = '#,##0.00';
        }
        
        // متوسط المبلغ
        const averageAmountCell = XLSX.utils.encode_cell({r: summaryStartRow + 2, c: 1});
        if (ws[averageAmountCell] && !isNaN(parseFloat(averageAmount))) {
            ws[averageAmountCell].v = parseFloat(averageAmount);
            ws[averageAmountCell].t = 'n';
            ws[averageAmountCell].z = '#,##0.00';
        }
        
        // إنشاء ملف Excel
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير المخول');
        
        // حفظ الملف
        const periodText = month ? month.replace('-', '_') : 'كامل';
        const safeName = recipientName.replace(/[^\w\u0600-\u06FF]/g, '_');
        const fileName = `تقرير_${safeName}_${periodText}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('success', 
                `تم تصدير ${recipientExpenses.length} معاملة إلى Excel بنجاح`);
        }
        
    } catch (error) {
        console.error('خطأ في تصدير التقرير:', error);
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر تصدير التقرير: ' + error.message);
        }
    }
}

// دالة مساعدة للحصول على مصاريف المخول للتقارير الحالية
function getRecipientExpensesForCurrentReport() {
    const recipientName = document.getElementById('reportEmployeeFilter').value;
    const month = document.getElementById('reportMonthFilter').value;
    
    if (!recipientName) return [];
    
    // تصفية المصاريف الأصلية بناءً على التصفية الحالية
    return expenses.filter(expense => {
        const matchesRecipient = expense.recipient === recipientName;
        
        let matchesMonth = true;
        if (month && expense.date) {
            const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
            const expenseYearMonth = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
            matchesMonth = expenseYearMonth === month;
        }
        
        return matchesRecipient && matchesMonth;
    });
}

// دالة مساعدة لاستخراج الرقم من النص بشكل آمن
function extractNumberFromText(text) {
    if (!text) return 0;
    
    // إزالة جميع الأحرف غير الرقمية والنقاط
    const cleanText = text.toString().replace(/[^\d.]/g, '');
    
    // التحقق إذا كان النص يحتوي على رقم صالح
    if (cleanText && cleanText !== '.') {
        const num = parseFloat(cleanText);
        if (!isNaN(num)) {
            return num;
        }
    }
    
    // إذا فشل التحويل، حاول استخراج الرقم بطريقة أخرى
    const match = text.toString().match(/(\d+\.?\d*)/);
    if (match) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
            return num;
        }
    }
    
    return 0;
}

// دالة مساعدة للحصول على معلومات التصفية الحالية
function getCurrentFilterInfo() {
    return {
        search: document.getElementById('searchInput').value,
        type: document.getElementById('typeFilter').value,
        recipient: document.getElementById('employeeFilter').value,
        month: document.getElementById('monthFilter').value
    };
}

// دالة مساعدة لحساب عدد الصفوف المرئية
function getVisibleRowCount() {
    const tableBody = document.getElementById('expensesTableBody');
    if (!tableBody) return 0;
    
    const rows = tableBody.querySelectorAll('tr');
    let count = 0;
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3 && !row.querySelector('td[colspan]')) {
            count++;
        }
    });
    
    return count;
}

// دالة مساعدة لإنشاء جزء اسم الملف من معلومات التصفية
function getFilterFileNamePart(filterInfo) {
    const parts = [];
    
    if (filterInfo.search) {
        parts.push('بحث');
    }
    
    if (filterInfo.type) {
        parts.push(filterInfo.type);
    }
    
    if (filterInfo.recipient) {
        const shortName = filterInfo.recipient.split(' ')[0];
        parts.push(shortName);
    }
    
    if (filterInfo.month) {
        parts.push(filterInfo.month.replace('-', '_'));
    }
    
    if (parts.length === 0) {
        parts.push('كامل');
    }
    
    return parts.join('_');
}

// دالة للتحقق من وجود بيانات للتصدير
function hasDataToExport() {
    const tableBody = document.getElementById('expensesTableBody');
    if (!tableBody) return false;
    
    const rows = tableBody.querySelectorAll('tr');
    
    // إذا كان هناك صف واحد فقط وهو رسالة "لا يوجد بيانات"
    if (rows.length === 1 && rows[0].querySelector('td[colspan]')) {
        return false;
    }
    
    // عد الصفوف الحقيقية
    let realRowCount = 0;
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3 && !row.querySelector('td[colspan]')) {
            realRowCount++;
        }
    });
    
    return realRowCount > 0;
}

// =========== دوال المساعدة ===========

// إعادة التوجيه إلى صفحة المشاريع
function redirectToProjects() {
    if (window.firebaseConfig && window.firebaseConfig.showMessage) {
        window.firebaseConfig.showMessage('error', 'الرجاء اختيار مشروع أولاً');
    }
    setTimeout(() => {
        window.location.href = '../projects/projects.html';
    }, 2000);
}

// عرض التحميل
function showLoading(message = 'جاري التحميل...') {
    const existing = document.querySelectorAll('.custom-loading');
    existing.forEach(el => el.remove());

    const div = document.createElement('div');
    div.className = 'custom-loading';
    div.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        color: white;
        font-size: 18px;
    `;
    div.innerHTML = `
        <div style="text-align: center;">
            <div class="spinner" style="
                width: 50px;
                height: 50px;
                border: 5px solid #f3f3f3;
                border-top: 5px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            "></div>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(div);
}

// إخفاء التحميل
function hideLoading() {
    const elements = document.querySelectorAll('.custom-loading');
    elements.forEach(el => el.remove());
}

// عرض المشروع الحالي
function displayCurrentProjectInfo() {
    if (!window.firebaseConfig) return;
    
    const currentProject = window.firebaseConfig.projectManager.getCurrentProject();
    const projectInfoElement = document.getElementById('currentProjectInfo');

    if (!projectInfoElement) {
        console.warn('عنصر currentProjectInfo غير موجود');
        return;
    }

    if (currentProject && currentProject.name) {
        projectInfoElement.innerHTML = `
            <div class="project-banner">
                <h3><i class="fas fa-project-diagram"></i> المشروع الحالي: ${currentProject.name}</h3>
                <button class="btn btn-secondary" onclick="window.location.href='../projects/projects.html'">
                    <i class="fas fa-exchange-alt"></i> تغيير المشروع
                </button>
            </div>
        `;
    }
}

// دالة لتحويل التاريخ
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// دالة التصفية والبحث
function setupSearchAndFilter() {
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const recipientFilter = document.getElementById('employeeFilter');
    const monthFilter = document.getElementById('monthFilter');

    function filterExpenses() {
        const searchTerm = searchInput.value.toLowerCase();
        const type = typeFilter.value;
        const recipient = recipientFilter.value;
        const month = monthFilter.value;

        const filtered = expenses.filter(expense => {
            const matchesSearch = !searchTerm || 
                (expense.description && expense.description.toLowerCase().includes(searchTerm)) ||
                (expense.expenseNumber && expense.expenseNumber.toLowerCase().includes(searchTerm)) ||
                (expense.recipient && expense.recipient.toLowerCase().includes(searchTerm));
            
            const matchesType = !type || expense.type === type;
            
            const matchesRecipient = !recipient || expense.recipient === recipient;
            
            let matchesMonth = true;
            if (month && expense.date) {
                const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
                const expenseYearMonth = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
                matchesMonth = expenseYearMonth === month;
            }

            return matchesSearch && matchesType && matchesRecipient && matchesMonth;
        });

        displayExpenses(filtered);
    }

    if (searchInput) searchInput.addEventListener('input', filterExpenses);
    if (typeFilter) typeFilter.addEventListener('change', filterExpenses);
    if (recipientFilter) recipientFilter.addEventListener('change', filterExpenses);
    if (monthFilter) monthFilter.addEventListener('change', filterExpenses);
}

// =========== تهيئة الصفحة ===========
document.addEventListener('DOMContentLoaded', async function() {
    console.log('جاري تحميل صفحة المصاريف...');
    
    // إضافة شاشة تحميل أولية
    showLoading('جاري تهيئة النظام والتحقق من التوثيق...');
    
    try {
        // الانتظار لتحميل Firebase Config
        const firebaseConfig = await waitForFirebaseConfig();
        
        // التحقق من التوثيق
        const authSuccess = await initializeAuth();
        if (!authSuccess) {
            // تم التوجيه تلقائياً إلى صفحة تسجيل الدخول
            hideLoading();
            return;
        }
        
        // التحقق من وجود مشروع محدد
        if (!firebaseConfig.projectManager.hasCurrentProject()) {
            hideLoading();
            showErrorMessage('الرجاء اختيار مشروع أولاً');
            setTimeout(() => {
                window.location.href = '../projects/projects.html';
            }, 2000);
            return;
        }
        
        // إخفاء شاشة التحميل
        hideLoading();
        
        // تحميل باقي الصفحة
        displayCurrentProjectInfo();
        await loadExpenses();
        setupSearchAndFilter();
        initImageUpload();
        setupLogoutButton();
        setupUserInfo();
        
        // إعداد event listeners
        setupEventListeners();
        
        console.log('✅ تم تحميل صفحة المصاريف بنجاح');
        
    } catch (error) {
        console.error('فشل في تحميل النظام:', error);
        hideLoading();
        
        // عرض رسالة خطأ مفيدة
        const errorMessage = error.message.includes('انتهى وقت') || error.message.includes('لم يتم تحميله') 
            ? 'تعذر تحميل النظام. يرجى التحقق من اتصال الإنترنت وتحديث الصفحة.'
            : `خطأ: ${error.message}`;
        
        showErrorMessage(errorMessage);
    }
});

// إعداد event listeners
function setupEventListeners() {
    // الزر الرئيسي لإضافة مصروف
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', openAddExpenseModal);
    }
    
    // زر فتح تقرير المخولين
    const viewReportBtn = document.getElementById('viewEmployeeReportBtn');
    if (viewReportBtn) {
        viewReportBtn.addEventListener('click', openRecipientReportModal);
    }
    
    // زر تصدير Excel للمصاريف المفلترة
    const exportExcelBtn = document.getElementById('exportFilteredExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportFilteredExpensesToExcel);
    }
    
    // زر إغلاق نموذج المصروف
    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeExpenseModal);
    }
    
    // زر إلغاء في نموذج المصروف
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeExpenseModal);
    }
    
    // زر إغلاق نموذج التقرير
    const closeReportBtn = document.getElementById('closeReportModal');
    if (closeReportBtn) {
        closeReportBtn.addEventListener('click', closeRecipientReportModal);
    }
    
    // نموذج المصروف
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) {
        expenseForm.addEventListener('submit', handleExpenseSubmit);
    }
    
    // زر توليد التقرير
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', generateRecipientReport);
    }
    
    // زر تصدير التقرير
    const exportReportBtn = document.getElementById('exportFilteredReportBtn');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', exportFilteredRecipientReport);
    }
    
    // إغلاق النماذج عند النقر خارجها
    window.addEventListener('click', function(event) {
        const expenseModal = document.getElementById('expenseModal');
        const reportModal = document.getElementById('employeeReportModal');
        
        if (event.target === expenseModal) closeExpenseModal();
        if (event.target === reportModal) closeRecipientReportModal();
    });
    
    // إغلاق النماذج بالضغط على زر ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeExpenseModal();
            closeRecipientReportModal();
        }
    });
}

// عرض رسالة خطأ
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #e74c3c;
        color: white;
        padding: 20px 30px;
        border-radius: 8px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 400px;
        width: 90%;
    `;
    errorDiv.innerHTML = `
        <h3 style="margin: 0 0 10px 0;"><i class="fas fa-exclamation-triangle"></i> خطأ في التحميل</h3>
        <p style="margin: 0 0 15px 0;">${message}</p>
        <button onclick="location.reload()" style="
            background: white;
            color: #e74c3c;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            margin: 5px;
        ">
            <i class="fas fa-redo"></i> إعادة تحميل الصفحة
        </button>
    `;
    document.body.appendChild(errorDiv);
}

// إضافة animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);