const STORAGE_KEY = 'momentum_custom_os';

// --- SOUND EFFECTS (Web Audio API Synthesizer) ---
const sfx = {
    ctx: null,
    init: () => {
        if (state.settings.sound === 'off') return;
        if (!sfx.ctx) {
            sfx.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playNote: (freq, type, duration, delay = 0) => {
        if (state.settings.sound === 'off') return;
        sfx.init();
        if (!sfx.ctx) return;
        setTimeout(() => {
            try {
                // Ensure audio context is resumed if suspended
                if (sfx.ctx.state === 'suspended') {
                    sfx.ctx.resume();
                }
                const osc = sfx.ctx.createOscillator();
                const gain = sfx.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, sfx.ctx.currentTime);
                
                gain.gain.setValueAtTime(0.08, sfx.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, sfx.ctx.currentTime + duration);
                
                osc.connect(gain);
                gain.connect(sfx.ctx.destination);
                osc.start();
                osc.stop(sfx.ctx.currentTime + duration);
            } catch (e) {
                console.warn("Audio Context error:", e);
            }
        }, delay * 1000);
    },
    playQuestComplete: () => {
        // Cheerful upbeat chime: G4 -> C5
        sfx.playNote(392.00, 'sine', 0.25, 0);
        sfx.playNote(523.25, 'sine', 0.40, 0.12);
    },
    playLevelUp: () => {
        // Classic RPG level up fanfare: C4 -> E4 -> G4 -> C5
        sfx.playNote(261.63, 'triangle', 0.15, 0);
        sfx.playNote(329.63, 'triangle', 0.15, 0.08);
        sfx.playNote(392.00, 'triangle', 0.15, 0.16);
        sfx.playNote(523.25, 'triangle', 0.50, 0.24);
    },
    playSkillLevelUp: () => {
        // Sparkling high sci-fi sound: E5 -> G#5 -> B5
        sfx.playNote(659.25, 'sine', 0.12, 0);
        sfx.playNote(830.61, 'sine', 0.12, 0.08);
        sfx.playNote(987.77, 'sine', 0.35, 0.16);
    },
    playTimerFinished: () => {
        // High attention alert chime: A5 -> F5 -> A5 -> F5
        sfx.playNote(880.00, 'triangle', 0.15, 0);
        sfx.playNote(698.46, 'triangle', 0.15, 0.12);
        sfx.playNote(880.00, 'triangle', 0.15, 0.24);
        sfx.playNote(698.46, 'triangle', 0.35, 0.36);
    }
};

// Default Template (Users can modify everything)
const DEFAULT_STATE = {
    profile: { name: '', goal: '', isFirstVisit: true },
    settings: {
        appName: 'MOMENTUM',
        theme: { primary: '#8b5cf6', secondary: '#ec4899', radius: 20 },
        xp: { base: 500, mult: 1.2 },
        budgetMins: 120,
        widgets: ['w-quests', 'w-skills', 'w-timer', 'w-bosses', 'w-stats'], // Toggles
        timerPresets: [15, 25, 50, 90],
        sound: 'on'
    },
    categories: [
        { id: 'c1', name: 'Growth', color: '#22d3ee' },
        { id: 'c2', name: 'Fitness', color: '#10b981' },
        { id: 'c3', name: 'Work', color: '#fbbf24' }
    ],
    quests: [], // { id, title, catId, diffXp, timeMins, isOneOff }
    skills: [], // { id, name, catId, progress, level }
    bosses: [], // { id, name, hp, maxHp, catId, rewardXp }
    stats: { level: 1, xp: 0, totalXp: 0, currentStreak: 0, bestStreak: 0, totalMins: 0 },
    history: {} // 'YYYY-MM-DD': { xp: 0, qIds: [], mins: 0 }
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY));
let questFilter = 'active';
if (!state || !state.settings) { 
    state = JSON.parse(JSON.stringify(DEFAULT_STATE)); 
} else {
    // Migration checks for new masterpiece features
    if (state.settings.sound === undefined) state.settings.sound = 'on';
    state.skills.forEach(s => {
        if (s.level === undefined) s.level = 1;
    });
}

// --- UTILS ---
const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

// Solid Date formatting to support accurate Local timezone tracking
const formatDateLocal = (dateObj) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getTodayStr = () => formatDateLocal(new Date());

const getTodayData = () => {
    const d = getTodayStr();
    if (!state.history[d]) state.history[d] = { xp: 0, qIds: [], mins: 0 };
    return state.history[d];
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

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
        
        // Level Up character
        let req = Math.max(1, Math.floor(state.settings.xp.base * Math.pow(state.settings.xp.mult, state.stats.level - 1)));
        while (state.stats.xp >= req) {
            state.stats.xp -= req;
            state.stats.level++;
            showToast(`LEVEL UP! Welcome to Level ${state.stats.level} 🚀`);
            sfx.playLevelUp();
            req = Math.max(1, Math.floor(state.settings.xp.base * Math.pow(state.settings.xp.mult, state.stats.level - 1)));
        }

        // Infinite Skill Levels: when a skill progress goes >= 100, level it up!
        state.skills.forEach(s => { 
            if (s.catId === catId) {
                s.level = s.level || 1;
                let addProgress = xp / 10;
                s.progress += addProgress;
                
                while (s.progress >= 100) {
                    s.progress -= 100;
                    s.level++;
                    const bonusXp = s.level * 25; // RPG-style scaling leveling reward
                    
                    setTimeout(() => {
                        showToast(`🔥 SKILL LEVEL UP: ${s.name} reached LV.${s.level}! +${bonusXp} XP`);
                        sfx.playSkillLevelUp();
                        coreLogic.addXp(bonusXp, null, null);
                    }, 400);
                }
            } 
        });

        // Boss progression based on category match
        state.bosses.forEach(b => { 
            if (b.catId === catId && b.hp > 0) {
                b.hp = Math.max(0, b.hp - xp);
                if(b.hp === 0) {
                    showToast(`BOSS DEFEATED: ${b.name}! +${b.rewardXp} XP`);
                    sfx.playLevelUp();
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
            const dStr = formatDateLocal(d);
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
                sfx.init(); // Initialize audio context on first interactive click
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`view-${e.target.dataset.view}`).classList.add('active');
            });
            document.querySelectorAll('[data-quest-filter]').forEach(btn => {
                btn.addEventListener('click', () => {
                    questFilter = btn.dataset.questFilter;
                    document.querySelectorAll('[data-quest-filter]').forEach(filter => filter.classList.toggle('active', filter === btn));
                    ui.renderQuests();
                });
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
        const name = state.profile.name || 'traveler';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        document.getElementById('ui-greeting').innerText = `${greeting}, ${name}`;
        document.getElementById('ui-goal').innerText = state.profile.goal ? `Current mission: ${state.profile.goal}` : 'Choose a mission and make today count.';
        document.getElementById('ui-date').innerText = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
        document.getElementById('ui-streak').innerText = state.stats.currentStreak;
        document.getElementById('ui-level').innerText = `LV.${state.stats.level}`;
        
        let req = Math.floor(state.settings.xp.base * Math.pow(state.settings.xp.mult, state.stats.level - 1));
        document.getElementById('ui-xp-text').innerText = `${Math.floor(state.stats.xp)} / ${req} XP`;
        document.getElementById('ui-xp-bar').style.width = `${Math.min((state.stats.xp/Math.max(req, 1))*100, 100)}%`;

        let spent = getTodayData().mins;
        document.getElementById('ui-budget-spent').innerText = spent;
        document.getElementById('ui-budget-max').innerText = state.settings.budgetMins;
        document.getElementById('ui-budget-bar').style.width = `${Math.min((spent/Math.max(state.settings.budgetMins, 1))*100, 100)}%`;
    },
    renderDashboard: () => {
        const grid = document.getElementById('dashboard-widgets');
        grid.innerHTML = '';
        if (state.settings.widgets.includes('w-quests')) grid.innerHTML += `<div class="glass-card"><h3>Today's Quests</h3><div id="dash-quests" class="mt-1"></div></div>`;
        if (state.settings.widgets.includes('w-skills')) grid.innerHTML += `<div class="glass-card"><h3>Skills Progress</h3><div id="dash-skills" class="mt-1"></div></div>`;
        if (state.settings.widgets.includes('w-bosses')) grid.innerHTML += `<div class="glass-card"><h3>Active Bosses</h3><div id="dash-bosses" class="mt-1"></div></div>`;
        if (state.settings.widgets.includes('w-timer')) {
            grid.innerHTML += `<div class="glass-card dashboard-action-card"><h3>Focus Timer</h3><p class="text-soft mt-1">Ready for a focused session?</p><button class="btn-primary mt-1" onclick="ui.openView('timer')">Open Timer</button></div>`;
        }
        if (state.settings.widgets.includes('w-stats')) {
            grid.innerHTML += `<div class="glass-card"><h3>Progress Snapshot</h3><div class="dashboard-stats mt-1"><div><strong>${state.stats.totalXp}</strong><span>Total XP</span></div><div><strong>${state.stats.totalMins}</strong><span>Focus mins</span></div><div><strong>${state.stats.bestStreak}</strong><span>Best streak</span></div></div></div>`;
        }
    },
    openView: (view) => {
        const button = document.querySelector(`.nav-btn[data-view="${view}"]`);
        if (button) button.click();
    },
    renderQuests: () => {
        const list = document.getElementById('quest-list-container');
        const dashList = document.getElementById('dash-quests');
        list.innerHTML = ''; if(dashList) dashList.innerHTML = '';
        const todayCompleted = getTodayData().qIds;
        const completedCount = state.quests.filter(q => todayCompleted.includes(q.id)).length;
        document.getElementById('quest-progress-label').innerText = `${completedCount} / ${state.quests.length} completed today`;
        document.getElementById('quest-progress-bar').style.width = `${state.quests.length ? (completedCount / state.quests.length) * 100 : 0}%`;

        if (!state.quests.length) {
            list.innerHTML = '<p class="empty-state">No quests yet. Create one to start building momentum.</p>';
            return;
        }
        let visibleQuests = 0;
        state.quests.forEach(q => {
            const cat = state.categories.find(c => c.id === q.catId) || {name: 'None', color: '#ccc'};
            const isDone = todayCompleted.includes(q.id);
            if ((questFilter === 'active' && isDone) || (questFilter === 'completed' && !isDone)) return;
            visibleQuests++;
            const questTypeLabel = q.isOneOff ? '🎯 One-off' : '🔁 Daily';
            const html = `
                <div class="list-item" style="border-left: 4px solid ${cat.color}">
                    <div>
                        <h4>${escapeHtml(q.title)}</h4>
                        <div class="item-meta">
                            <span class="cat-badge" style="color:${cat.color}">${cat.name}</span>
                            <span>${q.timeMins}m | ${q.diffXp} XP</span>
                            <span class="type-badge" style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">${questTypeLabel}</span>
                        </div>
                    </div>
                    <div class="flex-row">
                        ${!isDone ? `<button class="btn-success btn-small" onclick="questManager.complete('${q.id}', event)">Done</button>` : `<span style="color:var(--success); font-weight:700;">Completed ✓</span>`}
                        <button class="btn-secondary btn-small" onclick="questManager.openEditor('${q.id}')">Edit</button>
                        <button class="btn-danger btn-small" onclick="questManager.delete('${q.id}')">Del</button>
                    </div>
                </div>`;
            list.innerHTML += html;
            if(dashList && !isDone) dashList.innerHTML += html;
        });
        if (!visibleQuests) list.innerHTML = `<p class="empty-state">No ${questFilter} quests right now.</p>`;
    },
    renderSkills: () => {
        const cont = document.getElementById('skills-container');
        const dash = document.getElementById('dash-skills');
        cont.innerHTML = ''; if(dash) dash.innerHTML = '';
        if (!state.skills.length) {
            cont.innerHTML = '<p class="empty-state">No skills yet. Add a skill to track your growth.</p>';
            return;
        }
        state.skills.forEach(s => {
            const cat = state.categories.find(c => c.id === s.catId) || {name: 'None'};
            const level = s.level || 1;
            const html = `
                <div class="mb-2" style="padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.015); border: 1px solid var(--border);">
                    <div class="header-flex">
                        <span><strong>${escapeHtml(s.name)}</strong> <small class="text-soft">(${escapeHtml(cat.name)})</small></span>
                        <span class="skill-lvl-badge" style="color:var(--secondary); font-family:'JetBrains Mono', monospace; font-weight:800; font-size:0.9em;">LV.${level}</span>
                    </div>
                    <div class="header-flex text-soft" style="font-size: 0.8em; margin-top: 5px;">
                        <span>Progress</span>
                        <span>${s.progress.toFixed(1)}%</span>
                    </div>
                    <div class="progress-bg" style="margin-top: 5px;"><div class="progress-fill" style="width:${s.progress}%"></div></div>
                    <div class="flex-row mt-1" style="justify-content: flex-end; gap:6px;">
                        <button class="btn-secondary btn-small" onclick="skillManager.openEditor('${s.id}')">Edit</button>
                        <button class="btn-danger btn-small" onclick="skillManager.delete('${s.id}')">Del</button>
                    </div>
                </div>`;
            cont.innerHTML += html;
            
            if(dash) {
                dash.innerHTML += `
                    <div class="mb-2">
                        <div class="header-flex"><span>${s.name} <small class="text-soft">(LV.${level})</small></span><span>${s.progress.toFixed(1)}%</span></div>
                        <div class="progress-bg"><div class="progress-fill" style="width:${s.progress}%"></div></div>
                    </div>`;
            }
        });
    },
    renderBosses: () => {
        const cont = document.getElementById('bosses-container');
        const dash = document.getElementById('dash-bosses');
        cont.innerHTML = ''; if(dash) dash.innerHTML = '';
        if (!state.bosses.length) {
            cont.innerHTML = '<p class="empty-state">No boss fights yet. Summon a boss to make progress tangible.</p>';
            return;
        }
        state.bosses.forEach(b => {
            const cat = state.categories.find(c => c.id === b.catId) || {name: 'None'};
            const statusLabel = b.hp === 0 ? `<span style="color:var(--primary); font-weight:700;">💀 SLAIN</span>` : `<span>HP: ${b.hp} / ${b.maxHp}</span>`;
            const html = `
                <div class="glass-card">
                    <div class="header-flex"><h3>${escapeHtml(b.name)}</h3> <span class="cat-badge">${escapeHtml(cat.name)}</span></div>
                    <div class="item-meta mb-2">Reward: ${b.rewardXp} XP</div>
                    <div class="header-flex text-soft">
                        <span>Status</span>
                        ${statusLabel}
                    </div>
                    <div class="progress-bg"><div class="progress-fill danger-fill" style="width:${(b.hp/b.maxHp)*100}%"></div></div>
                    <div class="flex-row mt-2" style="justify-content: flex-end; gap:6px;">
                        <button class="btn-secondary btn-small" onclick="bossManager.openEditor('${b.id}')">Edit</button>
                        <button class="btn-danger btn-small" onclick="bossManager.delete('${b.id}')">Del</button>
                    </div>
                </div>`;
            cont.innerHTML += html;
            if(dash && b.hp > 0) {
                dash.innerHTML += `
                    <div class="mb-2" style="padding-bottom: 8px; border-bottom: 1px solid var(--border)">
                        <div class="header-flex"><strong>${escapeHtml(b.name)}</strong> <span class="cat-badge">${escapeHtml(cat.name)}</span></div>
                        <div class="header-flex text-soft mt-1" style="font-size:0.8em;"><span>HP</span><span>${b.hp} / ${b.maxHp}</span></div>
                        <div class="progress-bg"><div class="progress-fill danger-fill" style="width:${(b.hp/b.maxHp)*100}%"></div></div>
                    </div>`;
            }
        });
    },
    renderAnalytics: () => {
        document.getElementById('stat-xp').innerText = state.stats.totalXp;
        document.getElementById('stat-tasks').innerText = Object.values(state.history).reduce((sum, h) => sum + h.qIds.length, 0);
        document.getElementById('stat-hours').innerText = (state.stats.totalMins / 60).toFixed(1);
        
        const cal = document.getElementById('ui-calendar'); cal.innerHTML = '';
        
        // Render weekday labels above the heatmap block
        const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        weekdays.forEach(wd => {
            cal.innerHTML += `<div class="cal-header text-soft" style="text-align: center; font-size: 0.75em; font-weight: bold; padding: 5px 0;">${wd}</div>`;
        });
        
        const today = new Date(); 
        const year = today.getFullYear();
        const month = today.getMonth();
        
        // Grid alignment based on actual day of week for the 1st of the current month
        const firstDayIndex = new Date(year, month, 1).getDay();
        const dim = new Date(year, month + 1, 0).getDate();
        
        // Alignment buffer spacing
        for (let j = 0; j < firstDayIndex; j++) {
            cal.innerHTML += `<div class="cal-day cal-empty" style="opacity: 0; pointer-events: none;"></div>`;
        }
        
        // Heatmap cells
        for (let i = 1; i <= dim; i++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const xp = state.history[dStr] ? state.history[dStr].xp : 0;
            let lvl = ''; 
            if (xp > 200) lvl='lvl-4'; 
            else if(xp>100) lvl='lvl-3'; 
            else if(xp>40) lvl='lvl-2'; 
            else if(xp>0) lvl='lvl-1';
            
            cal.innerHTML += `<div class="cal-day ${lvl}" title="${dStr}: ${xp} XP" onclick="showToast('${dStr}: ${xp} XP Earned')"></div>`;
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
        document.getElementById('set-sound').value = state.settings.sound || 'on';
        
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
    openEditor: (id = null) => {
        const q = id ? state.quests.find(x => x.id === id) : null;
        const catOptions = state.categories.map(c => `<option value="${escapeHtml(c.id)}" ${q && q.catId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        
        genericEditor.open(q ? 'Edit Quest' : 'New Quest', `
            <input type="text" id="eq-title" placeholder="Quest Title" value="${q ? escapeHtml(q.title) : ''}">
            <label>Category</label><select id="eq-cat">${catOptions}</select>
            <label>Quest Type</label>
            <select id="eq-type">
                <option value="daily" ${q && !q.isOneOff ? 'selected' : ''}>🔁 Daily Repeatable</option>
                <option value="one-off" ${q && q.isOneOff ? 'selected' : ''}>🎯 One-off Quest</option>
            </select>
            <label>XP Reward</label><input type="number" id="eq-xp" value="${q ? q.diffXp : '25'}">
            <label>Est. Mins</label><input type="number" id="eq-mins" value="${q ? q.timeMins : '15'}">
        `, () => {
            const title = document.getElementById('eq-title').value || 'Unnamed Quest';
            const catId = document.getElementById('eq-cat').value;
            const isOneOff = document.getElementById('eq-type').value === 'one-off';
            const diffXp = parseInt(document.getElementById('eq-xp').value) || 25;
            const timeMins = parseInt(document.getElementById('eq-mins').value) || 15;

            if (q) {
                q.title = title;
                q.catId = catId;
                q.isOneOff = isOneOff;
                q.diffXp = diffXp;
                q.timeMins = timeMins;
                showToast('Quest Updated');
            } else {
                state.quests.push({
                    id: Date.now().toString(),
                    title: title,
                    catId: catId,
                    isOneOff: isOneOff,
                    diffXp: diffXp,
                    timeMins: timeMins
                });
                showToast('Quest Added');
            }
            saveState(); ui.fullRender();
        });
    },
    complete: (id, e) => {
        const q = state.quests.find(x => x.id === id);
        if (!q) return;
        if (getTodayData().qIds.includes(id)) return;
        getTodayData().qIds.push(id);
        getTodayData().mins += q.timeMins;
        coreLogic.addXp(q.diffXp, q.catId, e);
        sfx.playQuestComplete();

        if (q.isOneOff) {
            state.quests = state.quests.filter(x => x.id !== id);
            saveState();
            setTimeout(() => { ui.fullRender(); }, 1200); // smooth visual delay
        }
    },
    delete: (id) => { 
        if (confirm("Delete this quest?")) {
            state.quests = state.quests.filter(q => q.id !== id); 
            saveState(); 
            ui.fullRender(); 
        }
    }
};

const skillManager = {
    openEditor: (id = null) => {
        const s = id ? state.skills.find(x => x.id === id) : null;
        const catOptions = state.categories.map(c => `<option value="${escapeHtml(c.id)}" ${s && s.catId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        
        genericEditor.open(s ? 'Edit Skill' : 'New Skill', `
            <input type="text" id="es-name" placeholder="Skill Name (e.g. React.js)" value="${s ? escapeHtml(s.name) : ''}">
            <label>Category</label><select id="es-cat">${catOptions}</select>
            ${s ? `
            <label>Level</label><input type="number" id="es-level" value="${s.level || 1}">
            <label>Progress (%)</label><input type="number" id="es-progress" value="${(s.progress || 0).toFixed(1)}" min="0" max="100" step="0.1">
            ` : ''}
        `, () => {
            const name = document.getElementById('es-name').value || 'Unnamed Skill';
            const catId = document.getElementById('es-cat').value;
            
            if (s) {
                s.name = name;
                s.catId = catId;
                s.level = parseInt(document.getElementById('es-level').value) || 1;
                s.progress = parseFloat(document.getElementById('es-progress').value) || 0;
                showToast('Skill Updated');
            } else {
                state.skills.push({ id: Date.now().toString(), name: name, catId: catId, progress: 0, level: 1 });
                showToast('Skill Added');
            }
            saveState(); ui.fullRender();
        });
    },
    delete: (id) => { 
        if (confirm("Delete this skill?")) {
            state.skills = state.skills.filter(s => s.id !== id); 
            saveState(); 
            ui.fullRender(); 
        }
    }
};

const bossManager = {
    openEditor: (id = null) => {
        const b = id ? state.bosses.find(x => x.id === id) : null;
        const catOptions = state.categories.map(c => `<option value="${escapeHtml(c.id)}" ${b && b.catId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        
        genericEditor.open(b ? 'Edit Boss' : 'New Boss', `
            <input type="text" id="eb-name" placeholder="Boss Name" value="${b ? escapeHtml(b.name) : ''}">
            <label>Weakness (Category)</label><select id="eb-cat">${catOptions}</select>
            <label>Max HP</label><input type="number" id="eb-hp" value="${b ? b.maxHp : '500'}">
            <label>Current HP</label><input type="number" id="eb-cur-hp" value="${b ? b.hp : '500'}">
            <label>XP Reward</label><input type="number" id="eb-reward" value="${b ? b.rewardXp : '200'}">
        `, () => {
            const name = document.getElementById('eb-name').value || 'Unnamed Boss';
            const catId = document.getElementById('eb-cat').value;
            const maxHp = parseInt(document.getElementById('eb-hp').value) || 500;
            const hp = parseInt(document.getElementById('eb-cur-hp').value) || maxHp;
            const rewardXp = parseInt(document.getElementById('eb-reward').value) || 200;

            if (b) {
                b.name = name;
                b.catId = catId;
                b.maxHp = maxHp;
                b.hp = Math.min(hp, maxHp);
                b.rewardXp = rewardXp;
                showToast('Boss Updated');
            } else {
                state.bosses.push({ id: Date.now().toString(), name: name, catId: catId, hp: hp, maxHp: maxHp, rewardXp: rewardXp });
                showToast('Boss Summoned!');
            }
            saveState(); ui.fullRender();
        });
    },
    delete: (id) => { 
        if (confirm("Banish this boss?")) {
            state.bosses = state.bosses.filter(b => b.id !== id); 
            saveState(); 
            ui.fullRender(); 
        }
    }
};

// --- SETTINGS & DATA MANAGER ---
const settingsManager = {
    saveTheme: () => {
        state.settings.appName = document.getElementById('set-appname').value.trim() || 'MOMENTUM';
        state.settings.theme.primary = document.getElementById('set-color1').value;
        state.settings.theme.secondary = document.getElementById('set-color2').value;
        state.settings.theme.radius = Math.max(0, Math.min(40, parseInt(document.getElementById('set-radius').value, 10) || 0));
        state.settings.sound = document.getElementById('set-sound').value;
        saveState(); ui.init(); showToast('Theme Applied');
    },
    saveProgression: () => {
        state.settings.xp.base = Math.max(1, parseInt(document.getElementById('set-xpbase').value, 10) || 1);
        state.settings.xp.mult = Math.max(1, parseFloat(document.getElementById('set-xpmult').value) || 1);
        state.settings.budgetMins = Math.max(1, parseInt(document.getElementById('set-budget').value, 10) || 1);
        saveState(); ui.fullRender(); showToast('Progression Saved');
    },
    addCategory: () => {
        const n = document.getElementById('cat-new-name').value.trim();
        const c = document.getElementById('cat-new-color').value;
        if(n) { state.categories.push({ id: Date.now().toString(), name: n, color: c }); saveState(); ui.fullRender(); }
        else showToast('Enter a category name first');
    },
    delCat: (id) => {
        const inUse = state.quests.some(q => q.catId === id) || state.skills.some(s => s.catId === id) || state.bosses.some(b => b.catId === id);
        if (inUse) { showToast('Category is in use and cannot be deleted'); return; }
        state.categories = state.categories.filter(c => c.id !== id); saveState(); ui.fullRender();
    },
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
let timerInterval;
const timer = {
    initialMins: 25,
    isRunning: false,
    timerTime: 25 * 60,
    set: (mins) => { 
        clearInterval(timerInterval); 
        timer.isRunning = false; 
        timer.initialMins = mins;
        timer.timerTime = mins * 60; 
        timer.updateUI(); 
        
        document.getElementById('view-timer').classList.remove('focus-active');
    },
    updateUI: () => { 
        let m = Math.floor(timer.timerTime/60); 
        let s = timer.timerTime%60; 
        document.getElementById('timer-display').innerText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; 
    },
    start: () => { 
        if(timer.isRunning) return; 
        timer.isRunning = true; 
        sfx.init(); // Warm up AudioContext on click
        
        document.getElementById('view-timer').classList.add('focus-active');
        
        timerInterval = setInterval(() => { 
            if(timer.timerTime > 0){
                timer.timerTime--; 
                timer.updateUI();
            } else {
                timer.finish(true); 
            }
        }, 1000); 
    },
    pause: () => { 
        clearInterval(timerInterval); 
        timer.isRunning = false; 
        document.getElementById('view-timer').classList.remove('focus-active');
    },
    finish: (completedFully = false) => {
        clearInterval(timerInterval); 
        timer.isRunning = false;
        document.getElementById('view-timer').classList.remove('focus-active');
        
        let mins = 0;
        if (completedFully) {
            mins = timer.initialMins;
        } else {
            // Precise elapsed calculation instead of hardcoded 25m estimation!
            mins = Math.max(1, timer.initialMins - Math.floor(timer.timerTime / 60));
        }
        
        state.stats.totalMins += mins; 
        getTodayData().mins += mins;
        coreLogic.addXp(mins, null, null); 
        
        sfx.playTimerFinished();
        showToast(`Focus logged! +${mins} XP`); 
        timer.set(timer.initialMins); 
    }
};

document.getElementById('btn-timer-start').onclick = timer.start;
document.getElementById('btn-timer-pause').onclick = timer.pause;
document.getElementById('btn-timer-reset').onclick = () => timer.set(timer.initialMins);
document.getElementById('btn-timer-finish').onclick = () => timer.finish(false);

// --- ONBOARDING EVENT ---
document.getElementById('btn-onboard').onclick = () => {
    state.profile.name = document.getElementById('ob-name').value || 'Traveler';
    state.profile.goal = document.getElementById('ob-goal').value || 'Level Up';
    state.profile.isFirstVisit = false;
    saveState(); 
    document.getElementById('onboarding-modal').classList.remove('active');
    document.getElementById('app').classList.remove('hidden'); 
    ui.fullRender();
};

// Start App
ui.init();
