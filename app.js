/* ══════════════════════════════════════════════════════════
   AlvaTracker — app.js
   ══════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let state = {
    dailyTasks:      [],
    normalTasks:     [],
    heatmap:         {},
    lastOpenedDate:  '',
    contentAccounts: [],
    streak:          0,
    lastStreakDate:  ''   // date of last day streak was counted (100% completed)
};

// ── Utilities ──────────────────────────────────────────────
const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

// ── Undo Stack ─────────────────────────────────────────────
const MAX_UNDO = 30;
let undoStack = [];

const pushUndo = () => {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoBtn();
};

const undo = () => {
    if (undoStack.length === 0) return;
    state = JSON.parse(undoStack.pop());
    saveToLocal();
    saveToIDB(state);
    renderTaskList('daily');
    renderTaskList('normal');
    updateProgress();
    updateStreakDisplay();
    renderContentGrid();
    updateUndoBtn();
    showToast('Aksi dibatalkan (Ctrl+Z)', 'info', 2000);
};

const updateUndoBtn = () => {
    const btn = document.getElementById('btn-undo');
    if (btn) btn.disabled = undoStack.length === 0;
};

// ── Toast ──────────────────────────────────────────────────
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

// ── Theme Toggle ───────────────────────────────────────────
let currentTheme = 'dark';

const toggleTheme = () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme();
    localStorage.setItem('alvatracker_theme', currentTheme);
    showToast(currentTheme === 'light' ? 'Mode terang aktif ☀️' : 'Mode gelap aktif 🌙', 'info', 1500);
};

const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', currentTheme === 'light' ? 'light' : '');
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = currentTheme === 'light'
        ? `<i class='bx bx-moon'></i>`
        : `<i class='bx bx-sun'></i>`;
};

const loadTheme = () => {
    currentTheme = localStorage.getItem('alvatracker_theme') || 'dark';
    applyTheme();
};

// ── Modal ──────────────────────────────────────────────────
const showModal = ({ title = '', desc = '', html = '', buttons = [] }) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const btnHTML = buttons.map((b, i) =>
        `<button class="${b.cls || 'btn-secondary'}" data-idx="${i}" style="font-family:inherit;">${b.label}</button>`
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
            if (buttons[idx]?.action) buttons[idx].action();
        });
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return overlay;
};

// ── Persist ────────────────────────────────────────────────
const DB_KEY = 'alvatracker_state';

const saveToLocal = () => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(state)); } catch(e) {}
};

let idb = null;
const openIDB = () => new Promise((res, rej) => {
    const req = indexedDB.open('AlvaTrackerDB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('data');
    req.onsuccess = e => { idb = e.target.result; res(idb); };
    req.onerror   = rej;
});

const saveToIDB = async (data) => {
    try {
        const db = idb || await openIDB();
        const tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(JSON.stringify(data), 'state');
    } catch(e) {}
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

// ── Load ───────────────────────────────────────────────────
const loadState = async () => {
    let saved = null;
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch(e) {}

    if (!saved) saved = await loadFromIDB();

    if (saved) {
        state = saved;
        if (!state.contentAccounts) state.contentAccounts = [];
        if (state.streak  === undefined) state.streak  = 0;
        if (!state.lastStreakDate) state.lastStreakDate = '';
        // Migrate old xp fields out (cleanup)
        delete state.xp;
        delete state.level;
        delete state.lastXpDate;
        checkMidnightReset();
    } else {
        state.lastOpenedDate = getTodayStr();
        saveState();
    }
};

// ── Midnight Reset ─────────────────────────────────────────
const checkMidnightReset = () => {
    const today     = getTodayStr();
    const yesterday = getYesterdayStr();

    if (state.lastOpenedDate !== today) {
        // Reset daily subtasks
        state.dailyTasks.forEach(task => {
            task.subtasks = task.subtasks.filter(sub => {
                if (sub.repeatDaily) { sub.completed = false; return true; }
                return !sub.completed;
            });
        });

        // Streak: if yesterday wasn't a perfect day → reset streak
        if (state.lastStreakDate !== yesterday) {
            const hadTasks = state.dailyTasks.some(t => t.subtasks.length > 0);
            if (hadTasks) {
                state.streak = 0;
                updateStreakDisplay();
            }
        }

        state.lastOpenedDate = today;
        saveState();
    }
};

// ── Streak Logic ───────────────────────────────────────────
/**
 * Called when daily progress hits 100%.
 * Only increments streak once per day.
 */
const checkAndUpdateStreak = () => {
    const today     = getTodayStr();
    const yesterday = getYesterdayStr();

    if (state.lastStreakDate === today) return; // already counted today

    if (state.lastStreakDate === yesterday) {
        state.streak = (state.streak || 0) + 1;
    } else {
        state.streak = 1; // new streak start
    }

    state.lastStreakDate = today;
    updateStreakDisplay(true); // true = animate
    saveToLocal();
    saveToIDB(state);

    showToast(`🔥 Streak ${state.streak} hari! Pertahankan!`, 'success', 3500);
};

const updateStreakDisplay = (animate = false) => {
    const badge   = document.getElementById('streak-badge');
    const numEl   = document.getElementById('streak-num');
    const inactEl = document.getElementById('streak-inactive');
    const wrapEl  = document.getElementById('streak-section-wrap');

    const s = state.streak || 0;
    const isActive = s > 0;

    if (wrapEl) wrapEl.style.display = 'flex';
    if (numEl)  numEl.textContent = s;

    if (badge)   badge.style.display   = isActive ? 'flex' : 'none';
    if (inactEl) inactEl.style.display = isActive ? 'none' : 'flex';

    if (animate && badge) {
        badge.classList.remove('new-streak');
        void badge.offsetWidth; // reflow
        badge.classList.add('new-streak');
    }
};

// ── Export / Import / Clear ────────────────────────────────
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
    const input   = document.createElement('input');
    input.type    = 'file';
    input.accept  = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (typeof parsed !== 'object' || !parsed.dailyTasks) throw new Error('Format tidak valid');
            showModal({
                title: 'Konfirmasi Import',
                desc:  `File "<b>${file.name}</b>" akan menggantikan semua data saat ini.`,
                buttons: [
                    { label: 'Batal', cls: 'btn-secondary' },
                    { label: 'Ya, Import!', cls: 'btn-danger', action: () => {
                        state = parsed;
                        if (!state.contentAccounts) state.contentAccounts = [];
                        if (!state.streak)          state.streak = 0;
                        if (!state.lastStreakDate)   state.lastStreakDate = '';
                        saveState();
                        renderAll();
                        showToast('Data berhasil diimpor!', 'success');
                    }}
                ]
            });
        } catch(err) { showToast('File tidak valid: ' + err.message, 'error'); }
    };
    input.click();
};

const clearAllData = () => {
    showModal({
        title: 'Hapus Semua Data',
        desc:  'Semua data task, akun, dan riwayat akan dihapus permanen. Backup dulu ya!',
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus Semua', cls: 'btn-danger', action: () => {
                state = {
                    dailyTasks:[], normalTasks:[], heatmap:{},
                    lastOpenedDate: getTodayStr(),
                    contentAccounts:[],
                    streak:0, lastStreakDate:''
                };
                undoStack = [];
                saveState();
                renderAll();
                showToast('Semua data telah dihapus.', 'info');
            }}
        ]
    });
};

const renderAll = () => {
    renderTaskList('daily');
    renderTaskList('normal');
    updateProgress();
    updateStreakDisplay();
    updateUndoBtn();
    renderContentGrid();
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    loadTheme();

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const view = e.currentTarget.getAttribute('data-view');
            document.getElementById(`view-${view}`).classList.add('active');
            if (view === 'heatmap') renderHeatmap();
            else if (view === 'content') renderContentGrid();
            else if (view === 'pomodoro') { updatePomoDisplay(); updateNotifBtn(); }
        });
    });

    document.getElementById('add-daily-task-btn')?.addEventListener('click', () => addMainTask('daily'));
    document.getElementById('daily-task-input')?.addEventListener('keypress', e => { if(e.key==='Enter') addMainTask('daily'); });
    document.getElementById('add-normal-task-btn')?.addEventListener('click', () => addMainTask('normal'));
    document.getElementById('normal-task-input')?.addEventListener('keypress', e => { if(e.key==='Enter') addMainTask('normal'); });

    const addAccBtn   = document.getElementById('add-content-account-btn');
    const addAccInput = document.getElementById('content-account-input');
    if (addAccBtn && addAccInput) {
        addAccBtn.addEventListener('click', addContentAccount);
        addAccInput.addEventListener('keypress', e => { if(e.key==='Enter') addContentAccount(); });
    }

    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeMonth(1));

    document.getElementById('btn-export')?.addEventListener('click', exportData);
    document.getElementById('btn-import')?.addEventListener('click', importData);
    document.getElementById('btn-clear')?.addEventListener('click', clearAllData);
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);

    // Global keyboard shortcut: Ctrl+Z
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            const active = document.activeElement;
            const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
            if (!isEditing) { e.preventDefault(); undo(); }
        }
    });

    renderAll();
    currentHeatmapDate = new Date();
    setSaveStatus(true);

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

// ── Task Actions ───────────────────────────────────────────
const addMainTask = (type) => {
    const input = document.getElementById(`${type}-task-input`);
    const title = input.value.trim();
    if (!title) return;
    pushUndo();
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
        desc:  `Yakin hapus task "<b>${task.title}</b>"? (Bisa di-undo dengan Ctrl+Z)`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                pushUndo();
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
        pushUndo();
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
    const sub  = task?.subtasks.find(s => s.id === subtaskId);
    if (!sub) return;
    showModal({
        title: 'Hapus Subtask',
        desc:  `Yakin hapus subtask "<b>${sub.title}</b>"? (Bisa di-undo dengan Ctrl+Z)`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                pushUndo();
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
    if (!task) return;
    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub) return;

    pushUndo();
    sub.completed = isCompleted;
    saveState();
    renderTaskList(listType);
    // updateProgress will check streak via updateProgress call inside saveState
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
            document.getElementById(`inline-add-input-${taskId}`)?.focus();
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
    pushUndo();
    const list = d.type === 'daily' ? state.dailyTasks : state.normalTasks;
    if (!d.isSubtask) {
        if (d.id === targetId) { undoStack.pop(); updateUndoBtn(); return; }
        const oi = list.findIndex(t => t.id === d.id);
        const ni = list.findIndex(t => t.id === targetId);
        if (oi > -1 && ni > -1) { const [m] = list.splice(oi,1); list.splice(ni,0,m); }
    } else {
        if (d.parentId !== targetParentId || d.id === targetId) { undoStack.pop(); updateUndoBtn(); return; }
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

    // ── Streak: only when 100% AND there are tasks ──
    if (pct === 100 && total > 0) {
        checkAndUpdateStreak();
    }
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
        const taskEl = document.createElement('div');
        taskEl.className = `task-card ${allComplete?'completed':''} ${task.isCollapsed?'collapsed':''}`;
        taskEl.draggable = true;
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
                        onkeypress="blurOnEnter(event)" spellcheck="false"
                        style="${sub.completed ? 'text-decoration:line-through;opacity:0.5' : ''}">${sub.title}</span>
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
                    ${allComplete
                        ? "<i class='bx bxs-check-circle' style='color:var(--primary)'></i>"
                        : "<i class='bx bx-circle'></i>"}
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

const renderHeatmap = () => {
    const year  = currentHeatmapDate.getFullYear();
    const month = currentHeatmapDate.getMonth();
    document.getElementById('current-month-label').innerText = `${BULAN[month]} ${year}`;

    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const todayStr    = getTodayStr();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'heatmap-cell';
        empty.style.opacity = '0';
        grid.appendChild(empty);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const pct     = state.heatmap[dateStr] !== undefined ? state.heatmap[dateStr] : 0;
        const cell    = document.createElement('div');
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

const platformIconHTML = (name, size = 13) => {
    const p = AVAILABLE_PLATFORMS.find(x => x.name === name);
    return p ? `<i class='bx ${p.icon}' style='color:${p.color};font-size:${size}px'></i>` : '';
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
    pushUndo();
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
        desc:  `Yakin hapus akun "<b>${acc.name}</b>"? (Bisa di-undo dengan Ctrl+Z)`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                pushUndo();
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

const openPlatformModal = (accountId) => {
    const acc = state.contentAccounts.find(a => a.id === accountId);
    if (!acc) return;

    const pending = new Set(acc.platforms.map(p => p.name));

    showModal({
        title: `Platform — ${acc.name}`,
        desc:  'Klik untuk aktifkan/nonaktifkan. Klik <b>Selesai</b> untuk menyimpan.',
        html:  `<div class="modal-platform-grid" id="modal-plat-grid"></div>`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Selesai', cls: 'btn-primary', action: () => {
                pushUndo();
                acc.platforms = acc.platforms.filter(p => pending.has(p.name));
                pending.forEach(name => {
                    if (!acc.platforms.find(p => p.name === name)) {
                        acc.platforms.push({ id: generateId(), name, records: {} });
                    }
                });
                saveState();
                renderContentGrid();
                showToast('Platform diperbarui.', 'success');
            }}
        ]
    });

    const grid = document.getElementById('modal-plat-grid');
    if (!grid) return;

    const renderPlatBtns = () => {
        grid.innerHTML = '';
        AVAILABLE_PLATFORMS.forEach(p => {
            const btn = document.createElement('button');
            btn.className = `platform-btn${pending.has(p.name) ? ' active' : ''}`;
            btn.style.fontFamily = 'inherit';
            btn.innerHTML = `<i class='bx ${p.icon}' style='color:${p.color}'></i> ${p.name}`;
            btn.addEventListener('click', () => {
                pending.has(p.name) ? pending.delete(p.name) : pending.add(p.name);
                renderPlatBtns();
            });
            grid.appendChild(btn);
        });
    };

    renderPlatBtns();
};

const deleteContentPlatform = (accountId, platformId) => {
    const acc  = state.contentAccounts.find(a => a.id === accountId);
    const plat = acc?.platforms.find(p => p.id === platformId);
    if (!plat) return;
    showModal({
        title: 'Hapus Platform',
        desc:  `Yakin hapus platform "<b>${plat.name}</b>"? (Bisa di-undo dengan Ctrl+Z)`,
        buttons: [
            { label: 'Batal', cls: 'btn-secondary' },
            { label: 'Hapus', cls: 'btn-danger', action: () => {
                pushUndo();
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
    const plat = acc?.platforms.find(p => p.id === platformId);
    if (!plat) return;
    pushUndo();
    if (value === '' || value === null) delete plat.records[dateStr];
    else plat.records[dateStr] = value;
    saveState();
    // Lightweight cell update + update total col
    const cell = document.querySelector(`[data-cell="${platformId}-${dateStr}"]`);
    if (cell) {
        const isPastOrToday = isDatePastOrToday(dateStr);
        const hasValue  = value !== '' && !isNaN(value) && Number(value) > 0;
        const isMissing = (!value || value === '') && isPastOrToday;
        const isCompleted = hasValue && isPastOrToday;
        const isScheduled = hasValue && !isPastOrToday;
        cell.classList.toggle('ct-missing-post', isMissing);
        cell.classList.toggle('ct-has-post', isCompleted);
        cell.classList.toggle('ct-scheduled-post', isScheduled);
    }
    // Update total column for this platform row
    const totalCell = document.querySelector(`[data-total="${platformId}"]`);
    if (totalCell) {
        const total = calcPlatformTotal(plat, currentContentDate.getFullYear(), currentContentDate.getMonth());
        totalCell.textContent = total > 0 ? total : '—';
        totalCell.className = `ct-total-col ${total > 0 ? 'has-total' : ''}`;
    }
};

const isDatePastOrToday = (dateStr) => {
    const today  = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateStr); target.setHours(0,0,0,0);
    return target.getTime() <= today.getTime();
};

const calcPlatformTotal = (platform, year, month) => {
    const daysInMonth = new Date(year, month+1, 0).getDate();
    let total = 0;
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const v = platform.records[dateStr];
        if (v !== undefined && v !== '' && !isNaN(v)) total += Number(v);
    }
    return total;
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
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isToday = dateStr === realTodayStr;
        const isHL    = activeContentCol === i;
        headerHTML += `<div class="ct-cell ${isToday?'ct-today-col':''} ${isHL?'ct-col-highlight':''}"
            style="cursor:pointer;" onclick="toggleContentColumn(${i})" title="Klik untuk sorot">${i}</div>`;
    }
    // Total header
    headerHTML += `<div class="ct-total-col header-total">Total</div>`;
    headerHTML += `</div>`;
    container.innerHTML += headerHTML;

    if (!state.contentAccounts || state.contentAccounts.length === 0) {
        container.innerHTML += `<div style="padding:18px 12px; color:var(--text-muted); font-size:13px;">Belum ada akun. Tambahkan akun baru di atas.</div>`;
        return;
    }

    let spacerHTML = '';
    for (let i = 1; i <= daysInMonth; i++) {
        spacerHTML += `<div class="ct-cell" style="border:none;pointer-events:none;"></div>`;
    }

    state.contentAccounts.forEach(account => {
        container.innerHTML += `
            <div class="ct-row ct-account-row">
                <div class="ct-header-col">
                    <div class="account-name-container" onclick="toggleContentAccount('${account.id}')">
                        <i class='bx bx-chevron-${account.isCollapsed?'right':'down'}'></i>
                        <span contenteditable="true"
                            onclick="event.stopPropagation()"
                            onblur="renameContentAccount('${account.id}',this.innerText)"
                            onkeypress="blurOnEnter(event)"
                            spellcheck="false">${account.name}</span>
                    </div>
                    <div class="ct-account-actions">
                        <button class="icon-btn" style="font-size:14px;" onclick="openPlatformModal('${account.id}')" title="Kelola Platform">
                            <i class='bx bx-plus'></i>
                        </button>
                        <button class="icon-btn danger" style="font-size:14px;" onclick="deleteContentAccount('${account.id}')" title="Hapus Akun">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </div>
                ${spacerHTML}
                <div class="ct-total-col header-total" style="background:var(--bg-hover);">—</div>
            </div>
        `;

        if (!account.isCollapsed) {
            if (account.platforms.length === 0) {
                container.innerHTML += `
                    <div class="ct-row ct-platform-row">
                        <div class="ct-header-col" style="cursor:pointer;color:var(--text-dim);font-size:11px;" onclick="openPlatformModal('${account.id}')">
                            <span style="padding-left:14px; display:flex; align-items:center; gap:4px;">
                                <i class='bx bx-plus' style="font-size:12px;"></i> Tambah platform…
                            </span>
                        </div>
                        ${spacerHTML}
                        <div class="ct-total-col">—</div>
                    </div>
                `;
            }

            account.platforms.forEach(platform => {
                const icon  = platformIconHTML(platform.name, 13);
                const total = calcPlatformTotal(platform, year, month);
                let rowHTML = `
                    <div class="ct-row ct-platform-row">
                        <div class="ct-header-col">
                            <div class="plat-name">${icon} <span>${platform.name}</span></div>
                            <button class="icon-btn danger" style="font-size:12px;" onclick="deleteContentPlatform('${account.id}','${platform.id}')">
                                <i class='bx bx-trash'></i>
                            </button>
                        </div>
                `;

                for (let i = 1; i <= daysInMonth; i++) {
                    const dateStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                    const isToday   = dateStr === realTodayStr;
                    const val       = platform.records[dateStr] || '';
                    const isPastOrToday = isDatePastOrToday(dateStr);
                    const hasValue  = val !== '' && !isNaN(val) && Number(val) > 0;
                    const isMissing = (val === '') && isPastOrToday;
                    const isCompleted = hasValue && isPastOrToday;
                    const isScheduled = hasValue && !isPastOrToday;
                    const isHL      = activeContentCol === i;
                    rowHTML += `
                        <div class="ct-cell ${isToday?'ct-today-col':''} ${isMissing?'ct-missing-post':''} ${isCompleted?'ct-has-post':''} ${isScheduled?'ct-scheduled-post':''} ${isHL?'ct-col-highlight':''}"
                             data-cell="${platform.id}-${dateStr}">
                            <input type="text" value="${val}"
                                onchange="updateContentRecord('${account.id}','${platform.id}','${dateStr}',this.value)"
                                title="${dateStr}">
                        </div>
                    `;
                }

                // Total column
                rowHTML += `<div class="ct-total-col ${total > 0 ? 'has-total' : ''}" data-total="${platform.id}">${total > 0 ? total : '—'}</div>`;
                rowHTML += `</div>`;
                container.innerHTML += rowHTML;
            });
        }
    });
};

// ── Expose globals ─────────────────────────────────────────
window.changeContentMonth    = changeContentMonth;
window.addContentAccount     = addContentAccount;
window.renameContentAccount  = renameContentAccount;
window.deleteContentAccount  = deleteContentAccount;
window.toggleContentAccount  = toggleContentAccount;
window.openPlatformModal     = openPlatformModal;
window.deleteContentPlatform = deleteContentPlatform;
window.updateContentRecord   = updateContentRecord;
window.toggleContentColumn   = toggleContentColumn;
window.deleteMainTask        = deleteMainTask;
window.deleteSubtask         = deleteSubtask;
window.toggleSubtask         = toggleSubtask;
window.handleInlineAdd       = handleInlineAdd;
window.updateMainTaskTitle   = updateMainTaskTitle;
window.updateSubtaskTitle    = updateSubtaskTitle;
window.blurOnEnter           = blurOnEnter;
window.showInlineAdd         = showInlineAdd;
window.toggleCollapse        = toggleCollapse;
window.toggleSidebar         = toggleSidebar;
window.toggleTheme           = toggleTheme;
window.exportData            = exportData;
window.importData            = importData;
window.clearAllData          = clearAllData;
window.undo                  = undo;

// ── Pomodoro Timer ─────────────────────────────────────────
const POMO_MODES = {
    focus: { label: 'Fokus',             duration: 25 * 60, color: '#7c6af7', breakMode: false },
    short: { label: 'Istirahat Pendek',  duration:  5 * 60, color: '#22c55e', breakMode: true  },
    long:  { label: 'Istirahat Panjang', duration: 15 * 60, color: '#3b82f6', breakMode: true  },
};

let pomoState = {
    mode:       'focus',
    timeLeft:   25 * 60,
    running:    false,
    session:    0,        // completed focus sessions (0-3 in current cycle)
    totalDone:  0,        // all-time completed sessions
    intervalId: null
};

const formatPomoTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

const setPomoMode = (mode) => {
    clearInterval(pomoState.intervalId);
    pomoState.mode    = mode;
    pomoState.timeLeft = POMO_MODES[mode].duration;
    pomoState.running = false;
    document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`pomo-btn-${mode}`);
    if (btn) btn.classList.add('active');
    updatePomoDisplay();
};

const togglePomo = () => {
    if (pomoState.running) {
        clearInterval(pomoState.intervalId);
        pomoState.running = false;
    } else {
        requestPomoNotif();
        pomoState.running = true;
        pomoState.intervalId = setInterval(() => {
            if (pomoState.timeLeft > 0) {
                pomoState.timeLeft--;
                updatePomoDisplay();
            } else {
                clearInterval(pomoState.intervalId);
                pomoState.running = false;
                onPomoComplete();
            }
        }, 1000);
    }
    updatePomoDisplay();
};

const resetPomo = () => {
    clearInterval(pomoState.intervalId);
    pomoState.timeLeft = POMO_MODES[pomoState.mode].duration;
    pomoState.running  = false;
    updatePomoDisplay();
};

const onPomoComplete = () => {
    playPomoBeep();

    if (pomoState.mode === 'focus') {
        pomoState.totalDone++;
        pomoState.session = (pomoState.session + 1) % 4;
        const isLongBreak = pomoState.session === 0;
        const breakMode   = isLongBreak ? 'long' : 'short';
        sendPomoNotif(
            '✅ Sesi fokus selesai!',
            isLongBreak ? 'Keren! Waktunya istirahat panjang 15 menit.' : 'Istirahat 5 menit dulu.'
        );
        showToast(`Sesi selesai! 🎉 Istirahat ${isLongBreak ? '15' : '5'} menit.`, 'success', 4000);
        setTimeout(() => setPomoMode(breakMode), 600);
    } else {
        pomoState.session = 0;
        sendPomoNotif('⏰ Istirahat selesai!', 'Saatnya fokus lagi! 💪');
        showToast('Istirahat selesai! Yuk fokus lagi 💪', 'info', 3000);
        setTimeout(() => setPomoMode('focus'), 600);
    }

    updatePomoDisplay();
};

const updatePomoDisplay = () => {
    const timeEl    = document.getElementById('pomo-time');
    if (!timeEl) return;

    const modeData  = POMO_MODES[pomoState.mode];
    const total     = modeData.duration;
    const pct       = (pomoState.timeLeft / total);
    const deg       = pct * 360;

    document.getElementById('pomo-time').textContent      = formatPomoTime(pomoState.timeLeft);
    document.getElementById('pomo-mode-label').textContent = modeData.label;

    // Session dots (4 dots = 1 cycle)
    const dotsEl = document.getElementById('pomo-dots');
    if (dotsEl) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('span');
            dot.className = 'pomo-dot';
            if (i < pomoState.session) dot.classList.add('done');
            else if (i === pomoState.session && pomoState.mode === 'focus') dot.classList.add('current');
            dotsEl.appendChild(dot);
        }
    }

    const sessionLbl = document.getElementById('pomo-session-label');
    if (sessionLbl) {
        sessionLbl.textContent = `Sesi ${pomoState.session + 1}/4 · Total selesai: ${pomoState.totalDone}`;
    }

    // Ring
    const ring = document.getElementById('pomo-ring');
    if (ring) {
        ring.style.background = `conic-gradient(${modeData.color} ${deg}deg, var(--bg-hover) 0deg)`;
        ring.classList.toggle('break-mode', modeData.breakMode);
        ring.style.boxShadow = modeData.breakMode
            ? '0 0 50px rgba(34,197,94,0.25)'
            : '0 0 50px rgba(124,106,247,0.25)';
    }

    // Toggle button
    const toggleBtn = document.getElementById('pomo-toggle-btn');
    if (toggleBtn) {
        if (pomoState.running) {
            toggleBtn.innerHTML = `<i class='bx bx-pause'></i> Jeda`;
            toggleBtn.classList.remove('paused');
        } else {
            toggleBtn.innerHTML = `<i class='bx bx-play'></i> ${pomoState.timeLeft === total ? 'Mulai' : 'Lanjut'}`;
            if (pomoState.timeLeft < total) toggleBtn.classList.add('paused');
            else toggleBtn.classList.remove('paused');
        }
    }

    // Document title (so timer visible on tab)
    if (pomoState.running) {
        document.title = `${formatPomoTime(pomoState.timeLeft)} ${modeData.label} — AlvaTracker`;
    } else {
        document.title = 'AlvaTracker';
    }
};

// ── Notifications ──────────────────────────────────────────
const requestPomoNotif = () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(updateNotifBtn);
    }
};

const sendPomoNotif = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, silent: false }); } catch(e) {}
    }
};

const updateNotifBtn = () => {
    const btn = document.getElementById('pomo-notif-btn');
    if (!btn) return;
    const perm = ('Notification' in window) ? Notification.permission : 'denied';
    if (perm === 'granted') {
        btn.className = 'pomo-notif-btn granted';
        btn.innerHTML = `<i class='bx bx-check-circle'></i> Notifikasi aktif`;
    } else if (perm === 'denied') {
        btn.className = 'pomo-notif-btn';
        btn.innerHTML = `<i class='bx bx-bell-off'></i> Notifikasi diblokir`;
        btn.style.cursor = 'not-allowed';
    } else {
        btn.className = 'pomo-notif-btn';
        btn.innerHTML = `<i class='bx bx-bell'></i> Aktifkan notifikasi Windows`;
    }
};

// ── Beep (Web Audio API) ───────────────────────────────────
const playPomoBeep = () => {
    try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        // Three-tone ding
        [880, 1100, 1320].forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.3, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    } catch(e) {}
};

// Expose Pomodoro
window.setPomoMode   = setPomoMode;
window.togglePomo    = togglePomo;
window.resetPomo     = resetPomo;
window.requestPomoNotif = requestPomoNotif;

