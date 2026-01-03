// firebase-config.js

// إعداد Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAn_j0i_-c2xmpDu1xQFbpSloWbm_T-6cs",
  authDomain: "test-ba6eb.firebaseapp.com",
  projectId: "test-ba6eb",
  storageBucket: "test-ba6eb.appspot.com",
  messagingSenderId: "1032465837780",
  appId: "1:1032465837780:web:e3b623abcd42712b215541"
};

// تهيئة Firebase إذا لم يكن مهيأ مسبقاً
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Authentication
const auth = firebase.auth();

// قاعدة البيانات
const db = firebase.firestore();

// إدارة المشروع الحالي
class ProjectManager {
    constructor() {
        this.currentProjectId = localStorage.getItem('currentProjectId');
        this.currentProjectName = localStorage.getItem('currentProjectName');
        this.projectChangeCallbacks = []; // مصفوفة للدوال المسجلة
    }

    setCurrentProject(projectId, projectName) {
        this.currentProjectId = projectId;
        this.currentProjectName = projectName;
        localStorage.setItem('currentProjectId', projectId);
        localStorage.setItem('currentProjectName', projectName);
        
        // إطلاق حدث تغيير المشروع
        this.triggerProjectChange();
    }

    getCurrentProject() {
        return {
            id: this.currentProjectId,
            name: this.currentProjectName
        };
    }

    hasCurrentProject() {
        return !!this.currentProjectId && !!this.currentProjectName;
    }

    clearCurrentProject() {
        this.currentProjectId = null;
        this.currentProjectName = null;
        localStorage.removeItem('currentProjectId');
        localStorage.removeItem('currentProjectName');
        
        // إطلاق حدث مسح المشروع
        this.triggerProjectChange();
    }
    
    // تسجيل دالة استماع
    onProjectChange(callback) {
        if (typeof callback === 'function') {
            this.projectChangeCallbacks.push(callback);
        }
    }
    
    // إطلاق حدث تغيير المشروع
    triggerProjectChange() {
        const project = this.getCurrentProject();
        this.projectChangeCallbacks.forEach(callback => {
            try {
                callback(project);
            } catch (error) {
                console.error('Error in project change callback:', error);
            }
        });
    }
}

const projectManager = new ProjectManager();

// دوال مساعدة
function formatCurrency(amount) {
    if (!amount) amount = 0;
    return new Intl.NumberFormat('ar-IQ', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount) + ' د.ع';
}

function showMessage(type, message) {
    const existing = document.querySelectorAll('.custom-message');
    existing.forEach(m => m.remove());

    const div = document.createElement('div');
    div.className = 'custom-message';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        color: white;
        font-weight: 500;
    `;

    let bg = '#3498db';
    let icon = 'info-circle';
    if (type === 'success') { bg = '#2ecc71'; icon = 'check-circle'; }
    if (type === 'error') { bg = '#e74c3c'; icon = 'exclamation-circle'; }

    div.style.backgroundColor = bg;
    div.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span> <button onclick="this.parentElement.remove()" style="background:none;border:none;color:white;cursor:pointer;"><i class="fas fa-times"></i></button>`;

    document.body.appendChild(div);
    setTimeout(() => div.remove(), type === 'error' ? 5000 : 3000);
}

// ============================================================
// دوال التوثيق (Authentication)
// ============================================================

// التحقق من حالة تسجيل الدخول
function checkAuth() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged((user) => {
            if (user) {
                resolve(user);
            } else {
                resolve(null);
            }
        }, reject);
    });
}

// تسجيل الخروج
async function logout() {
    try {
        await auth.signOut();
        // مسح بيانات المشروع المحلية
        projectManager.clearCurrentProject();
        // توجيه إلى صفحة تسجيل الدخول
        window.location.href = 'login.html';
    } catch (error) {
        console.error('خطأ في تسجيل الخروج:', error);
        showMessage('error', 'حدث خطأ أثناء تسجيل الخروج');
    }
}

// الحصول على معلومات المستخدم الحالي
function getCurrentUser() {
    return auth.currentUser;
}

// التحقق من صلاحيات المستخدم
async function checkUserPermissions() {
    const user = getCurrentUser();
    if (!user) return { hasAccess: false, role: 'guest' };
    
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            return { 
                hasAccess: true, 
                role: userData.role || 'user',
                email: user.email,
                name: userData.name || user.email.split('@')[0]
            };
        }
        
        // إذا لم يوجد مستخدم في قاعدة البيانات، إنشاؤه
        await db.collection('users').doc(user.uid).set({
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'user'
        }, { merge: true });
        
        return { 
            hasAccess: true, 
            role: 'user',
            email: user.email,
            name: user.email.split('@')[0]
        };
        
    } catch (error) {
        console.error('Error checking permissions:', error);
        return { hasAccess: false, role: 'guest' };
    }
}

// حماية الصفحات
async function protectPage() {
    const user = await checkAuth();
    if (!user) {
        window.location.href = 'login.html';
        return false;
    }
    
    const permissions = await checkUserPermissions();
    if (!permissions.hasAccess) {
        showMessage('error', 'ليس لديك صلاحية للوصول إلى هذه الصفحة');
        await logout();
        return false;
    }
    
    return permissions;
}

// ============================================================
// دوال الرصيد المركزية
// ============================================================

// دالة لحساب الرصيد الشامل من جميع المصادر
async function calculateTotalBalance() {
    try {
        if (!projectManager.hasCurrentProject()) {
            return 0;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        let balance = 0;
        
        // 1. الدفعات المستلمة من قسم الدفعات والسلف (تزيد الرصيد)
        const receivedSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'receive')
            .get();
        
        receivedSnapshot.forEach(doc => {
            const advance = doc.data();
            balance += parseFloat(advance.amount) || 0;
        });
        
        // 2. السلف المدفوعة من قسم الدفعات والسلف (تنقص الرصيد)
        const paidSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'payment')
            .get();
        
        paidSnapshot.forEach(doc => {
            const advance = doc.data();
            const amount = parseFloat(advance.amount) || 0;
            const refunded = parseFloat(advance.refundedAmount) || 0;
            balance -= amount; // ناقص المبلغ الأصلي
            balance += refunded; // زائد ما تم استرداده
        });
        
        // 3. دفعات المقاولين من قسم المقاولين (تنقص الرصيد)
        const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
            .collection('contractorPayments')
            .get();
        
        contractorPaymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            balance -= parseFloat(payment.amount) || 0;
        });
        
        // 4. المصاريف العامة من قسم المصاريف (تنقص الرصيد)
        const expensesSnapshot = await db.collection('projects').doc(projectId)
            .collection('expenses')
            .get();
        
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            balance -= parseFloat(expense.amount) || 0;
        });
        
        console.log('حساب الرصيد الشامل:', balance);
        return balance;
        
    } catch (error) {
        console.error('خطأ في حساب الرصيد الشامل:', error);
        return 0;
    }
}

// دالة لحساب الرصيد بدقة من جميع المصادر
async function calculateAccurateBalance() {
    try {
        if (!projectManager.hasCurrentProject()) {
            return 0;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        let balance = 0;
        
        console.log('========== بدء حساب الرصيد الدقيق ==========');
        
        // 1. الدفعات المستلمة (تزيد الرصيد)
        const receivedSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'receive')
            .get();
        
        let totalReceived = 0;
        receivedSnapshot.forEach(doc => {
            const advance = doc.data();
            const amount = parseFloat(advance.amount) || 0;
            totalReceived += amount;
        });
        console.log('إجمالي الدفعات المستلمة:', totalReceived);
        balance += totalReceived;
        
        // 2. السلف المدفوعة (تنقص الرصيد) مع مراعاة الاسترداد
        const paidSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'payment')
            .get();
        
        let totalPaid = 0;
        let totalRefunded = 0;
        paidSnapshot.forEach(doc => {
            const advance = doc.data();
            const amount = parseFloat(advance.amount) || 0;
            const refunded = parseFloat(advance.refundedAmount) || 0;
            
            totalPaid += amount;
            totalRefunded += refunded;
            
            // صافي السلفة = المبلغ الأصلي - ما تم استرداده
            const netAdvance = amount - refunded;
            balance -= netAdvance;
        });
        console.log('إجمالي السلف المدفوعة:', totalPaid);
        console.log('إجمالي المبالغ المستردة:', totalRefunded);
        
        // 3. دفعات المقاولين (تنقص الرصيد)
        const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
            .collection('contractorPayments')
            .get();
        
        let totalContractorPayments = 0;
        contractorPaymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            const amount = parseFloat(payment.amount) || 0;
            totalContractorPayments += amount;
            balance -= amount;
        });
        console.log('إجمالي دفعات المقاولين:', totalContractorPayments);
        
        // 4. المصاريف العامة (تنقص الرصيد)
        const expensesSnapshot = await db.collection('projects').doc(projectId)
            .collection('expenses')
            .get();
        
        let totalExpenses = 0;
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            // استبعاد دفعات المقاولين لأنها محسوبة في النقطة 3
            if (expense.category !== 'contractor_payments') {
                const amount = parseFloat(expense.amount) || 0;
                totalExpenses += amount;
                balance -= amount;
            }
        });
        console.log('إجمالي المصاريف العامة:', totalExpenses);
        
        console.log('========== النتائج ==========');
        console.log('الرصيد النهائي:', balance);
        console.log('ملخص الحساب:');
        console.log('+ الدفعات المستلمة:', totalReceived);
        console.log('- السلف المدفوعة:', totalPaid);
        console.log('+ المبالغ المستردة:', totalRefunded);
        console.log('- دفعات المقاولين:', totalContractorPayments);
        console.log('- المصاريف العامة:', totalExpenses);
        console.log('= الرصيد النهائي:', balance);
        
        // تحديث الرصيد في المشروع
        await db.collection('projects').doc(projectId).update({
            currentBalance: balance,
            lastBalanceCalculation: firebase.firestore.Timestamp.now(),
            balanceDetails: {
                totalReceived: totalReceived,
                totalPaid: totalPaid,
                totalRefunded: totalRefunded,
                totalContractorPayments: totalContractorPayments,
                totalExpenses: totalExpenses
            }
        });
        
        return balance;
        
    } catch (error) {
        console.error('خطأ في حساب الرصيد الدقيق:', error);
        return 0;
    }
}

// دالة لتحديث الرصيد في قاعدة البيانات بناءً على الحساب الشامل
async function updateTotalBalance() {
    try {
        if (!projectManager.hasCurrentProject()) {
            return;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        const totalBalance = await calculateTotalBalance();
        
        // تحديث الرصيد في المشروع
        await db.collection('projects').doc(projectId).update({
            currentBalance: totalBalance,
            updatedAt: firebase.firestore.Timestamp.now()
        });
        
        console.log('تم تحديث الرصيد الشامل إلى:', totalBalance);
        return totalBalance;
        
    } catch (error) {
        console.error('خطأ في تحديث الرصيد الشامل:', error);
        throw error;
    }
}

// دالة لإعادة حساب وتحديث الرصيد (للأغراض العامة)
async function recalculateAndUpdateBalance() {
    try {
        return await updateTotalBalance();
    } catch (error) {
        console.error('خطأ في إعادة حساب الرصيد:', error);
        return 0;
    }
}

// دالة للحصول على الرصيد الحالي
async function getCurrentProjectBalance() {
    if (!projectManager.hasCurrentProject()) {
        return 0;
    }
    
    try {
        const projectId = projectManager.getCurrentProject().id;
        const projectDoc = await db.collection('projects').doc(projectId).get();
        
        if (projectDoc.exists) {
            const projectData = projectDoc.data();
            return projectData.currentBalance || 0;
        }
        
        return 0;
    } catch (error) {
        console.error('Error getting project balance:', error);
        return 0;
    }
}

// دالة للتحقق من الرصيد قبل إجراء عملية
async function checkBalanceBeforeOperation(amount, operationType = 'decrease') {
    try {
        const currentBalance = await calculateTotalBalance();
        
        if (operationType === 'decrease' && amount > currentBalance) {
            return {
                hasEnoughBalance: false,
                currentBalance: currentBalance,
                requiredAmount: amount,
                deficit: amount - currentBalance
            };
        }
        
        return {
            hasEnoughBalance: true,
            currentBalance: currentBalance
        };
        
    } catch (error) {
        console.error('خطأ في التحقق من الرصيد:', error);
        return {
            hasEnoughBalance: false,
            error: error.message
        };
    }
}

// دالة لتحديث رصيد المشروع (مستمرة للتوافق مع الملفات الأخرى)
async function updateProjectBalance(amount, operation = 'set') {
    if (!projectManager.hasCurrentProject()) {
        console.warn('لا يوجد مشروع محدد لتحديث الرصيد');
        return null;
    }
    
    try {
        const projectId = projectManager.getCurrentProject().id;
        const projectRef = db.collection('projects').doc(projectId);
        
        // الحصول على المشروع الحالي
        const projectDoc = await projectRef.get();
        if (!projectDoc.exists) {
            console.error('المشروع غير موجود في قاعدة البيانات');
            return null;
        }
        
        const currentData = projectDoc.data();
        const currentBalance = currentData.currentBalance || 0;
        let newBalance = currentBalance;
        
        // حساب الرصيد الجديد
        if (operation === 'set') {
            newBalance = amount;
        } else if (operation === 'increase') {
            newBalance = currentBalance + parseFloat(amount);
        } else if (operation === 'decrease') {
            newBalance = currentBalance - parseFloat(amount);
        }
        
        // تحديث الرصيد في قاعدة البيانات
        await projectRef.update({
            currentBalance: newBalance,
            updatedAt: firebase.firestore.Timestamp.now()
        });
        
        console.log(`تم تحديث رصيد المشروع: ${currentBalance} -> ${newBalance}`);
        
        return newBalance;
        
    } catch (error) {
        console.error('خطأ في تحديث رصيد المشروع:', error);
        return null;
    }
}

// دالة لحساب الرصيد من السجلات القديمة (للتوافق)
async function calculateProjectBalance() {
    return await calculateTotalBalance();
}

// دالة لتحميل وتحديث الرصيد (للتوافق)
async function loadAndUpdateProjectBalance() {
    return await updateTotalBalance();
}

// دالة لتحديث إحصائيات المقاولين
async function updateContractorStats(contractorId, amount, operation = 'add') {
    if (!projectManager.hasCurrentProject()) {
        return;
    }
    
    try {
        const projectId = projectManager.getCurrentProject().id;
        const contractorRef = db.collection('projects').doc(projectId)
            .collection('contractors')
            .doc(contractorId);
        
        const contractorDoc = await contractorRef.get();
        if (!contractorDoc.exists) return;
        
        const currentData = contractorDoc.data();
        let newPaidAmount = currentData.paidAmount || 0;
        
        if (operation === 'add') {
            newPaidAmount += parseFloat(amount);
        } else if (operation === 'subtract') {
            newPaidAmount = Math.max(0, newPaidAmount - parseFloat(amount));
        }
        
        await contractorRef.update({
            paidAmount: newPaidAmount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`تم تحديث المبلغ المدفوع للمقاول: ${newPaidAmount}`);
        
        // تحديث الرصيد الشامل بعد تحديث دفعات المقاولين
        await updateTotalBalance();
        
    } catch (error) {
        console.error('خطأ في تحديث إحصائيات المقاول:', error);
    }
}

// دالة للتحقق من حساب الرصيد
async function verifyBalanceCalculation() {
    try {
        if (!projectManager.hasCurrentProject()) {
            return;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        
        console.log('========== تحقق من حساب الرصيد ==========');
        
        let totalReceived = 0;
        let totalPaid = 0;
        let totalRefunded = 0;
        let totalContractorPayments = 0;
        let totalExpenses = 0;
        
        // الدفعات المستلمة
        const receivedSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'receive')
            .get();
        
        receivedSnapshot.forEach(doc => {
            const advance = doc.data();
            totalReceived += parseFloat(advance.amount) || 0;
        });
        
        // السلف المدفوعة
        const paidSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'payment')
            .get();
        
        paidSnapshot.forEach(doc => {
            const advance = doc.data();
            const amount = parseFloat(advance.amount) || 0;
            const refunded = parseFloat(advance.refundedAmount) || 0;
            totalPaid += amount;
            totalRefunded += refunded;
        });
        
        // دفعات المقاولين
        const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
            .collection('contractorPayments')
            .get();
        
        contractorPaymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            totalContractorPayments += parseFloat(payment.amount) || 0;
        });
        
        // المصاريف
        const expensesSnapshot = await db.collection('projects').doc(projectId)
            .collection('expenses')
            .get();
        
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            totalExpenses += parseFloat(expense.amount) || 0;
        });
        
        const calculatedBalance = totalReceived - (totalPaid - totalRefunded) - totalExpenses - totalContractorPayments;
        
        console.log('🔢 الأرقام:');
        console.log('الدخل:', totalReceived);
        console.log('السلف المدفوعة:', totalPaid);
        console.log('المسترد:', totalRefunded);
        console.log('دفعات المقاولين:', totalContractorPayments);
        console.log('المصاريف:', totalExpenses);
        console.log('الرصيد المحسوب:', calculatedBalance);
        
        return {
            totalReceived,
            totalPaid,
            totalRefunded,
            totalContractorPayments,
            totalExpenses,
            calculatedBalance
        };
        
    } catch (error) {
        console.error('خطأ في التحقق:', error);
        return null;
    }
}

// دالة لإضافة زر فحص الرصيد
function addBalanceDebugButton() {
    if (document.getElementById('balanceDebugBtn')) return;
    
    const button = document.createElement('button');
    button.id = 'balanceDebugBtn';
    button.innerHTML = '🔍 فحص الرصيد';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #3498db;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 9998;
        font-size: 12px;
        opacity: 0.7;
        transition: opacity 0.3s;
    `;
    
    button.onmouseover = () => button.style.opacity = '1';
    button.onmouseout = () => button.style.opacity = '0.7';
    
    button.onclick = async () => {
        console.log('========== فحص الرصيد ==========');
        await verifyBalanceCalculation();
    };
    
    document.body.appendChild(button);
}

// إضافة زر تسجيل الخروج
function addLogoutButton() {
    if (document.getElementById('logoutBtn')) return;
    
    const button = document.createElement('button');
    button.id = 'logoutBtn';
    button.innerHTML = '🚪 تسجيل الخروج';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #e74c3c;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 9998;
        font-size: 12px;
        opacity: 0.7;
        transition: opacity 0.3s;
        font-family: 'Tajawal', sans-serif;
    `;
    
    button.onmouseover = () => button.style.opacity = '1';
    button.onmouseout = () => button.style.opacity = '0.7';
    
    button.onclick = async () => {
        if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
            await logout();
        }
    };
    
    document.body.appendChild(button);
}

// إضافة معلومات المستخدم
function addUserInfo(userData) {
    if (document.getElementById('userInfo')) return;
    
    const userInfo = document.createElement('div');
    userInfo.id = 'userInfo';
    userInfo.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: rgba(255, 255, 255, 0.9);
        padding: 10px 15px;
        border-radius: 5px;
        z-index: 9997;
        font-size: 12px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        font-family: 'Tajawal', sans-serif;
    `;
    
    userInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-user-circle" style="color: #3498db;"></i>
            <div>
                <div style="font-weight: bold; color: #2c3e50;">${userData.name}</div>
                <div style="font-size: 10px; color: #7f8c8d;">${userData.role === 'admin' ? 'مدير' : 'مستخدم'}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(userInfo);
}

// ============================================================
// تصدير متغيرات عامة للملفات الأخرى
// ============================================================

const firebaseConfigObject = { 
    db, 
    auth,
    projectManager, 
    showMessage, 
    formatCurrency,
    
    // دوال التوثيق
    checkAuth,
    logout,
    getCurrentUser,
    checkUserPermissions,
    protectPage,
    
    // الدوال الجديدة
    calculateAccurateBalance,
    calculateTotalBalance,
    updateTotalBalance,
    recalculateAndUpdateBalance,
    checkBalanceBeforeOperation,
    verifyBalanceCalculation,
    
    // الدوال القديمة (للتوافق مع الملفات الحالية)
    updateProjectBalance,
    calculateProjectBalance,
    loadAndUpdateProjectBalance,
    getCurrentProjectBalance,
    updateContractorStats,
    
    // دوال واجهة المستخدم
    addBalanceDebugButton,
    addLogoutButton,
    addUserInfo
};

window.firebaseConfig = firebaseConfigObject;

// التحقق من التوثيق عند تحميل الملف
(async function() {
    try {
        const user = await checkAuth();
        if (user) {
            console.log('المستخدم مسجل الدخول:', user.email);
            const permissions = await checkUserPermissions();
            
            // إضافة أزرار التحكم بعد تحميل الصفحة
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        addBalanceDebugButton();
                        addLogoutButton();
                        addUserInfo(permissions);
                    }, 2000);
                });
            } else {
                setTimeout(() => {
                    addBalanceDebugButton();
                    addLogoutButton();
                    addUserInfo(permissions);
                }, 2000);
            }
        } else {
            console.log('المستخدم غير مسجل الدخول');
            // توجيه إلى صفحة تسجيل الدخول إذا لم تكن عليها
            if (!window.location.href.includes('login.html')) {
                window.location.href = 'login.html';
            }
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
})();
