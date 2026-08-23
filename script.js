const STORAGE_KEY = 'momentum_custom_os';

// Default Template (Users can modify everything)
const DEFAULT_STATE = {
    profile: { name: '', goal: '', isFirstVisit: true },
    settings: {
        appName: 'MOMENTUM',
        theme: { primary: '#8b5cf6', secondary: '#ec4899', radius: 20 },
        xp: { base: 500, mult: 1.2 },
        budgetMins: 120,
        widgets: ['w-quests', 'w-skills', 'w-timer', 'w-bosses', 'w-stats'], // Toggles
        timerPresets: [15, 25, 50, 90]
    },
    categories: [
        { id: 'c1', name: 'Growth', color: '#22d3ee' },
        { id: 'c2', name: 'Fitness', color: '#10b981' },
        { id: 'c3', name: 'Work', color: '#fbbf24' }
    ],
    quests: [], // { id, title, catId, diffXp, timeMins }
    skills: [], // { id, name, catId, progress }
    bosses: [], // { id, name, hp, maxHp, catId, rewardXp }
    stats: { level: 1, xp: 0, totalXp: 0, currentStreak: 0, bestStreak: 0, totalMins: 0 },
    history: {} // 'YYYY-MM-DD': { xp: 0, qIds: [], mins: 0 }
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY));
if (!state || !state.settings) { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); }

// --- UTILS ---
const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const getTodayStr = () => new Date().toISOString().split('T')[0];
const getTodayData = () => {
    const d = getTodayStr();
    if (!state.history[d]) state.history[d] = { xp: 0, qIds: [], mins: 0 };
    return state.history[d];
};
const showToast = (msg) => {
    const t = document.getElementById('toast');
    t.innerText = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
};
const floatXp = (xp, e) => {
    if(!e) return;
    const f = document.createElement('div'); f.className = 'xp-float'; f.innerText = `+${xp} XP`;
    f.style.left = e.clientX + 'px'; f.style.top = e.clientY + 'px';
    document.getElementById('xp-floater-container').appendChild(f);
    setTimeout(() => f.remove(), 1000);
};

// --- CORE LOGIC ---
const coreLogic = {
    addXp: (xp, catId, e) => {
        state.stats.xp += xp;
        state.stats.totalXp += xp;
        getTodayData().xp += xp;
        
        // Level Up
        let req = Math.floor(state.settings.xp.base * Math.pow(state.settings.xp.mult, state.stats.level - 1));
        if (state.stats.xp >= req) {
            state.stats.xp -= req;
            state.stats.level++;
            showToast(`LEVEL UP! Welcome to Level ${state.stats.level} 🚀`);
        }

        // Skills & Bosses progress based on category match
        state.skills.forEach(s => { if (s.catId === catId) s.progress = Math.min(100, s.progress + (xp/10)); });
        state.bosses.forEach(b => { 
            if (b.catId === catId && b.hp > 0) {
                b.hp = Math.max(0, b.hp - xp);
                if(b.hp === 0) {
                    showToast(`BOSS DEFEATED: ${b.name}! +${b.rewardXp} XP`);
                    coreLogic.addXp(parseInt(b.rewardXp), null, null);
                }
            }
        });

        coreLogic.calcStreak();
        saveState();
        ui.fullRender();
        if(e) floatXp(xp, e);
    },
    calcStreak: () => {
        let current = 0; let d = new Date();
        while(true) {
            const dStr = d.toISOString().split('T')[0];
            const h = state.history[dStr];
            if (h && (h.xp > 0)) { current++; d.setDate(d.getDate() - 1); }
            else if (dStr === getTodayStr()) { d.setDate(d.getDate() - 1); } // today empty is ok
            else break;
        }
        state.stats.currentStreak = current;
        if(current > state.stats.bestStreak) state.stats.bestStreak = current;
    }
};

// --- UI & RENDERING ---
const ui = {
    init: () => {
        document.documentElement.style.setProperty('--primary', state.settings.theme.primary);
        document.documentElement.style.setProperty('--secondary', state.settings.theme.secondary);
        document.documentElement.style.setProperty('--card-radius', state.settings.theme.radius + 'px');
        document.getElementById('app-title-display').innerText = state.settings.appName;
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`view-${e.target.dataset.view}`).classList.add('active');
            });
        });

        if (state.profile.isFirstVisit) document.getElementById('onboarding-modal').classList.add('active');
        else { document.getElementById('app').classList.remove('hidden'); ui.fullRender(); }
    },
    fullRender: () => {
        ui.renderTopBar();
        ui.renderDashboard();
        ui.renderQuests();
        ui.renderSkills();
        ui.renderBosses();
        ui.renderAnalytics();
        ui.renderTimerPresets();
        ui.renderSettings();
    },
    renderTopBar: () => {
        document.getElementById('ui-username').innerText = state.profile.name || 'User';
        document.getElementById('ui-streak').innerText = state.stats.currentStreak;
        document.getElementById('ui-level').innerText = `LV.${state.stats.level}`;
        
        let req = Math.floor(state.settings.xp.base * Math.pow(state.settings.xp.mult, state.stats.level - 1));
        document.getElementById('ui-xp-text').innerText = `${Math.floor(state.stats.xp)} / ${req} XP`;
        document.getElementById('ui-xp-bar').style.width = `${Math.min((state.stats.xp/req)*100, 100)}%`;

        let spent = getTodayData().mins;
        document.getElementById('ui-budget-spent').innerText = spent;
        document.getElementById('ui-budget-max').innerText = state.settings.budgetMins;
        document.getElementById('ui-budget-bar').style.width = `${Math.min((spent/state.settings.budgetMins)*100, 100)}%`;
    },
    renderDashboard: () => {
        const grid = document.getElementById('dashboard-widgets');
        grid.innerHTML = '';
        if (state.settings.widgets.includes('w-quests')) grid.innerHTML += `<div class="glass-card"><h3>Today's Quests</h3><div id="dash-quests" class="mt-1"></div></div>`;
        if (state.settings.widgets.includes('w-skills')) grid.innerHTML += `<div class="glass-card"><h3>Skills Progress</h3><div id="dash-skills" class="mt-1"></div></div>`;
        if (state.settings.widgets.includes('w-bosses')) grid.innerHTML += `<div class="glass-card"><h3>Active Bosses</h3><div id="dash-bosses" class="mt-1"></div></div>`;
    },
    renderQuests: () => {
        const list = document.getElementById('quest-list-container');
        const dashList = document.getElementById('dash-quests');
        list.innerHTML = ''; if(dashList) dashList.innerHTML = '';
        const todayCompleted = getTodayData().qIds;

        state.quests.forEach(q => {
            const cat = state.categories.find(c => c.id === q.catId) || {name: 'None', color: '#ccc'};
            const isDone = todayCompleted.includes(q.id);
            const html = `
                <div class="list-item" style="border-left: 4px solid ${cat.color}">
                    <div>
                        <h4>${q.title}</h4>
                        <div class="item-meta">
                            <span class="cat-badge" style="color:${cat.color}">${cat.name}</span>
                            <span>${q.timeMins}m | ${q.diffXp} XP</span>
                        </div>
                    </div>
                    <div class="flex-row">
                        ${!isDone ? `<button class="btn-success btn-small" onclick="questManager.complete('${q.id}', event)">Done</button>` : `<span style="color:var(--success)">Completed ✓</span>`}
                        <button class="btn-danger btn-small" onclick="questManager.delete('${q.id}')">Del</button>
                    </div>
                </div>`;
            list.innerHTML += html;
            if(dashList && !isDone) dashList.innerHTML += html;
        });
    },
    renderSkills: () => {
        const cont = document.getElementById('skills-container');
        const dash = document.getElementById('dash-skills');
        cont.innerHTML = ''; if(dash) dash.innerHTML = '';
        state.skills.forEach(s => {
            const cat = state.categories.find(c => c.id === s.catId) || {name: 'None'};
            const html = `
                <div class="mb-2">
                    <div class="header-flex"><span>${s.name} <small class="text-soft">(${cat.name})</small></span><span>${s.progress.toFixed(1)}%</span></div>
                    <div class="progress-bg"><div class="progress-fill" style="width:${s.progress}%"></div></div>
                </div>`;
            cont.innerHTML += html;
            if(dash) dash.innerHTML += html;
        });
    },
    renderBosses: () => {
        const cont = document.getElementById('bosses-container');
        const dash = document.getElementById('dash-bosses');
        cont.innerHTML = ''; if(dash) dash.innerHTML = '';
        state.bosses.forEach(b => {
            const cat = state.categories.find(c => c.id === b.catId) || {name: 'None'};
            const html = `
                <div class="glass-card">
                    <div class="header-flex"><h3>${b.name}</h3> <span class="cat-badge">${cat.name}</span></div>
                    <div class="item-meta mb-2">Reward: ${b.rewardXp} XP</div>
                    <div class="header-flex text-soft"><span>HP</span><span>${b.hp} / ${b.maxHp}</span></div>
                    <div class="progress-bg"><div class="progress-fill danger-fill" style="width:${(b.hp/b.maxHp)*100}%"></div></div>
                </div>`;
            cont.innerHTML += html;
            if(dash && b.hp > 0) dash.innerHTML += html;
        });
    },
    renderAnalytics: () => {
        document.getElementById('stat-xp').innerText = state.stats.totalXp;
        document.getElementById('stat-tasks').innerText = Object.values(state.history).reduce((sum, h) => sum + h.qIds.length, 0);
        document.getElementById('stat-hours').innerText = (state.stats.totalMins / 60).toFixed(1);
        
        const cal = document.getElementById('ui-calendar'); cal.innerHTML = '';
        const today = new Date(); const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= dim; i++) {
            const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const xp = state.history[dStr] ? state.history[dStr].xp : 0;
            let lvl = ''; if (xp > 200) lvl='lvl-4'; else if(xp>100) lvl='lvl-3'; else if(xp>40) lvl='lvl-2'; else if(xp>0) lvl='lvl-1';
            cal.innerHTML += `<div class="cal-day ${lvl}" title="${dStr}: ${xp} XP"></div>`;
        }
    },
    renderSettings: () => {
        document.getElementById('set-appname').value = state.settings.appName;
        document.getElementById('set-color1').value = state.settings.theme.primary;
        document.getElementById('set-color2').value = state.settings.theme.secondary;
        document.getElementById('set-radius').value = state.settings.theme.radius;
        document.getElementById('set-xpbase').value = state.settings.xp.base;
        document.getElementById('set-xpmult').value = state.settings.xp.mult;
        document.getElementById('set-budget').value = state.settings.budgetMins;
        
        const catList = document.getElementById('categories-list'); catList.innerHTML = '';
        state.categories.forEach(c => {
            catList.innerHTML += `<span class="cat-badge" style="background:${c.color}; color:#fff;">${c.name} <span style="cursor:pointer; margin-left:5px;" onclick="settingsManager.delCat('${c.id}')">×</span></span>`;
        });

        const widgetsList = ['w-quests', 'w-skills', 'w-timer', 'w-bosses', 'w-stats'];
        const wtDiv = document.getElementById('widget-toggles'); wtDiv.innerHTML = '';
        widgetsList.forEach(w => {
            const checked = state.settings.widgets.includes(w) ? 'checked' : '';
            wtDiv.innerHTML += `<label style="display:flex; gap:5px;"><input type="checkbox" value="${w}" ${checked} onchange="settingsManager.toggleWidget(this)"> ${w.replace('w-','')}</label>`;
        });
    },
    renderTimerPresets: () => {
        const cont = document.getElementById('timer-presets-container'); cont.innerHTML = '';
        state.settings.timerPresets.forEach(p => {
            cont.innerHTML += `<button class="btn-secondary" onclick="timer.set(${p})">${p} Min</button>`;
        });
    }
};

// --- ENTITY MANAGERS ---
const genericEditor = {
    open: (title, html, onSave) => {
        document.getElementById('editor-title').innerText = title;
        document.getElementById('editor-body').innerHTML = html;
        document.getElementById('editor-modal').classList.add('active');
        document.getElementById('editor-save').onclick = () => { onSave(); document.getElementById('editor-modal').classList.remove('active'); };
    }
};

const questManager = {
    openEditor: () => {
        const catOptions = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        genericEditor.open('New Quest', `
            <input type="text" id="eq-title" placeholder="Quest Title">
            <label>Category</label><select id="eq-cat">${catOptions}</select>
            <label>XP Reward</label><input type="number" id="eq-xp" value="25">
            <label>Est. Mins</label><input type="number" id="eq-mins" value="15">
        `, () => {
            state.quests.push({
                id: Date.now().toString(), title: document.getElementById('eq-title').value,
                catId: document.getElementById('eq-cat').value, diffXp: parseInt(document.getElementById('eq-xp').value),
                timeMins: parseInt(document.getElementById('eq-mins').value)
            });
            saveState(); ui.fullRender(); showToast('Quest Added');
        });
    },
    complete: (id, e) => {
        const q = state.quests.find(x => x.id === id);
        getTodayData().qIds.push(id);
        getTodayData().mins += q.timeMins;
        coreLogic.addXp(q.diffXp, q.catId, e);
    },
    delete: (id) => { state.quests = state.quests.filter(q => q.id !== id); saveState(); ui.fullRender(); }
};

const skillManager = {
    openEditor: () => {
        const catOptions = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        genericEditor.open('New Skill', `
            <input type="text" id="es-name" placeholder="Skill Name (e.g. React.js)">
            <label>Category</label><select id="es-cat">${catOptions}</select>
        `, () => {
            state.skills.push({ id: Date.now().toString(), name: document.getElementById('es-name').value, catId: document.getElementById('es-cat').value, progress: 0 });
            saveState(); ui.fullRender();
        });
    }
};

const bossManager = {
    openEditor: () => {
        const catOptions = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        genericEditor.open('New Boss', `
            <input type="text" id="eb-name" placeholder="Boss Name">
            <label>Weakness (Category)</label><select id="eb-cat">${catOptions}</select>
            <label>HP</label><input type="number" id="eb-hp" value="500">
            <label>XP Reward</label><input type="number" id="eb-reward" value="200">
        `, () => {
            const hp = parseInt(document.getElementById('eb-hp').value);
            state.bosses.push({ id: Date.now().toString(), name: document.getElementById('eb-name').value, catId: document.getElementById('eb-cat').value, hp: hp, maxHp: hp, rewardXp: parseInt(document.getElementById('eb-reward').value) });
            saveState(); ui.fullRender();
        });
    }
}

// --- SETTINGS & DATA MANAGER ---
const settingsManager = {
    saveTheme: () => {
        state.settings.appName = document.getElementById('set-appname').value;
        state.settings.theme.primary = document.getElementById('set-color1').value;
        state.settings.theme.secondary = document.getElementById('set-color2').value;
        state.settings.theme.radius = parseInt(document.getElementById('set-radius').value);
        saveState(); ui.init(); showToast('Theme Applied');
    },
    saveProgression: () => {
        state.settings.xp.base = parseInt(document.getElementById('set-xpbase').value);
        state.settings.xp.mult = parseFloat(document.getElementById('set-xpmult').value);
        state.settings.budgetMins = parseInt(document.getElementById('set-budget').value);
        saveState(); ui.fullRender(); showToast('Progression Saved');
    },
    addCategory: () => {
        const n = document.getElementById('cat-new-name').value;
        const c = document.getElementById('cat-new-color').value;
        if(n) { state.categories.push({ id: Date.now().toString(), name: n, color: c }); saveState(); ui.fullRender(); }
    },
    delCat: (id) => { state.categories = state.categories.filter(c => c.id !== id); saveState(); ui.fullRender(); },
    toggleWidget: (cb) => {
        if(cb.checked && !state.settings.widgets.includes(cb.value)) state.settings.widgets.push(cb.value);
        if(!cb.checked) state.settings.widgets = state.settings.widgets.filter(w => w !== cb.value);
        saveState(); ui.renderDashboard();
    }
};

const dataManager = {
    exportData: () => {
        const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        const a = document.createElement('a'); a.href = str; a.download = `OS_Backup_${getTodayStr()}.json`; a.click();
    },
    importData: (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try { const imported = JSON.parse(ev.target.result); if(imported.settings) { state = imported; saveState(); location.reload(); } } catch(err) { alert('Invalid file'); }
        };
        reader.readAsText(file);
    },
    resetData: () => { if(confirm("DELETE EVERYTHING?")) { if(confirm("Are you SURE?")) { localStorage.removeItem(STORAGE_KEY); location.reload(); } } }
};

// --- FOCUS TIMER ---
let timerInterval; let timerTime = 25 * 60; let isRunning = false;
const timer = {
    set: (mins) => { clearInterval(timerInterval); isRunning = false; timerTime = mins * 60; timer.updateUI(); },
    updateUI: () => { let m = Math.floor(timerTime/60); let s = timerTime%60; document.getElementById('timer-display').innerText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; },
    start: () => { if(isRunning) return; isRunning = true; timerInterval = setInterval(() => { if(timerTime>0){timerTime--; timer.updateUI();} else timer.finish(); }, 1000); },
    pause: () => { clearInterval(timerInterval); isRunning = false; },
    finish: () => {
        clearInterval(timerInterval); isRunning = false;
        let mins = Math.max(1, 25 - Math.floor(timerTime/60)); // simplified estimate
        state.stats.totalMins += mins; getTodayData().mins += mins;
        coreLogic.addXp(mins, null, null); // generic category focus
        showToast(`Focus logged! +${mins} XP`); timer.set(25);
    }
};
document.getElementById('btn-timer-start').onclick = timer.start;
document.getElementById('btn-timer-pause').onclick = timer.pause;
document.getElementById('btn-timer-reset').onclick = () => timer.set(25);
document.getElementById('btn-timer-finish').onclick = timer.finish;

// --- ONBOARDING EVENT ---
document.getElementById('btn-onboard').onclick = () => {
    state.profile.name = document.getElementById('ob-name').value || 'Traveler';
    state.profile.goal = document.getElementById('ob-goal').value || 'Level Up';
    state.profile.isFirstVisit = false;
    saveState(); document.getElementById('onboarding-modal').classList.remove('active');
    document.getElementById('app').classList.remove('hidden'); ui.fullRender();
};

// Start App
ui.init();
