const STORAGE_KEY = "study_habit_planner_v2";

// Load saved state safely
function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
        studyTasks: Array.isArray(parsed.studyTasks) ? parsed.studyTasks : [],
        habits: Array.isArray(parsed.habits) ? parsed.habits : [],
        syncConfig: parsed.syncConfig || { firebaseUrl: "", syncKey: "" }
      };
    }
  } catch (e) {
    console.warn("Resetting local state due to parse error:", e);
  }
  return {
    deadlines: [],
    studyTasks: [],
    habits: [
      { id: "h_1", title: "2h Focused Study (No Phone)", completedDates: [] },
      { id: "h_2", title: "Review Tomorrow's Deadlines", completedDates: [] }
    ],
    syncConfig: { firebaseUrl: "", syncKey: "" }
  };
}

let state = loadInitialState();
let currentMonth = new Date();
let selectedDateStr = toISODate(new Date());

// Helper: Format Date object as YYYY-MM-DD in local timezone
function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper: Escape HTML to prevent broken tags
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function saveState(skipCloud = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  if (!skipCloud && state.syncConfig.firebaseUrl && state.syncConfig.syncKey) {
    pushToCloud(true);
  }
}

// ==========================================
// 1. DEADLINES & SMART 2-WEEK STUDY PLANNER
// ==========================================
const deadlineForm = document.getElementById("deadline-form");
const dlDateInput = document.getElementById("dl-date");
if (dlDateInput) dlDateInput.value = toISODate(new Date());

deadlineForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const titleEl = document.getElementById("dl-title");
  const dateEl = document.getElementById("dl-date");
  const priorityEl = document.getElementById("dl-priority");

  const title = titleEl.value.trim();
  const date = dateEl.value;
  const priority = parseInt(priorityEl.value, 10) || 2;

  if (!title || !date) return;

  state.deadlines.push({
    id: "dl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    title,
    date,
    priority
  });

  state.deadlines.sort((a, b) => a.date.localeCompare(b.date));
  titleEl.value = "";
  selectedDateStr = date;
  saveState();
});

window.deleteDeadline = function (id) {
  state.deadlines = state.deadlines.filter((d) => d.id !== id);
  state.studyTasks = state.studyTasks.filter((t) => t.deadlineId !== id);
  saveState();
};

// Load-balanced Study Plan Generator for multiple deadlines
document.getElementById("btn-generate-plan").addEventListener("click", () => {
  if (state.deadlines.length === 0) {
    alert("Add your deadlines first, then click Auto-Build 2-Week Study Plan!");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stepTemplates = {
    4: [
      "Part 1: Topic Review & Outline",
      "Part 2: Core Work / Problem Solving",
      "Part 3: Complete Draft / Implementation",
      "Part 4: Final Polish & Submission Check"
    ],
    3: [
      "Part 1: Review Notes & Setup",
      "Part 2: Main Study / Assignment Work",
      "Part 3: Final Review & Wrap-Up"
    ],
    2: [
      "Part 1: Core Study Session",
      "Part 2: Final Check & Submission"
    ]
  };

  // Preserve completion status if regenerating
  const previousDoneMap = {};
  state.studyTasks.forEach((t) => {
    previousDoneMap[`${t.deadlineId}_${t.stepIndex}`] = t.done;
  });

  // Track how many tasks are scheduled on each date so we balance the load across 2 weeks
  const dailyLoad = {};
  const generatedTasks = [];

  // Sort deadlines by due date (earliest first, highest priority first)
  const sortedDeadlines = [...state.deadlines].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.priority - a.priority;
  });

  sortedDeadlines.forEach((dl) => {
    const dueDate = new Date(dl.date + "T00:00:00");
    const totalDays = Math.max(1, Math.round((dueDate - today) / 86400000));
    const numBlocks = dl.priority + 1; // High=4, Med=3, Low=2
    const labels = stepTemplates[numBlocks] || stepTemplates[3];

    // Build list of candidate dates from today up to the deadline
    const candidateDates = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      candidateDates.push(toISODate(d));
    }
    if (candidateDates.length === 0) {
      candidateDates.push(dl.date);
    }

    // Divide candidate window into segments and pick the lightest-loaded day in each segment
    for (let b = 0; b < numBlocks; b++) {
      const segStart = Math.floor((b * candidateDates.length) / numBlocks);
      const segEnd = Math.max(
        segStart,
        Math.floor(((b + 1) * candidateDates.length) / numBlocks) - 1
      );

      let chosenDate = candidateDates[segStart];
      let minLoad = Infinity;

      for (let idx = segStart; idx <= segEnd; idx++) {
        const dStr = candidateDates[idx];
        const load = dailyLoad[dStr] || 0;
        if (load < minLoad) {
          minLoad = load;
          chosenDate = dStr;
        }
      }

      dailyLoad[chosenDate] = (dailyLoad[chosenDate] || 0) + 1;
      const taskKey = `${dl.id}_${b}`;

      generatedTasks.push({
        id: `st_${dl.id}_${b}`,
        deadlineId: dl.id,
        stepIndex: b,
        title: `${dl.title} — ${labels[b]}`,
        date: chosenDate,
        done: Boolean(previousDoneMap[taskKey])
      });
    }
  });

  generatedTasks.sort((a, b) => a.date.localeCompare(b.date));
  state.studyTasks = generatedTasks;
  saveState();
});

window.toggleStudyTask = function (taskId) {
  const task = state.studyTasks.find((t) => t.id === taskId);
  if (task) {
    task.done = !task.done;
    saveState();
  }
};

// ==========================================
// 2. INTERACTIVE CALENDAR
// ==========================================
document.getElementById("prev-month").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const titleEl = document.getElementById("calendar-title");
  grid.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  titleEl.textContent = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const firstDayOfMonth = new Date(year, month, 1);
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toISODate(new Date());

  // Leading empty cells
  for (let i = 0; i < startOffset; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "cal-day other-month";
    grid.appendChild(emptyCell);
  }

  // Days of the month
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
      badgesHTML += `<div class="dot-deadline" title="Deadline: ${escapeHTML(d.title)}">🎯 ${escapeHTML(d.title)}</div>`;
    });
    if (dayTasks.length > 0) {
      const completed = dayTasks.filter((t) => t.done).length;
      badgesHTML += `<div class="dot-study">📖 ${completed}/${dayTasks.length} study</div>`;
    }
    badgesHTML += `</div>`;

    cell.innerHTML = `<span class="cal-day-num">${day}</span>${badgesHTML}`;
    cell.addEventListener("click", () => {
      selectedDateStr = dateStr;
      dlDateInput.value = dateStr; // Also pre-fill deadline date picker with clicked day
      renderCalendar();
      renderSelectedDay();
    });

    grid.appendChild(cell);
  }
}

function renderSelectedDay() {
  const labelEl = document.getElementById("selected-date-label");
  const contentEl = document.getElementById("selected-date-content");

  labelEl.textContent = `📌 Schedule for ${selectedDateStr}`;

  const dls = state.deadlines.filter((d) => d.date === selectedDateStr);
  const tasks = state.studyTasks.filter((t) => t.date === selectedDateStr);

  if (dls.length === 0 && tasks.length === 0) {
    contentEl.innerHTML = `<p class="helper-text">No deadlines or study blocks on this day. Click "+ Add Deadline" to schedule one here.</p>`;
    return;
  }

  let html = "";
  dls.forEach((d) => {
    html += `<div><span class="legend-pill pill-deadline">🎯 DEADLINE: ${escapeHTML(d.title)}</span></div>`;
  });

  tasks.forEach((t) => {
    html += `
      <label class="task-check">
        <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleStudyTask('${t.id}')" />
        <span class="${t.done ? "done-text" : ""}">${escapeHTML(t.title)}</span>
      </label>
    `;
  });

  contentEl.innerHTML = html;
}

// ==========================================
// 3. DAILY STUDY HABITS
// ==========================================
document.getElementById("habit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("habit-input");
  const title = input.value.trim();
  if (!title) return;

  state.habits.push({
    id: "h_" + Date.now(),
    title,
    completedDates: []
  });

  input.value = "";
  saveState();
});

window.toggleHabitToday = function (habitId) {
  const today = toISODate(new Date());
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;

  if (habit.completedDates.includes(today)) {
    habit.completedDates = habit.completedDates.filter((d) => d !== today);
  } else {
    habit.completedDates.push(today);
  }
  saveState();
};

window.deleteHabit = function (habitId) {
  state.habits = state.habits.filter((h) => h.id !== habitId);
  saveState();
};

// ==========================================
// 4. CLOUD SYNC & CALENDAR (.ICS) EXPORT
// ==========================================
const syncPanel = document.getElementById("sync-panel");
const firebaseUrlInput = document.getElementById("firebase-url");
const syncKeyInput = document.getElementById("sync-key");
const syncStatusEl = document.getElementById("sync-status");

document.getElementById("btn-open-sync").addEventListener("click", () => {
  syncPanel.classList.toggle("hidden");
  firebaseUrlInput.value = state.syncConfig.firebaseUrl || "";
  syncKeyInput.value = state.syncConfig.syncKey || "";
});

async function pushToCloud(silent = false) {
  const url = (firebaseUrlInput.value || state.syncConfig.firebaseUrl || "").trim().replace(/\/$/, "");
  const key = (syncKeyInput.value || state.syncConfig.syncKey || "").trim();

  if (!url || !key) {
    if (!silent) syncStatusEl.textContent = "⚠️ Enter Firebase URL & Sync Key";
    return;
  }

  state.syncConfig = { firebaseUrl: url, syncKey: key };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  try {
    if (!silent) syncStatusEl.textContent = "⏳ Saving to Cloud...";
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
    if (res.ok) {
      syncStatusEl.textContent = "✅ Synced to Cloud";
    } else {
      syncStatusEl.textContent = "❌ Cloud Error (" + res.status + ")";
    }
  } catch (err) {
    syncStatusEl.textContent = "❌ Network / URL Error";
  }
}

async function pullFromCloud() {
  const url = firebaseUrlInput.value.trim().replace(/\/$/, "");
  const key = syncKeyInput.value.trim();

  if (!url || !key) {
    syncStatusEl.textContent = "⚠️ Enter Firebase URL & Sync Key";
    return;
  }

  try {
    syncStatusEl.textContent = "⏳ Loading from Cloud...";
    const res = await fetch(`${url}/studyPlanner/${encodeURIComponent(key)}.json`);
    const data = await res.json();

    if (data) {
      state.deadlines = Array.isArray(data.deadlines) ? data.deadlines : [];
      state.studyTasks = Array.isArray(data.studyTasks) ? data.studyTasks : [];
      state.habits = Array.isArray(data.habits) ? data.habits : [];
      state.syncConfig = { firebaseUrl: url, syncKey: key };
      saveState(true);
      syncStatusEl.textContent = "✅ Loaded from Cloud!";
    } else {
      syncStatusEl.textContent = "ℹ️ No data found for this key";
    }
  } catch (err) {
    syncStatusEl.textContent = "❌ Failed to load from Cloud";
  }
}

document.getElementById("btn-cloud-push").addEventListener("click", () => pushToCloud(false));
document.getElementById("btn-cloud-pull").addEventListener("click", pullFromCloud);

document.getElementById("btn-copy-json").addEventListener("click", () => {
  navigator.clipboard.writeText(JSON.stringify(state));
  syncStatusEl.textContent = "📋 Sync Code Copied!";
});

document.getElementById("btn-paste-json").addEventListener("click", () => {
  const pasted = prompt("Paste the Sync Code from your other device:");
  if (!pasted) return;
  try {
    const parsed = JSON.parse(pasted);
    state.deadlines = parsed.deadlines || [];
    state.studyTasks = parsed.studyTasks || [];
    state.habits = parsed.habits || [];
    saveState(true);
    syncStatusEl.textContent = "✅ Restored from Sync Code!";
  } catch (e) {
    alert("Invalid Sync Code.");
  }
});

// Export .ics Calendar file for Phone, Tablet & Laptop Calendar Apps
document.getElementById("btn-export-ics").addEventListener("click", () => {
  if (state.deadlines.length === 0 && state.studyTasks.length === 0) {
    alert("Add your deadlines first before exporting to your calendar!");
    return;
  }

  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//StudyPlanner//EN\r\n";
  const cleanDate = (d) => d.replace(/-/g, "");

  state.deadlines.forEach((d) => {
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${d.id}@studyplanner\r\n`;
    ics += `DTSTART;VALUE=DATE:${cleanDate(d.date)}\r\n`;
    ics += `SUMMARY:🎯 DEADLINE: ${d.title}\r\n`;
    ics += "END:VEVENT\r\n";
  });

  state.studyTasks.forEach((t) => {
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${t.id}@studyplanner\r\n`;
    ics += `DTSTART;VALUE=DATE:${cleanDate(t.date)}\r\n`;
    ics += `SUMMARY:📖 STUDY: ${t.title}\r\n`;
    ics += "END:VEVENT\r\n";
  });

  ics += "END:VCALENDAR";

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-2week-study-plan.ics";
  a.click();
});

// ==========================================
// 5. RENDER DASHBOARD
// ==========================================
function renderAll() {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const remainingBlocks = state.studyTasks.filter((t) => !t.done).length;
  document.getElementById("deadline-count").textContent = state.deadlines.length;
  document.getElementById("header-summary").textContent =
    `${state.deadlines.length} Deadlines • ${remainingBlocks} Study Blocks Remaining`;

  // 1. Render Deadlines List
  const dlList = document.getElementById("deadline-list");
  if (state.deadlines.length === 0) {
    dlList.innerHTML = `<li class="helper-text">No deadlines yet. Add your 9 deadlines above!</li>`;
  } else {
    dlList.innerHTML = state.deadlines
      .map((d) => {
        const due = new Date(d.date + "T00:00:00");
        const diffDays = Math.round((due - todayMidnight) / 86400000);
        const countdown =
          diffDays < 0
            ? "Overdue"
            : diffDays === 0
            ? "🔥 Due Today!"
            : `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;

        return `
          <li class="item-row priority-${d.priority}">
            <div>
              <strong>${escapeHTML(d.title)}</strong>
              <div class="item-meta">📅 ${d.date} • ${countdown}</div>
            </div>
            <button type="button" class="btn btn-icon" onclick="deleteDeadline('${d.id}')" title="Delete">✕</button>
          </li>
        `;
      })
      .join("");
  }

  // 2. Render Daily Study Plan
  const planContainer = document.getElementById("study-plan-list");
  const totalTasks = state.studyTasks.length;
  const completedTasks = state.studyTasks.filter((t) => t.done).length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  document.getElementById("plan-progress").textContent = `${pct}% Completed`;

  if (totalTasks === 0) {
    planContainer.innerHTML = `<p class="helper-text">Add your deadlines, then click <strong>⚡ Auto-Build 2-Week Study Plan</strong> to generate your daily schedule.</p>`;
  } else {
    const groupedByDate = {};
    state.studyTasks.forEach((t) => {
      if (!groupedByDate[t.date]) groupedByDate[t.date] = [];
      groupedByDate[t.date].push(t);
    });

    planContainer.innerHTML = Object.keys(groupedByDate)
      .sort()
      .map((dateStr) => {
        const dayTasks = groupedByDate[dateStr];
        const dayDone = dayTasks.filter((t) => t.done).length;
        return `
          <div class="plan-day-group">
            <h4>
              <span>📅 ${dateStr}</span>
              <span>${dayDone}/${dayTasks.length} done</span>
            </h4>
            ${dayTasks
              .map(
                (t) => `
                <label class="task-check">
                  <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleStudyTask('${t.id}')" />
                  <span class="${t.done ? "done-text" : ""}">${escapeHTML(t.title)}</span>
                </label>
              `
              )
              .join("")}
          </div>
        `;
      })
      .join("");
  }

  // 3. Render Habits List
  const todayStr = toISODate(new Date());
  const habitList = document.getElementById("habit-list");
  habitList.innerHTML = state.habits
    .map((h) => {
      const isDoneToday = h.completedDates.includes(todayStr);
      return `
        <li class="item-row">
          <label class="task-check">
            <input type="checkbox" ${isDoneToday ? "checked" : ""} onchange="toggleHabitToday('${h.id}')" />
            <span class="${isDoneToday ? "done-text" : ""}">${escapeHTML(h.title)}</span>
          </label>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <span class="legend-pill pill-study">🔥 ${h.completedDates.length}d</span>
            <button type="button" class="btn btn-icon" onclick="deleteHabit('${h.id}')" title="Delete">✕</button>
          </div>
        </li>
      `;
    })
    .join("");

  renderCalendar();
  renderSelectedDay();
}

// Initial boot + auto-pull if cloud sync is configured
renderAll();
if (state.syncConfig.firebaseUrl && state.syncConfig.syncKey) {
  firebaseUrlInput.value = state.syncConfig.firebaseUrl;
  syncKeyInput.value = state.syncConfig.syncKey;
  pullFromCloud();
}
