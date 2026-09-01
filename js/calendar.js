/* ============================================================
   calendar.js — month calendar with a zoom-in day view.
   Click a day (grid, week strip, or "Today" button) to see and
   manage everything for that day: excursions/notes, homework
   due, and assessments due, in one place.
============================================================ */

let calState = { profile: null, year: null, month: null, excursions: [], homework: [] };

async function initCalendar(profile) {
    calState.profile = profile;
    const now = new Date();
    calState.year = now.getFullYear();
    calState.month = now.getMonth();

    document.getElementById("calPrevBtn")?.addEventListener("click", () => shiftMonth(-1));
    document.getElementById("calNextBtn")?.addEventListener("click", () => shiftMonth(1));
    document.getElementById("calTodayBtn")?.addEventListener("click", () => openDayModal(todayISO()));

    await loadMonth();
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function shiftMonth(delta) {
    calState.month += delta;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    loadMonth();
}

function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

async function loadMonth() {
    const grid = document.getElementById("calendarGrid");
    if (grid) grid.innerHTML = `<p class="muted-note" style="grid-column:1/-1;padding:30px 0;text-align:center;">Loading…</p>`;

    const { year, month } = calState;
    const first = new Date(year, month, 1).toISOString().slice(0, 10);
    const last = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const { data: excursions } = await supabaseClient.from("excursions").select("*").gte("event_date", first).lte("event_date", last);
    calState.excursions = excursions || [];

    const { data: hw } = await supabaseClient.from("homework").select("*").gte("due_date", first).lte("due_date", last);
    calState.homework = hw || [];

    renderCalendarGrid();
}

function renderCalendarGrid() {
    const { year, month, excursions, homework } = calState;
    const grid = document.getElementById("calendarGrid");
    const label = document.getElementById("calMonthLabel");
    if (label) label.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = todayISO();
    const week = getWeekRange(new Date());

    const eventsByDay = {};
    excursions.forEach((e) => { (eventsByDay[e.event_date] = eventsByDay[e.event_date] || { exc: [], hw: [] }).exc.push(e); });
    homework.forEach((h) => { (eventsByDay[h.due_date] = eventsByDay[h.due_date] || { exc: [], hw: [] }).hw.push(h); });

    let html = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-weekday">${d}</div>`).join("");
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayData = eventsByDay[dateStr] || { exc: [], hw: [] };
        const isToday = dateStr === todayStr;
        const isThisWeek = dateStr >= week.start && dateStr <= week.end;
        const hasAssessment = dayData.hw.some((h) => h.type === "assessment");
        const hasHomework = dayData.hw.some((h) => h.type !== "assessment");

        html += `
            <button class="cal-cell${isToday ? " today" : ""}${isThisWeek ? " this-week" : ""}" data-date="${dateStr}">
                <span class="cal-daynum">${d}</span>
                <span class="cal-dots">
                    ${dayData.exc.length ? `<span class="dot excursion"></span>` : ""}
                    ${hasHomework ? `<span class="dot homework"></span>` : ""}
                    ${hasAssessment ? `<span class="dot assessment"></span>` : ""}
                </span>
            </button>`;
    }

    if (!grid) return;
    grid.innerHTML = html;
    grid.querySelectorAll(".cal-cell:not(.empty)").forEach((cell) => {
        cell.addEventListener("click", () => openDayModal(cell.dataset.date));
    });
}

async function openDayModal(dateStr) {
    const title = document.getElementById("dayModalTitle");
    const body = document.getElementById("dayModalBody");
    const panel = document.querySelector("#dayModal .modal-panel");

    title.textContent = new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    const { data: excursions } = await supabaseClient.from("excursions").select("*").eq("event_date", dateStr).order("start_time");
    const { data: homeworkItems } = await supabaseClient.from("homework").select("*").eq("due_date", dateStr);

    const exc = excursions || [];
    const hw = (homeworkItems || []).filter((h) => h.type !== "assessment");
    const assessments = (homeworkItems || []).filter((h) => h.type === "assessment");
    const canManage = calState.profile.viewRole === "teacher" || calState.profile.viewRole === "principal";

    let html = "";

    if (assessments.length) {
        html += `<p class="section-label">Assessments</p>`;
        html += assessments.map((a) => `
            <div class="day-event">
                <span class="type-badge assessment">Assessment</span>
                <h4>${a.title}</h4>
                ${a.subject ? `<p class="upcoming-meta">${a.subject}</p>` : ""}
                ${a.description ? `<p>${a.description}</p>` : ""}
                ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteDayHomework('${a.id}', '${dateStr}')"><i class="fa-solid fa-trash"></i></button>` : ""}
            </div>`).join("");
    }

    if (hw.length) {
        html += `<p class="section-label">Homework due</p>`;
        html += hw.map((h) => `
            <div class="day-event">
                <span class="type-badge homework">Homework</span>
                <h4>${h.title}</h4>
                ${h.subject ? `<p class="upcoming-meta">${h.subject}</p>` : ""}
                ${h.description ? `<p>${h.description}</p>` : ""}
                ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteDayHomework('${h.id}', '${dateStr}')"><i class="fa-solid fa-trash"></i></button>` : ""}
            </div>`).join("");
    }

    html += `<p class="section-label">Notes &amp; events</p>`;
    html += exc.length
        ? exc.map((e) => `
            <div class="day-event">
                <span class="type-badge event">Event</span>
                <h4>${e.event_name}</h4>
                <p class="upcoming-meta">${e.start_time ? (e.end_time ? `${e.start_time} – ${e.end_time}` : `From ${e.start_time}`) : "All day"}</p>
                ${e.details ? `<p>${e.details}</p>` : ""}
                ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteDayExcursion('${e.id}', '${dateStr}')"><i class="fa-solid fa-trash"></i></button>` : ""}
            </div>`).join("")
        : `<p class="muted-note">Nothing added for this day yet.</p>`;

    if (canManage) {
        html += `<button class="btn btn-ghost btn-block" id="dayAddBtn" style="margin-top:14px;"><i class="fa-solid fa-plus"></i> Add a note or event</button>`;
    }

    body.innerHTML = html;

    // Restart the zoom-in animation every time a day is opened
    if (panel) {
        panel.classList.remove("zoom-in");
        void panel.offsetWidth;
        panel.classList.add("zoom-in");
    }

    openModal("dayModal");

    if (canManage) {
        document.getElementById("dayAddBtn").addEventListener("click", () => openDayAddForm(dateStr));
    }
}

function openDayAddForm(dateStr) {
    const body = document.getElementById("dayModalBody");
    body.innerHTML = `
        <div class="field"><label>Name</label><div class="input-wrap"><i class="fa-solid fa-heading"></i><input id="dayEvTitle" type="text" placeholder="e.g. Museum excursion or a reminder note"></div></div>
        <div class="field"><label>Start time (optional)</label><div class="input-wrap"><i class="fa-solid fa-clock"></i><input id="dayEvStart" type="time"></div></div>
        <div class="field"><label>End time (optional)</label><div class="input-wrap"><i class="fa-solid fa-clock"></i><input id="dayEvEnd" type="time"></div></div>
        <div class="field"><label>Details</label><textarea id="dayEvDetails" rows="3" placeholder="Anything students or parents should know"></textarea></div>
        <div class="form-msg error" id="dayEvMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="dayEvMsgText"></span></div>
        <button class="btn btn-primary btn-block" id="dayEvSaveBtn"><i class="fa-solid fa-check"></i> Add to this day</button>
        <button class="btn btn-ghost btn-block" id="dayEvCancelBtn" style="margin-top:8px;">Cancel</button>
    `;
    document.getElementById("dayEvCancelBtn").addEventListener("click", () => openDayModal(dateStr));
    document.getElementById("dayEvSaveBtn").addEventListener("click", () => saveDayEvent(dateStr));
}

async function saveDayEvent(dateStr) {
    const title = document.getElementById("dayEvTitle").value.trim();
    const start = document.getElementById("dayEvStart").value;
    const end = document.getElementById("dayEvEnd").value;
    const details = document.getElementById("dayEvDetails").value.trim();
    const msg = document.getElementById("dayEvMsg");

    if (!title) {
        document.getElementById("dayEvMsgText").textContent = "Give it a name first.";
        msg.classList.add("show");
        return;
    }

    const { error } = await supabaseClient.from("excursions").insert({
        event_name: title,
        event_date: dateStr,
        start_time: start || null,
        end_time: end || null,
        details: details || null,
        created_by: calState.profile.id
    });

    if (error) {
        document.getElementById("dayEvMsgText").textContent = error.message;
        msg.classList.add("show");
        return;
    }

    await loadMonth();
    await openDayModal(dateStr);
}

async function deleteDayExcursion(id, dateStr) {
    if (!confirm("Remove this?")) return;
    const { error } = await supabaseClient.from("excursions").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await loadMonth();
    await openDayModal(dateStr);
}

async function deleteDayHomework(id, dateStr) {
    if (!confirm("Delete this?")) return;
    const { error } = await supabaseClient.from("homework").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await loadMonth();
    await openDayModal(dateStr);
}