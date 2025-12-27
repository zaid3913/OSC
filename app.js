// تحديث التاريخ الحالي
function updateCurrentDate() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString('ar-IQ', options);
    }
}

// إظهار حالة التحميل
function showLoading(message = 'جاري تحميل البيانات...') {
    hideLoading();
    
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingMessage';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #3498db;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 500;
        font-size: 14px;
    `;
    
    loadingDiv.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(loadingDiv);
}

// إخفاء حالة التحميل
function hideLoading() {
    const loadingDiv = document.getElementById('loadingMessage');
    if (loadingDiv && loadingDiv.parentNode) {
        loadingDiv.parentNode.removeChild(loadingDiv);
    }
}

// التحقق من عناصر DOM قبل التحديث
function safeUpdateElement(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = content;
        return true;
    }
    return false;
}



async function calculateBalanceOnce() {
    try {
        if (!window.firebaseConfig || !window.firebaseConfig.db) {
            console.warn('Firebase not initialized yet');
            return 0;
        }
        
        const db = window.firebaseConfig.db;
        const projectManager = window.firebaseConfig.projectManager;
        
        if (!projectManager || !projectManager.hasCurrentProject()) {
            return 0;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        
        console.log('🔄 حساب الرصيد الحالي (يشمل دفعات المقاولين)...');
        
        // 1. أولاً: حاول الحصول على الرصيد المخزن في المشروع (أسرع)
        try {
            const projectDoc = await db.collection('projects').doc(projectId).get();
            if (projectDoc.exists) {
                const projectData = projectDoc.data();
                if (projectData.currentBalance !== undefined) {
                    console.log('📊 استخدم الرصيد المخزن:', projectData.currentBalance);
                    return projectData.currentBalance;
                }
            }
        } catch (error) {
            console.warn("خطأ في جلب الرصيد المخزن:", error);
        }
        
        // 2. إذا لم يوجد رصيد مخزن: احسب يدوياً من جميع المصادر
        let totalReceived = 0;    // الدفعات المستلمة
        let totalAdvances = 0;    // السلف المدفوعة (بعد الاسترداد)
        let totalExpenses = 0;    // المصاريف العامة
        let totalContractorPayments = 0; // دفعات المقاولين - هذا المهم!
        
        // حساب الدفعات المستلمة
        try {
            const receivedSnapshot = await db.collection('projects').doc(projectId)
                .collection('advances')
                .where('transactionType', '==', 'receive')
                .get();
            
            receivedSnapshot.forEach(doc => {
                const advance = doc.data();
                totalReceived += parseFloat(advance.amount) || 0;
            });
        } catch (error) {
            console.warn("خطأ في حساب الدفعات المستلمة:", error);
        }
        
        // حساب السلف المدفوعة (مع الاستردادات)
        try {
            const paidSnapshot = await db.collection('projects').doc(projectId)
                .collection('advances')
                .where('transactionType', '==', 'payment')
                .get();
            
            paidSnapshot.forEach(doc => {
                const advance = doc.data();
                const amount = parseFloat(advance.amount) || 0;
                const refunded = parseFloat(advance.refundedAmount) || 0;
                totalAdvances += (amount - refunded);
            });
        } catch (error) {
            console.warn("خطأ في حساب السلف المدفوعة:", error);
        }
        
        // حساب المصاريف العامة
        try {
            const expensesSnapshot = await db.collection('projects').doc(projectId)
                .collection('expenses')
                .get();
            
            expensesSnapshot.forEach(doc => {
                const expense = doc.data();
                totalExpenses += parseFloat(expense.amount) || 0;
            });
        } catch (error) {
            console.warn("خطأ في حساب المصاريف:", error);
        }
        
        // حساب دفعات المقاولين - هذا هو المهم المنسي!
        try {
            const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
                .collection('contractorPayments')
                .get();
            
            contractorPaymentsSnapshot.forEach(doc => {
                const payment = doc.data();
                totalContractorPayments += parseFloat(payment.amount) || 0;
            });
        } catch (error) {
            console.warn("خطأ في حساب دفعات المقاولين:", error);
        }
        
        // حساب الرصيد النهائي (يشمل كل شيء)
        const calculatedBalance = totalReceived - totalAdvances - totalExpenses - totalContractorPayments;
        
        console.log('✅ تم حساب الرصيد الكامل يدوياً:', {
            received: totalReceived,
            advances: totalAdvances,
            expenses: totalExpenses,
            contractorPayments: totalContractorPayments,
            balance: calculatedBalance
        });
        
        console.log('📝 المعادلة:', 
            totalReceived, '-', totalAdvances, '-', totalExpenses, '-', totalContractorPayments, 
            '=', calculatedBalance
        );
        
        return calculatedBalance;
        
    } catch (error) {
        console.error("❌ خطأ في حساب الرصيد:", error);
        return 0;
    }
}

// أضف هذه الدالة في app.js بعد calculateBalanceOnce:
async function debugBalanceCalculation() {
    console.log('========== فحص شامل لحساب الرصيد ==========');
    
    try {
        if (!window.firebaseConfig || !window.firebaseConfig.db) {
            console.log('Firebase غير مهيأ');
            return;
        }
        
        const db = window.firebaseConfig.db;
        const projectManager = window.firebaseConfig.projectManager;
        
        if (!projectManager || !projectManager.hasCurrentProject()) {
            console.log('لا يوجد مشروع محدد');
            return;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        
        // الحصول على الرصيد المخزن
        const projectDoc = await db.collection('projects').doc(projectId).get();
        const storedBalance = projectDoc.data().currentBalance || 0;
        console.log('الرصيد المخزن:', storedBalance);
        
        let totalReceived = 0;
        let totalAdvances = 0;
        let totalExpenses = 0;
        let totalContractorPayments = 0;
        
        // حساب الدفعات المستلمة
        const receivedSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'receive')
            .get();
        
        receivedSnapshot.forEach(doc => {
            const advance = doc.data();
            totalReceived += parseFloat(advance.amount) || 0;
        });
        console.log('🔵 الدفعات المستلمة:', totalReceived);
        
        // حساب السلف المدفوعة مع الاسترداد
        const paidSnapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .where('transactionType', '==', 'payment')
            .get();
        
        paidSnapshot.forEach(doc => {
            const advance = doc.data();
            const amount = parseFloat(advance.amount) || 0;
            const refunded = parseFloat(advance.refundedAmount) || 0;
            totalAdvances += (amount - refunded);
        });
        console.log('🔵 السلف المدفوعة:', totalAdvances);
        
        // حساب المصاريف
        const expensesSnapshot = await db.collection('projects').doc(projectId)
            .collection('expenses')
            .get();
        
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            totalExpenses += parseFloat(expense.amount) || 0;
        });
        console.log('🔵 المصاريف:', totalExpenses);
        
        // حساب دفعات المقاولين
        const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
            .collection('contractorPayments')
            .get();
        
        contractorPaymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            totalContractorPayments += parseFloat(payment.amount) || 0;
        });
        console.log('🔵 دفعات المقاولين:', totalContractorPayments);
        
        // الرصيد المحسوب
        const calculatedBalance = totalReceived - totalAdvances - totalExpenses - totalContractorPayments;
        console.log('🟢 الرصيد المحسوب:', calculatedBalance);
        console.log('📊 المعادلة:', totalReceived, '-', totalAdvances, '-', totalExpenses, '-', totalContractorPayments, '=', calculatedBalance);
        
        // مقارنة مع المخزن
        const difference = storedBalance - calculatedBalance;
        console.log('🔴 الفرق بين المخزن والمحسوب:', difference);
        
        if (Math.abs(difference) > 0.01) {
            console.warn('⚠️ هناك فرق! تحتاج إلى تصحيح');
            console.warn('المخزن:', storedBalance, 'المحسوب:', calculatedBalance);
            
            // تصحيح تلقائي
            await db.collection('projects').doc(projectId).update({
                currentBalance: calculatedBalance,
                balanceCorrectedAt: firebase.firestore.Timestamp.now(),
                debugInfo: {
                    totalReceived,
                    totalAdvances,
                    totalExpenses,
                    totalContractorPayments,
                    calculatedAt: new Date().toISOString()
                }
            });
            
            console.log('✅ تم تصحيح الرصيد في قاعدة البيانات');
        } else {
            console.log('✅ الرصيد صحيح');
        }
        
    } catch (error) {
        console.error('خطأ في فحص الرصيد:', error);
    }
}

// متغير لحفظ آخر مرة تم فيها تحديث الرصيد
let lastBalanceUpdate = 0;
const BALANCE_CACHE_TIME = 30000; // 30 ثانية كحد أقصى للتخزين المؤقت

// تحديث عرض الرصيد (مع التخزين المؤقت)
async function updateBalanceDisplay(force = false) {
    try {
        if (!window.firebaseConfig) return;
        
        // التحقق من الوقت المنقضي منذ آخر تحديث
        const now = Date.now();
        const timeSinceLastUpdate = now - lastBalanceUpdate;
        
        // إذا مر أقل من 30 ثانية ولا نريد فرض التحديث، لا تفعل شيئاً
        if (!force && timeSinceLastUpdate < BALANCE_CACHE_TIME) {
            console.log('استخدام البيانات المخزنة، مر:', timeSinceLastUpdate, 'مللي ثانية');
            return;
        }
        
        // الحصول على الرصيد الحالي (الآن سيشمل دفعات المقاولين)
        const currentBalance = await calculateBalanceOnce();
        lastBalanceUpdate = now; // تحديث وقت آخر تحديث
        
        const formatCurrency = window.firebaseConfig.formatCurrency || function(amount) {
            return new Intl.NumberFormat('ar-IQ').format(amount || 0) + ' د.ع';
        };
        
        // تحديث الرصيد في الصفحة الرئيسية
        const balanceElement = document.getElementById('currentBalance');
        if (balanceElement) {
            balanceElement.textContent = formatCurrency(currentBalance);
            
            // تلوين الرصيد حسب القيمة
            if (currentBalance > 0) {
                balanceElement.style.color = '#2ecc71';
                balanceElement.innerHTML = `➕ ${formatCurrency(currentBalance)}`;
            } else if (currentBalance < 0) {
                balanceElement.style.color = '#e74c3c';
                balanceElement.innerHTML = `➖ ${formatCurrency(Math.abs(currentBalance))}`;
            } else {
                balanceElement.style.color = '#f39c12';
                balanceElement.innerHTML = formatCurrency(currentBalance);
            }
        }
        
        console.log('✅ تم تحديث عرض الرصيد بنجاح:', currentBalance);
        
    } catch (error) {
        console.error("خطأ في تحديث عرض الرصيد:", error);
    }
}

// إعادة تعيين التخزين المؤقت عند تغيير المشروع
function setupProjectChangeListener() {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager) return;
    
    // استمع لتغييرات المشروع
    if (typeof window.firebaseConfig.projectManager.onProjectChange === 'function') {
        window.firebaseConfig.projectManager.onProjectChange(function() {
            console.log('تم تغيير المشروع، إعادة حساب الرصيد...');
            lastBalanceUpdate = 0; // إعادة تعيين التخزين المؤقت
            updateBalanceDisplay(true); // فرض التحديث
        });
    }
}

// تحميل الإحصائيات
async function loadStatistics() {
    try {
        showLoading('جاري تحميل البيانات...');
        
        // التحقق من تحميل Firebase
        if (!window.firebaseConfig || !window.firebaseConfig.db) {
            throw new Error('قاعدة البيانات غير متاحة');
        }
        
        const db = window.firebaseConfig.db;
        const formatCurrency = window.firebaseConfig.formatCurrency || function(amount) {
            return new Intl.NumberFormat('ar-IQ').format(amount || 0) + ' د.ع';
        };
        
        let employeesCount = 0;
        let totalReceivedAdvances = 0;
        let totalExpenses = 0;
        let totalContractorPayments = 0; // أضف هذا
        
        // حساب عدد الموظفين (إذا كان هناك مشروع محدد)
        const projectManager = window.firebaseConfig.projectManager;
        if (projectManager && projectManager.hasCurrentProject()) {
            try {
                const projectId = projectManager.getCurrentProject().id;
                
                // حساب عدد الموظفين
                const employeesSnapshot = await db.collection('projects').doc(projectId)
                    .collection('employees').get();
                employeesCount = employeesSnapshot.size;
                
                // حساب دفعات المقاولين
                const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
                    .collection('contractorPayments')
                    .get();
                
                contractorPaymentsSnapshot.forEach(doc => {
                    const payment = doc.data();
                    totalContractorPayments += parseFloat(payment.amount) || 0;
                });
                
            } catch (error) {
                console.warn("Could not load data:", error);
            }
        }
        
        // تحديث الرصيد (مرة واحدة عند التحميل)
        await updateBalanceDisplay(true);
        
        // حساب الإحصائيات الأخرى
        if (projectManager && projectManager.hasCurrentProject()) {
            const projectId = projectManager.getCurrentProject().id;
            
            // حساب الدفعات المستلمة
            try {
                const receivedSnapshot = await db.collection('projects').doc(projectId)
                    .collection('advances')
                    .where('transactionType', '==', 'receive')
                    .get();
                
                receivedSnapshot.forEach(doc => {
                    const advance = doc.data();
                    totalReceivedAdvances += parseFloat(advance.amount) || 0;
                });
            } catch (error) {
                console.warn("خطأ في حساب الدفعات المستلمة:", error);
            }
            
            // حساب المصاريف
            try {
                const expensesSnapshot = await db.collection('projects').doc(projectId)
                    .collection('expenses')
                    .get();
                
                expensesSnapshot.forEach(doc => {
                    const expense = doc.data();
                    totalExpenses += parseFloat(expense.amount) || 0;
                });
            } catch (error) {
                console.warn("خطأ في حساب المصاريف:", error);
            }
        }
        
        // تحديث واجهة المستخدم
        safeUpdateElement('employees-count', employeesCount);
        safeUpdateElement('total-advances', formatCurrency(totalReceivedAdvances));
        safeUpdateElement('total-expenses', formatCurrency(totalExpenses));
        
        // إضافة عرض دفعات المقاولين في الإحصائيات
        const contractorPaymentsElement = document.getElementById('contractor-payments');
        if (contractorPaymentsElement) {
            contractorPaymentsElement.textContent = formatCurrency(totalContractorPayments);
        } else {
            // إذا لم يكن العنصر موجوداً، أضفه
            const statsContainer = document.querySelector('.stats-container');
            if (statsContainer) {
                const contractorCard = document.createElement('div');
                contractorCard.className = 'stat-card';
                contractorCard.innerHTML = `
                    <div class="stat-icon">
                        <i class="fas fa-hard-hat"></i>
                    </div>
                    <div class="stat-content">
                        <h3>دفعات المقاولين</h3>
                        <p id="contractor-payments">${formatCurrency(totalContractorPayments)}</p>
                    </div>
                `;
                statsContainer.appendChild(contractorCard);
            }
        }
        
        hideLoading();
        
    } catch (error) {
        console.error("خطأ في تحميل الإحصائيات:", error);
        hideLoading();
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر تحميل الإحصائيات');
        }
        
        // تعيين القيم الافتراضية
        const formatCurrency = window.firebaseConfig?.formatCurrency || function(amount) {
            return new Intl.NumberFormat('ar-IQ').format(amount || 0) + ' د.ع';
        };
        
        safeUpdateElement('employees-count', '0');
        safeUpdateElement('total-advances', formatCurrency(0));
        safeUpdateElement('total-expenses', formatCurrency(0));
    }
}

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', function() {
    // تحديث التاريخ الحالي
    updateCurrentDate();
    
    // الانتظار لتحميل Firebase
    const checkFirebaseLoaded = setInterval(() => {
        if (window.firebaseConfig && window.firebaseConfig.db) {
            clearInterval(checkFirebaseLoaded);
            loadStatistics();
            setupProjectChangeListener();
        }
    }, 500);
    
    // تحديث التاريخ فقط كل دقيقة
    setInterval(updateCurrentDate, 60000);
    
    // تأثيرات تفاعلية للبطاقات
    const sectionCards = document.querySelectorAll('.section-card');
    sectionCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.08)';
        });
    });
});

// تصدير الدوال للاستخدام العالمي
window.appFunctions = {
    updateCurrentDate,
    showLoading,
    hideLoading,
    loadStatistics,
    updateBalanceDisplay,
    calculateBalanceOnce
};