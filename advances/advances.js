// قسم الدفعات والسلف مع نظام حساب الرصيد الصحيح
let advances = [];
let currentAdvanceId = null;
let selectedAdvanceForRefund = null;
let filteredAdvances = [];

// =========== دوال المساعدة ===========

// الانتظار حتى يتم تحميل Firebase Config
function waitForFirebaseConfig(maxAttempts = 30, interval = 100) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        function check() {
            attempts++;
            if (window.firebaseConfig && window.firebaseConfig.db) {
                console.log('✅ تم تحميل Firebase Config بنجاح');
                resolve(window.firebaseConfig);
            } else if (attempts >= maxAttempts) {
                reject(new Error('❌ Firebase Config لم يتم تحميله بعد'));
            } else {
                setTimeout(check, interval);
            }
        }
        
        check();
    });
}

// =========== دالة إعادة حساب الرصيد (المركزية) ===========

async function recalculateProjectBalance() {
    console.log('🔄 بدء إعادة حساب الرصيد...');
    
    try {
        if (!window.firebaseConfig) {
            console.error('❌ firebaseConfig غير متوفر');
            return 0;
        }
        
        const projectManager = window.firebaseConfig.projectManager;
        if (!projectManager || !projectManager.hasCurrentProject()) {
            console.error('❌ لا يوجد مشروع محدد');
            return 0;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        const db = window.firebaseConfig.db;
        
        console.log(`📁 المشروع: ${projectId}`);
        
        // 1. حساب جميع المصادر المالية
        let totalReceived = 0;      // الدفعات المستلمة (+)
        let totalAdvances = 0;      // السلف المدفوعة (-)
        let totalExpenses = 0;      // المصاريف (-)
        let totalContractorPayments = 0; // دفعات المقاولين (-)
        
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
            console.log(`✅ الدفعات المستلمة: ${totalReceived}`);
        } catch (error) {
            console.error('❌ خطأ في حساب الدفعات المستلمة:', error);
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
            console.log(`✅ السلف المدفوعة: ${totalAdvances}`);
        } catch (error) {
            console.error('❌ خطأ في حساب السلف المدفوعة:', error);
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
            console.log(`✅ المصاريف: ${totalExpenses}`);
        } catch (error) {
            console.error('❌ خطأ في حساب المصاريف:', error);
        }
        
        // حساب دفعات المقاولين - هذا هو الأهم!
        try {
            const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
                .collection('contractorPayments')
                .get();
            
            console.log(`📊 عدد دفعات المقاولين: ${contractorPaymentsSnapshot.size}`);
            
            if (contractorPaymentsSnapshot.size > 0) {
                contractorPaymentsSnapshot.forEach(doc => {
                    const payment = doc.data();
                    const amount = parseFloat(payment.amount) || 0;
                    totalContractorPayments += amount;
                    console.log(`   دفعة مقاول: ${amount} (${payment.contractorId || 'غير معروف'})`);
                });
            } else {
                console.log('ℹ️ لا توجد دفعات مقاولين مسجلة');
            }
            
            console.log(`✅ إجمالي دفعات المقاولين: ${totalContractorPayments}`);
        } catch (error) {
            console.error('❌ خطأ في حساب دفعات المقاولين:', error);
            console.log('📝 محاولة إنشاء المجموعة إذا لم تكن موجودة...');
        }
        
        // حساب الرصيد النهائي
        const calculatedBalance = totalReceived - totalAdvances - totalExpenses - totalContractorPayments;
        
        console.log('📊 ملخص الحساب:');
        console.log(`+ الدفعات المستلمة: ${totalReceived}`);
        console.log(`- السلف المدفوعة: ${totalAdvances}`);
        console.log(`- المصاريف: ${totalExpenses}`);
        console.log(`- دفعات المقاولين: ${totalContractorPayments}`);
        console.log(`= الرصيد النهائي: ${calculatedBalance}`);
        
        // 2. تحديث الرصيد في قاعدة البيانات
        try {
            await db.collection('projects').doc(projectId).update({
                currentBalance: calculatedBalance,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastRecalculation: new Date().toISOString()
            });
            
            console.log('✅ تم تحديث الرصيد في قاعدة البيانات');
        } catch (error) {
            console.error('❌ خطأ في تحديث قاعدة البيانات:', error);
        }
        
        // 3. تحديث عرض الرصيد
        updateBalanceDisplayImmediately(calculatedBalance);
        
        // 4. تحديث ملخص الرصيد
        updateBalanceSummary(totalReceived, totalAdvances, totalContractorPayments, totalExpenses);
        
        return calculatedBalance;
        
    } catch (error) {
        console.error('❌ خطأ في إعادة حساب الرصيد:', error);
        return 0;
    }
}

// =========== دالة تحديث عرض الرصيد فوراً ===========

function updateBalanceDisplayImmediately(balance) {
    console.log('🎨 تحديث عرض الرصيد فوراً:', balance);
    
    const currentBalanceEl = document.getElementById('currentBalanceAmount');
    if (!currentBalanceEl) {
        console.error('❌ عنصر currentBalanceAmount غير موجود');
        createBalanceDisplay();
        return;
    }
    
    const formatCurrency = window.firebaseConfig ? window.firebaseConfig.formatCurrency : 
        (amount) => new Intl.NumberFormat('ar-IQ').format(amount) + ' د.ع';
    
    let balanceHtml = '';
    let balanceColor = '#f39c12';
    
    if (balance > 0) {
        balanceColor = '#2ecc71';
        balanceHtml = `<span style="color: ${balanceColor}; font-size: 28px; font-weight: bold;">➕ ${formatCurrency(balance)}</span>`;
    } else if (balance < 0) {
        balanceColor = '#e74c3c';
        const absAmount = formatCurrency(Math.abs(balance));
        balanceHtml = `<span style="color: ${balanceColor}; font-size: 28px; font-weight: bold;">➖ ${absAmount}</span>`;
    } else {
        balanceHtml = `<span style="color: ${balanceColor}; font-size: 28px;">${formatCurrency(balance)}</span>`;
    }
    
    currentBalanceEl.innerHTML = balanceHtml;
    console.log('✅ تم تحديث عرض الرصيد');
}

// =========== إنشاء عرض الرصيد إذا لم يكن موجوداً ===========

function createBalanceDisplay() {
    console.log('🔧 جاري إنشاء عرض الرصيد...');
    
    const header = document.querySelector('.page-header');
    if (!header) {
        console.error('❌ عنصر page-header غير موجود');
        return;
    }
    
    // إنشاء عنصر الرصيد
    const balanceDiv = document.createElement('div');
    balanceDiv.id = 'balanceDisplay';
    balanceDiv.style.cssText = `
        background: #f8f9fa;
        border-radius: 8px;
        padding: 15px;
        margin: 10px 0;
        text-align: center;
        border: 1px solid #dee2e6;
    `;
    
    balanceDiv.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #495057;">
            <i class="fas fa-wallet"></i> رصيد المشروع الحالي
        </h3>
        <div id="currentBalanceAmount" style="
            font-size: 28px;
            font-weight: bold;
            color: #e74c3c;
        ">
            جاري التحميل...
        </div>
        <div style="margin-top: 10px; font-size: 14px; color: #6c757d;">
            <i class="fas fa-info-circle"></i> يشمل جميع الدفعات والسلف والمصاريف ودفعات المقاولين
        </div>
    `;
    
    header.parentNode.insertBefore(balanceDiv, header.nextSibling);
    console.log('✅ تم إنشاء عرض الرصيد');
}

// =========== دالة تحميل الدفعات والسلف ===========

async function loadAdvances() {
    console.log('🚀 بدء تحميل صفحة السلف');
    
    try {
        // 1. انتظار تحميل Firebase Config
        if (!window.firebaseConfig) {
            await waitForFirebaseConfig();
        }
        
        if (!window.firebaseConfig) {
            throw new Error('❌ فشل في تحميل Firebase Config');
        }
        
        // 2. التحقق من المشروع الحالي
        const projectManager = window.firebaseConfig.projectManager;
        if (!projectManager.hasCurrentProject()) {
            console.error('❌ لا يوجد مشروع محدد');
            redirectToProjects();
            return;
        }
        
        const project = projectManager.getCurrentProject();
        console.log(`📁 المشروع: ${project.name} (${project.id})`);
        
        // 3. إظهار حالة التحميل
        showLoading('جاري تحميل بيانات الدفعات والسلف...');
        
        const db = window.firebaseConfig.db;
        const projectId = project.id;
        
        // 4. إعادة حساب الرصيد أولاً
        console.log('🧮 إعادة حساب الرصيد الشامل...');
        const calculatedBalance = await recalculateProjectBalance();
        
        // 5. تحميل معاملات السلف
        console.log('📥 تحميل معاملات السلف...');
        const snapshot = await db.collection('projects').doc(projectId)
            .collection('advances')
            .orderBy('date', 'desc')
            .get();
        
        advances = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            advances.push({
                id: doc.id,
                ...data
            });
        });
        
        console.log(`✅ تم تحميل ${advances.length} معاملة`);
        
        // 6. عرض البيانات
        filteredAdvances = [...advances];
        displayAdvances(filteredAdvances);
        
        // 7. إخفاء التحميل
        hideLoading();
        
        console.log('✅ تم تحميل الصفحة بنجاح');
        
        // 8. تحديث نهائي بعد التأكد
        setTimeout(async () => {
            console.log('🔍 التحقق النهائي...');
            
            const projectDoc = await db.collection('projects').doc(projectId).get();
            const finalBalance = projectDoc.data().currentBalance || 0;
            console.log(`📊 الرصيد النهائي المخزن: ${finalBalance}`);
            
            if (window.firebaseConfig && window.firebaseConfig.showMessage) {
                window.firebaseConfig.showMessage('info', 
                    `الرصيد الحالي للمشروع: ${window.firebaseConfig.formatCurrency(finalBalance)}`);
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
        hideLoading();
        
        if (window.firebaseConfig && window.firebaseConfig.showMessage) {
            window.firebaseConfig.showMessage('error', 'تعذر تحميل بيانات الدفعات والسلف');
        }
        
        showErrorMessage(error.message || 'تعذر تحميل البيانات');
    }
}

// =========== تحديث ملخص الرصيد ===========

function updateBalanceSummary(totalReceived, totalAdvances, totalContractorPayments, totalExpenses) {
    console.log('📈 تحديث ملخص الرصيد...');
    
    if (!window.firebaseConfig) return;
    
    const formatCurrency = window.firebaseConfig.formatCurrency;
    
    // تحديث الدفعات المستلمة
    const totalReceivedEl = document.getElementById('totalReceivedAmount');
    if (totalReceivedEl && totalReceived !== undefined) {
        totalReceivedEl.textContent = formatCurrency(totalReceived);
    }
    
    // تحديث السلف المدفوعة
    const totalPaidEl = document.getElementById('totalPaidAmount');
    if (totalPaidEl && totalAdvances !== undefined) {
        totalPaidEl.textContent = formatCurrency(totalAdvances);
    }
    
    // تحديث دفعات المقاولين
    const contractorEl = document.getElementById('totalContractorPaymentsAmount');
    if (contractorEl && totalContractorPayments !== undefined) {
        contractorEl.textContent = formatCurrency(totalContractorPayments);
    }
    
    // تحديث المصاريف
    const expensesEl = document.getElementById('totalExpensesAmount');
    if (expensesEl && totalExpenses !== undefined) {
        expensesEl.textContent = formatCurrency(totalExpenses);
    }
}

// =========== دوال العرض ===========

// عرض الدفعات والسلف في الجدول
function displayAdvances(list) {
    const tbody = document.getElementById('advancesTableBody');
    if (!tbody) {
        console.error('❌ عنصر الجدول غير موجود');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 40px;">
                    <i class="fas fa-exchange-alt" style="font-size: 48px; color: #ccc; margin-bottom: 15px; display: block;"></i>
                    <p style="color: #666;">لا يوجد دفعات أو سلف مسجلة بعد</p>
                </td>
            </tr>
        `;
        return;
    }
    
    list.forEach((advance, index) => {
        const isReceive = advance.transactionType === 'receive';
        const isPayment = advance.transactionType === 'payment';
        
        let typeText = '';
        let name = '';
        let refunded = 0;
        let remaining = 0;
        let statusBadge = '';
        
        if (isReceive) {
            typeText = 'دفعة مستلمة';
            name = advance.name || '';
            statusBadge = `<span class="status-badge status-مستلمة">مستلمة</span>`;
        } else if (isPayment) {
            typeText = 'سلفة مدفوعة';
            name = advance.recipientName || '';
            refunded = parseFloat(advance.refundedAmount) || 0;
            remaining = parseFloat(advance.remainingAmount) || parseFloat(advance.amount);
            const refundStatus = advance.refundStatus || 'غير مسدد';
            statusBadge = `<span class="status-badge refund-${refundStatus}">${refundStatus}</span>`;
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${advance.transactionNumber || ''}</td>
            <td><span class="type-badge type-${advance.transactionType}">${typeText}</span></td>
            <td>${name || ''}</td>
            <td>${window.firebaseConfig.formatCurrency(advance.amount || 0)}</td>
            <td>${isPayment ? window.firebaseConfig.formatCurrency(refunded) : '-'}</td>
            <td>${isPayment ? window.firebaseConfig.formatCurrency(remaining) : '-'}</td>
            <td>${formatDate(advance.date)}</td>
            <td>${formatDate(advance.dueDate)}</td>
            <td>${statusBadge}</td>
            <td>${advance.notes || ''}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteAdvance('${advance.id}')">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =========== دوال النماذج ===========

// فتح نموذج إضافة دفعة مستلمة
function openReceivePaymentModal() {
    const today = new Date().toISOString().split('T')[0];
    const paymentNumber = generateTransactionNumber('RECEIVE');
    
    document.getElementById('receivePaymentNumber').value = paymentNumber;
    document.getElementById('receiveDate').value = today;
    document.getElementById('receiveAmount').value = '';
    document.getElementById('receivePaymentName').value = '';
    document.getElementById('receivePaymentType').value = '';
    document.getElementById('receiveLocation').value = '';
    document.getElementById('receiveDescription').value = '';
    document.getElementById('receiveNotes').value = '';
    
    document.getElementById('receivePaymentModal').style.display = 'flex';
}

// إغلاق نموذج دفعة مستلمة
function closeReceivePaymentModal() {
    document.getElementById('receivePaymentModal').style.display = 'none';
}

// فتح نموذج إضافة سلفة مدفوعة
function openPayAdvanceModal() {
    const today = new Date().toISOString().split('T')[0];
    const advanceNumber = generateTransactionNumber('ADVANCE');
    
    document.getElementById('payAdvanceNumber').value = advanceNumber;
    document.getElementById('payDate').value = today;
    document.getElementById('payAmount').value = '';
    document.getElementById('payRecipientName').value = '';
    document.getElementById('payAdvanceType').value = '';
    document.getElementById('dueDate').value = '';
    document.getElementById('paymentMethod').value = '';
    document.getElementById('paymentLocation').value = '';
    document.getElementById('payDescription').value = '';
    document.getElementById('payNotes').value = '';
    
    document.getElementById('payAdvanceModal').style.display = 'flex';
}

// إغلاق نموذج سلفة مدفوعة
function closePayAdvanceModal() {
    document.getElementById('payAdvanceModal').style.display = 'none';
}

// توليد رقم معاملة
function generateTransactionNumber(prefix) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${prefix}-${year}${month}${day}-${random}`;
}

// =========== دوال الإدارة ===========

// إضافة دفعة مستلمة
async function addReceivedPayment(paymentData) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        redirectToProjects();
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري إضافة الدفعة المستلمة...');
        
        if (paymentData.date) {
            paymentData.date = firebase.firestore.Timestamp.fromDate(new Date(paymentData.date));
        }
        
        paymentData.type = 'دفعة';
        paymentData.transactionType = 'receive';
        paymentData.status = 'مستلمة';
        paymentData.createdAt = firebase.firestore.Timestamp.now();
        paymentData.updatedAt = firebase.firestore.Timestamp.now();
        
        await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('advances')
            .add(paymentData);
        
        console.log('✅ تم إضافة دفعة مستلمة');
        
        // إعادة حساب الرصيد
        await recalculateProjectBalance();
        
        window.firebaseConfig.showMessage('success', 'تم إضافة الدفعة المستلمة بنجاح');
        closeReceivePaymentModal();
        loadAdvances();
        
    } catch (error) {
        console.error("❌ خطأ في إضافة الدفعة المستلمة:", error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر إضافة الدفعة المستلمة');
    }
}

// إضافة سلفة مدفوعة
async function addPaidAdvance(advanceData) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        redirectToProjects();
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري إضافة السلفة المدفوعة...');
        
        if (advanceData.date) {
            advanceData.date = firebase.firestore.Timestamp.fromDate(new Date(advanceData.date));
        }
        if (advanceData.dueDate) {
            advanceData.dueDate = firebase.firestore.Timestamp.fromDate(new Date(advanceData.dueDate));
        }
        
        advanceData.type = 'سلف';
        advanceData.transactionType = 'payment';
        advanceData.status = 'مدفوعة';
        advanceData.refundedAmount = 0;
        advanceData.remainingAmount = parseFloat(advanceData.amount);
        advanceData.refundStatus = 'غير مسدد';
        advanceData.refunds = [];
        advanceData.createdAt = firebase.firestore.Timestamp.now();
        advanceData.updatedAt = firebase.firestore.Timestamp.now();
        
        await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('advances')
            .add(advanceData);
        
        console.log('✅ تم إضافة سلفة مدفوعة');
        
        // إعادة حساب الرصيد
        await recalculateProjectBalance();
        
        window.firebaseConfig.showMessage('success', 'تم إضافة السلفة المدفوعة بنجاح');
        closePayAdvanceModal();
        loadAdvances();
        
    } catch (error) {
        console.error("❌ خطأ في إضافة السلفة المدفوعة:", error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر إضافة السلفة المدفوعة');
    }
}

// حذف معاملة
async function deleteAdvance(advanceId) {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return;
    }
    
    const advance = advances.find(a => a.id === advanceId);
    if (!advance) return;
    
    if (!confirm('هل أنت متأكد من حذف هذه العملية؟')) {
        return;
    }
    
    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    
    try {
        showLoading('جاري حذف العملية...');
        
        await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('advances')
            .doc(advanceId)
            .delete();
        
        console.log('✅ تم حذف العملية');
        
        // إعادة حساب الرصيد
        await recalculateProjectBalance();
        
        window.firebaseConfig.showMessage('success', 'تم حذف العملية وتعديل الرصيد بنجاح');
        loadAdvances();
        
    } catch (error) {
        console.error("❌ خطأ في حذف العملية:", error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر حذف العملية');
    }
}

// =========== دوال التصفية والبحث ===========

function setupSearchAndFilter() {
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const statusFilter = document.getElementById('statusFilter');
    const monthFilter = document.getElementById('monthFilter');

    function filterAdvances() {
        const searchTerm = searchInput.value.toLowerCase();
        const type = typeFilter.value;
        const status = statusFilter.value;
        const month = monthFilter.value;

        filteredAdvances = advances.filter(advance => {
            const matchesSearch = !searchTerm || 
                (advance.name && advance.name.toLowerCase().includes(searchTerm)) ||
                (advance.recipientName && advance.recipientName.toLowerCase().includes(searchTerm)) ||
                (advance.transactionNumber && advance.transactionNumber.toLowerCase().includes(searchTerm));
            
            let matchesType = !type;
            if (type === 'دفعة') {
                matchesType = advance.transactionType === 'receive';
            } else if (type === 'سلف') {
                matchesType = advance.transactionType === 'payment';
            }
            
            let matchesStatus = !status;
            if (status === 'مستلمة') {
                matchesStatus = advance.transactionType === 'receive';
            } else if (status === 'مدفوعة') {
                matchesStatus = advance.transactionType === 'payment' && advance.refundStatus !== 'مسدد بالكامل';
            } else if (status === 'مسدد بالكامل') {
                matchesStatus = advance.refundStatus === 'مسدد بالكامل';
            } else if (status === 'مسدد جزئياً') {
                matchesStatus = advance.refundStatus === 'مسدد جزئياً';
            } else if (status === 'غير مسدد') {
                matchesStatus = advance.refundStatus === 'غير مسدد';
            }
            
            let matchesMonth = true;
            if (month && advance.date) {
                const advanceDate = advance.date.toDate ? advance.date.toDate() : new Date(advance.date);
                const advanceYearMonth = `${advanceDate.getFullYear()}-${String(advanceDate.getMonth() + 1).padStart(2, '0')}`;
                matchesMonth = advanceYearMonth === month;
            }

            return matchesSearch && matchesType && matchesStatus && matchesMonth;
        });

        displayAdvances(filteredAdvances);
    }

    if (searchInput) searchInput.addEventListener('input', filterAdvances);
    if (typeFilter) typeFilter.addEventListener('change', filterAdvances);
    if (statusFilter) statusFilter.addEventListener('change', filterAdvances);
    if (monthFilter) monthFilter.addEventListener('change', filterAdvances);
}

// =========== دوال المساعدة العامة ===========

function showLoading(message = 'جاري التحميل...') {
    hideLoading();
    
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

function hideLoading() {
    const elements = document.querySelectorAll('.custom-loading');
    elements.forEach(el => el.remove());
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function redirectToProjects() {
    if (window.firebaseConfig && window.firebaseConfig.showMessage) {
        window.firebaseConfig.showMessage('error', 'الرجاء اختيار مشروع أولاً');
    }
    setTimeout(() => {
        window.location.href = '../projects/projects.html';
    }, 2000);
}

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
        <h3 style="margin: 0 0 10px 0;"><i class="fas fa-exclamation-triangle"></i> خطأ</h3>
        <p style="margin: 0 0 15px 0;">${message}</p>
        <button onclick="location.reload()" style="
            background: white;
            color: #e74c3c;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        ">
            إعادة تحميل الصفحة
        </button>
    `;
    document.body.appendChild(errorDiv);
}

// =========== معالجة النماذج ===========

async function handleReceivePaymentSubmit(e) {
    e.preventDefault();
    
    const paymentData = {
        transactionNumber: document.getElementById('receivePaymentNumber').value.trim(),
        type: document.getElementById('receivePaymentType').value,
        name: document.getElementById('receivePaymentName').value.trim(),
        amount: parseFloat(document.getElementById('receiveAmount').value) || 0,
        date: document.getElementById('receiveDate').value,
        location: document.getElementById('receiveLocation').value,
        description: document.getElementById('receiveDescription').value.trim(),
        notes: document.getElementById('receiveNotes').value.trim()
    };
    
    await addReceivedPayment(paymentData);
}

async function handlePayAdvanceSubmit(e) {
    e.preventDefault();
    
    const advanceData = {
        transactionNumber: document.getElementById('payAdvanceNumber').value.trim(),
        type: document.getElementById('payAdvanceType').value,
        recipientName: document.getElementById('payRecipientName').value.trim(),
        amount: parseFloat(document.getElementById('payAmount').value) || 0,
        date: document.getElementById('payDate').value,
        dueDate: document.getElementById('dueDate').value,
        paymentMethod: document.getElementById('paymentMethod').value,
        location: document.getElementById('paymentLocation').value,
        description: document.getElementById('payDescription').value.trim(),
        notes: document.getElementById('payNotes').value.trim()
    };
    
    await addPaidAdvance(advanceData);
}

// =========== تهيئة الصفحة ===========

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 بدء تحميل صفحة السلف...');
    
    try {
        // انتظار تحميل firebaseConfig
        if (!window.firebaseConfig) {
            console.log('⏳ انتظار تحميل firebaseConfig...');
            await waitForFirebaseConfig();
        }
        
        console.log('✅ firebaseConfig محمل بنجاح');
        
        // التحقق من المشروع
        if (!window.firebaseConfig.projectManager.hasCurrentProject()) {
            console.error('❌ لا يوجد مشروع محدد');
            redirectToProjects();
            return;
        }
        
        // تحميل البيانات
        await loadAdvances();
        
        // إعداد التصفية
        setupSearchAndFilter();
        
        // إعداد Event Listeners
        document.getElementById('addReceiveBtn').addEventListener('click', openReceivePaymentModal);
        document.getElementById('addPaymentBtn').addEventListener('click', openPayAdvanceModal);
        
        document.getElementById('closeReceiveModal').addEventListener('click', closeReceivePaymentModal);
        document.getElementById('cancelReceiveBtn').addEventListener('click', closeReceivePaymentModal);
        document.getElementById('closePayModal').addEventListener('click', closePayAdvanceModal);
        document.getElementById('cancelPayBtn').addEventListener('click', closePayAdvanceModal);
        
        document.getElementById('receivePaymentForm').addEventListener('submit', handleReceivePaymentSubmit);
        document.getElementById('payAdvanceForm').addEventListener('submit', handlePayAdvanceSubmit);
        
        console.log('✅ تم تحميل صفحة السلف بنجاح');
        
    } catch (error) {
        console.error('❌ خطأ في تحميل الصفحة:', error);
        showErrorMessage('تعذر تحميل الصفحة، يرجى المحاولة مرة أخرى');
    }
});

// =========== دوال التصحيح والاختبار ===========

// إنشاء دالة التصحيح في النطاق العالمي
window.debugAdvances = async function() {
    console.log('🧪 ========== بدء فحص صفحة السلف ==========');
    
    if (!window.firebaseConfig) {
        console.log('❌ firebaseConfig غير محمل');
        return;
    }
    
    try {
        const projectManager = window.firebaseConfig.projectManager;
        if (!projectManager.hasCurrentProject()) {
            console.log('❌ لا يوجد مشروع محدد');
            return;
        }
        
        const projectId = projectManager.getCurrentProject().id;
        const db = window.firebaseConfig.db;
        
        console.log(`📁 المشروع ID: ${projectId}`);
        
        // قراءة الرصيد الحالي
        const projectDoc = await db.collection('projects').doc(projectId).get();
        const storedBalance = projectDoc.data().currentBalance || 0;
        console.log(`💰 الرصيد المخزن حالياً: ${storedBalance}`);
        
        // عد دفعات المقاولين
        console.log('🔍 البحث عن دفعات المقاولين...');
        
        try {
            const contractorPaymentsSnapshot = await db.collection('projects').doc(projectId)
                .collection('contractorPayments')
                .get();
            
            console.log(`📊 عدد دفعات المقاولين: ${contractorPaymentsSnapshot.size}`);
            
            if (contractorPaymentsSnapshot.size === 0) {
                console.log('ℹ️ لم أجد أي دفعات مقاولين!');
            }
            
            let totalContractorPayments = 0;
            contractorPaymentsSnapshot.forEach(doc => {
                const payment = doc.data();
                const amount = parseFloat(payment.amount) || 0;
                totalContractorPayments += amount;
                console.log(`   دفعة ${doc.id}: ${amount} - المقاول: ${payment.contractorId || 'غير معروف'}`);
            });
            
            console.log(`🔢 إجمالي دفعات المقاولين: ${totalContractorPayments}`);
            
        } catch (error) {
            console.error('❌ خطأ في قراءة دفعات المقاولين:', error);
        }
        
        // استدعاء الدالة المركزية
        console.log('🎯 استدعاء الدالة المركزية...');
        const accurateBalance = await recalculateProjectBalance();
        console.log(`✅ الرصيد من الدالة المركزية: ${accurateBalance}`);
        
        console.log('✅ ========== انتهى الفحص ==========');
        
        return accurateBalance;
        
    } catch (error) {
        console.error('❌ خطأ في الفحص:', error);
        return null;
    }
};

// دالة اختبار بسيطة
window.quickTest = function() {
    console.log('🔧 اختبار سريع:');
    console.log('هل firebaseConfig محمل؟', !!window.firebaseConfig);
    
    if (window.firebaseConfig) {
        console.log('هل هناك مشروع محدد؟', window.firebaseConfig.projectManager.hasCurrentProject());
        
        if (window.firebaseConfig.projectManager.hasCurrentProject()) {
            const project = window.firebaseConfig.projectManager.getCurrentProject();
            console.log('المشروع:', project.name, 'ID:', project.id);
        }
    }
};

// إضافة زر التصحيح للصفحة
function addDebugButton() {
    if (document.getElementById('debugBtn')) return;
    
    const button = document.createElement('button');
    button.id = 'debugBtn';
    button.innerHTML = '🐛 تصحيح';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #e74c3c;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 9998;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        opacity: 0.8;
        transition: opacity 0.3s;
    `;
    
    button.onmouseover = () => button.style.opacity = '1';
    button.onmouseout = () => button.style.opacity = '0.8';
    
    button.onclick = async () => {
        console.log('🔍 بدء الفحص من الزر...');
        await window.debugAdvances();
    };
    
    document.body.appendChild(button);
}

// إضافة زر التصحيح بعد تحميل الصفحة
setTimeout(addDebugButton, 3000);

// اختبار تلقائي عند التحميل
setTimeout(async () => {
    console.log('🔧 تشغيل اختبار تلقائي...');
    if (window.firebaseConfig && window.firebaseConfig.projectManager.hasCurrentProject()) {
        await window.debugAdvances();
    } else {
        console.log('⏳ انتظار تحميل البيانات...');
    }
}, 2000);

// جعل الدوال متاحة من Console
window.recalculateProjectBalance = recalculateProjectBalance;
window.loadAdvances = loadAdvances;
window.updateBalanceDisplayImmediately = updateBalanceDisplayImmediately;

console.log('✅ advances.js محمل وجاهز!');