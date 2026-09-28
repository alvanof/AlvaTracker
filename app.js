// ──────────────────────────────────────────────────────────
// AlvaTracker — app.js
// ──────────────────────────────────────────────────────────

// ── State ──────────────────────────────────────────────────
let state = {
    dailyTasks:      [],  // {id, title, isCollapsed, subtasks:[{id,title,completed,repeatDaily}]}
    normalTasks:     [],
    heatmap:         {},  // 'YYYY-MM-DD' → number (0-100)
    lastOpenedDate:  '',
    contentAccounts: []   // {id, name, isCollapsed, platforms:[{id,name,records:{'YYYY-MM-DD':val}}]}
};

// ── Utilities ──────────────────────────────────────────────
const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

// ── Toast Notification ─────────────────────────────────────
const showToast = (msg, type = 'info', duration = 3000) => {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const icon = type === 'success' ? 'bx-check-circle'
               : type === 'error'   ? 'bx-x-circle'
               :                      'bx-info-circle';

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class='bx ${icon}'></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(6px)';
        t.style.transition = 'all 0.3s ease';
        setTimeout(() => t.remove(), 300);
    }, duration);
};

// ── Modal ──────────────────────────────────────────────────
/**
 * showModal({ title, desc, html, buttons:[{label, cls, action}] })
 * Returns the overlay element.
 */
const showModal = ({ title = '', desc = '', html = '', buttons = [] }) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const btnHTML = buttons.map((b, i) =>
        `<button class="${b.cls || 'btn-secondary'}" data-idx="${i}">${b.label}</button>`
    ).join('');

    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-title">${title}</div>
            ${desc ? `<div class="modal-desc">${desc}</div>` : ''}
            ${html}
            <div class="modal-actions">${btnHTML}</div>
        </div>
    `;

    overlay.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            overlay.remove();
            if (buttons[idx] && buttons[idx].action) buttons[idx].action();
        });
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    return overlay;
};

// ── Persist: localStorage + IndexedDB ─────────────────────
const DB_KEY = 'alvatracker_state';

// Primary: localStorage (fast, sync)
const saveToLocal = () => {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(state));
    } catch(e) {
        console.warn('localStorage gagal:', e);
    }
};

// Secondary: IndexedDB (kapasitas besar, async)
let idb = null;
const openIDB = () => new Promise((res, rej) => {
    const req = indexedDB.open('AlvaTrackerDB', 1);
    req.onupgradeneeded = e => {
        e.target.result.createObjectStore('data');
    };
    req.onsuccess = e => { idb = e.target.result; res(idb); };
    req.onerror   = rej;
});

const saveToIDB = async (data) => {
    try {
        const db = idb || await openIDB();
        const tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(JSON.stringify(data), 'state');
    } catch(e) { console.warn('IDB gagal:', e); }
};

const loadFromIDB = () => new Promise(async (res) => {
    try {
        const db = idb || await openIDB();
        const tx = db.transaction('data', 'readonly');
        const req = tx.objectStore('data').get('state');
        req.onsuccess = () => res(req.result ? JSON.parse(req.result) : null);
        req.onerror   = () => res(null);
    } catch(e) { res(null); }
});

// Update save-status indicator
const setSaveStatus = (saved) => {
    const el = document.getElementById('save-status');
    if (!el) return;
    if (saved) {
        el.className = 'save-status saved';
        el.innerHTML = `<i class='bx bx-check-circle'></i> Tersimpan`;
    } else {
        el.className = 'save-status';
        el.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Menyimpan…`;
    }
};

let saveTimer = null;
const saveState = () => {
    setSaveStatus(false);
    saveToLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        await saveToIDB(state);
        setSaveStatus(true);
        updateProgress();
    }, 300);
};

// ── Load State ─────────────────────────────────────────────
const loadState = async () => {
    // Try localStorage first (fast)
    let saved = null;
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch(e) {}

    // Fallback to IndexedDB
    if (!saved) {
        saved = await loadFromIDB();
    }

    if (saved) {
        state = saved;
        if (!state.contentAccounts) state.contentAccounts = [];
        checkMidnightReset();
    } else {
        state.lastOpenedDate = getTodayStr();
        saveState();
    }
};

// ── Midnight Reset ─────────────────────────────────────────
const checkMidnightReset = () => {
    const today = getTodayStr();
    if (state.lastOpenedDate !== today) {
        state.dailyTasks.forEach(task => {
            task.subtasks = task.subtasks.filter(sub => {
                if (sub.repeatDaily) {
                    sub.completed = false;
                    return true;
                }
                return !sub.completed;
            });
        });
        state.lastOpenedDate = today;
        saveState();
    }
};

// ── Export / Import ────────────────────────────────────────
const exportData = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `alvatracker_backup_${getTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data berhasil diekspor!', 'success');
};

const importData = () => {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            // Validate structure
            if (typeof parsed !== 'object' || !parsed.dailyTasks) throw new Error('Format tidak valid');

            showModal({
                title: 'Konfirmasi Import',
                desc:  `File "<b>${file.name}</b>" akan menggantikan semua data saat ini. Data yang ada tidak dapat dikembalikan!`,
                buttons: [
                    { label: 'Batal',  cls: 'btn-secondary' },
                    { label: 'Ya, Import!', cls: 'btn-danger', action: () => {
                        state = parsed;
                        if (!state.contentAccounts) state.contentAccounts = [];
                        saveState();
                        renderTaskList('daily');
                        renderTaskList('normal');
                        updateProgress();
                        renderContentGrid();
                        showToast('Data berhasil diimpor!', 'success');
                    }}
                ]
            });
        } catch(err) {
            showToast('File tidak valid: ' + err.message, 'error');
        }
    };
    input.click();
};

const clearAllData = () => {
    showModal({
        title: 'Hapus Semua Data',
        desc:  'Semua data task, akun, dan riwayat aktivitas akan dihapus permanen. Pastikan sudah backup terlebih dahulu!',
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus Semua', cls: 'btn-danger', action: () => {
                state = {
                    dailyTasks: [],
                    normalTasks: [],
                    heatmap: {},
                    lastOpenedDate: getTodayStr(),
                    contentAccounts: []
                };
                saveState();
                renderTaskList('daily');
                renderTaskList('normal');
                updateProgress();
                renderContentGrid();
                showToast('Semua data telah dihapus.', 'info');
            }}
        ]
    });
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const view = e.currentTarget.getAttribute('data-view');
            document.getElementById(`view-${view}`).classList.add('active');
            if (view === 'heatmap') renderHeatmap();
            else if (view === 'content') renderContentGrid();
        });
    });

    // Task inputs
    document.getElementById('add-daily-task-btn').addEventListener('click', () => addMainTask('daily'));
    document.getElementById('daily-task-input').addEventListener('keypress', e => { if(e.key==='Enter') addMainTask('daily'); });
    document.getElementById('add-normal-task-btn').addEventListener('click', () => addMainTask('normal'));
    document.getElementById('normal-task-input').addEventListener('keypress', e => { if(e.key==='Enter') addMainTask('normal'); });

    // Content account input
    const addAccBtn = document.getElementById('add-content-account-btn');
    const addAccInput = document.getElementById('content-account-input');
    if (addAccBtn && addAccInput) {
        addAccBtn.addEventListener('click', addContentAccount);
        addAccInput.addEventListener('keypress', e => { if(e.key==='Enter') addContentAccount(); });
    }

    // Heatmap nav
    document.getElementById('prev-month-btn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => changeMonth(1));

    // Data management buttons
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', importData);
    document.getElementById('btn-clear').addEventListener('click', clearAllData);

    // Initial render
    renderTaskList('daily');
    renderTaskList('normal');
    updateProgress();
    currentHeatmapDate = new Date();
    setSaveStatus(true);

    // Sidebar preference
    if (localStorage.getItem('alvatracker_sidebar_collapsed') === 'true') {
        document.querySelector('.sidebar').classList.add('collapsed');
    }
});

// ── Sidebar ────────────────────────────────────────────────
const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('alvatracker_sidebar_collapsed', isCollapsed);
};

// ── Add Task ───────────────────────────────────────────────
const addMainTask = (type) => {
    const input = document.getElementById(`${type}-task-input`);
    const title = input.value.trim();
    if (!title) return;

    const newTask = { id: generateId(), title, isCollapsed: false, subtasks: [] };
    if (type === 'daily') state.dailyTasks.push(newTask);
    else state.normalTasks.push(newTask);

    input.value = '';
    saveState();
    renderTaskList(type);
};

const deleteMainTask = (type, id) => {
    const task = (type === 'daily' ? state.dailyTasks : state.normalTasks).find(t => t.id === id);
    if (!task) return;

    showModal({
        title: 'Hapus Task',
        desc:  `Yakin ingin menghapus task "<b>${task.title}</b>"? Semua subtask di dalamnya juga akan ikut terhapus.`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                if (type === 'daily') state.dailyTasks = state.dailyTasks.filter(t => t.id !== id);
                else state.normalTasks = state.normalTasks.filter(t => t.id !== id);
                saveState();
                renderTaskList(type);
            }}
        ]
    });
};

// ── Subtask ────────────────────────────────────────────────
const handleInlineAdd = (event, type, taskId) => {
    if (event.key !== 'Enter') return;
    const input = event.target;
    const title = input.value.trim();
    if (!title) return;

    let repeatDaily = false;
    if (type === 'daily') {
        const cb = document.getElementById(`repeat-sub-${taskId}`);
        if (cb) repeatDaily = cb.checked;
    }

    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        task.subtasks.push({ id: generateId(), title, completed: false, repeatDaily });
        saveState();
        renderTaskList(type);
    }
};

const blurOnEnter = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
};

const updateMainTaskTitle = (type, taskId, newTitle) => {
    const t = newTitle.trim();
    if (!t) return renderTaskList(type);
    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(x => x.id === taskId);
    if (task && task.title !== t) { task.title = t; saveState(); }
};

const updateSubtaskTitle = (type, taskId, subtaskId, newTitle) => {
    const t = newTitle.trim();
    if (!t) return renderTaskList(type);
    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(x => x.id === taskId);
    if (task) {
        const sub = task.subtasks.find(s => s.id === subtaskId);
        if (sub && sub.title !== t) { sub.title = t; saveState(); }
    }
};

const deleteSubtask = (listType, taskId, subtaskId) => {
    const list = listType === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    const sub  = task && task.subtasks.find(s => s.id === subtaskId);
    if (!sub) return;

    showModal({
        title: 'Hapus Subtask',
        desc:  `Yakin ingin menghapus subtask "<b>${sub.title}</b>"?`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
                saveState();
                renderTaskList(listType);
            }}
        ]
    });
};

const toggleSubtask = (listType, taskId, subtaskId, isCompleted) => {
    const list = listType === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) {
        const sub = task.subtasks.find(s => s.id === subtaskId);
        if (sub) { sub.completed = isCompleted; saveState(); renderTaskList(listType); }
    }
};

const toggleCollapse = (type, taskId) => {
    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) { task.isCollapsed = !task.isCollapsed; saveState(); renderTaskList(type); }
};

const showInlineAdd = (type, taskId) => {
    const list = type === 'daily' ? state.dailyTasks : state.normalTasks;
    const task = list.find(t => t.id === taskId);
    if (task) { task.isCollapsed = false; saveState(); renderTaskList(type); }
    setTimeout(() => {
        const el = document.getElementById(`inline-add-container-${taskId}`);
        if (el) {
            el.style.display = 'flex';
            const inp = document.getElementById(`inline-add-input-${taskId}`);
            if (inp) inp.focus();
        }
    }, 50);
};

// ── Drag & Drop ────────────────────────────────────────────
let draggedElement = null;

const handleDragStart = (e, type, isSubtask, parentId, id) => {
    draggedElement = e.currentTarget;
    setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, isSubtask, parentId, id }));
};

const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

const handleDrop = (e, targetType, isTargetSubtask, targetParentId, targetId) => {
    e.preventDefault(); e.stopPropagation();
    if (!draggedElement) return;
    draggedElement.classList.remove('dragging');
    draggedElement = null;
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    const d = JSON.parse(dataStr);
    if (d.isSubtask !== isTargetSubtask || d.type !== targetType) return;
    const list = d.type === 'daily' ? state.dailyTasks : state.normalTasks;
    if (!d.isSubtask) {
        if (d.id === targetId) return;
        const oi = list.findIndex(t => t.id === d.id);
        const ni = list.findIndex(t => t.id === targetId);
        if (oi > -1 && ni > -1) { const [m] = list.splice(oi,1); list.splice(ni,0,m); }
    } else {
        if (d.parentId !== targetParentId || d.id === targetId) return;
        const taskObj = list.find(t => t.id === d.parentId);
        if (taskObj) {
            const oi = taskObj.subtasks.findIndex(s => s.id === d.id);
            const ni = taskObj.subtasks.findIndex(s => s.id === targetId);
            if (oi > -1 && ni > -1) { const [m] = taskObj.subtasks.splice(oi,1); taskObj.subtasks.splice(ni,0,m); }
        }
    }
    saveState();
    renderTaskList(d.type);
};

const handleDragEnd = () => {
    if (draggedElement) draggedElement.classList.remove('dragging');
    draggedElement = null;
};

// ── Progress ───────────────────────────────────────────────
const updateProgress = () => {
    let total = 0, done = 0;
    state.dailyTasks.forEach(task => {
        task.subtasks.forEach(sub => { total++; if(sub.completed) done++; });
    });
    const pct = total > 0 ? Math.round((done/total)*100) : 0;
    document.getElementById('overall-progress-text').innerText = `${pct}%`;
    const circle = document.getElementById('overall-progress-circle');
    circle.style.background = `conic-gradient(var(--primary) ${pct*3.6}deg, var(--bg-hover) 0deg)`;
    const widget = document.querySelector('.progress-widget');
    if (widget) widget.setAttribute('data-progress', `${pct}%`);
    const today = getTodayStr();
    state.heatmap[today] = pct;
};

// ── Render Tasks ───────────────────────────────────────────
const renderTaskList = (type) => {
    const container = document.getElementById(`${type}-task-list`);
    const tasks     = type === 'daily' ? state.dailyTasks : state.normalTasks;
    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-landscape'></i>
                <p>Belum ada task. Tambahkan task baru di atas!</p>
            </div>`;
        return;
    }

    tasks.forEach(task => {
        const allComplete = task.subtasks.length > 0 && task.subtasks.every(s => s.completed);
        const taskEl      = document.createElement('div');
        taskEl.className  = `task-card ${allComplete?'completed':''} ${task.isCollapsed?'collapsed':''}`;
        taskEl.draggable  = true;
        taskEl.ondragstart = e => { e.stopPropagation(); handleDragStart(e, type, false, null, task.id); };
        taskEl.ondragover  = handleDragOver;
        taskEl.ondrop      = e => handleDrop(e, type, false, null, task.id);
        taskEl.ondragend   = handleDragEnd;

        const subtasksHTML = task.subtasks.map(sub => `
            <div class="subtask-item" draggable="true"
                 ondragstart="event.stopPropagation(); handleDragStart(event,'${type}',true,'${task.id}','${sub.id}')"
                 ondragover="event.preventDefault(); event.dataTransfer.dropEffect='move';"
                 ondrop="handleDrop(event,'${type}',true,'${task.id}','${sub.id}')"
                 ondragend="handleDragEnd(event)">
                <i class='bx bx-grid-vertical drag-handle'></i>
                <div class="subtask-content">
                    <label class="custom-checkbox-wrapper">
                        <input type="checkbox"
                            onchange="toggleSubtask('${type}','${task.id}','${sub.id}',this.checked)"
                            ${sub.completed ? 'checked' : ''}>
                        <span class="custom-checkbox"></span>
                    </label>
                    <span class="subtask-title-text" contenteditable="true"
                        onblur="updateSubtaskTitle('${type}','${task.id}','${sub.id}',this.innerText)"
                        onkeypress="blurOnEnter(event)" spellcheck="false">${sub.title}</span>
                    ${type === 'daily' ? `<span class="subtask-tag ${sub.repeatDaily?'':'oneoff'}">${sub.repeatDaily ? '<i class="bx bx-repost"></i>' : '1x'}</span>` : ''}
                </div>
                <button class="icon-btn danger" onclick="deleteSubtask('${type}','${task.id}','${sub.id}')" title="Hapus subtask">
                    <i class='bx bx-trash'></i>
                </button>
            </div>
        `).join('');

        const inlineAddHTML = `
            <div class="inline-add-subtask" id="inline-add-container-${task.id}"
                 style="${task.subtasks.length===0?'display:flex':'display:none'}">
                <i class='bx bx-plus' style='color:var(--text-muted);margin-left:4px'></i>
                <input type="text" placeholder="Tambah subtask, tekan Enter…" id="inline-add-input-${task.id}"
                    onkeypress="handleInlineAdd(event,'${type}','${task.id}')">
                ${type === 'daily' ? `
                    <label class="custom-checkbox-wrapper small" title="Ulangi setiap hari">
                        <input type="checkbox" id="repeat-sub-${task.id}" checked>
                        <span class="custom-checkbox"></span>
                        <span class="label-text" style="font-size:10px;opacity:0.7">Harian</span>
                    </label>` : ''}
            </div>
        `;

        taskEl.innerHTML = `
            <div class="task-header">
                <div class="task-title ${allComplete?'completed':''}">
                    <i class='bx bx-grid-vertical drag-handle task-handle'></i>
                    <button class="icon-btn collapse-btn" onclick="toggleCollapse('${type}','${task.id}')">
                        <i class='bx bx-chevron-${task.isCollapsed?'right':'down'}'></i>
                    </button>
                    ${allComplete ? "<i class='bx bxs-check-circle' style='color:var(--primary)'></i>" : "<i class='bx bx-circle'></i>"}
                    <span class="task-title-text" contenteditable="true"
                        onblur="updateMainTaskTitle('${type}','${task.id}',this.innerText)"
                        onkeypress="blurOnEnter(event)" spellcheck="false">${task.title}</span>
                </div>
                <div class="task-actions">
                    <button class="icon-btn" onclick="showInlineAdd('${type}','${task.id}')" title="Tambah Subtask">
                        <i class='bx bx-plus'></i>
                    </button>
                    <button class="icon-btn danger" onclick="deleteMainTask('${type}','${task.id}')" title="Hapus Task">
                        <i class='bx bx-trash'></i>
                    </button>
                </div>
            </div>
            <div class="subtask-list" style="${task.isCollapsed?'display:none':'display:flex'}">
                ${subtasksHTML}
                ${inlineAddHTML}
            </div>
        `;
        container.appendChild(taskEl);
    });
};

// ── Heatmap ────────────────────────────────────────────────
let currentHeatmapDate = new Date();

const changeMonth = (offset) => {
    currentHeatmapDate.setMonth(currentHeatmapDate.getMonth() + offset);
    renderHeatmap();
};

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];
const HARI_PENDEK = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

const renderHeatmap = () => {
    const year  = currentHeatmapDate.getFullYear();
    const month = currentHeatmapDate.getMonth();
    document.getElementById('current-month-label').innerText = `${BULAN[month]} ${year}`;

    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';

    const firstDay   = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const todayStr   = getTodayStr();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'heatmap-cell';
        empty.style.opacity = '0';
        grid.appendChild(empty);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const pct      = state.heatmap[dateStr] !== undefined ? state.heatmap[dateStr] : 0;
        const cell     = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.innerText = i;

        if      (pct > 0  && pct < 40)  cell.classList.add('level-1');
        else if (pct >= 40 && pct < 70)  cell.classList.add('level-2');
        else if (pct >= 70 && pct < 100) cell.classList.add('level-3');
        else if (pct === 100)             cell.classList.add('level-4');

        if (dateStr === todayStr) cell.style.border = '2px solid var(--primary)';

        const tip = document.createElement('span');
        tip.className = 'tooltip';
        tip.innerText = `${pct}% selesai`;
        cell.appendChild(tip);
        grid.appendChild(cell);
    }
};

// ── Content Tracker ────────────────────────────────────────
let currentContentDate = new Date();
let activeContentCol   = null;

const AVAILABLE_PLATFORMS = [
    { name: 'Facebook',  icon: 'bxl-facebook-square', color: '#3b82f6' },
    { name: 'Instagram', icon: 'bxl-instagram',        color: '#ec4899' },
    { name: 'TikTok',   icon: 'bxl-tiktok',           color: '#f0f0f0' },
    { name: 'YouTube',  icon: 'bxl-youtube',           color: '#ef4444' },
    { name: 'Shorts',   icon: 'bx-video',              color: '#ef4444' },
    { name: 'Twitter',  icon: 'bxl-twitter',           color: '#1da1f2' },
    { name: 'LinkedIn', icon: 'bxl-linkedin',          color: '#0a66c2' },
];

const platformIconHTML = (name, size = 14) => {
    const p = AVAILABLE_PLATFORMS.find(x => x.name === name);
    if (!p) return '';
    return `<i class='bx ${p.icon}' style='color:${p.color};font-size:${size}px'></i>`;
};

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
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    state.contentAccounts.push({ id: generateId(), name, isCollapsed: false, platforms: [] });
    input.value = '';
    saveState();
    renderContentGrid();
    showToast(`Akun "${name}" ditambahkan.`, 'success');
};

const renameContentAccount = (accountId, newName) => {
    const acc = state.contentAccounts.find(a => a.id === accountId);
    if (!acc) return;
    const n = newName.trim();
    if (n && n !== acc.name) { acc.name = n; saveState(); }
};

const deleteContentAccount = (accountId) => {
    const acc = state.contentAccounts.find(a => a.id === accountId);
    if (!acc) return;
    showModal({
        title: 'Hapus Akun',
        desc:  `Yakin ingin menghapus akun "<b>${acc.name}</b>"? Semua data tracking platform di dalamnya akan terhapus.`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                state.contentAccounts = state.contentAccounts.filter(a => a.id !== accountId);
                saveState();
                renderContentGrid();
                showToast('Akun dihapus.', 'info');
            }}
        ]
    });
};

const toggleContentAccount = (accountId) => {
    const acc = state.contentAccounts.find(a => a.id === accountId);
    if (acc) { acc.isCollapsed = !acc.isCollapsed; saveState(); renderContentGrid(); }
};

/**
 * Open a modal to manage platforms for the given account.
 * Toggle (add/remove) platform with single click, saved only on "Selesai".
 */
const openPlatformModal = (accountId) => {
    const acc = state.contentAccounts.find(a => a.id === accountId);
    if (!acc) return;

    // Snapshot of currently active platforms
    const active = new Set(acc.platforms.map(p => p.name));
    const pending = new Set(active); // will be modified by toggles inside modal

    const overlay = showModal({
        title: `Platform — ${acc.name}`,
        desc:  'Klik platform untuk mengaktifkan / menonaktifkan. Klik <b>Selesai</b> untuk menyimpan.',
        html:  `<div class="modal-platform-grid" id="modal-plat-grid"></div>`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            {
                label: 'Selesai', cls: 'btn-primary', action: () => {
                    // Apply changes
                    // Remove deselected
                    acc.platforms = acc.platforms.filter(p => pending.has(p.name));
                    // Add newly selected
                    pending.forEach(name => {
                        if (!acc.platforms.find(p => p.name === name)) {
                            acc.platforms.push({ id: generateId(), name, records: {} });
                        }
                    });
                    saveState();
                    renderContentGrid();
                    showToast('Platform diperbarui.', 'success');
                }
            }
        ]
    });

    // Populate grid after modal is in DOM
    const grid = document.getElementById('modal-plat-grid');
    if (!grid) return;

    const renderPlatBtns = () => {
        grid.innerHTML = '';
        AVAILABLE_PLATFORMS.forEach(p => {
            const btn = document.createElement('button');
            btn.className = `platform-btn${pending.has(p.name) ? ' active' : ''}`;
            btn.innerHTML = `<i class='bx ${p.icon}' style='color:${p.color}'></i> ${p.name}`;
            btn.addEventListener('click', () => {
                if (pending.has(p.name)) pending.delete(p.name);
                else pending.add(p.name);
                renderPlatBtns();
            });
            grid.appendChild(btn);
        });
    };

    renderPlatBtns();
};

const deleteContentPlatform = (accountId, platformId) => {
    const acc  = state.contentAccounts.find(a => a.id === accountId);
    const plat = acc && acc.platforms.find(p => p.id === platformId);
    if (!plat) return;

    showModal({
        title: 'Hapus Platform',
        desc:  `Yakin ingin menghapus platform "<b>${plat.name}</b>" dari akun "<b>${acc.name}</b>"? Semua data record akan hilang.`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                acc.platforms = acc.platforms.filter(p => p.id !== platformId);
                saveState();
                renderContentGrid();
                showToast('Platform dihapus.', 'info');
            }}
        ]
    });
};

const updateContentRecord = (accountId, platformId, dateStr, value) => {
    const acc  = state.contentAccounts.find(a => a.id === accountId);
    const plat = acc && acc.platforms.find(p => p.id === platformId);
    if (!plat) return;
    if (value === '' || value === null) {
        delete plat.records[dateStr];
    } else {
        plat.records[dateStr] = value;
    }
    saveState();
    // Re-render just the cell classes without full re-render for performance
    const cell = document.querySelector(`[data-cell="${platformId}-${dateStr}"]`);
    if (cell) {
        const isMissing = (!value || value === '') && isDatePastOrToday(dateStr);
        const hasPost   = value !== '' && !isNaN(value) && Number(value) > 0;
        cell.classList.toggle('ct-missing-post', isMissing);
        cell.classList.toggle('ct-has-post', hasPost);
    }
};

const isDatePastOrToday = (dateStr) => {
    const today  = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateStr); target.setHours(0,0,0,0);
    return target.getTime() <= today.getTime();
};

const renderContentGrid = () => {
    const container = document.getElementById('content-tracker-grid');
    if (!container) return;

    const year  = currentContentDate.getFullYear();
    const month = currentContentDate.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const realTodayStr = getTodayStr();

    const monthLabel = document.getElementById('content-month-label');
    if (monthLabel) monthLabel.innerText = `${BULAN[month]} ${year}`;

    container.innerHTML = '';

    // ── Header row ─────────────────────────────────────────
    let headerHTML = `
        <div class="ct-row ct-date-row">
            <div class="ct-header-col">Akun &amp; Platform</div>
    `;
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr     = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isToday     = dateStr === realTodayStr;
        const isHighlight = activeContentCol === i;
        headerHTML += `<div class="ct-cell ${isToday?'ct-today-col':''} ${isHighlight?'ct-col-highlight':''}"
            style="cursor:pointer;" onclick="toggleContentColumn(${i})" title="Klik untuk sorot kolom">${i}</div>`;
    }
    headerHTML += `</div>`;
    container.innerHTML += headerHTML;

    // ── Body ───────────────────────────────────────────────
    if (!state.contentAccounts || state.contentAccounts.length === 0) {
        container.innerHTML += `<div style="padding:20px 12px; color:var(--text-muted); font-size:13px;">Belum ada akun. Tambahkan akun baru di atas.</div>`;
        return;
    }

    state.contentAccounts.forEach(account => {
        // Account row
        container.innerHTML += `
            <div class="ct-row ct-account-row">
                <div class="ct-header-col">
                    <div class="account-name-container" onclick="toggleContentAccount('${account.id}')">
                        <i class='bx bx-chevron-${account.isCollapsed ? 'right' : 'down'}'></i>
                        <span contenteditable="true"
                            onclick="event.stopPropagation()"
                            onblur="renameContentAccount('${account.id}',this.innerText)"
                            onkeypress="blurOnEnter(event)"
                            spellcheck="false">${account.name}</span>
                    </div>
                    <div class="ct-account-actions">
                        <button class="icon-btn" style="font-size:15px;" onclick="openPlatformModal('${account.id}')" title="Kelola Platform">
                            <i class='bx bx-plus'></i>
                        </button>
                        <button class="icon-btn danger" style="font-size:15px;" onclick="deleteContentAccount('${account.id}')" title="Hapus Akun">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </div>
                <div class="ct-account-spacer"></div>
            </div>
        `;

        if (!account.isCollapsed) {
            if (account.platforms.length === 0) {
                container.innerHTML += `
                    <div class="ct-row ct-platform-row">
                        <div class="ct-header-col" style="padding-left:28px; color:var(--text-dim); font-size:11px; cursor:pointer;" onclick="openPlatformModal('${account.id}')">
                            <i class='bx bx-plus' style="font-size:13px;"></i> Tambah platform…
                        </div>
                    </div>
                `;
            }

            account.platforms.forEach(platform => {
                const icon = platformIconHTML(platform.name, 13);
                let platformRowHTML = `
                    <div class="ct-row ct-platform-row">
                        <div class="ct-header-col">
                            <div class="plat-name">${icon} <span>${platform.name}</span></div>
                            <button class="icon-btn danger" style="font-size:13px;" onclick="deleteContentPlatform('${account.id}','${platform.id}')" title="Hapus Platform">
                                <i class='bx bx-trash'></i>
                            </button>
                        </div>
                `;

                for (let i = 1; i <= daysInMonth; i++) {
                    const dateStr     = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                    const isToday     = dateStr === realTodayStr;
                    const recordValue = platform.records[dateStr] || '';
                    const isMissing   = (recordValue === '') && isDatePastOrToday(dateStr);
                    const hasPost     = recordValue !== '' && !isNaN(recordValue) && Number(recordValue) > 0;
                    const isHighlight = activeContentCol === i;
                    platformRowHTML += `
                        <div class="ct-cell ${isToday?'ct-today-col':''} ${isMissing?'ct-missing-post':''} ${hasPost?'ct-has-post':''} ${isHighlight?'ct-col-highlight':''}"
                             data-cell="${platform.id}-${dateStr}">
                            <input type="text" value="${recordValue}"
                                onchange="updateContentRecord('${account.id}','${platform.id}','${dateStr}',this.value)"
                                title="${dateStr}">
                        </div>
                    `;
                }
                platformRowHTML += `</div>`;
                container.innerHTML += platformRowHTML;
            });
        }
    });
};

// ── Expose globals ─────────────────────────────────────────
window.changeContentMonth       = changeContentMonth;
window.addContentAccount        = addContentAccount;
window.renameContentAccount     = renameContentAccount;
window.deleteContentAccount     = deleteContentAccount;
window.toggleContentAccount     = toggleContentAccount;
window.openPlatformModal        = openPlatformModal;
window.deleteContentPlatform    = deleteContentPlatform;
window.updateContentRecord      = updateContentRecord;
window.toggleContentColumn      = toggleContentColumn;
window.deleteMainTask           = deleteMainTask;
window.deleteSubtask            = deleteSubtask;
window.toggleSubtask            = toggleSubtask;
window.handleInlineAdd          = handleInlineAdd;
window.updateMainTaskTitle      = updateMainTaskTitle;
window.updateSubtaskTitle       = updateSubtaskTitle;
window.blurOnEnter              = blurOnEnter;
window.showInlineAdd            = showInlineAdd;
window.toggleCollapse           = toggleCollapse;
window.toggleSidebar            = toggleSidebar;
window.exportData               = exportData;
window.importData               = importData;
window.clearAllData             = clearAllData;
