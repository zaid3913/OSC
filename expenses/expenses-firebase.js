// قسم المصاريف مع نظام تتبع المصاريف للمخولين من قسم السلف

let expenses = [];
let currentExpenseId = null;
let recipientsList = [];
let currentImageFile = null;
let currentImageUrl = null;
let currentRecipientExpenses = []; // لتخزين مصاريف المخول الحالية للتصدير
let filteredExpenses = [];

function normalizeFundSource(value) {
    return value === 'advance' ? 'advance' : 'general';
}

function getFundSourceLabel(value) {
    return normalizeFundSource(value) === 'advance' ? 'من سلفة مخول' : 'من الرصيد العام';
}

async function getAdvanceById(advanceId) {
    if (!advanceId || !window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) return null;
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    const doc = await window.firebaseConfig.db.collection('projects').doc(projectId).collection('advances').doc(advanceId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function calculateAdvanceSpent(projectId, advanceId, excludeExpenseId = null) {
    let total = 0;
    const snap = await window.firebaseConfig.db.collection('projects').doc(projectId).collection('expenses').where('fundSource', '==', 'advance').where('advanceId', '==', advanceId).get();
    snap.forEach(doc => {
        if (excludeExpenseId && doc.id === excludeExpenseId) return;
        const exp = doc.data();
        const status = exp.paymentStatus || 'paid';
        if (status === 'paid') total += parseFloat(exp.amount) || 0;
    });
    return total;
}

async function getAdvanceAvailableAmount(projectId, advanceId, excludeExpenseId = null) {
    const advance = await getAdvanceById(advanceId);
    if (!advance) return 0;
    const spent = await calculateAdvanceSpent(projectId, advanceId, excludeExpenseId);
    const amount = parseFloat(advance.amount) || 0;
    const refunded = parseFloat(advance.refundedAmount) || 0;
    return Math.max(0, amount - refunded - spent);
}

async function syncAdvanceRemainingAmount(projectId, advanceId) {
    const advance = await getAdvanceById(advanceId);
    if (!advance) return;
    const available = await getAdvanceAvailableAmount(projectId, advanceId);
    await window.firebaseConfig.db.collection('projects').doc(projectId).collection('advances').doc(advanceId).update({
        remainingAmount: available,
        updatedAt: firebase.firestore.Timestamp.now()
    });
}

async function syncAllAdvanceRemainingAmounts(projectId) {
    const snap = await window.firebaseConfig.db.collection('projects').doc(projectId).collection('advances').where('transactionType', '==', 'payment').get();
    for (const doc of snap.docs) {
        await syncAdvanceRemainingAmount(projectId, doc.id);
    }
}

function toggleFundSourceFields() {
    const fundSourceEl = document.getElementById('fundSource');
    const advanceGroup = document.getElementById('advanceRecipientGroup');
    const advanceSelect = document.getElementById('advanceRecipientSelect');
    const recipientInput = document.getElementById('recipient');
    if (!fundSourceEl || !advanceGroup || !advanceSelect || !recipientInput) return;
    const isAdvance = normalizeFundSource(fundSourceEl.value) === 'advance';
    advanceGroup.style.display = isAdvance ? 'block' : 'none';
    advanceSelect.required = isAdvance;
    recipientInput.readOnly = isAdvance;
    if (!isAdvance) {
        advanceSelect.value = '';
        document.getElementById('advanceRecipientHint').textContent = '';
    }
}

function handleAdvanceRecipientChange() {
    const advanceSelect = document.getElementById('advanceRecipientSelect');
    const recipientInput = document.getElementById('recipient');
    const hint = document.getElementById('advanceRecipientHint');
    if (!advanceSelect || !recipientInput || !hint) return;
    const selected = recipientsList.find(r => r.id === advanceSelect.value);
    if (selected) {
        recipientInput.value = selected.name || '';
        hint.textContent = `المتبقي الحالي: ${window.firebaseConfig.formatCurrency(selected.remainingAmount || 0)}`;
    } else {
        hint.textContent = '';
    }
}

function populateAdvanceRecipientSelect() {
    const select = document.getElementById('advanceRecipientSelect');
    if (!select) return;
    select.innerHTML = '<option value="">اختر سلفة المخول</option>';
    recipientsList.forEach(recipient => {
        const option = document.createElement('option');
        option.value = recipient.id;
        option.textContent = `${recipient.name} - المتبقي ${window.firebaseConfig.formatCurrency(recipient.remainingAmount || 0)}`;
        select.appendChild(option);
    });
}

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

// الانتظار حتى يتم تحميل Firebase Config
function waitForFirebaseConfig(maxAttempts = 20, interval = 100) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        function check() {
            attempts++;
            if (window.firebaseConfig && window.firebaseConfig.db) {
                console.log('تم تحميل Firebase Config بنجاح');
                resolve(window.firebaseConfig);
            } else if (attempts >= maxAttempts) {
                reject(new Error('Firebase Config لم يتم تحميله بعد'));
            } else {
                setTimeout(check, interval);
            }
        }
        
        check();
    });
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
            window.firebaseConfig.showMessage('error', 'الرجاء اختيار ملف صورة فقط');
        }
    });

    removeImageBtn.addEventListener('click', () => {
        resetImageUpload();
    });
}

// معالجة ملف الصورة
function handleImageFile(file) {
    if (file.size > 5 * 1024 * 1024) {
        window.firebaseConfig.showMessage('error', 'حجم الملف كبير جداً. الحد الأقصى هو 5MB');
        return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        window.firebaseConfig.showMessage('error', 'صيغة الملف غير مدعومة. استخدم JPG, PNG, GIF, أو WebP');
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
        window.firebaseConfig.showMessage('error', `تعذر رفع الصورة: ${error.message}`);
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
    const fundSourceEl = document.getElementById('fundSource');
    const advanceSelectEl = document.getElementById('advanceRecipientSelect');
    if (fundSourceEl) fundSourceEl.value = 'general';
    if (advanceSelectEl) advanceSelectEl.value = '';
    toggleFundSourceFields();
    handleAdvanceRecipientChange();
    document.getElementById('employeeName').value = '';
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expenseNotes').value = '';
    
    resetImageUpload();
    
    // إضافة console.log للتحقق
    console.log('Opening modal - setting default payment status');
    const paidRadio = document.querySelector('input[name="paymentStatus"][value="paid"]');
    const unpaidRadio = document.querySelector('input[name="paymentStatus"][value="unpaid"]');
    
    console.log('Paid radio found:', !!paidRadio);
    console.log('Unpaid radio found:', !!unpaidRadio);
    
    if (paidRadio) {
        paidRadio.checked = true;
        console.log('Paid radio checked:', paidRadio.checked);
    } else {
        console.error('Paid radio not found!');
    }
    
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
    const fundSourceEl = document.getElementById('fundSource');
    const advanceSelectEl = document.getElementById('advanceRecipientSelect');
    if (fundSourceEl) fundSourceEl.value = normalizeFundSource(expense.fundSource);
    populateAdvanceRecipientSelect();
    if (advanceSelectEl) advanceSelectEl.value = expense.advanceId || '';
    toggleFundSourceFields();
    handleAdvanceRecipientChange();
    document.getElementById('employeeName').value = expense.employeeName || '';
    document.getElementById('expenseDescription').value = expense.description || '';
    document.getElementById('expenseNotes').value = expense.notes || '';

    if (expense.paymentStatus) {
    const radio = document.querySelector(
        `input[name="paymentStatus"][value="${expense.paymentStatus}"]`
    );
    if (radio) radio.checked = true;
}

    
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
        
        populateAdvanceRecipientSelect();
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
        window.firebaseConfig.showMessage('error', 'تعذر تحميل بيانات المصاريف');
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

async function loadRecipientsFromAdvances() {
    await loadRecipientsList();
    updateRecipientFilterOptions();
    populateAdvanceRecipientSelect();
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

        expenseData.fundSource = normalizeFundSource(expenseData.fundSource);
        expenseData.advanceId = expenseData.fundSource === 'advance' ? (expenseData.advanceId || null) : null;

        if (expenseData.fundSource === 'advance') {
            const available = await getAdvanceAvailableAmount(projectId, expenseData.advanceId);
            if ((parseFloat(expenseData.amount) || 0) > available) {
                hideLoading();
                window.firebaseConfig.showMessage('error', 'مبلغ المصروف أكبر من المتبقي في سلفة المخول');
                return;
            }
        }

        expenseData.createdAt = firebase.firestore.Timestamp.now();
        expenseData.updatedAt = firebase.firestore.Timestamp.now();

        if (expenseData.date) {
            expenseData.date = firebase.firestore.Timestamp.fromDate(new Date(expenseData.date));
        }

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

        if (expenseData.fundSource === 'advance' && expenseData.advanceId) {
            await syncAdvanceRemainingAmount(projectId, expenseData.advanceId);
        }

        await window.firebaseConfig.updateTotalBalance();
        await loadRecipientsFromAdvances();

        window.firebaseConfig.showMessage('success', 'تم إضافة المصروف بنجاح');
        closeExpenseModal();
        loadExpenses();

    } catch (error) {
        console.error("Error adding expense:", error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر إضافة المصروف');
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

        expenseData.fundSource = normalizeFundSource(expenseData.fundSource);
        expenseData.advanceId = expenseData.fundSource === 'advance' ? (expenseData.advanceId || null) : null;

        if (expenseData.fundSource === 'advance') {
            const available = await getAdvanceAvailableAmount(projectId, expenseData.advanceId, expenseId);
            if ((parseFloat(expenseData.amount) || 0) > available) {
                hideLoading();
                window.firebaseConfig.showMessage('error', 'مبلغ المصروف أكبر من المتبقي في سلفة المخول');
                return;
            }
        }

        expenseData.updatedAt = firebase.firestore.Timestamp.now();

        if (expenseData.date) {
            expenseData.date = firebase.firestore.Timestamp.fromDate(new Date(expenseData.date));
        }

        await expenseRef.update(expenseData);

        if (currentData?.advanceId) await syncAdvanceRemainingAmount(projectId, currentData.advanceId);
        if (expenseData.advanceId) await syncAdvanceRemainingAmount(projectId, expenseData.advanceId);

        await window.firebaseConfig.updateTotalBalance();
        await loadRecipientsFromAdvances();

        window.firebaseConfig.showMessage('success', 'تم تحديث المصروف بنجاح');
        closeExpenseModal();
        loadExpenses();

    } catch (error) {
        console.error("Error updating expense:", error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر تحديث المصروف');
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
        
        const affectedAdvanceId = expense.advanceId || null;

        if (expense.receiptImage?.deleteUrl) {
            await deleteExpenseImage(expense.receiptImage);
        }
        
        await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('expenses')
            .doc(expenseId)
            .delete();

        if (affectedAdvanceId) await syncAdvanceRemainingAmount(projectId, affectedAdvanceId);
        await window.firebaseConfig.updateTotalBalance();
        await loadRecipientsFromAdvances();

        window.firebaseConfig.showMessage('success', 'تم حذف المصروف بنجاح');
        loadExpenses();
        
    } catch (error) {
        console.error("Error deleting expense:", error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر حذف المصروف');
    }
}

// توليد تقرير المخول
async function generateRecipientReport() {
    const recipientName = document.getElementById('reportEmployeeFilter').value;
    const month = document.getElementById('reportMonthFilter').value;
    
    if (!recipientName) {
        window.firebaseConfig.showMessage('error', 'الرجاء اختيار مخول لعرض تقريره');
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
        window.firebaseConfig.showMessage('error', 'تعذر توليد التقرير');
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
    
    // قراءة حالة التسديد بشكل موثوق
    let paymentStatus = 'paid'; // القيمة الافتراضية
    const paidRadio = document.querySelector('input[name="paymentStatus"][value="paid"]');
    const unpaidRadio = document.querySelector('input[name="paymentStatus"][value="unpaid"]');
    
    if (unpaidRadio && unpaidRadio.checked) {
        paymentStatus = 'unpaid';
    } else if (paidRadio && paidRadio.checked) {
        paymentStatus = 'paid';
    }
    
    const expenseData = {
        expenseNumber: document.getElementById('expenseNumber').value.trim(),
        type: document.getElementById('expenseType').value,
        amount: parseFloat(document.getElementById('expenseAmount').value) || 0,
        date: document.getElementById('expenseDate').value,
        paymentMethod: document.getElementById('paymentMethod').value,
        recipient: document.getElementById('recipient').value.trim(),
        employeeName: document.getElementById('employeeName').value.trim(),
        description: document.getElementById('expenseDescription').value.trim(),
        notes: document.getElementById('expenseNotes').value.trim(),
        paymentStatus: paymentStatus, // استخدم القيمة المحسوبة
        fundSource: normalizeFundSource(document.getElementById('fundSource')?.value),
        advanceId: normalizeFundSource(document.getElementById('fundSource')?.value) === 'advance'
            ? (document.getElementById('advanceRecipientSelect')?.value || null)
            : null
    };
    
    // إضافة console.log للتشخيص
    console.log('paymentStatus in submit:', paymentStatus);
    console.log('Paid radio checked:', paidRadio?.checked);
    console.log('Unpaid radio checked:', unpaidRadio?.checked);
    
    if (currentExpenseId) {
        await updateExpense(currentExpenseId, expenseData);
    } else {
        await addExpense(expenseData);
    }
}

// تحديث ملخص المصاريف
function updateExpenseSummary() {
    if (!window.firebaseConfig) return;
    
    let totalPaidExpenses = 0;
    let totalUnpaidExpenses = 0;
    let totalSalaries = 0;
    let totalOther = 0;
    let unpaidCount = 0;
    
    expenses.forEach(expense => {
        const amount = parseFloat(expense.amount) || 0;
        const status = expense.paymentStatus || 'paid';
        
        if (status === 'paid') {
            totalPaidExpenses += amount;
            
            if (expense.type === 'راتب') {
                totalSalaries += amount;
            } else {
                totalOther += amount;
            }
        } else {
            totalUnpaidExpenses += amount;
            unpaidCount++;
        }
    });
    
    // تحديث البطاقات
    document.getElementById('totalExpensesAmount').textContent = 
        window.firebaseConfig.formatCurrency(totalPaidExpenses);
    document.getElementById('salariesAmount').textContent = 
        window.firebaseConfig.formatCurrency(totalSalaries);
    document.getElementById('otherExpensesAmount').textContent = 
        window.firebaseConfig.formatCurrency(totalOther);
    
    // تحديث بطاقة المصروفات غير المسددة
    const unpaidAmountEl = document.getElementById('unpaidExpensesAmount');
    const unpaidCountEl = document.getElementById('unpaidExpensesCount');
    
    if (unpaidAmountEl) {
        unpaidAmountEl.textContent = window.firebaseConfig.formatCurrency(totalUnpaidExpenses);
    }
    if (unpaidCountEl) {
        unpaidCountEl.textContent = `${unpaidCount} مصروف`;
    }
}
//======تحديث حالة التسديد=======
async function markExpenseAsPaid(expenseId) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) return;

    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;

    try {
        if (!confirm('تأكيد: تريد تسديد هذا المصروف؟')) return;

        showLoading('جاري تسديد المصروف...');

        const expenseRef = window.firebaseConfig.db
            .collection('projects')
            .doc(projectId)
            .collection('expenses')
            .doc(expenseId);

        const snap = await expenseRef.get();
        if (!snap.exists) {
            hideLoading();
            return;
        }

        const expense = snap.data();
        const status = expense.paymentStatus || 'paid';

        // حماية: إذا مسدد مسبقاً
        if (status === 'paid') {
            hideLoading();
            window.firebaseConfig.showMessage('info', 'هذا المصروف مسدد مسبقاً');
            return;
        }

        const amount = parseFloat(expense.amount) || 0;
        if (amount <= 0) {
            hideLoading();
            window.firebaseConfig.showMessage('error', 'مبلغ المصروف غير صحيح');
            return;
        }

        if ((expense.fundSource || 'general') === 'advance' && expense.advanceId) {
            const available = await getAdvanceAvailableAmount(projectId, expense.advanceId, expenseId);
            if (amount > available) {
                hideLoading();
                window.firebaseConfig.showMessage('error', 'لا يمكن التسديد لأن المبلغ يتجاوز المتبقي من السلفة');
                return;
            }
        }

        // 1) تحديث الحالة إلى مسدد
        await expenseRef.update({
            paymentStatus: 'paid',
            paidAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now()
        });

        if ((expense.fundSource || 'general') === 'advance' && expense.advanceId) {
            await syncAdvanceRemainingAmount(projectId, expense.advanceId);
        }

        await window.firebaseConfig.updateTotalBalance();
        await loadRecipientsFromAdvances();

        hideLoading();
        window.firebaseConfig.showMessage('success', 'تم تسديد المصروف وتحديث الرصيد');
        loadExpenses();

    } catch (error) {
        console.error('Error paying expense:', error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر تسديد المصروف');
    }
}



// =========== عرض المصاريف في الجدول ===========
function displayExpenses(list) {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" style="text-align: center; padding: 40px;">
                    <i class="fas fa-file-invoice-dollar" style="font-size: 48px; color: #ccc; margin-bottom: 15px; display: block;"></i>
                    <p style="color: #666;">لا يوجد مصاريف مسجلة بعد</p>
                </td>
            </tr>
        `;
        return;
    }
    
    list.forEach((expense, index) => {
        const isRecipient = recipientsList.some(rec => rec.name === expense.recipient);
    const fundSourceLabel = getFundSourceLabel(expense.fundSource);
        
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
        
        const status = expense.paymentStatus || 'paid';

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

    <td>
        ${
            status === 'paid'
            ? '<span style="color:#2ecc71;font-weight:bold;">مسدد</span>'
            : '<span style="color:#e67e22;font-weight:bold;">غير مسدد</span>'
        }
    </td>

    <td>${expense.description || ''}</td>
    <td>${imageCell}</td>
    <td>${expense.notes || ''}</td>

    <td>
        ${
            status === 'unpaid'
            ? `<button class="btn btn-success btn-sm" onclick="markExpenseAsPaid('${expense.id}')">
                   <i class="fas fa-check"></i> تسديد
               </button>`
            : ''
        }

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
        // استخدام البيانات المفلترة مباشرة بدلاً من الجدول المعروض
        const filteredExpenses = getFilteredExpenses();
        
        // التحقق من وجود بيانات
        if (filteredExpenses.length === 0) {
            window.firebaseConfig.showMessage('warning', 'لا توجد بيانات معروضة للتصدير');
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
        data.push([`عدد السجلات: ${filteredExpenses.length} سجل`]);
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
        // حالة التسديد
        if (filterInfo.paymentStatus) {
            data.push([`- حالة التسديد: ${filterInfo.paymentStatus === 'paid' ? 'مسدد' : 'غير مسدد'}`]);
        }
        if (filterInfo.fundSource) {
            data.push([`- مصدر الصرف: ${filterInfo.fundSource === 'advance' ? 'من سلفة مخول' : 'من الرصيد العام'}`]);
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
            'حالة التسديد',
            'الوصف',
            'ملاحظات',
            'صورة الوصل'
        ];
        data.push(tableHeaders);
        
        // === بيانات الجدول من البيانات المفلترة مباشرة ===
        let totalAmount = 0;
        let paidAmount = 0;
        let unpaidAmount = 0;
        let paidCount = 0;
        let unpaidCount = 0;
        
        filteredExpenses.forEach((expense, index) => {
            const amount = parseFloat(expense.amount) || 0;
            totalAmount += amount;
            
            const status = expense.paymentStatus || 'paid';
            const statusText = status === 'paid' ? 'مسدد' : 'غير مسدد';
            
            if (status === 'paid') {
                paidAmount += amount;
                paidCount++;
            } else {
                unpaidAmount += amount;
                unpaidCount++;
            }
            
            // تنسيق التاريخ
            let dateFormatted = '';
            if (expense.date) {
                const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
                dateFormatted = expenseDate.toLocaleDateString('ar-IQ', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            
            // حالة الصورة
            let imageInfo = 'لا يوجد';
            if (expense.receiptImage && expense.receiptImage.url) {
                imageInfo = 'مرفوعة';
            }
            
            const excelRow = [
                index + 1, // المسلسل
                expense.expenseNumber || '-', // رقم الفاتورة
                expense.type || '-', // نوع المصروف
                amount, // المبلغ
                expense.recipient || '-', // المخول
                expense.employeeName || '-', // الموظف
                dateFormatted, // التاريخ
                expense.paymentMethod || '-', // طريقة الدفع
                statusText, // حالة التسديد ⭐ هذا هو المهم
                expense.description || '-', // الوصف
                expense.notes || '-', // الملاحظات
                imageInfo // حالة الصورة
            ];
            data.push(excelRow);
        });
        
        // === سطور التلخيص ===
        data.push(['']); // سطر فارغ
        data.push(['ملخص البيانات المفلترة:']);
        data.push(['إجمالي المبلغ:', totalAmount]);
        data.push(['المبلغ المسدد:', paidAmount]);
        data.push(['المبلغ غير المسدد:', unpaidAmount]);
        
        // حساب المتوسط بطريقة آمنة
        const averageAmount = filteredExpenses.length > 0 ? 
            (totalAmount / filteredExpenses.length).toFixed(2) : '0.00';
        data.push(['متوسط المبلغ:', averageAmount]);
        data.push(['عدد المعاملات:', filteredExpenses.length]);
        data.push(['عدد المسدد:', paidCount]);
        data.push(['عدد غير المسدد:', unpaidCount]);
        
        if (totalAmount > 0) {
            data.push(['نسبة المسدد:', Math.round((paidAmount / totalAmount) * 100) || 0, '%']);
            data.push(['نسبة غير المسدد:', Math.round((unpaidAmount / totalAmount) * 100) || 0, '%']);
        }
        
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
            {wch: 12},  // حالة التسديد
            {wch: 30},  // الوصف
            {wch: 25},  // الملاحظات
            {wch: 12}   // الصورة
        ];
        ws['!cols'] = wscols;
        
        // تنسيق عمود المبالغ كأرقام مع التنسيق المناسب
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        // تنسيق المبالغ في السطور التي تحتوي على بيانات
        // بدءاً من السطر بعد العناوين (الصف الأول من البيانات)
        const headerRows = 7; // عدد صفوف العناوين والمعلومات
        for (let R = headerRows; R <= range.e.r; ++R) {
            const amountAddress = XLSX.utils.encode_cell({r:R, c:3}); // العمود الرابع (المبالغ)
            const cell = ws[amountAddress];
            
            if (cell && typeof cell.v === 'number') {
                cell.t = 'n'; // نوع رقمي
                cell.z = '#,##0.00'; // تنسيق رقمي مع فواصل آلاف
            }
        }
        
        // تنسيق خلايا المجموع
        const summaryStartRow = range.e.r - (totalAmount > 0 ? 10 : 8); // بداية قسم الملخص
        
        // إجمالي المبلغ
        const totalAddress = XLSX.utils.encode_cell({r: summaryStartRow, c: 1});
        if (ws[totalAddress]) {
            ws[totalAddress].t = 'n';
            ws[totalAddress].z = '#,##0.00';
        }
        
        // المبلغ المسدد
        const paidAddress = XLSX.utils.encode_cell({r: summaryStartRow + 1, c: 1});
        if (ws[paidAddress]) {
            ws[paidAddress].t = 'n';
            ws[paidAddress].z = '#,##0.00';
        }
        
        // المبلغ غير المسدد
        const unpaidAddress = XLSX.utils.encode_cell({r: summaryStartRow + 2, c: 1});
        if (ws[unpaidAddress]) {
            ws[unpaidAddress].t = 'n';
            ws[unpaidAddress].z = '#,##0.00';
        }
        
        // متوسط المبلغ
        const averageAddress = XLSX.utils.encode_cell({r: summaryStartRow + 4, c: 1});
        if (ws[averageAddress] && !isNaN(parseFloat(averageAmount))) {
            ws[averageAddress].v = parseFloat(averageAmount);
            ws[averageAddress].t = 'n';
            ws[averageAddress].z = '#,##0.00';
        }
        
        // === إنشاء ملف Excel ===
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المصاريف المفلترة');
        
        // === حفظ الملف ===
        const fileName = `مصاريف_${project.name.replace(/[^\w\u0600-\u06FF]/g, '_')}_${getFilterFileNamePart(filterInfo)}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        window.firebaseConfig.showMessage('success', 
            `تم تصدير ${filteredExpenses.length} سجل إلى Excel بنجاح`);
        
        // إضافة console.log للتحقق
        console.log('✅ تم التصدير بنجاح');
        console.log('📊 عدد السجلات المصدرة:', filteredExpenses.length);
        console.log('🔍 معلومات التصفية:', filterInfo);
        console.log('💰 إجمالي المبلغ:', totalAmount);
        console.log('✅ المسدد:', paidCount, 'بمبلغ', paidAmount);
        console.log('⏳ غير المسدد:', unpaidCount, 'بمبلغ', unpaidAmount);
        
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        window.firebaseConfig.showMessage('error', 'تعذر تصدير البيانات: ' + error.message);
    }
}

// دالة للحصول على المصاريف المفلترة
function getFilteredExpenses() {
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const recipientFilter = document.getElementById('employeeFilter');
    const monthFilter = document.getElementById('monthFilter');
    const paymentStatusFilter = document.getElementById('paymentStatusFilter'); // أضف هذا
    
    const searchTerm = searchInput.value.toLowerCase();
    const type = typeFilter.value;
    const recipient = recipientFilter.value;
    const month = monthFilter.value;
    const paymentStatus = paymentStatusFilter.value; // أضف هذا
    
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

        // ⭐ أضف هذا: فلتر حالة التسديد
        const matchesPaymentStatus = !paymentStatus || 
            (expense.paymentStatus || 'paid') === paymentStatus;

        return matchesSearch && matchesType && matchesRecipient && matchesMonth && matchesPaymentStatus;
    });
}

// دالة تصدير تقرير المخول المفلتر إلى Excel
function exportFilteredRecipientReport() {
    console.log('زر التصدير للتقرير تم النقر عليه');
    
    const recipientName = document.getElementById('reportEmployeeFilter').value;
    const month = document.getElementById('reportMonthFilter').value;
    
    if (!recipientName) {
        window.firebaseConfig.showMessage('error', 'الرجاء اختيار مخول أولاً');
        return;
    }
    
    try {
        // الحصول على البيانات الأصلية من المتغيرات المحلية بدلاً من الجدول
        const recipientExpenses = getRecipientExpensesForCurrentReport();
        
        // التحقق من وجود بيانات
        if (!recipientExpenses || recipientExpenses.length === 0) {
            window.firebaseConfig.showMessage('warning', 'لا توجد بيانات في التقرير للتصدير');
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
        
        window.firebaseConfig.showMessage('success', 
            `تم تصدير ${recipientExpenses.length} معاملة إلى Excel بنجاح`);
        
    } catch (error) {
        console.error('خطأ في تصدير التقرير:', error);
        window.firebaseConfig.showMessage('error', 'تعذر تصدير التقرير: ' + error.message);
    }
}

// دالة مساعدة للحصول على مصاريف المخول للتقارير الحالية
function getRecipientExpensesForCurrentReport() {
    const recipientName = document.getElementById('reportEmployeeFilter').value;
    const month = document.getElementById('reportMonthFilter').value;
    
    if (!recipientName) return [];
    
    // تصفية المصاريف الأصلية بناءً على التصفية الحالية
    return expenses.filter(expense => {
        const matchesRecipient = expense.recipient === recipientName && normalizeFundSource(expense.fundSource) === 'advance';
        
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
        month: document.getElementById('monthFilter').value,
        paymentStatus: document.getElementById('paymentStatusFilter').value,
        fundSource: document.getElementById('fundSourceFilter') ? document.getElementById('fundSourceFilter').value : ''
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
    
    // ⭐ أضف هذا: حالة التسديد
    if (filterInfo.paymentStatus) {
        parts.push(filterInfo.paymentStatus === 'paid' ? 'مسدد' : 'غير_مسدد');
    }
    if (filterInfo.fundSource) {
        parts.push(filterInfo.fundSource === 'advance' ? 'من_سلفة' : 'من_الرصيد_العام');
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
    window.firebaseConfig.showMessage('error', 'الرجاء اختيار مشروع أولاً');
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
    const paymentStatusFilter = document.getElementById('paymentStatusFilter');
    const fundSourceFilter = document.getElementById('fundSourceFilter');

    function filterExpenses() {
        const searchTerm = (searchInput?.value || '').toLowerCase().trim();
        const type = typeFilter?.value || '';
        const recipient = recipientFilter?.value || '';
        const month = monthFilter?.value || '';
        const paymentStatus = paymentStatusFilter?.value || '';
        const fundSource = fundSourceFilter?.value || '';

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

            const matchesPaymentStatus = !paymentStatus || (expense.paymentStatus || 'paid') === paymentStatus;
            const matchesFundSource = !fundSource || normalizeFundSource(expense.fundSource) === fundSource;

            return matchesSearch && matchesType && matchesRecipient && matchesMonth && matchesPaymentStatus && matchesFundSource;
        });

        filtered.sort((a, b) => {
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
            return dateB - dateA;
        });

        filteredExpenses = filtered;
        displayExpenses(filtered);
        updateExpenseSummary();
    }

    searchInput?.addEventListener('input', filterExpenses);
    typeFilter?.addEventListener('change', filterExpenses);
    recipientFilter?.addEventListener('change', filterExpenses);
    monthFilter?.addEventListener('change', filterExpenses);
    paymentStatusFilter?.addEventListener('change', filterExpenses);
    fundSourceFilter?.addEventListener('change', filterExpenses);
}

// =========== تهيئة الصفحة ===========
document.addEventListener('DOMContentLoaded', async function() {
    console.log('جاري تحميل صفحة المصاريف...');
    
    try {
        await waitForFirebaseConfig();
        
        if (!window.firebaseConfig.projectManager.hasCurrentProject()) {
            redirectToProjects();
            return;
        }
        
        displayCurrentProjectInfo();
        await loadExpenses();
        setupSearchAndFilter();
        initImageUpload();
        
        // === إضافة event listeners ===
        
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

        const fundSourceEl = document.getElementById('fundSource');
        const advanceRecipientSelect = document.getElementById('advanceRecipientSelect');
        if (fundSourceEl) fundSourceEl.addEventListener('change', toggleFundSourceFields);
        if (advanceRecipientSelect) advanceRecipientSelect.addEventListener('change', handleAdvanceRecipientChange);
        toggleFundSourceFields();
        
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
        
        console.log('تم تحميل صفحة المصاريف بنجاح');
        
    } catch (error) {
        console.error('فشل في تحميل Firebase:', error);
        showErrorMessage('تعذر تحميل إعدادات النظام، يرجى تحديث الصفحة');
    }
});

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
