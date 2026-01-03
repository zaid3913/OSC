// استخدام Firebase من firebase-config.js

// مشاريع ومتغيرات الصفحة
let projects = [];
let currentProjectId = null;

// تهيئة Firebase Config
function initializeFirebaseConfig() {
    if (window.firebaseConfig) {
        return true;
    }
    return false;
}


// تنسيق التاريخ
function formatDate(timestamp) {
    if (!timestamp) return 'غير محدد';
    if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString('ar-IQ');
    }
    return new Date(timestamp).toLocaleDateString('ar-IQ');
}

// تحميل المشاريع
async function loadProjects() {
    try {
        showLoading('جاري تحميل المشاريع...');
        
        const snapshot = await db.collection('projects')
            .orderBy('createdAt', 'desc')
            .get();
        
        projects = [];
        snapshot.forEach(doc => {
            projects.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        displayProjects(projects);
        updateCurrentProjectCard();
        hideLoading();
        
    } catch (error) {
        console.error("Error loading projects:", error);
        hideLoading();
        showMessage('error', 'تعذر تحميل المشاريع');
    }
}

// الحصول على إحصائيات المشروع
async function getProjectStats(projectId) {
    try {
        let employeesCount = 0;
        let totalAdvances = 0;
        let totalExpenses = 0;
        
        // حساب الموظفين
        try {
            const employeesSnapshot = await db.collection('projects').doc(projectId)
                .collection('employees').get();
            employeesCount = employeesSnapshot.size;
        } catch (error) {
            console.warn("Error getting employees:", error);
        }
        
        // حساب السلف
        try {
            const advancesSnapshot = await db.collection('projects').doc(projectId)
                .collection('advances').get();
            advancesSnapshot.forEach(doc => {
                const advance = doc.data();
                totalAdvances += parseFloat(advance.amount) || 0;
            });
        } catch (error) {
            console.warn("Error getting advances:", error);
        }
        
        // حساب المصاريف
        try {
            const expensesSnapshot = await db.collection('projects').doc(projectId)
                .collection('expenses').get();
            expensesSnapshot.forEach(doc => {
                const expense = doc.data();
                totalExpenses += parseFloat(expense.amount) || 0;
            });
        } catch (error) {
            console.warn("Error getting expenses:", error);
        }
        
        return {
            employees: employeesCount,
            totalAdvances: totalAdvances,
            totalExpenses: totalExpenses,
            balance: totalAdvances - totalExpenses
        };
        
    } catch (error) {
        console.error("Error getting project stats:", error);
        return { employees: 0, totalAdvances: 0, totalExpenses: 0, balance: 0 };
    }
}

// عرض المشاريع
function displayProjects(projectsList) {
    const projectsGrid = document.getElementById('projectsGrid');
    if (!projectsGrid) return;
    
    projectsGrid.innerHTML = '';
    
    if (projectsList.length === 0) {
        projectsGrid.innerHTML = `
            <div class="no-projects">
                <i class="fas fa-project-diagram" style="font-size: 60px; color: #ddd;"></i>
                <p>لا توجد مشاريع مسجلة</p>
                <button onclick="openAddProjectModal()" class="btn btn-primary">
                    <i class="fas fa-plus-circle"></i> إضافة أول مشروع
                </button>
            </div>
        `;
        return;
    }
    
    projectsList.forEach(project => {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        
        getProjectStats(project.id).then(stats => {
            projectCard.innerHTML = `
                <div class="project-header">
                    <h4>${project.name || 'بدون اسم'}</h4>
                    <span class="project-status status-${project.status || 'نشط'}">
                        ${project.status || 'نشط'}
                    </span>
                </div>
                <div class="project-body">
                    <p class="project-description">${project.description || 'لا يوجد وصف'}</p>
                    <div class="project-dates">
                        <span><i class="far fa-calendar-alt"></i> البدء: ${formatDate(project.startDate)}</span>
                        <span><i class="far fa-calendar-check"></i> الانتهاء: ${formatDate(project.endDate)}</span>
                    </div>
                    <div class="project-stats">
                        <div class="stat">
                            <i class="fas fa-users"></i>
                            <span>${stats.employees} موظف</span>
                        </div>
                        <div class="stat">
                            <i class="fas fa-hand-holding-usd"></i>
                            <span>${formatCurrency(stats.totalAdvances)}</span>
                        </div>
                        <div class="stat">
                            <i class="fas fa-file-invoice-dollar"></i>
                            <span>${formatCurrency(stats.totalExpenses)}</span>
                        </div>
                    </div>
                    ${project.budget ? `<div class="project-budget"><i class="fas fa-money-bill-wave"></i> الميزانية: ${formatCurrency(project.budget)}</div>` : ''}
                </div>
                <div class="project-actions">
                    <button onclick="selectProject('${project.id}', '${project.name}')" class="btn btn-primary">
                        <i class="fas fa-check-circle"></i> اختيار المشروع
                    </button>
                    <button onclick="editProject('${project.id}')" class="btn btn-info">
                        <i class="fas fa-edit"></i> تعديل
                    </button>
                    <button onclick="deleteProject('${project.id}')" class="btn btn-danger">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </div>
            `;
        });
        
        projectsGrid.appendChild(projectCard);
    });
}

// اختيار مشروع
function selectProject(projectId, projectName) {
    if (projectManager) {
        projectManager.setCurrentProject(projectId, projectName);
        showMessage('success', `تم اختيار المشروع: ${projectName}`);
        updateCurrentProjectCard();
        
        // تحديث الإحصائيات
        getProjectStats(projectId).then(stats => {
            document.getElementById('currentProjectEmployees').textContent = stats.employees;
            document.getElementById('currentProjectAdvances').textContent = formatCurrency(stats.totalAdvances);
            document.getElementById('currentProjectExpenses').textContent = formatCurrency(stats.totalExpenses);
        });
    } else {
        showMessage('error', 'تعذر اختيار المشروع');
    }
}

// تحديث بطاقة المشروع الحالي
function updateCurrentProjectCard() {
    const currentProjectCard = document.getElementById('currentProjectCard');
    if (!currentProjectCard || !projectManager) return;
    
    const currentProject = projectManager.getCurrentProject();
    
    if (currentProject && currentProject.id) {
        currentProjectCard.style.display = 'block';
        document.getElementById('currentProjectName').textContent = currentProject.name;
        
        // تحميل تفاصيل المشروع
        db.collection('projects').doc(currentProject.id).get().then(doc => {
            if (doc.exists) {
                const project = doc.data();
                document.getElementById('currentProjectDescription').textContent = project.description || 'لا يوجد وصف';
            }
        });
        
        // تحديث الإحصائيات
        getProjectStats(currentProject.id).then(stats => {
            document.getElementById('currentProjectEmployees').textContent = stats.employees;
            document.getElementById('currentProjectAdvances').textContent = formatCurrency(stats.totalAdvances);
            document.getElementById('currentProjectExpenses').textContent = formatCurrency(stats.totalExpenses);
        });
    } else {
        currentProjectCard.style.display = 'none';
    }
}

// التنقل إلى الأقسام
function goToDashboard() {
    if (projectManager && projectManager.hasCurrentProject()) {
        window.location.href = '../dashboard/dashboard.html';
    } else {
        showMessage('error', 'الرجاء اختيار مشروع أولاً');
    }
}

function goToEmployees() {
    if (projectManager && projectManager.hasCurrentProject()) {
        window.location.href = '../employees/employees.html';
    } else {
        showMessage('error', 'الرجاء اختيار مشروع أولاً');
    }
}

function goToAdvances() {
    if (projectManager && projectManager.hasCurrentProject()) {
        window.location.href = '../advances/advances.html';
    } else {
        showMessage('error', 'الرجاء اختيار مشروع أولاً');
    }
}

function goToExpenses() {
    if (projectManager && projectManager.hasCurrentProject()) {
        window.location.href = '../expenses/expenses.html';
    } else {
        showMessage('error', 'الرجاء اختيار مشروع أولاً');
    }
}

// دوال CRUD للمشاريع
function openAddProjectModal() {
    currentProjectId = null;
    document.getElementById('modalTitle').textContent = 'إضافة مشروع جديد';
    document.getElementById('projectForm').reset();
    document.getElementById('projectStatus').value = 'نشط';
    document.getElementById('projectModal').style.display = 'flex';
}

async function editProject(projectId) {
    try {
        const doc = await db.collection('projects').doc(projectId).get();
        if (!doc.exists) {
            showMessage('error', 'المشروع غير موجود');
            return;
        }
        
        const project = doc.data();
        currentProjectId = projectId;
        
        document.getElementById('modalTitle').textContent = 'تعديل المشروع';
        document.getElementById('projectName').value = project.name || '';
        document.getElementById('projectDescription').value = project.description || '';
        document.getElementById('projectStatus').value = project.status || 'نشط';
        document.getElementById('projectBudget').value = project.budget || '';
        
        if (project.startDate && project.startDate.toDate) {
            const date = project.startDate.toDate();
            document.getElementById('projectStartDate').value = date.toISOString().split('T')[0];
        }
        
        if (project.endDate && project.endDate.toDate) {
            const date = project.endDate.toDate();
            document.getElementById('projectEndDate').value = date.toISOString().split('T')[0];
        }
        
        document.getElementById('projectModal').style.display = 'flex';
        
    } catch (error) {
        console.error("Error editing project:", error);
        showMessage('error', 'تعذر تحميل بيانات المشروع');
    }
}

async function saveProject(e) {
    e.preventDefault();
    
    if (!db) {
        showMessage('error', 'قاعدة البيانات غير متاحة');
        return;
    }
    
    const projectData = {
        name: document.getElementById('projectName').value.trim(),
        description: document.getElementById('projectDescription').value.trim(),
        status: document.getElementById('projectStatus').value,
        budget: parseFloat(document.getElementById('projectBudget').value) || 0,
        updatedAt: firebase.firestore.Timestamp.now()
    };
    
    const startDate = document.getElementById('projectStartDate').value;
    const endDate = document.getElementById('projectEndDate').value;
    
    if (startDate) {
        projectData.startDate = firebase.firestore.Timestamp.fromDate(new Date(startDate));
    }
    
    if (endDate) {
        projectData.endDate = firebase.firestore.Timestamp.fromDate(new Date(endDate));
    }
    
    try {
        if (currentProjectId) {
            // تحديث المشروع
            await db.collection('projects').doc(currentProjectId).update(projectData);
            showMessage('success', 'تم تحديث المشروع بنجاح');
        } else {
            // إضافة مشروع جديد
            projectData.createdAt = firebase.firestore.Timestamp.now();
            const docRef = await db.collection('projects').add(projectData);
            
            // اختيار المشروع الجديد تلقائياً
            if (projectManager) {
                selectProject(docRef.id, projectData.name);
            }
            showMessage('success', 'تم إضافة المشروع بنجاح');
        }
        
        closeProjectModal();
        loadProjects();
        
    } catch (error) {
        console.error("Error saving project:", error);
        showMessage('error', 'تعذر حفظ المشروع');
    }
}

async function deleteProject(projectId) {
    if (!confirm('هل أنت متأكد من حذف هذا المشروع؟ سيتم حذف جميع البيانات المرتبطة به.')) {
        return;
    }
    
    try {
        // حذف المشروع
        await db.collection('projects').doc(projectId).delete();
        
        // إذا كان المشروع المحذوف هو الحالي، مسح التحديد
        if (projectManager && projectId === projectManager.getCurrentProject().id) {
            projectManager.clearCurrentProject();
            updateCurrentProjectCard();
        }
        
        showMessage('success', 'تم حذف المشروع بنجاح');
        loadProjects();
        
    } catch (error) {
        console.error("Error deleting project:", error);
        showMessage('error', 'تعذر حذف المشروع');
    }
}

// دوال المساعدة
function closeProjectModal() {
    document.getElementById('projectModal').style.display = 'none';
    currentProjectId = null;
}

function showLoading(message) {
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
    `;
    loadingDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${message}</span>`;
    document.body.appendChild(loadingDiv);
}

function hideLoading() {
    const loadingDiv = document.getElementById('loadingMessage');
    if (loadingDiv && loadingDiv.parentNode) {
        loadingDiv.parentNode.removeChild(loadingDiv);
    }
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // إضافة الأحداث
    const addProjectBtn = document.getElementById('addProjectBtn');
    const projectForm = document.getElementById('projectForm');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const changeProjectBtn = document.getElementById('changeProjectBtn');
    
    if (addProjectBtn) addProjectBtn.addEventListener('click', openAddProjectModal);
    if (projectForm) projectForm.addEventListener('submit', saveProject);
    if (closeModal) closeModal.addEventListener('click', closeProjectModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeProjectModal);
    if (changeProjectBtn) changeProjectBtn.addEventListener('click', () => {
        if (projectManager) {
            projectManager.clearCurrentProject();
            updateCurrentProjectCard();
            showMessage('info', 'تم مسح اختيار المشروع الحالي');
        }
    });
}

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // الانتظار لتحميل Firebase Config
    const checkConfig = setInterval(() => {
        if (initializeFirebaseConfig()) {
            clearInterval(checkConfig);
            console.log("✅ Firebase config loaded for projects");
            
            // التحقق من مشروع محدد مسبقاً
            updateCurrentProjectCard();
            
            // تحميل المشاريع
            loadProjects();
            
            // إعداد الأحداث
            setupEventListeners();
        }
    }, 100);
    
    // إعادة المحاولة بعد 3 ثواني
    setTimeout(() => {
        if (!db) {
            showMessage('error', 'تعذر تحميل النظام. يرجى تحديث الصفحة.');
            console.error('Firebase config failed to load after 3 seconds');
        }
    }, 3000);
});