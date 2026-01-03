// === employees-firebase.js ===

// متغيرات عالمية (لا تعيد تعريف db هنا، استخدم المتغيرات من firebase-config)
let employees = [];
let currentEmployeeId = null;
let deleteEmployeeId = null;

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

// تهيئة التطبيق - بدون تعريف db من جديد
async function initializeApp() {
    try {
        console.log('جاري تهيئة Firebase...');
        const config = await waitForFirebaseConfig();
        
        // استخدم المتغيرات مباشرة من window.firebaseConfig
        // لا تعيد تعريفها
        console.log('تم تهيئة Firebase بنجاح');
        return true;
    } catch (error) {
        console.error('فشل في تهيئة Firebase:', error);
        showErrorMessage('تعذر تحميل إعدادات النظام، يرجى تحديث الصفحة');
        return false;
    }
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
        <button onclick="window.location.href='../index.html'" style="
            background: transparent;
            color: white;
            border: 1px solid white;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
        ">
            <i class="fas fa-home"></i> العودة للرئيسية
        </button>
    `;
    document.body.appendChild(errorDiv);
}

// === دوال CRUD الموظفين ===

// تحميل الموظفين
async function loadEmployees() {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        redirectToProjects();
        return;
    }

    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
    showLoading('جاري تحميل بيانات الموظفين...');

    try {
        const snapshot = await window.firebaseConfig.db.collection('projects')
            .doc(projectId)
            .collection('employees')
            .orderBy('createdAt', 'desc')
            .get();

        employees = [];
        snapshot.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });

        displayEmployees(employees);
        hideLoading();
    } catch (error) {
        console.error('خطأ في تحميل الموظفين:', error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'تعذر تحميل بيانات الموظفين');
    }
}

// عرض الموظفين في الجدول
function displayEmployees(list) {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px;">
                    <i class="fas fa-users" style="font-size: 48px; color: #ccc; margin-bottom: 15px; display: block;"></i>
                    <p style="color: #666;">لا يوجد موظفين مضافين بعد</p>
                </td>
            </tr>
        `;
        return;
    }

    list.forEach((emp, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${emp.name || ''}</td>
            <td>${emp.position || ''}</td>
            <td><span class="dept-badge dept-${emp.department || 'أخرى'}">${emp.department || ''}</span></td>
            <td>${window.firebaseConfig.formatCurrency(emp.salary || 0)}</td>
            <td>${emp.phone || ''}</td>
            <td>${window.firebaseConfig.formatCurrency(emp.bonuses || 0)}</td>
            <td>${window.firebaseConfig.formatCurrency(emp.violations || 0)}</td>
            <td><span class="status-badge status-${emp.status === 'نشط' ? 'active' : 'inactive'}">${emp.status || 'نشط'}</span></td>
            <td>
                <button class="btn btn-info" onclick="openEditEmployeeModal('${emp.id}')">
                    <i class="fas fa-edit"></i> تعديل
                </button>
                <button class="btn btn-danger" onclick="openDeleteEmployeeModal('${emp.id}')">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// فتح نموذج إضافة موظف
function openAddEmployeeModal() {
    currentEmployeeId = null;
    document.getElementById('modalTitle').textContent = 'إضافة موظف جديد';
    document.getElementById('employeeForm').reset();
    
    // تعيين التاريخ الحالي كتاريخ افتراضي للتعيين
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('employeeHireDate').value = today;
    
    document.getElementById('employeeModal').style.display = 'flex';
}

// فتح نموذج تعديل موظف
function openEditEmployeeModal(empId) {
    currentEmployeeId = empId;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    document.getElementById('modalTitle').textContent = 'تعديل بيانات الموظف';
    document.getElementById('employeeName').value = emp.name || '';
    document.getElementById('employeePosition').value = emp.position || '';
    document.getElementById('employeeDepartment').value = emp.department || '';
    document.getElementById('employeeSalary').value = emp.salary || 0;
    document.getElementById('employeePhone').value = emp.phone || '';
    document.getElementById('employeeAddress').value = emp.address || '';
    document.getElementById('employeeBonuses').value = emp.bonuses || 0;
    document.getElementById('employeeViolations').value = emp.violations || 0;
    document.getElementById('employeeStatus').value = emp.status || 'نشط';
    
    if (emp.hireDate && emp.hireDate.toDate) {
        const hireDate = emp.hireDate.toDate();
        document.getElementById('employeeHireDate').value = hireDate.toISOString().split('T')[0];
    } else if (emp.hireDate) {
        document.getElementById('employeeHireDate').value = emp.hireDate;
    }
    
    document.getElementById('employeeNotes').value = emp.notes || '';
    document.getElementById('employeeModal').style.display = 'flex';
}

// إغلاق النموذج
function closeEmployeeModal() {
    document.getElementById('employeeModal').style.display = 'none';
    currentEmployeeId = null;
}

// إضافة أو تحديث موظف
async function saveEmployee(e) {
    e.preventDefault();
    
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        redirectToProjects();
        return;
    }

    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;

    const data = {
        name: document.getElementById('employeeName').value.trim(),
        position: document.getElementById('employeePosition').value.trim(),
        department: document.getElementById('employeeDepartment').value,
        salary: parseFloat(document.getElementById('employeeSalary').value) || 0,
        phone: document.getElementById('employeePhone').value.trim(),
        address: document.getElementById('employeeAddress').value.trim(),
        bonuses: parseFloat(document.getElementById('employeeBonuses').value) || 0,
        violations: parseFloat(document.getElementById('employeeViolations').value) || 0,
        status: document.getElementById('employeeStatus').value,
        notes: document.getElementById('employeeNotes').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // التعامل مع تاريخ التعيين
    const hireDateInput = document.getElementById('employeeHireDate').value;
    if (hireDateInput) {
        data.hireDate = firebase.firestore.Timestamp.fromDate(new Date(hireDateInput));
    }

    try {
        if (currentEmployeeId) {
            // تحديث
            await window.firebaseConfig.db.collection('projects').doc(projectId)
                .collection('employees')
                .doc(currentEmployeeId)
                .update(data);
            window.firebaseConfig.showMessage('success', 'تم تحديث بيانات الموظف بنجاح');
        } else {
            // إضافة جديد
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await window.firebaseConfig.db.collection('projects').doc(projectId)
                .collection('employees')
                .add(data);
            window.firebaseConfig.showMessage('success', 'تم إضافة الموظف بنجاح');
        }

        closeEmployeeModal();
        loadEmployees();
    } catch (error) {
        console.error('خطأ في حفظ الموظف:', error);
        window.firebaseConfig.showMessage('error', 'تعذر حفظ بيانات الموظف');
    }
}

// فتح نافذة تأكيد الحذف
function openDeleteEmployeeModal(empId) {
    deleteEmployeeId = empId;
    document.getElementById('deleteModal').style.display = 'flex';
}

// إغلاق نافذة الحذف
function closeDeleteEmployeeModal() {
    deleteEmployeeId = null;
    document.getElementById('deleteModal').style.display = 'none';
}

// تأكيد حذف الموظف
async function confirmDeleteEmployee() {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject() || !deleteEmployeeId) return;

    const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;

    try {
        await window.firebaseConfig.db.collection('projects').doc(projectId)
            .collection('employees')
            .doc(deleteEmployeeId)
            .delete();
        window.firebaseConfig.showMessage('success', 'تم حذف الموظف بنجاح');
        closeDeleteEmployeeModal();
        loadEmployees();
    } catch (error) {
        console.error('خطأ في حذف الموظف:', error);
        window.firebaseConfig.showMessage('error', 'تعذر حذف الموظف');
    }
}

// إعادة التوجيه للمشاريع
function redirectToProjects() {
    window.firebaseConfig.showMessage('error', 'الرجاء اختيار مشروع أولاً');
    setTimeout(() => window.location.href = '../projects/projects.html', 2000);
}

// عرض المشروع الحالي
function displayCurrentProjectInfo() {
    if (!window.firebaseConfig) return;
    
    const currentProject = window.firebaseConfig.projectManager.getCurrentProject();
    const projectInfoElement = document.getElementById('currentProjectInfo');

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

// دوال التحميل
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

function hideLoading() {
    const elements = document.querySelectorAll('.custom-loading');
    elements.forEach(el => el.remove());
}

// إضافة event listeners للبحث والتصفية
function setupSearchAndFilter() {
    const searchInput = document.getElementById('searchInput');
    const departmentFilter = document.getElementById('departmentFilter');
    const statusFilter = document.getElementById('statusFilter');

    function filterEmployees() {
        const searchTerm = searchInput.value.toLowerCase();
        const department = departmentFilter.value;
        const status = statusFilter.value;

        const filtered = employees.filter(emp => {
            const matchesSearch = !searchTerm || 
                (emp.name && emp.name.toLowerCase().includes(searchTerm)) ||
                (emp.position && emp.position.toLowerCase().includes(searchTerm));
            
            const matchesDept = !department || emp.department === department;
            const matchesStatus = !status || emp.status === status;

            return matchesSearch && matchesDept && matchesStatus;
        });

        displayEmployees(filtered);
    }

    if (searchInput) searchInput.addEventListener('input', filterEmployees);
    if (departmentFilter) departmentFilter.addEventListener('change', filterEmployees);
    if (statusFilter) statusFilter.addEventListener('change', filterEmployees);
}

// === دوال تصدير إلى Excel ===

// دالة لتنزيل ملف Excel
function downloadExcel(data, filename = 'الموظفين.xlsx') {
    // إنشاء عنصر <a> مخفي للتنزيل
    const link = document.createElement('a');
    link.href = data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// دالة لتحويل البيانات إلى تنسيق Excel (CSV)
function exportToExcel() {
    // الحصول على البيانات المعروضة حالياً (المفلترة)
    const table = document.getElementById('employeesTable');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    
    // إذا لم تكن هناك بيانات
    if (rows.length === 0 || rows[0].querySelector('td').colSpan === "10") {
        window.firebaseConfig.showMessage('error', 'لا توجد بيانات للتصدير');
        return;
    }

    showLoading('جاري تحضير ملف Excel...');

    try {
        // تحضير رؤوس الأعمدة
        const headers = [];
        const headerCells = table.querySelectorAll('thead th');
        headerCells.forEach((cell, index) => {
            if (index < headerCells.length - 1) { // استبعاد عمود الإجراءات
                headers.push(cell.textContent.trim());
            }
        });

        // تحضير البيانات
        const data = [];
        
        // إضافة رؤوس الأعمدة
        data.push(headers);
        
        // إضافة صفوف البيانات
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const rowData = [];
            
            cells.forEach((cell, index) => {
                if (index < cells.length - 1) { // استبعاد عمود الإجراءات
                    // الحصول على النص الحقيقي بدون تنسيق HTML
                    let cellText = cell.textContent.trim();
                    
                    // إذا كان هناك عناصر span (مثل الحالة والقسم)
                    const span = cell.querySelector('span');
                    if (span) {
                        cellText = span.textContent.trim();
                    }
                    
                    rowData.push(cellText);
                }
            });
            
            data.push(rowData);
        });

        // إنشاء محتوى CSV
        let csvContent = '\uFEFF'; // BOM للتعامل مع اللغة العربية
        
        data.forEach(row => {
            const formattedRow = row.map(cell => {
                // معالجة النصوص التي تحتوي على فواصل
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',');
            
            csvContent += formattedRow + '\r\n';
        });

        // إنشاء blob وتنزيل الملف
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        // تسمية الملف بالمشروع الحالي
        const projectName = window.firebaseConfig.projectManager.getCurrentProject().name;
        const date = new Date().toISOString().split('T')[0];
        const filename = `موظفين_${projectName}_${date}.csv`;
        
        downloadExcel(url, filename);
        URL.revokeObjectURL(url);
        
        hideLoading();
        window.firebaseConfig.showMessage('success', 'تم تصدير البيانات بنجاح');
        
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'حدث خطأ أثناء التصدير');
    }
}

// دالة لتصدير البيانات الأصلية (غير المفلترة) من Firebase
async function exportAllEmployeesToExcel() {
    if (!window.firebaseConfig || !window.firebaseConfig.projectManager.hasCurrentProject()) {
        return;
    }

    showLoading('جاري تحضير جميع بيانات الموظفين...');

    try {
        const projectId = window.firebaseConfig.projectManager.getCurrentProject().id;
        
        // جلب جميع الموظفين من Firebase
        const snapshot = await window.firebaseConfig.db.collection('projects')
            .doc(projectId)
            .collection('employees')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            hideLoading();
            window.firebaseConfig.showMessage('error', 'لا توجد بيانات للتصدير');
            return;
        }

        // تحضير رؤوس الأعمدة
        const headers = [
            'اسم الموظف',
            'الوظيفة',
            'القسم',
            'الراتب (دينار عراقي)',
            'رقم الهاتف',
            'المكافآت (دينار عراقي)',
            'المخالفات (دينار عراقي)',
            'الحالة',
            'تاريخ التعيين',
            'العنوان',
            'ملاحظات'
        ];

        // تحضير البيانات
        const data = [headers];
        
        snapshot.forEach(doc => {
            const emp = doc.data();
            
            const rowData = [
                emp.name || '',
                emp.position || '',
                emp.department || '',
                window.firebaseConfig.formatCurrency(emp.salary || 0),
                emp.phone || '',
                window.firebaseConfig.formatCurrency(emp.bonuses || 0),
                window.firebaseConfig.formatCurrency(emp.violations || 0),
                emp.status || 'نشط',
                emp.hireDate ? (emp.hireDate.toDate ? emp.hireDate.toDate().toLocaleDateString('ar-IQ') : emp.hireDate) : '',
                emp.address || '',
                emp.notes || ''
            ];
            
            data.push(rowData);
        });

        // إنشاء محتوى CSV
        let csvContent = '\uFEFF'; // BOM للتعامل مع اللغة العربية
        
        data.forEach(row => {
            const formattedRow = row.map(cell => {
                if (cell === null || cell === undefined) cell = '';
                const cellStr = String(cell);
                
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',');
            
            csvContent += formattedRow + '\r\n';
        });

        // إنشاء blob وتنزيل الملف
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        // تسمية الملف بالمشروع الحالي
        const projectName = window.firebaseConfig.projectManager.getCurrentProject().name;
        const date = new Date().toISOString().split('T')[0];
        const filename = `جميع_موظفين_${projectName}_${date}.csv`;
        
        downloadExcel(url, filename);
        URL.revokeObjectURL(url);
        
        hideLoading();
        window.firebaseConfig.showMessage('success', 'تم تصدير جميع البيانات بنجاح');
        
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        hideLoading();
        window.firebaseConfig.showMessage('error', 'حدث خطأ أثناء التصدير');
    }
}

// دالة لعرض خيارات التصدير
function showExportOptions() {
    // إنشاء نافذة خيارات التصدير
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'exportModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="
            background: white;
            border-radius: 10px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            overflow: hidden;
        ">
            <div class="modal-header" style="
                background: #2c3e50;
                color: white;
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="margin: 0;"><i class="fas fa-file-export"></i> تصدير البيانات</h3>
                <button class="close-btn" style="
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                ">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <p style="margin-bottom: 20px; color: #555;">اختر نوع البيانات التي تريد تصديرها:</p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn btn-success" id="exportCurrentBtn" style="
                        padding: 12px;
                        text-align: right;
                        font-size: 16px;
                    ">
                        <i class="fas fa-table"></i> تصدير البيانات المعروضة حالياً
                        <br>
                        <small style="font-size: 12px; opacity: 0.8;">(البيانات بعد التصفية والبحث)</small>
                    </button>
                    <button class="btn btn-primary" id="exportAllBtn" style="
                        padding: 12px;
                        text-align: right;
                        font-size: 16px;
                    ">
                        <i class="fas fa-database"></i> تصدير جميع الموظفين
                        <br>
                        <small style="font-size: 12px; opacity: 0.8;">(جميع الموظفين في المشروع الحالي)</small>
                    </button>
                </div>
            </div>
            <div class="modal-footer" style="
                padding: 15px 20px;
                background: #f8f9fa;
                text-align: left;
                border-top: 1px solid #dee2e6;
            ">
                <button class="btn btn-secondary" id="cancelExportBtn" style="padding: 8px 16px;">
                    إلغاء
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // إضافة event listeners
    modal.querySelector('.close-btn').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelector('#cancelExportBtn').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelector('#exportCurrentBtn').addEventListener('click', () => {
        modal.remove();
        exportToExcel();
    });
    
    modal.querySelector('#exportAllBtn').addEventListener('click', () => {
        modal.remove();
        exportAllEmployeesToExcel();
    });
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async function () {
    console.log('جاري تحميل صفحة الموظفين...');
    
    // تهيئة Firebase أولاً
    const initialized = await initializeApp();
    if (!initialized) return;

    // التحقق من وجود مشروع
    if (!window.firebaseConfig.projectManager.hasCurrentProject()) {
        redirectToProjects();
        return;
    }

    // تهيئة المكونات
    displayCurrentProjectInfo();
    loadEmployees();
    setupSearchAndFilter();

    // إضافة event listeners
    document.getElementById('addEmployeeBtn').addEventListener('click', openAddEmployeeModal);
    document.getElementById('closeModal').addEventListener('click', closeEmployeeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeEmployeeModal);
    document.getElementById('employeeForm').addEventListener('submit', saveEmployee);
    document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteEmployeeModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteEmployeeModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteEmployee);
    document.getElementById('exportExcelBtn').addEventListener('click', showExportOptions);
    console.log('تم تحميل صفحة الموظفين بنجاح');
});