// contractors.js - ملف شامل لإدارة المقاولين

// متغيرات عامة - نستخدم window لتجنب مشاكل التعارض
window.contractors = {
    currentContractorId: null
};

// ===========================================
// دوال الحصول على Firebase
// ===========================================
async function getFirebaseInstance() {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK لم يتم تحميله');
        throw new Error('Firebase SDK لم يتم تحميله');
    }
    return firebase;
}

async function getFirestore() {
    try {
        const firebase = await getFirebaseInstance();
        
        // إذا لم يكن Firebase مهيئاً، قم بتهيئته
        if (firebase.apps.length === 0) {
            console.log('جاري تهيئة Firebase...');
            if (window.firebaseConfig && window.firebaseConfig.initializeFirebase) {
                window.firebaseConfig.initializeFirebase();
            }
            // انتظر قليلاً للتهيئة
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return firebase.firestore();
    } catch (error) {
        console.error('خطأ في الحصول على Firestore:', error);
        throw error;
    }
}

function getProjectManager() {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager) {
        console.error('مدير المشروع غير متوفر');
        throw new Error('مدير المشروع غير متوفر');
    }
    return window.firebaseConfig.projectManager;
}

function checkCurrentProject() {
    try {
        const projectManager = getProjectManager();
        if (!projectManager.hasCurrentProject()) {
            throw new Error('الرجاء اختيار مشروع أولاً');
        }
        return projectManager.getCurrentProject();
    } catch (error) {
        console.error('خطأ في التحقق من المشروع:', error);
        throw error;
    }
}

// ===========================================
// دوال المساعدة
// ===========================================
function showLoading(message) {
    try {
        if (window.appFunctions && window.appFunctions.showLoading) {
            window.appFunctions.showLoading(message);
        } else if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('info', message);
        } else {
            console.log('تحميل: ' + message);
        }
    } catch (error) {
        console.error('خطأ في إظهار التحميل:', error);
    }
}

function hideLoading() {
    try {
        if (window.appFunctions && window.appFunctions.hideLoading) {
            window.appFunctions.hideLoading();
        }
    } catch (error) {
        console.error('خطأ في إخفاء التحميل:', error);
    }
}

function showMessage(type, message) {
    try {
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage(type, message);
        } else {
            console.log(type + ': ' + message);
            alert(message);
        }
    } catch (error) {
        console.error('خطأ في إظهار الرسالة:', error);
        alert(message);
    }
}

function formatCurrency(amount) {
    try {
        if (window.firebaseConfig && window.firebaseConfig.formatCurrency) {
            return window.firebaseConfig.formatCurrency(amount);
        }
        return new Intl.NumberFormat('ar-IQ').format(amount || 0) + ' د.ع';
    } catch (error) {
        console.error('خطأ في تنسيق العملة:', error);
        return (amount || 0) + ' د.ع';
    }
}

// ===========================================
// دوال إدارة المقاولين
// ===========================================
async function loadContractors() {
    try {
        console.log('بدء تحميل المقاولين...');
        showLoading('جاري تحميل المقاولين...');
        
        const db = await getFirestore();
        const project = checkCurrentProject();
        const contractorsTableBody = document.getElementById('contractorsTableBody');
        const noContractorsMessage = document.getElementById('noContractorsMessage');
        
        if (!contractorsTableBody) {
            console.error('عنصر contractorsTableBody غير موجود');
            hideLoading();
            return;
        }
        
        contractorsTableBody.innerHTML = '';
        
        // جلب المقاولين
        const snapshot = await db.collection('projects').doc(project.id)
            .collection('contractors')
            .orderBy('createdAt', 'desc')
            .get();
        
        console.log('تم جلب ' + snapshot.size + ' مقاول');
        
        if (snapshot.empty) {
            console.log('لا توجد مقاولين');
            contractorsTableBody.style.display = 'none';
            if (noContractorsMessage) {
                noContractorsMessage.style.display = 'block';
            }
            hideLoading();
            return;
        }
        
        if (noContractorsMessage) {
            noContractorsMessage.style.display = 'none';
        }
        contractorsTableBody.style.display = 'table-row-group';
        
        let index = 1;
        snapshot.forEach(doc => {
            const contractor = doc.data();
            const contractorId = doc.id;
            
            const contractValue = parseFloat(contractor.contractValue) || 0;
            const paidAmount = parseFloat(contractor.paidAmount) || 0;
            const remaining = contractValue - paidAmount;
            
            // تحديد الحالة
            let statusBadge = '<span class="status-badge status-active">نشط</span>';
            if (contractor.contractStatus === 'completed') {
                statusBadge = '<span class="status-badge status-completed">مكتمل</span>';
            } else if (contractor.contractStatus === 'pending') {
                statusBadge = '<span class="status-badge status-pending">معلق</span>';
            } else if (contractor.contractStatus === 'cancelled') {
                statusBadge = '<span class="status-badge status-cancelled">ملغي</span>';
            }
            
            // تنسيق التاريخ
            let contractDate = '-';
            if (contractor.contractDate) {
                try {
                    const date = new Date(contractor.contractDate);
                    contractDate = date.toLocaleDateString('ar-IQ');
                } catch (e) {
                    console.error('خطأ في تنسيق التاريخ:', e);
                }
            }
            
            // إضافة الصف
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index}</td>
                <td>${contractor.name || '-'}</td>
                <td>${contractor.phone || '-'}</td>
                <td>${contractor.workType || '-'}</td>
                <td>${formatCurrency(contractValue)}</td>
                <td>${formatCurrency(paidAmount)}</td>
                <td>${formatCurrency(remaining)}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-icon btn-view" onclick="viewContractor('${contractorId}')" title="عرض التفاصيل">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" onclick="editContractor('${contractorId}')" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-payment" onclick="addPayment('${contractorId}')" title="إضافة دفعة">
                        <i class="fas fa-money-check-alt"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteContractor('${contractorId}')" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            contractorsTableBody.appendChild(row);
            index++;
        });
        
        hideLoading();
        await updateSummary();
        console.log('تم تحميل المقاولين بنجاح');
        
    } catch (error) {
        console.error('خطأ في تحميل المقاولين:', error);
        hideLoading();
        showMessage('error', 'تعذر تحميل المقاولين: ' + error.message);
    }
}

async function updateSummary() {
    try {
        const db = await getFirestore();
        const project = checkCurrentProject();
        
        const snapshot = await db.collection('projects').doc(project.id)
            .collection('contractors')
            .get();
        
        let totalContractors = 0;
        let totalContracts = 0;
        let totalPayments = 0;
        
        snapshot.forEach(doc => {
            const contractor = doc.data();
            totalContractors++;
            totalContracts += parseFloat(contractor.contractValue) || 0;
            totalPayments += parseFloat(contractor.paidAmount) || 0;
        });
        
        const remainingBalance = totalContracts - totalPayments;
        
        // تحديث الواجهة
        const totalContractorsEl = document.getElementById('total-contractors');
        const totalContractsEl = document.getElementById('total-contracts');
        const totalPaymentsEl = document.getElementById('total-payments');
        const remainingBalanceEl = document.getElementById('remaining-balance');
        
        if (totalContractorsEl) totalContractorsEl.textContent = totalContractors;
        if (totalContractsEl) totalContractsEl.textContent = formatCurrency(totalContracts);
        if (totalPaymentsEl) totalPaymentsEl.textContent = formatCurrency(totalPayments);
        if (remainingBalanceEl) remainingBalanceEl.textContent = formatCurrency(remainingBalance);
        
        console.log('تم تحديث الملخص:', { totalContractors, totalContracts, totalPayments, remainingBalance });
        
    } catch (error) {
        console.error('خطأ في تحديث الملخص:', error);
    }
}

// ===========================================
// دوال النماذج (Modals)
// ===========================================
function openAddContractorModal(contractorId = null) {
    try {
        const modal = document.getElementById('contractorModal');
        const modalTitle = document.getElementById('modalTitle');
        const submitBtn = document.getElementById('modalSubmitBtn');
        
        if (!modal || !modalTitle || !submitBtn) {
            showMessage('error', 'عناصر النموذج غير موجودة');
            return;
        }
        
        if (contractorId) {
            modalTitle.textContent = 'تعديل بيانات المقاول';
            submitBtn.textContent = 'تحديث';
            window.contractors.currentContractorId = contractorId;
            loadContractorData(contractorId);
        } else {
            modalTitle.textContent = 'إضافة مقاول جديد';
            submitBtn.textContent = 'حفظ';
            window.contractors.currentContractorId = null;
            
            const form = document.getElementById('contractorForm');
            if (form) form.reset();
            
            // تعيين تاريخ اليوم
            const today = new Date().toISOString().split('T')[0];
            const dateInput = document.getElementById('contractDate');
            if (dateInput) dateInput.value = today;
            
            const statusInput = document.getElementById('contractStatus');
            if (statusInput) statusInput.value = 'active';
        }
        
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('خطأ في فتح نموذج المقاول:', error);
        showMessage('error', 'تعذر فتح النموذج');
    }
}

function closeContractorModal() {
    try {
        const modal = document.getElementById('contractorModal');
        if (modal) {
            modal.style.display = 'none';
        }
        window.contractors.currentContractorId = null;
    } catch (error) {
        console.error('خطأ في إغلاق النموذج:', error);
    }
}

async function loadContractorData(contractorId) {
    try {
        showLoading('جاري تحميل البيانات...');
        
        const db = await getFirestore();
        const project = checkCurrentProject();
        
        const doc = await db.collection('projects').doc(project.id)
            .collection('contractors')
            .doc(contractorId)
            .get();
        
        if (doc.exists) {
            const contractor = doc.data();
            
            const contractorIdInput = document.getElementById('contractorId');
            const nameInput = document.getElementById('contractorName');
            const phoneInput = document.getElementById('contractorPhone');
            const workTypeInput = document.getElementById('workType');
            const dateInput = document.getElementById('contractDate');
            const valueInput = document.getElementById('contractValue');
            const descInput = document.getElementById('contractDescription');
            const statusInput = document.getElementById('contractStatus');
            
            if (contractorIdInput) contractorIdInput.value = contractorId;
            if (nameInput) nameInput.value = contractor.name || '';
            if (phoneInput) phoneInput.value = contractor.phone || '';
            if (workTypeInput) workTypeInput.value = contractor.workType || '';
            if (dateInput) dateInput.value = contractor.contractDate || '';
            if (valueInput) valueInput.value = contractor.contractValue || '';
            if (descInput) descInput.value = contractor.contractDescription || '';
            if (statusInput) statusInput.value = contractor.contractStatus || 'active';
        } else {
            showMessage('error', 'المقاول غير موجود');
        }
        
        hideLoading();
    } catch (error) {
        console.error('خطأ في تحميل بيانات المقاول:', error);
        hideLoading();
        showMessage('error', 'تعذر تحميل البيانات');
    }
}

async function saveContractor() {
    try {
        showLoading('جاري الحفظ...');
        
        const nameInput = document.getElementById('contractorName');
        const phoneInput = document.getElementById('contractorPhone');
        const valueInput = document.getElementById('contractValue');
        
        if (!nameInput || !phoneInput || !valueInput) {
            showMessage('error', 'الحقول المطلوبة غير موجودة');
            hideLoading();
            return;
        }
        
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const contractValue = valueInput.value;
        
        if (!name || !phone || !contractValue) {
            showMessage('error', 'الرجاء ملء جميع الحقول المطلوبة');
            hideLoading();
            return;
        }
        
        const db = await getFirestore();
        const project = checkCurrentProject();
        
        const contractorData = {
            name: name,
            phone: phone,
            workType: document.getElementById('workType')?.value.trim() || '',
            contractDate: document.getElementById('contractDate')?.value || '',
            contractValue: parseFloat(contractValue),
            contractDescription: document.getElementById('contractDescription')?.value.trim() || '',
            contractStatus: document.getElementById('contractStatus')?.value || 'active',
            paidAmount: 0,
            createdAt: window.contractors.currentContractorId ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (window.contractors.currentContractorId) {
            // تحديث المقاول الحالي
            await db.collection('projects').doc(project.id)
                .collection('contractors')
                .doc(window.contractors.currentContractorId)
                .update(contractorData);
            
            showMessage('success', 'تم تحديث المقاول بنجاح');
        } else {
            // إضافة مقاول جديد
            await db.collection('projects').doc(project.id)
                .collection('contractors')
                .add(contractorData);
            
            showMessage('success', 'تم إضافة المقاول بنجاح');
        }
        
        closeContractorModal();
        await loadContractors();
        
    } catch (error) {
        console.error('خطأ في حفظ المقاول:', error);
        hideLoading();
        showMessage('error', 'تعذر حفظ المقاول: ' + error.message);
    }
}

// ===========================================
// دوال الدفعات
// ===========================================
async function addPayment(contractorId, contractorName = '') {
    try {
        window.contractors.currentContractorId = contractorId;
        
        const modal = document.getElementById('paymentModal');
        if (!modal) {
            showMessage('error', 'لم يتم العثور على نموذج الدفعة');
            return;
        }
        
        // إذا لم يتم توفير الاسم، أحضره من قاعدة البيانات
        let name = contractorName;
        if (!name) {
            try {
                const db = await getFirestore();
                const project = checkCurrentProject();
                
                const doc = await db.collection('projects').doc(project.id)
                    .collection('contractors')
                    .doc(contractorId)
                    .get();
                
                if (doc.exists) {
                    name = doc.data().name || 'مقاول';
                }
            } catch (error) {
                console.error('خطأ في جلب اسم المقاول:', error);
                name = 'مقاول';
            }
        }
        
        // تعيين اسم المقاول
        const nameElement = document.getElementById('paymentContractorName');
        if (nameElement) nameElement.textContent = name;
        
        // تعيين معرّف المقاول
        const idInput = document.getElementById('paymentContractorId');
        if (idInput) idInput.value = contractorId;
        
        // تعيين تاريخ اليوم
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('paymentDate');
        if (dateInput) dateInput.value = today;
        
        // تحديث معلومات الرصيد
        await updateCurrentBalanceInfo();
        
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('خطأ في فتح نموذج الدفعة:', error);
        showMessage('error', 'تعذر فتح نموذج الدفعة');
    }
}

function closePaymentModal() {
    try {
        const modal = document.getElementById('paymentModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        const form = document.getElementById('paymentForm');
        if (form) {
            form.reset();
        }
        
        window.contractors.currentContractorId = null;
    } catch (error) {
        console.error('خطأ في إغلاق نموذج الدفعة:', error);
    }
}

async function updateCurrentBalanceInfo() {
    try {
        const balanceElement = document.getElementById('currentProjectBalanceInfo');
        if (!balanceElement) return;
        
        let balance = 0;
        if (window.appFunctions && window.appFunctions.calculateBalanceOnce) {
            balance = await window.appFunctions.calculateBalanceOnce();
        } else if (window.firebaseConfig && window.firebaseConfig.getCurrentProjectBalance) {
            balance = await window.firebaseConfig.getCurrentProjectBalance();
        }
        
        balanceElement.innerHTML = 
            `رصيد المشروع الحالي: <strong>${formatCurrency(balance)}</strong>`;
            
    } catch (error) {
        console.error('خطأ في تحديث معلومات الرصيد:', error);
        const balanceElement = document.getElementById('currentProjectBalanceInfo');
        if (balanceElement) {
            balanceElement.innerHTML = 'غير متوفر';
        }
    }
}

async function savePayment() {
    try {
        showLoading('جاري إضافة الدفعة...');
        
        const amountInput = document.getElementById('paymentAmount');
        const dateInput = document.getElementById('paymentDate');
        
        if (!amountInput || !dateInput) {
            showMessage('error', 'الحقول المطلوبة غير موجودة');
            hideLoading();
            return;
        }
        
        const amount = parseFloat(amountInput.value);
        const paymentDate = dateInput.value;
        
        if (!amount || amount <= 0) {
            showMessage('error', 'الرجاء إدخال مبلغ صحيح');
            hideLoading();
            return;
        }
        
        if (!window.contractors.currentContractorId) {
            showMessage('error', 'لم يتم تحديد مقاول');
            hideLoading();
            return;
        }
        
        // التحقق من رصيد المشروع
        let currentBalance = 0;
        if (window.appFunctions && window.appFunctions.calculateBalanceOnce) {
            currentBalance = await window.appFunctions.calculateBalanceOnce();
        } else if (window.firebaseConfig && window.firebaseConfig.getCurrentProjectBalance) {
            currentBalance = await window.firebaseConfig.getCurrentProjectBalance();
        }
        
        if (amount > currentBalance) {
            showMessage('error', 'المبلغ المطلوب أكبر من رصيد المشروع الحالي');
            hideLoading();
            return;
        }
        
        const db = await getFirestore();
        const project = checkCurrentProject();
        
        // بيانات الدفعة
        const paymentData = {
            contractorId: window.contractors.currentContractorId,
            amount: amount,
            paymentDate: paymentDate,
            paymentMethod: document.getElementById('paymentMethod')?.value || 'cash',
            paymentType: document.getElementById('paymentType')?.value || 'advance',
            description: document.getElementById('paymentDescription')?.value.trim() || '',
            createdAt: new Date().toISOString()
        };
        
        // 1. إضافة سجل الدفعة
        await db.collection('projects').doc(project.id)
            .collection('contractorPayments')
            .add(paymentData);
        
        // 2. تحديث المبلغ المدفوع للمقاول
        const contractorRef = db.collection('projects').doc(project.id)
            .collection('contractors')
            .doc(window.contractors.currentContractorId);
        
        const contractorDoc = await contractorRef.get();
        if (contractorDoc.exists) {
            const currentPaid = contractorDoc.data().paidAmount || 0;
            await contractorRef.update({
                paidAmount: currentPaid + amount,
                updatedAt: new Date().toISOString()
            });
        }
        
        // 3. تحديث رصيد المشروع
        if (window.firebaseConfig && window.firebaseConfig.calculateAccurateBalance) {
    await window.firebaseConfig.calculateAccurateBalance();
} else if (window.firebaseConfig && window.firebaseConfig.updateTotalBalance) {
    await window.firebaseConfig.updateTotalBalance();
}
        
        // 4. تحديث العرض
        if (window.appFunctions && window.appFunctions.updateBalanceDisplay) {
            window.appFunctions.updateBalanceDisplay(true);
        }
        
        showMessage('success', `تم إضافة دفعة بقيمة ${formatCurrency(amount)}`);
        closePaymentModal();
        
        // إعادة تحميل البيانات حسب الصفحة الحالية
        const currentPath = window.location.pathname;
        if (currentPath.includes('contractor-details.html')) {
            // إذا كنا في صفحة التفاصيل، أعد تحميل البيانات
            if (typeof window.reloadContractorDetails === 'function') {
                window.reloadContractorDetails();
            }
        } else {
            // إذا كنا في صفحة المقاولين الرئيسية
            await loadContractors();
        }
        
    } catch (error) {
        console.error('خطأ في إضافة الدفعة:', error);
        hideLoading();
        showMessage('error', 'تعذر إضافة الدفعة: ' + error.message);
    }
}

// ===========================================
// دوال أخرى
// ===========================================
function viewContractor(contractorId) {
    try {
        window.location.href = `contractor-details.html?id=${contractorId}`;
    } catch (error) {
        console.error('خطأ في عرض المقاول:', error);
        showMessage('error', 'تعذر عرض تفاصيل المقاول');
    }
}

function editContractor(contractorId) {
    try {
        openAddContractorModal(contractorId);
    } catch (error) {
        console.error('خطأ في تعديل المقاول:', error);
        showMessage('error', 'تعذر فتح نموذج التعديل');
    }
}

async function deleteContractor(contractorId) {
    try {
        if (!confirm('هل أنت متأكد من حذف هذا المقاول؟ سيتم حذف جميع الدفعات المسجلة له.')) {
            return;
        }
        
        showLoading('جاري الحذف...');
        
        const db = await getFirestore();
        const project = checkCurrentProject();
        
        // حذف جميع دفعات المقاول
        const paymentsSnapshot = await db.collection('projects').doc(project.id)
            .collection('contractorPayments')
            .where('contractorId', '==', contractorId)
            .get();
        
        const deletePromises = [];
        paymentsSnapshot.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });
        
        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
        }
        
        // حذف المقاول
        await db.collection('projects').doc(project.id)
            .collection('contractors')
            .doc(contractorId)
            .delete();
        
        showMessage('success', 'تم حذف المقاول بنجاح');
        await loadContractors();
        
    } catch (error) {
        console.error('خطأ في حذف المقاول:', error);
        hideLoading();
        showMessage('error', 'تعذر حذف المقاول');
    }
}

function searchContractors() {
    try {
        const searchInput = document.getElementById('searchContractor');
        if (!searchInput) return;
        
        const searchTerm = searchInput.value.toLowerCase();
        const rows = document.querySelectorAll('#contractorsTableBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    } catch (error) {
        console.error('خطأ في البحث:', error);
    }
}

// ===========================================
// دوال لصفحة التفاصيل (يتم استدعاؤها من contractor-details.html)
// ===========================================
window.reloadContractorDetails = async function() {
    try {
        // هذه الدالة سيتم تعريفها في contractor-details.html
        if (typeof window.loadContractorDetails === 'function') {
            await window.loadContractorDetails();
        }
        if (typeof window.loadContractorPayments === 'function') {
            await window.loadContractorPayments();
        }
    } catch (error) {
        console.error('خطأ في إعادة تحميل التفاصيل:', error);
    }
};

// ===========================================
// تهيئة الأحداث عند تحميل الصفحة
// ===========================================
document.addEventListener('DOMContentLoaded', function() {
    try {
        // إضافة أحداث للنماذج إذا كانت موجودة
        const contractorForm = document.getElementById('contractorForm');
        const paymentForm = document.getElementById('paymentForm');
        
        if (contractorForm) {
            contractorForm.addEventListener('submit', function(e) {
                e.preventDefault();
                saveContractor();
            });
        }
        
        if (paymentForm) {
            paymentForm.addEventListener('submit', function(e) {
                e.preventDefault();
                savePayment();
            });
        }
        
        console.log('تم تهيئة أحداث المقاولين بنجاح');
    } catch (error) {
        console.error('خطأ في تهيئة الأحداث:', error);
    }
});

// تصدير الدوال للاستخدام العالمي
window.contractorsModule = {
    loadContractors,
    updateSummary,
    openAddContractorModal,
    closeContractorModal,
    saveContractor,
    addPayment,
    closePaymentModal,
    savePayment,
    viewContractor,
    editContractor,
    deleteContractor,
    searchContractors,
    getFirestore,
    getProjectManager,
    checkCurrentProject,
    showMessage,
    formatCurrency
};