// --- STATE MANAGEMENT ---
const STORAGE_KEY = 'momentum_os_data';

const DEFAULT_STATE = {
    user: { name: '', goal: '', isFirstVisit: true },
    stats: { level: 1, xp: 0, totalXp: 0, currentStreak: 0, bestStreak: 0, totalStudyMins: 0 },
    quests: [], // { id, title, category, diff, time, active: true }
    history: {}, // { 'YYYY-MM-DD': { xp, completedIds: [], studyMins: 0 } }
    skills: {
        'C++': 0, 'Linux': 0, 'Systems': 0, 'Machine Learning': 0, 
        'Distributed Systems': 0, 'GPU': 0, 'ML Systems': 0, 'Research': 0
    },
    bosses: {
        'MASTER C++': { hp: 100, cat: 'C++' },
        'MASTER LINUX': { hp: 100, cat: 'Linux' },
        'MASTER OS': { hp: 100, cat: 'Systems' },
        'MASTER ML': { hp: 100, cat: 'Machine Learning' }
    },
    readiness: {
        'GPA': 50, 'IELTS': 20, 'Research': 10, 'Paper': 0, 
        'GitHub': 40, 'Projects': 30, 'SOP': 0, 'Outreach': 0
    },
    achievements: [] // string IDs
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY));

if (!state || state.user === undefined) {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE)); // Deep copy
}

const ACHIEVEMENTS_DEF = {
    'FIRST_QUEST': { name: 'First Quest', desc: 'Complete your first task.', req: () => state.stats.totalXp > 0 },
    'STREAK_7': { name: '7 Day Streak', desc: 'Stay active for 7 consecutive days.', req: () => state.stats.bestStreak >= 7 },
    'XP_1000': { name: '1000 XP', desc: 'Reach 1000 total XP.', req: () => state.stats.totalXp >= 1000 },
    'STUDY_100H': { name: '100 Hours', desc: 'Log 100 hours of focus time.', req: () => state.stats.totalStudyMins >= 6000 }
};

// --- CORE UTILS ---
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getHistoryToday() {
    const today = getTodayStr();
    if (!state.history[today]) {
        state.history[today] = { xp: 0, completedIds: [], studyMins: 0 };
    }
    return state.history[today];
}

function calcLevelXpReq(level) {
    return Math.floor(500 * Math.pow(1.2, level - 1));
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function floatXpAnimation(amount, event) {
    const floater = document.createElement('div');
    floater.className = 'xp-float';
    floater.innerText = `+${amount} XP`;
    floater.style.left = `${event.clientX}px`;
    floater.style.top = `${event.clientY}px`;
    document.getElementById('xp-floater-container').appendChild(floater);
    setTimeout(() => floater.remove(), 1000);
}

// --- INIT & NAVIGATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (state.user.isFirstVisit) {
        document.getElementById('onboarding').classList.add('active');
    } else {
        document.getElementById('app').classList.remove('hidden');
        fullRender();
    }
    bindEvents();
});

function bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`view-${e.target.dataset.target}`).classList.add('active');
            fullRender();
        });
    });

    // Onboarding
    document.getElementById('btn-start-journey').addEventListener('click', () => {
        state.user.name = document.getElementById('ob-name').value || 'Traveler';
        state.user.goal = document.getElementById('ob-goal').value || 'Growth';
        state.user.isFirstVisit = false;
        saveState();
        document.getElementById('onboarding').classList.remove('active');
        document.getElementById('app').classList.remove('hidden');
        fullRender();
    });

    // Add Quest
    document.getElementById('btn-add-quest').addEventListener('click', () => {
        const title = document.getElementById('q-title').value.trim();
        if (!title) return;
        const newQuest = {
            id: Date.now().toString(),
            title: title,
            category: document.getElementById('q-category').value,
            diff: parseInt(document.getElementById('q-diff').value),
            time: parseInt(document.getElementById('q-time').value),
            active: true
        };
        state.quests.push(newQuest);
        document.getElementById('q-title').value = '';
        saveState();
        fullRender();
        showToast('Quest added!');
    });

    // Settings Data Management
    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm("Are you sure? This deletes ALL local data.")) {
            if (confirm("Double checking: Delete everything permanently?")) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        }
    });

    document.getElementById('btn-export').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `momentum_backup_${getTodayStr()}.json`);
        dlAnchorElem.click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                if (imported && imported.stats) {
                    state = imported;
                    saveState();
                    location.reload();
                } else { alert("Invalid save file."); }
            } catch(err) { alert("Error reading file."); }
        };
        reader.readAsText(file);
    });
}

// --- LOGIC & RENDERING ---
function fullRender() {
    updateGlobalUI();
    renderQuests();
    renderSkillsAndBosses();
    renderAnalytics();
    renderReadiness();
    checkAchievements();
    calculateStreak();
}

function updateGlobalUI() {
    document.getElementById('ui-username').innerText = state.user.name;
    document.getElementById('ui-streak').innerText = state.stats.currentStreak;
    document.getElementById('ui-level').innerText = `LV. ${state.stats.level}`;
    
    const req = calcLevelXpReq(state.stats.level);
    document.getElementById('ui-xp-text').innerText = `${state.stats.xp} / ${req} XP`;
    document.getElementById('ui-xp-bar').style.width = `${Math.min((state.stats.xp / req) * 100, 100)}%`;

    // Time budget
    let todayMins = 0;
    const todayData = getHistoryToday();
    state.quests.forEach(q => {
        if (todayData.completedIds.includes(q.id)) { todayMins += q.time; }
    });
    document.getElementById('ui-budget-spent').innerText = todayMins;
    const budgetPct = Math.min((todayMins / 120) * 100, 100);
    const bar = document.getElementById('ui-budget-bar');
    bar.style.width = `${budgetPct}%`;
    if (todayMins > 120) {
        bar.style.background = 'var(--danger)';
        document.getElementById('ui-budget-spent').style.color = 'var(--danger)';
    } else {
        bar.style.background = 'var(--grad)';
        document.getElementById('ui-budget-spent').style.color = 'inherit';
    }
}

function completeQuest(questId, xpValue, category, event) {
    const today = getHistoryToday();
    if (today.completedIds.includes(questId)) return; // Already done today

    today.completedIds.push(questId);
    today.xp += xpValue;
    
    // Add XP
    state.stats.totalXp += xpValue;
    state.stats.xp += xpValue;
    
    // Level Up Check
    let req = calcLevelXpReq(state.stats.level);
    if (state.stats.xp >= req) {
        state.stats.xp -= req;
        state.stats.level++;
        showToast(`LEVEL UP! You are now Level ${state.stats.level} 🚀`);
    }

    // Skills update
    if (state.skills[category] !== undefined) {
        state.skills[category] = Math.min(state.skills[category] + (xpValue / 10), 100);
    }

    // Boss damage
    for (let b in state.bosses) {
        if (state.bosses[b].cat === category && state.bosses[b].hp > 0) {
            state.bosses[b].hp = Math.max(state.bosses[b].hp - (xpValue/5), 0);
            if (state.bosses[b].hp === 0) showToast(`BOSS DEFEATED: ${b}!`);
        }
    }

    saveState();
    if (event) floatXpAnimation(xpValue, event);
    fullRender();
}

function renderQuests() {
    const dashList = document.getElementById('dash-quests');
    const allList = document.getElementById('all-quests');
    dashList.innerHTML = '';
    allList.innerHTML = '';
    
    const today = getHistoryToday();

    state.quests.forEach((q, index) => {
        const isCompletedToday = today.completedIds.includes(q.id);
        
        const div = document.createElement('div');
        div.className = 'quest-item';
        div.innerHTML = `
            <div class="quest-info">
                <h4>${q.title}</h4>
                <div class="quest-meta">${q.category} • ${q.time}m • ${q.diff} XP</div>
            </div>
            <div class="quest-actions">
                <div class="quest-checkbox ${isCompletedToday ? 'completed' : ''}" data-id="${q.id}"></div>
            </div>
        `;
        
        // Add to both lists
        allList.appendChild(div.cloneNode(true));
        dashList.appendChild(div);
    });

    document.querySelectorAll('.quest-checkbox').forEach(cb => {
        cb.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const quest = state.quests.find(q => q.id === id);
            if (!e.target.classList.contains('completed')) {
                completeQuest(quest.id, quest.diff, quest.category, e);
            }
        });
    });
}

function renderSkillsAndBosses() {
    const sTree = document.getElementById('skill-tree');
    sTree.innerHTML = '';
    for (let s in state.skills) {
        const pct = state.skills[s].toFixed(1);
        sTree.innerHTML += `
            <div class="skill-item">
                <div class="skill-header"><span>${s}</span><span>${pct}%</span></div>
                <div class="xp-bar-bg"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
            </div>`;
    }

    const bList = document.getElementById('boss-list');
    bList.innerHTML = '';
    for (let b in state.bosses) {
        const hp = state.bosses[b].hp;
        bList.innerHTML += `
            <div class="boss-item">
                <div class="boss-header"><span>${b}</span><span>HP: ${hp.toFixed(0)}/100</span></div>
                <div class="xp-bar-bg"><div class="xp-bar-fill" style="width:${hp}%"></div></div>
            </div>`;
    }
}

function renderReadiness() {
    const rCon = document.getElementById('ui-readiness-sliders');
    rCon.innerHTML = '';
    let total = 0;
    let count = 0;
    for (let r in state.readiness) {
        total += state.readiness[r];
        count++;
        rCon.innerHTML += `
            <div class="range-group">
                <label><span>${r}</span> <span>${state.readiness[r]}%</span></label>
                <input type="range" min="0" max="100" value="${state.readiness[r]}" data-key="${r}" class="readiness-slider">
            </div>`;
    }
    document.getElementById('ui-readiness-total').innerText = `${Math.round(total/count)}%`;
    
    document.querySelectorAll('.readiness-slider').forEach(sl => {
        sl.addEventListener('input', (e) => {
            state.readiness[e.target.dataset.key] = parseInt(e.target.value);
            saveState();
            renderReadiness(); // Re-render numbers
        });
    });
}

function calculateStreak() {
    let current = 0;
    let d = new Date();
    // Check backwards from today
    while(true) {
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const h = state.history[dStr];
        
        if (h && h.completedIds && h.completedIds.length > 0) {
            current++;
            d.setDate(d.getDate() - 1);
        } else {
            // If today is empty, it doesn't break the streak YET. Just check yesterday.
            if (dStr === getTodayStr()) {
                d.setDate(d.getDate() - 1);
                continue; 
            }
            break;
        }
    }
    state.stats.currentStreak = current;
    if (current > state.stats.bestStreak) state.stats.bestStreak = current;
    saveState();
}

function renderAnalytics() {
    document.getElementById('stat-xp').innerText = state.stats.totalXp;
    let totalC = 0;
    for (let k in state.history) { totalC += state.history[k].completedIds.length; }
    document.getElementById('stat-tasks').innerText = totalC;
    document.getElementById('stat-hours').innerText = (state.stats.totalStudyMins / 60).toFixed(1);

    // Weekly Chart
    const wChart = document.getElementById('ui-weekly-chart');
    wChart.innerHTML = '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    
    let maxWeeklyXp = 100; // Base scale
    let weeklyData = [];
    
    for (let i = 6; i >= 0; i--) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hXp = state.history[dStr] ? state.history[dStr].xp : 0;
        if (hXp > maxWeeklyXp) maxWeeklyXp = hXp;
        weeklyData.push({ day: days[d.getDay()], xp: hXp });
    }

    weeklyData.forEach(wd => {
        const hPct = (wd.xp / maxWeeklyXp) * 100;
        wChart.innerHTML += `
            <div class="chart-bar-container">
                <div class="chart-label">${wd.xp}</div>
                <div class="chart-bar" style="height: ${Math.max(hPct, 5)}%"></div>
                <div class="chart-label">${wd.day}</div>
            </div>`;
    });

    // Monthly Calendar Activity
    const cal = document.getElementById('ui-calendar');
    cal.innerHTML = '';
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const xp = state.history[dStr] ? state.history[dStr].xp : 0;
        let lvl = '';
        if (xp > 150) lvl = 'lvl-4';
        else if (xp > 75) lvl = 'lvl-3';
        else if (xp > 25) lvl = 'lvl-2';
        else if (xp > 0) lvl = 'lvl-1';
        
        cal.innerHTML += `<div class="cal-day ${lvl}" title="${dStr}: ${xp} XP"></div>`;
    }
}

function checkAchievements() {
    const achContainer = document.getElementById('ui-achievements-mini');
    achContainer.innerHTML = '';
    for (let key in ACHIEVEMENTS_DEF) {
        const ach = ACHIEVEMENTS_DEF[key];
        if (!state.achievements.includes(key) && ach.req()) {
            state.achievements.push(key);
            showToast(`🏆 Achievement Unlocked: ${ach.name}`);
            saveState();
        }
        if (state.achievements.includes(key)) {
            achContainer.innerHTML += `
                <div class="quest-item" style="padding:10px;">
                    <div><b style="color:var(--flame)">🏆 ${ach.name}</b><br><small class="text-soft">${ach.desc}</small></div>
                </div>`;
        }
    }
}

// --- FOCUS TIMER ---
let timerInterval;
let timerTime = 25 * 60; 
let isRunning = false;

function setTimer(mins) {
    clearInterval(timerInterval);
    isRunning = false;
    timerTime = mins * 60;
    updateTimerUI();
}

function updateTimerUI() {
    let m = Math.floor(timerTime / 60);
    let s = timerTime % 60;
    document.getElementById('timer-display').innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

document.getElementById('btn-timer-start').addEventListener('click', () => {
    if (isRunning) return;
    isRunning = true;
    timerInterval = setInterval(() => {
        if (timerTime > 0) {
            timerTime--;
            updateTimerUI();
        } else {
            clearInterval(timerInterval);
            isRunning = false;
        }
    }, 1000);
});

document.getElementById('btn-timer-pause').addEventListener('click', () => {
    clearInterval(timerInterval);
    isRunning = false;
});

document.getElementById('btn-timer-reset').addEventListener('click', () => {
    setTimer(25);
});

document.getElementById('btn-timer-finish').addEventListener('click', () => {
    clearInterval(timerInterval);
    isRunning = false;
    // Log time
    const minsCompleted = Math.max(1, 25 - Math.floor(timerTime/60)); // Rough estimate if not fully standard
    state.stats.totalStudyMins += minsCompleted;
    getHistoryToday().studyMins += minsCompleted;
    
    // Reward XP based on time (1 min = 1 XP)
    state.stats.totalXp += minsCompleted;
    state.stats.xp += minsCompleted;
    saveState();
    
    showToast(`Focus session logged! +${minsCompleted} XP`);
    fullRender();
    setTimer(25);
});
