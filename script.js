const STORAGE_KEY = "study_habit_planner_v1";

// Default state
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
  deadlines: [],
  studyTasks: [], // { id, deadlineId, title, date, done }
  habits: [
    { id: "h1", title: "2x Pomodoro Deep Study", completedDates: [] },
    { id: "h2", title: "Review Tomorrow's Deadlines", completedDates: [] }
  ],
  syncConfig: {
    firebaseUrl: "",
    syncKey: ""
  }
};

let currentMonth = new Date();
let selectedDateStr = toISODate(new Date());

function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  // Auto-push to cloud if configured
  if (state.syncConfig.firebaseUrl && state.syncConfig.syncKey) {
    pushToCloud(true);
  }
}

// ==========================================
// 1. DEADLINES & AUTO STUDY PLAN GENERATOR
// ==========================================
document.getElementById("deadline-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("dl-title").value.trim();
  const date = document.getElementById("dl-date").value;
  const priority = parseInt(document.getElementById("dl-priority").value, 10);

  if (!title || !date) return;

  state.deadlines.push({
    id: "dl_" + Date.now(),
    title,
    date,
    priority // 3 = High (4 blocks), 2 = Med (3 blocks), 1 = Low (2 blocks)
  });

  state.deadlines.sort((a, b) => a.date.localeCompare(b.date));
  e.target.reset();
  saveState();
});

function deleteDeadline(id) {
  state.deadlines = state.deadlines.filter((d) => d.id !== id);
  state.studyTasks = state.studyTasks.filter((t) => t.deadlineId !== id);
  saveState();
}

// Smart Study Plan Generator: spreads study sessions across days before each deadline
document.getElementById("btn-generate-plan").addEventListener("click", () => {
  if (state.deadlines.length === 0) {
    alert("Add your deadlines first, then click Auto-Build!");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const newTasks = [];
  const stepNames = {
    4: ["1. Outline & Gather Material", "2. Core Study / Drafting", "3. Practice & Problem Solving", "4. Final Review & Polish"],
    3: ["1. Core Concepts & Setup", "2. Main Work / Practice", "3. Final Review & Submission Prep"],
    2: ["1. Main Study Session", "2. Final Review & Wrap-up"]
  };

  // Track daily load so we balance study blocks across the 2 weeks
  const dailyLoad = {};

  state.deadlines.forEach((dl) => {
    const due = new Date(dl.date + "T00:00:00");
    const diffDays = Math.max(1, Math.round((due - today) / (1000 * 60 * 60 * 24)));
    const blocksCount = dl.priority + 1; // 4, 3, or 2 sessions
    const labels = stepNames[blocksCount] || stepNames[3];

    // Candidate dates from today up to 1 day before deadline (or deadline day if due today)
    const availableDates = [];
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      availableDates.push(toISODate(d));
    }
    if (availableDates.length === 0) availableDates.push(dl.date);

    // Pick evenly spaced days with the lowest existing study load
    for (let b = 0; b < blocksCount; b++) {
      const idealIdx = Math.min(
        availableDates.length - 1,
        Math.floor((b / blocksCount) * availableDates.length)
      );
      const chosenDate = availableDates[idealIdx];
      dailyLoad[chosenDate] = (dailyLoad[chosenDate] || 0) + 1;

      newTasks.push({
        id: `st_${dl.id}_${b}`,
        deadlineId: dl.id,
        title: `[${dl.title}] ${labels[b]}`,
        date: chosenDate,
        done: false
      });
    }
  });

  newTasks.sort((a, b) => a.date.localeCompare(b.date));
  state.studyTasks = newTasks;
  saveState();
});

function toggleStudyTask(taskId) {
  const t = state.studyTasks.find((x) => x.id === taskId);
  if (t) {
    t.done = !t.done;
    saveState();
  }
}

// ==========================================
// 2. CALENDAR VIEW
// ==========================================
document.getElementById("prev-month").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById("next-month").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
});

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  document.getElementById("calendar-title").textContent = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toISODate(new Date());

  for (let i = 0; i < startDayOfWeek; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day other-month";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const dateStr = toISODate(dateObj);
    const cell = document.createElement("div");
    cell.className = "cal-day";
    if (dateStr === todayStr) cell.classList.add("today");
    if (dateStr === selectedDateStr) cell.classList.add("selected");

    const dayDeadlines = state.deadlines.filter((d) => d.date === dateStr);
    const dayTasks = state.studyTasks.filter((t) => t.date === dateStr);

    let badgesHTML = `<div class="cal-badges">`;
    dayDeadlines.forEach((d) => {
      badgesHTML += `<div class="dot-deadline">🎯 ${d.title}</div>`;
    });
    if (dayTasks.length > 0) {
      const doneCount = dayTasks.filter((t) => t.done).length;
      badgesHTML += `<div class="dot-study">📖 ${doneCount}/${dayTasks.length} study</div>`;
    }
    badgesHTML += `</div>`;

    cell.innerHTML = `<span>${day}</span>${badgesHTML}`;
    cell.addEventListener("click", () => {
      selectedDateStr = dateStr;
      renderCalendar();
      renderSelectedDay();
    });
    grid.appendChild(cell);
  }
}

function renderSelectedDay() {
  document.getElementById("selected-date-label").textContent = `📌 Schedule for ${selectedDateStr}`;
  const container = document.getElementById("selected-date-content");
  const dls = state.deadlines.filter((d) => d.date === selectedDateStr);
  const tasks = state.studyTasks.filter((t) => t.date === selectedDateStr);

  if (dls.length === 0 && tasks.length === 0) {
    container.innerHTML = `<p class="hint">No deadlines or study blocks on this day.</p>`;
    return;
  }

  let html = "";
  dls.forEach((d) => {
    html += `<div class="badge badge-deadline" style="margin-bottom:6px;display:inline-block;">🎯 DEADLINE: ${d.title}</div>`;
  });
  tasks.forEach((t) => {
    html += `
      <label class="task-check">
        <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleStudyTask('${t.id}')" />
        <span class="${t.done ? "done-text" : ""}">${t.title}</span>
      </label>`;
  });
  container.innerHTML = html;
}

// ==========================================
// 3. DAILY HABIT TRACKER
// ==========================================
document.getElementById("habit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("habit-input");
  if (!input.value.trim()) return;
  state.habits.push({
    id: "h_" + Date.now(),
    title: input.value.trim(),
    completedDates: []
  });
  input.value = "";
  saveState();
});

function toggleHabitToday(habitId) {
  const today = toISODate(new Date());
  const h = state.habits.find((x) => x.id === habitId);
  if (!h) return;
  if (h.completedDates.includes(today)) {
    h.completedDates = h.completedDates.filter((d) => d !== today);
  } else {
    h.completedDates.push(today);
  }
  saveState();
}

// ==========================================
// 4. SYNC ACROSS LAPTOP, TABLET & MOBILE
// ==========================================
document.getElementById("btn-open-sync").addEventListener("click", () => {
  document.getElementById("sync-panel").classList.toggle("hidden");
  document.getElementById("firebase-url").value = state.syncConfig.firebaseUrl || "";
  document.getElementById("sync-key").value = state.syncConfig.syncKey || "";
});

async function pushToCloud(silent = false) {
  const url = document.getElementById("firebase-url").value.trim().replace(/\/$/, "");
  const key = document.getElementById("sync-key").value.trim();
  const statusEl = document.getElementById("sync-status");

  if (!url || !key) {
    if (!silent) statusEl.textContent = "⚠️ Enter both Firebase URL and Secret Key.";
    return;
  }

  state.syncConfig = { firebaseUrl: url, syncKey: key };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  try {
    const res = await fetch(`${url}/studyPlanner/${encodeURIComponent(key)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deadlines: state.deadlines,
        studyTasks: state.studyTasks,
        habits: state.habits,
        updatedAt: new Date().toISOString()
      })
    });
    if (res.ok && !silent) statusEl.textContent = "✅ Synced to Cloud!";
  } catch (err) {
    if (!silent) statusEl.textContent = "❌ Sync failed. Check URL.";
  }
}

async function pullFromCloud() {
  const url = document.getElementById("firebase-url").value.trim().replace(/\/$/, "");
  const key = document.getElementById("sync-key").value.trim();
  const statusEl = document.getElementById("sync-status");

  if (!url || !key) {
    statusEl.textContent = "⚠️ Enter both Firebase URL and Secret Key.";
    return;
  }

  try {
    const res = await fetch(`${url}/studyPlanner/${encodeURIComponent(key)}.json`);
    const data = await res.json();
    if (data) {
      state.deadlines = data.deadlines || [];
      state.studyTasks = data.studyTasks || [];
      state.habits = data.habits || [];
      state.syncConfig = { firebaseUrl: url, syncKey: key };
      saveState();
      statusEl.textContent = "✅ Loaded latest data from Cloud!";
    } else {
      statusEl.textContent = "ℹ️ No cloud backup found for that key.";
    }
  } catch (err) {
    statusEl.textContent = "❌ Failed to load from Cloud.";
  }
}

document.getElementById("btn-cloud-push").addEventListener("click", () => pushToCloud(false));
document.getElementById("btn-cloud-pull").addEventListener("click", pullFromCloud);

// Copy/Paste JSON backup for instant zero-account transfer
document.getElementById("btn-copy-json").addEventListener("click", () => {
  navigator.clipboard.writeText(JSON.stringify(state));
  document.getElementById("sync-status").textContent = "📋 Backup code copied!";
});

document.getElementById("btn-paste-json").addEventListener("click", async () => {
  const raw = prompt("Paste the backup code from your other device:");
  if (!raw) return;
  try {
    state = JSON.parse(raw);
    saveState();
    document.getElementById("sync-status").textContent = "✅ Restored from backup code!";
  } catch {
    alert("Invalid backup code.");
  }
});

// Export Deadlines & Study Plan as .ics file for Google/Apple/Samsung Calendar
document.getElementById("btn-export-ics").addEventListener("click", () => {
  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//StudyPlanner//EN\r\n";

  const formatICSDate = (dateStr) => dateStr.replace(/-/g, "");

  state.deadlines.forEach((d) => {
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${d.id}@studyplanner\r\n`;
    ics += `DTSTART;VALUE=DATE:${formatICSDate(d.date)}\r\n`;
    ics += `SUMMARY:🎯 DEADLINE: ${d.title}\r\n`;
    ics += "END:VEVENT\r\n";
  });

  state.studyTasks.forEach((t) => {
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${t.id}@studyplanner\r\n`;
    ics += `DTSTART;VALUE=DATE:${formatICSDate(t.date)}\r\n`;
    ics += `SUMMARY:📖 STUDY: ${t.title}\r\n`;
    ics += "END:VEVENT\r\n";
  });

  ics += "END:VCALENDAR";

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "study-plan-deadlines.ics";
  link.click();
});

// ==========================================
// 5. MAIN RENDER
// ==========================================
function renderAll() {
  document.getElementById("deadline-count").textContent = state.deadlines.length;
  document.getElementById("header-summary").textContent =
    `${state.deadlines.length} Deadlines | ${state.studyTasks.filter((t) => !t.done).length} Study Blocks Remaining`;

  // Render Deadline List
  const dlList = document.getElementById("deadline-list");
  dlList.innerHTML = state.deadlines
    .map((d) => {
      const daysLeft = Math.ceil((new Date(d.date + "T00:00:00") - new Date().setHours(0,0,0,0)) / 86400000);
      const badge = daysLeft < 0 ? "Past" : daysLeft === 0 ? "Due Today!" : `in ${daysLeft}d`;
      return `
        <li class="item-row priority-${d.priority}">
          <div>
            <strong>${d.title}</strong>
            <div class="hint">${d.date} (${badge})</div>
          </div>
          <button class="btn btn-icon" onclick="deleteDeadline('${d.id}')">✕</button>
        </li>`;
    })
    .join("");

  // Render Study Plan grouped by date
  const planList = document.getElementById("study-plan-list");
  const grouped = {};
  state.studyTasks.forEach((t) => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  });

  const doneCount = state.studyTasks.filter((t) => t.done).length;
  const pct = state.studyTasks.length ? Math.round((doneCount / state.studyTasks.length) * 100) : 0;
  document.getElementById("plan-progress").textContent = `${pct}% Completed`;

  planList.innerHTML = Object.keys(grouped)
    .sort()
    .map(
      (date) => `
      <div class="plan-day-group">
        <h4>📅 ${date}</h4>
        ${grouped[date]
          .map(
            (t) => `
          <label class="task-check">
            <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleStudyTask('${t.id}')" />
            <span class="${t.done ? "done-text" : ""}">${t.title}</span>
          </label>`
          )
          .join("")}
      </div>`
    )
    .join("");

  // Render Habits
  const today = toISODate(new Date());
  const habitList = document.getElementById("habit-list");
  habitList.innerHTML = state.habits
    .map((h) => {
      const done = h.completedDates.includes(today);
      return `
        <li class="item-row">
          <label class="task-check">
            <input type="checkbox" ${done ? "checked" : ""} onchange="toggleHabitToday('${h.id}')" />
            <span class="${done ? "done-text" : ""}">${h.title}</span>
          </label>
          <span class="badge badge-study">🔥 ${h.completedDates.length}d</span>
        </li>`;
    })
    .join("");

  renderCalendar();
  renderSelectedDay();
}

renderAll();
