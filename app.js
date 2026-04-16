// State variables
let state = {
    dailyTasks: [], // Array of { id, title, isCollapsed, subtasks: [{ id, title, completed, repeatDaily }] }
    normalTasks: [],
    heatmap: {}, // Object mapping 'YYYY-MM-DD' to percentage (0-100)
    lastOpenedDate: '', // 'YYYY-MM-DD',
    contentAccounts: [] // Array of {id, name, isCollapsed, platforms: [{id, name, records: {'YYYY-MM-DD': 'val'}}]}
};

// Utilities
const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

// Data Persistence
const loadState = () => {
    const saved = localStorage.getItem('horizon_state');
    if (saved) {
        state = JSON.parse(saved);
        if (!state.contentAccounts) state.contentAccounts = [];
        checkMidnightReset();
    } else {
        state.lastOpenedDate = getTodayStr();
        saveState();
    }
};

const saveState = () => {
    localStorage.setItem('horizon_state', JSON.stringify(state));
    updateProgress();
};

// Midnight Reset Logic
const checkMidnightReset = () => {
    const today = getTodayStr();
    if (state.lastOpenedDate !== today) {
        state.dailyTasks.forEach(task => {
            task.subtasks = task.subtasks.filter(sub => {
                if (sub.repeatDaily) {
                    sub.completed = false; 
                    return true;
                } else {
                    // Keep one-off tasks only if they haven't been completed yet
                    return !sub.completed;
                }
            });
        });
        state.lastOpenedDate = today;
        saveState();
    }
};

// Initialization and Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadState();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            
            e.currentTarget.classList.add('active');
            const targetView = e.currentTarget.getAttribute('data-view');
            document.getElementById(`view-${targetView}`).classList.add('active');

            if (targetView === 'heatmap') {
                renderHeatmap();
            } else if (targetView === 'content') {
                renderContentGrid();
            }
        });
    });

    // Add Tasks
    document.getElementById('add-daily-task-btn').addEventListener('click', () => addMainTask('daily'));
    document.getElementById('daily-task-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') addMainTask('daily') });

    document.getElementById('add-normal-task-btn').addEventListener('click', () => addMainTask('normal'));
    document.getElementById('normal-task-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') addMainTask('normal') });

    // Add Content Account
    const addAccBtn = document.getElementById('add-content-account-btn');
    const addAccInput = document.getElementById('content-account-input');
    if (addAccBtn && addAccInput) {
        addAccBtn.addEventListener('click', addContentAccount);
        addAccInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') addContentAccount() });
    }

    // Heatmap Navigation
    document.getElementById('prev-month-btn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => changeMonth(1));

    // Initial Renders
    renderTaskList('daily');
    renderTaskList('normal');
    updateProgress();
    
    // Set up heatmap date
    currentHeatmapDate = new Date();
    
    // Load UI preferences
    if(localStorage.getItem('horizon_sidebar_collapsed') === 'true') {
        document.querySelector('.sidebar').classList.add('collapsed');
    }
});

// UI Logic
const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('horizon_sidebar_collapsed', isCollapsed);
};

// Task Actions
const addMainTask = (type) => {
    const input = document.getElementById(`${type}-task-input`);
    const title = input.value.trim();
    if (!title) return;

    const newTask = {
        id: generateId(),
        title,
        isCollapsed: false,
        subtasks: []
    };

    if (type === 'daily') {
        state.dailyTasks.push(newTask);
    } else {
        state.normalTasks.push(newTask);
    }

    input.value = '';
    saveState();
    renderTaskList(type);
};

const deleteMainTask = (type, id) => {
    if (type === 'daily') {
        state.dailyTasks = state.dailyTasks.filter(t => t.id !== id);
    } else {
        state.normalTasks = state.normalTasks.filter(t => t.id !== id);
    }
    saveState();
    renderTaskList(type);
}

// Inline Subtask Add
const handleInlineAdd = (event, type, taskId) => {
    if (event.key === 'Enter') {
        const input = event.target;
        const title = input.value.trim();
        if (!title) return;

        let repeatDaily = false;
        if (type === 'daily') {
            const repeatCheck = document.getElementById(`repeat-sub-${taskId}`);
            if (repeatCheck) repeatDaily = repeatCheck.checked;
        }

        const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
        const task = list.find(t => t.id === taskId);
        
        if (task) {
            task.subtasks.push({
                id: generateId(),
                title,
                completed: false,
                repeatDaily
            });
            saveState();
            renderTaskList(type);
        }
    }
};

// Inline Editing
const blurOnEnter = (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
    }
};

const updateMainTaskTitle = (type, taskId, newTitle) => {
    const titleObj = newTitle.trim();
    if (!titleObj) return renderTaskList(type); // Revert if empty

    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task && task.title !== titleObj) {
        task.title = titleObj;
        saveState();
    }
};

const updateSubtaskTitle = (type, taskId, subtaskId, newTitle) => {
    const titleObj = newTitle.trim();
    if (!titleObj) return renderTaskList(type);

    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        const subtask = task.subtasks.find(s => s.id === subtaskId);
        if (subtask && subtask.title !== titleObj) {
            subtask.title = titleObj;
            saveState();
        }
    }
};

const deleteSubtask = (listType, taskId, subtaskId) => {
    const list = listType === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
        saveState();
        renderTaskList(listType);
    }
}

const toggleSubtask = (listType, taskId, subtaskId, isCompleted) => {
    const list = listType === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        const subtask = task.subtasks.find(s => s.id === subtaskId);
        if (subtask) {
            subtask.completed = isCompleted;
            saveState(); 
            renderTaskList(listType);
        }
    }
};

// Collapse / Expand
const toggleCollapse = (type, taskId) => {
    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        task.isCollapsed = !task.isCollapsed;
        saveState();
        renderTaskList(type);
    }
};

const showInlineAdd = (type, taskId) => {
    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        task.isCollapsed = false; // ensure expanded
        saveState();
        renderTaskList(type);
    }
    
    setTimeout(() => {
        const el = document.getElementById(`inline-add-container-${taskId}`);
        if (el) {
            el.style.display = 'flex';
            const input = document.getElementById(`inline-add-input-${taskId}`);
            if (input) input.focus();
        }
    }, 50);
};

// Drag and Drop Logic
let draggedElement = null;

const handleDragStart = (e, type, isSubtask, parentId, id) => {
    draggedElement = e.currentTarget;
    setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, isSubtask, parentId, id }));
};

const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

const handleDrop = (e, targetType, isTargetSubtask, targetParentId, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedElement) return;
    draggedElement.classList.remove('dragging');
    draggedElement = null;
    
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    
    const dataObj = JSON.parse(dataStr);
    
    if (dataObj.isSubtask !== isTargetSubtask) return; 
    if (dataObj.type !== targetType) return;
    
    const list = dataObj.type === 'daily' ? state.dailyTasks : state.normalTasks;
    
    if (!dataObj.isSubtask) {
        // Tasks
        if (dataObj.id === targetId) return;
        const oldIndex = list.findIndex(t => t.id === dataObj.id);
        const newIndex = list.findIndex(t => t.id === targetId);
        if (oldIndex > -1 && newIndex > -1) {
            const [moved] = list.splice(oldIndex, 1);
            list.splice(newIndex, 0, moved);
        }
    } else {
        // Subtasks
        if (dataObj.parentId !== targetParentId) return; 
        if (dataObj.id === targetId) return;
        const taskObj = list.find(t => t.id === dataObj.parentId);
        if (taskObj) {
            const oldIndex = taskObj.subtasks.findIndex(s => s.id === dataObj.id);
            const newIndex = taskObj.subtasks.findIndex(s => s.id === targetId);
            if (oldIndex > -1 && newIndex > -1) {
                const [moved] = taskObj.subtasks.splice(oldIndex, 1);
                taskObj.subtasks.splice(newIndex, 0, moved);
            }
        }
    }
    
    saveState();
    renderTaskList(dataObj.type);
};

const handleDragEnd = (e) => {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
    }
    draggedElement = null;
};

// Progress Calculations
const updateProgress = () => {
    let totalSubtasks = 0;
    let completedSubtasks = 0;

    state.dailyTasks.forEach(task => {
        task.subtasks.forEach(sub => {
            totalSubtasks++;
            if (sub.completed) completedSubtasks++;
        });
    });

    let percentage = 0;
    if (totalSubtasks > 0) {
        percentage = Math.round((completedSubtasks / totalSubtasks) * 100);
    }

    // Update Circular UI
    document.getElementById('overall-progress-text').innerText = `${percentage}%`;
    const circle = document.getElementById('overall-progress-circle');
    circle.style.background = `conic-gradient(var(--primary) ${percentage * 3.6}deg, var(--bg-dark) 0deg)`;

    // Update minimal UI attribute
    const widget = document.querySelector('.progress-widget');
    if (widget) {
        widget.setAttribute('data-progress', `${percentage}%`);
    }

    // Update Heatmap Data for Today
    const today = getTodayStr();
    state.heatmap[today] = percentage;
};

// Rendering
const renderTaskList = (type) => {
    const container = document.getElementById(`${type}-task-list`);
    const tasks = type === 'daily' ? state.dailyTasks : state.normalTasks;

    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-landscape'></i>
                <p>No ${type} tasks found. Add a new task above!</p>
            </div>
        `;
        return;
    }

    tasks.forEach(task => {
        let allComplete = false;
        if (task.subtasks.length > 0) {
            allComplete = task.subtasks.every(s => s.completed);
        }

        const taskEl = document.createElement('div');
        taskEl.className = `task-card ${allComplete ? 'completed' : ''} ${task.isCollapsed ? 'collapsed' : ''}`;
        taskEl.draggable = true;
        taskEl.ondragstart = (e) => { e.stopPropagation(); handleDragStart(e, type, false, null, task.id); };
        taskEl.ondragover = handleDragOver;
        taskEl.ondrop = (e) => handleDrop(e, type, false, null, task.id);
        taskEl.ondragend = handleDragEnd;
        
        let subtasksHTML = task.subtasks.map(sub => `
            <div class="subtask-item" draggable="true"
                 ondragstart="event.stopPropagation(); handleDragStart(event, '${type}', true, '${task.id}', '${sub.id}')"
                 ondragover="event.preventDefault(); event.dataTransfer.dropEffect = 'move';"
                 ondrop="handleDrop(event, '${type}', true, '${task.id}', '${sub.id}')"
                 ondragend="handleDragEnd(event)">
                 
                <i class='bx bx-grid-vertical drag-handle'></i>
                <div class="subtask-content">
                    <label class="custom-checkbox-wrapper">
                        <input type="checkbox" 
                            onchange="toggleSubtask('${type}', '${task.id}', '${sub.id}', this.checked)"
                            ${sub.completed ? 'checked' : ''}>
                        <span class="custom-checkbox"></span>
                    </label>
                    <span class="subtask-title-text" contenteditable="true" 
                        onblur="updateSubtaskTitle('${type}', '${task.id}', '${sub.id}', this.innerText)" 
                        onkeypress="blurOnEnter(event)" spellcheck="false">${sub.title}</span>
                    ${type === 'daily' ? `<span class="subtask-tag ${sub.repeatDaily ? '' : 'oneoff'}">${sub.repeatDaily ? '<i class="bx bx-repost"></i>' : '1x'}</span>` : ''}
                </div>
                <button class="icon-btn danger" onclick="deleteSubtask('${type}', '${task.id}', '${sub.id}')">
                    <i class='bx bx-trash'></i>
                </button>
            </div>
        `).join('');

        const inlineAddHTML = `
            <div class="inline-add-subtask" id="inline-add-container-${task.id}" style="${task.subtasks.length === 0 ? 'display:flex' : 'display:none'}">
                <i class='bx bx-plus' style='color: var(--text-muted); margin-left:8px'></i>
                <input type="text" placeholder="Add subtask and press Enter..." id="inline-add-input-${task.id}"
                    onkeypress="handleInlineAdd(event, '${type}', '${task.id}')">
                ${type === 'daily' ? `
                    <label class="custom-checkbox-wrapper small" title="Check to Repeat Daily">
                        <input type="checkbox" id="repeat-sub-${task.id}" checked>
                        <span class="custom-checkbox"></span>
                        <span class="label-text" style="font-size:10px; opacity:0.8">Daily</span>
                    </label>
                ` : ''}
            </div>
        `;

        taskEl.innerHTML = `
            <div class="task-header">
                <div class="task-title ${allComplete ? 'completed' : ''}">
                    <i class='bx bx-grid-vertical drag-handle task-handle'></i>
                    <button class="icon-btn collapse-btn" onclick="toggleCollapse('${type}', '${task.id}')">
                        <i class='bx bx-chevron-${task.isCollapsed ? 'right' : 'down'}'></i>
                    </button>
                    ${allComplete ? "<i class='bx bxs-check-circle' style='color: var(--primary)'></i>" : "<i class='bx bx-circle'></i>"}
                    <span class="task-title-text" contenteditable="true" 
                        onblur="updateMainTaskTitle('${type}', '${task.id}', this.innerText)" 
                        onkeypress="blurOnEnter(event)" spellcheck="false">${task.title}</span>
                </div>
                <div class="task-actions">
                    <button class="icon-btn" onclick="showInlineAdd('${type}', '${task.id}')" title="Add Subtask">
                        <i class='bx bx-plus'></i>
                    </button>
                    <button class="icon-btn danger" onclick="deleteMainTask('${type}', '${task.id}')" title="Delete Task">
                        <i class='bx bx-trash'></i>
                    </button>
                </div>
            </div>
            <div class="subtask-list" style="${task.isCollapsed ? 'display:none' : 'display:flex'}">
                ${subtasksHTML}
                ${inlineAddHTML}
            </div>
        `;
        
        container.appendChild(taskEl);
    });
};

// Heatmap Calendar Logic
let currentHeatmapDate = new Date();

const changeMonth = (offset) => {
    currentHeatmapDate.setMonth(currentHeatmapDate.getMonth() + offset);
    renderHeatmap();
};

const renderHeatmap = () => {
    const year = currentHeatmapDate.getFullYear();
    const month = currentHeatmapDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('current-month-label').innerText = `${monthNames[month]} ${year}`;

    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'heatmap-cell';
        emptyCell.style.opacity = '0';
        grid.appendChild(emptyCell);
    }

    const todayStr = getTodayStr();

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const percentage = state.heatmap[dateStr] !== undefined ? state.heatmap[dateStr] : 0;
        
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.innerText = i;
        
        if (percentage > 0 && percentage < 40) cell.classList.add('level-1');
        else if (percentage >= 40 && percentage < 70) cell.classList.add('level-2');
        else if (percentage >= 70 && percentage < 100) cell.classList.add('level-3');
        else if (percentage === 100) cell.classList.add('level-4');

        if (dateStr === todayStr) {
            cell.style.border = '2px solid var(--text-main)';
        }

        const tooltip = document.createElement('span');
        tooltip.className = 'tooltip';
        tooltip.innerText = `${percentage}% completed`;
        cell.appendChild(tooltip);

        grid.appendChild(cell);
    }
};

// Content Tracker Logic
let currentContentDate = new Date();
let activeContentCol = null;

const toggleContentColumn = (dayIndex) => {
    activeContentCol = activeContentCol === dayIndex ? null : dayIndex;
    renderContentGrid();
};

const changeContentMonth = (offset) => {
    currentContentDate.setMonth(currentContentDate.getMonth() + offset);
    activeContentCol = null;
    renderContentGrid();
};

const addContentAccount = () => {
    const input = document.getElementById('content-account-input');
    if(!input) return;
    const name = input.value.trim();
    if (!name) return;
    state.contentAccounts.push({
        id: generateId(),
        name: name,
        isCollapsed: false,
        platforms: []
    });
    input.value = '';
    saveState();
    renderContentGrid();
};

const renameContentAccount = (accountId, newName) => {
    const account = state.contentAccounts.find(a => a.id === accountId);
    if (!account) return;
    const cleanName = newName.trim();
    if (cleanName && cleanName !== account.name) {
        account.name = cleanName;
        saveState();
    }
    // we don't fully rerender since it drops focus, contenteditable handles it
};

const renameContentPlatform = (accountId, platformId, newName) => {
    const account = state.contentAccounts.find(a => a.id === accountId);
    if (!account) return;
    const platform = account.platforms.find(p => p.id === platformId);
    if (!platform) return;
    const cleanName = newName.trim();
    if (cleanName && cleanName !== platform.name) {
        platform.name = cleanName;
        saveState();
    }
};

const deleteContentAccount = (accountId) => {
    if(confirm("Delete this account and all its tracking data?")) {
        state.contentAccounts = state.contentAccounts.filter(a => a.id !== accountId);
        saveState();
        renderContentGrid();
    }
};

const toggleContentAccount = (accountId) => {
    const account = state.contentAccounts.find(a => a.id === accountId);
    if(account) {
        account.isCollapsed = !account.isCollapsed;
        saveState();
        renderContentGrid();
    }
};

const togglePlatformTray = (accountId) => {
    const account = state.contentAccounts.find(a => a.id === accountId);
    if(account) {
        account.isCollapsed = false;
        account.showTray = !account.showTray;
        renderContentGrid(); 
    }
};

const toggleContentPlatform = (accountId, platformName) => {
    const account = state.contentAccounts.find(a => a.id === accountId);
    if (!account) return;
    
    const existingIndex = account.platforms.findIndex(p => p.name === platformName);
    if (existingIndex > -1) {
        account.platforms.splice(existingIndex, 1);
    } else {
        account.platforms.push({
            id: generateId(),
            name: platformName,
            records: {}
        });
    }
    saveState();
    renderContentGrid();
};

const deleteContentPlatform = (accountId, platformId) => {
    if(confirm("Delete this platform?")) {
        const account = state.contentAccounts.find(a => a.id === accountId);
        if(account) {
            account.platforms = account.platforms.filter(p => p.id !== platformId);
            saveState();
            renderContentGrid();
        }
    }
};

const updateContentRecord = (accountId, platformId, dateStr, value) => {
    const account = state.contentAccounts.find(a => a.id === accountId);
    if(!account) return;
    const platform = account.platforms.find(p => p.id === platformId);
    if(!platform) return;
    
    platform.records[dateStr] = value;
    saveState();
    // We don't need a full re-render here, CSS handles focus/blur normally.
    // However, if the color changes due to empty state, it's better to update just that cell via class, 
    // but a full render is safe enough if small.
    renderContentGrid(); 
};

// Check if a date string is past or today relative to actual real-time today.
const isDatePastOrToday = (dateStr) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    return target.getTime() <= today.getTime();
}

const renderContentGrid = () => {
    const container = document.getElementById('content-tracker-grid');
    if (!container) return;

    const year = currentContentDate.getFullYear();
    const month = currentContentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = document.getElementById('content-month-label');
    if(monthLabel) monthLabel.innerText = `${monthNames[month]} ${year}`;

    const realTodayStr = getTodayStr();
    
    container.innerHTML = '';
    
    // Header Row
    let headerHTML = `
        <div class="ct-row ct-date-row">
            <div class="ct-header-col">
                <span>Account & Platform</span>
            </div>
    `;
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = dateStr === realTodayStr;
        const isHighlighted = activeContentCol === i;
        headerHTML += `<div class="ct-cell ${isToday ? 'ct-today-col' : ''} ${isHighlighted ? 'ct-col-highlight' : ''}" style="cursor: pointer;" onclick="toggleContentColumn(${i})" title="Click to highlight column">${i}</div>`;
    }
    headerHTML += `</div>`;
    
    container.innerHTML += headerHTML;

    // Body Rows
    if(!state.contentAccounts || state.contentAccounts.length === 0) {
        container.innerHTML += `<div style="padding: 24px; color: var(--text-muted);">No accounts added. Click 'Add Account' to start.</div>`;
    } else {
        state.contentAccounts.forEach(account => {
            // Account Header Row
            container.innerHTML += `
                <div class="ct-row ct-account-row">
                    <div class="ct-header-col">
                        <div class="account-name-container">
                            <i class='bx bx-chevron-${account.isCollapsed ? 'right' : 'down'}' onclick="toggleContentAccount('${account.id}')"></i>
                            <span contenteditable="true" onblur="renameContentAccount('${account.id}', this.innerText)" spellcheck="false" onkeypress="blurOnEnter(event)">${account.name}</span>
                        </div>
                        <div style="display:flex; gap:4px;">
                            <button class="icon-btn" style="font-size:16px;" onclick="togglePlatformTray('${account.id}')" title="Add Platform"><i class='bx bx-plus'></i></button>
                            <button class="icon-btn danger" style="font-size:16px;" onclick="deleteContentAccount('${account.id}')" title="Delete Account"><i class='bx bx-trash'></i></button>
                        </div>
                    </div>
                    <div class="ct-account-spacer"></div>
                </div>
            `;

            if(!account.isCollapsed) {
                if (account.showTray) {
                    const hasFB = account.platforms.some(p => p.name === 'Facebook');
                    const hasIG = account.platforms.some(p => p.name === 'Instagram');
                    const hasTT = account.platforms.some(p => p.name === 'TikTok');
                    const hasYT = account.platforms.some(p => p.name === 'YouTube');
                    const hasShorts = account.platforms.some(p => p.name === 'YT Shorts');
                    
                    container.innerHTML += `
                        <div class="platform-tray">
                            <button class="platform-btn ${hasFB ? 'active' : ''}" onclick="toggleContentPlatform('${account.id}', 'Facebook')"><i class='bx bxl-facebook-square'></i> Facebook</button>
                            <button class="platform-btn ${hasIG ? 'active' : ''}" onclick="toggleContentPlatform('${account.id}', 'Instagram')"><i class='bx bxl-instagram'></i> Instagram</button>
                            <button class="platform-btn ${hasTT ? 'active' : ''}" onclick="toggleContentPlatform('${account.id}', 'TikTok')"><i class='bx bxl-tiktok'></i> TikTok</button>
                            <button class="platform-btn ${hasYT ? 'active' : ''}" onclick="toggleContentPlatform('${account.id}', 'YouTube')"><i class='bx bxl-youtube'></i> YouTube</button>
                            <button class="platform-btn ${hasShorts ? 'active' : ''}" onclick="toggleContentPlatform('${account.id}', 'YT Shorts')"><i class='bx bx-video'></i> Shorts</button>
                        </div>
                    `;
                }

                account.platforms.forEach(platform => {
                    let platformIcon = '';
                    switch(platform.name) {
                        case 'Facebook': platformIcon = "<i class='bx bxl-facebook-square' style='color:#3b82f6; font-size:16px;'></i>"; break;
                        case 'Instagram': platformIcon = "<i class='bx bxl-instagram' style='color:#ec4899; font-size:16px;'></i>"; break;
                        case 'TikTok': platformIcon = "<i class='bx bxl-tiktok' style='color:#f8fafc; font-size:16px;'></i>"; break;
                        case 'YouTube': platformIcon = "<i class='bx bxl-youtube' style='color:#ef4444; font-size:16px;'></i>"; break;
                        case 'YT Shorts': platformIcon = "<i class='bx bx-video' style='color:#ef4444; font-size:16px;'></i>"; break;
                    }

                    let platformRowHTML = `
                        <div class="ct-row ct-platform-row">
                            <div class="ct-header-col">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    ${platformIcon}<span>${platform.name}</span>
                                </div>
                                <button class="icon-btn danger" style="font-size:14px;" onclick="deleteContentPlatform('${account.id}', '${platform.id}')" title="Delete Platform"><i class='bx bx-trash'></i></button>
                            </div>
                    `;
                    
                    for (let i = 1; i <= daysInMonth; i++) {
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                        const isToday = dateStr === realTodayStr;
                        const recordValue = platform.records[dateStr] || '';
                        
                        // Check empty and past
                        const isMissing = (recordValue === '') && isDatePastOrToday(dateStr);
                        const hasPost = recordValue !== '' && !isNaN(recordValue) && Number(recordValue) > 0;
                        const isHighlighted = activeContentCol === i;
                        
                        platformRowHTML += `
                            <div class="ct-cell ${isToday ? 'ct-today-col' : ''} ${isMissing ? 'ct-missing-post' : ''} ${hasPost ? 'ct-has-post' : ''} ${isHighlighted ? 'ct-col-highlight' : ''}">
                                <input type="text" value="${recordValue}" 
                                    onchange="updateContentRecord('${account.id}', '${platform.id}', '${dateStr}', this.value)">
                            </div>
                        `;
                    }
                    platformRowHTML += `</div>`;
                    container.innerHTML += platformRowHTML;
                });
            }
        });
    }
    
    // Ensure horizontal scrolling feels right
    container.style.width = '100%';
};

// Expose Content functions
window.changeContentMonth = changeContentMonth;
window.addContentAccount = addContentAccount;
window.renameContentAccount = renameContentAccount;
window.renameContentPlatform = renameContentPlatform;
window.deleteContentAccount = deleteContentAccount;
window.toggleContentAccount = toggleContentAccount;
window.togglePlatformTray = togglePlatformTray;
window.toggleContentPlatform = toggleContentPlatform;
window.deleteContentPlatform = deleteContentPlatform;
window.updateContentRecord = updateContentRecord;
window.toggleContentColumn = toggleContentColumn;

// Expose functions to window
window.deleteMainTask = deleteMainTask;
window.deleteSubtask = deleteSubtask;
window.toggleSubtask = toggleSubtask;
window.handleInlineAdd = handleInlineAdd;
window.updateMainTaskTitle = updateMainTaskTitle;
window.updateSubtaskTitle = updateSubtaskTitle;
window.blurOnEnter = blurOnEnter;
window.showInlineAdd = showInlineAdd;
window.toggleCollapse = toggleCollapse;
window.toggleSidebar = toggleSidebar;
