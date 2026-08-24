/* ============================================================
   calendar.js — month calendar with a day "zoom in" panel
   showing homework, exams, events, and announcements.
============================================================ */

let calState = { year: null, month: null, events: [], profile: null };

function initCalendar(profile) {
    calState.profile = profile;
    const now = new Date();
    calState.year = now.getFullYear();
    calState.month = now.getMonth();

    document.getElementById("calPrev").addEventListener("click", () => shiftMonth(-1));
    document.getElementById("calNext").addEventListener("click", () => shiftMonth(1));

    if (profile.viewRole === "teacher") {
        document.getElementById("calAddBtn").addEventListener("click", () => openEventForm(todayISO()));
    }

    loadMonth();
}

function shiftMonth(delta) {
    calState.month += delta;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    loadMonth();
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

async function loadMonth() {
    const { year, month } = calState;
    const first = new Date(year, month, 1).toISOString().slice(0, 10);
    const last = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const { data, error } = await supabaseClient
        .from("calendar_events")
        .select("*")
        .gte("event_date", first)
        .lte("event_date", last)
        .order("event_date", { ascending: true });

    calState.events = error ? [] : data;
    renderCalendarGrid();
}

function renderCalendarGrid() {
    const { year, month, events } = calState;
    const grid = document.getElementById("calendarGrid");
    const label = document.getElementById("calMonthLabel");
    label.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = todayISO();

    const eventsByDay = {};
    events.forEach((e) => {
        (eventsByDay[e.event_date] = eventsByDay[e.event_date] || []).push(e);
    });

    let html = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        .map((d) => `<div class="cal-weekday">${d}</div>`).join("");

    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayEvents = eventsByDay[dateStr] || [];
        const isToday = dateStr === todayStr;
        html += `
            <button class="cal-cell${isToday ? " today" : ""}" data-date="${dateStr}">
                <span class="cal-daynum">${d}</span>
                <span class="cal-dots">${dayEvents.slice(0, 4).map((e) => `<span class="dot ${e.event_type}"></span>`).join("")}</span>
            </button>`;
    }

    grid.innerHTML = html;
    grid.querySelectorAll(".cal-cell:not(.empty)").forEach((cell) => {
        cell.addEventListener("click", () => openDayModal(cell.dataset.date));
    });
}

function openDayModal(dateStr) {
    const dayEvents = calState.events.filter((e) => e.event_date === dateStr);
    const title = document.getElementById("dayModalTitle");
    const body = document.getElementById("dayModalBody");
    const formWrap = document.getElementById("dayModalForm");

    body.style.display = "block";
    formWrap.style.display = "none";
    formWrap.innerHTML = "";

    title.textContent = new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    body.innerHTML = dayEvents.length
        ? dayEvents.map((e) => `
            <div class="day-event">
                <span class="type-badge ${e.event_type}">${capitalize(e.event_type)}</span>
                <h4>${e.title}</h4>
                ${e.subject ? `<p class="upcoming-meta">${e.subject}</p>` : ""}
                <p>${e.description || ""}</p>
            </div>`).join("")
        : `<p class="muted-note">Nothing scheduled for this day.</p>`;

    if (calState.profile.viewRole === "teacher") {
        body.innerHTML += `
            <button class="btn btn-ghost btn-block" id="dayAddBtn" style="margin-top:14px;">
                <i class="fa-solid fa-plus"></i> Add something for this day
            </button>`;
    }

    openModal("dayModal");

    if (calState.profile.viewRole === "teacher") {
        document.getElementById("dayAddBtn").addEventListener("click", () => openEventForm(dateStr));
    }
}

function openEventForm(dateStr) {
    const body = document.getElementById("dayModalBody");
    const formWrap = document.getElementById("dayModalForm");
    const title = document.getElementById("dayModalTitle");

    title.textContent = "Add to calendar";
    body.style.display = "none";
    formWrap.style.display = "block";

    formWrap.innerHTML = `
        <div class="field">
            <label>Title</label>
            <div class="input-wrap"><i class="fa-solid fa-heading"></i><input id="evTitle" type="text" placeholder="e.g. Chapter 4 worksheet"></div>
        </div>
        <div class="field">
            <label>Type</label>
            <select id="evType" class="select-input">
                <option value="homework">Homework</option>
                <option value="exam">Exam</option>
                <option value="event">Event</option>
                <option value="announcement">Announcement</option>
            </select>
        </div>
        <div class="field">
            <label>Date</label>
            <div class="input-wrap"><i class="fa-solid fa-calendar"></i><input id="evDate" type="date" value="${dateStr}"></div>
        </div>
        <div class="field">
            <label>Subject (optional)</label>
            <div class="input-wrap"><i class="fa-solid fa-book"></i><input id="evSubject" type="text" placeholder="e.g. Mathematics"></div>
        </div>
        <div class="field">
            <label>Class (optional — leave blank to show everyone)</label>
            <div class="input-wrap"><i class="fa-solid fa-users"></i><input id="evClass" type="text" placeholder="e.g. Year 10B"></div>
        </div>
        <div class="field">
            <label>Description</label>
            <textarea id="evDescription" rows="3" placeholder="Details students and parents should see"></textarea>
        </div>
        <div class="form-msg error" id="evMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="evMsgText"></span></div>
        <button class="btn btn-primary btn-block" id="evSaveBtn"><i class="fa-solid fa-check"></i> Post to calendar</button>
    `;

    document.getElementById("evSaveBtn").addEventListener("click", saveNewEvent);
}

async function saveNewEvent() {
    const title = document.getElementById("evTitle").value.trim();
    const type = document.getElementById("evType").value;
    const date = document.getElementById("evDate").value;
    const subject = document.getElementById("evSubject").value.trim();
    const classGroup = document.getElementById("evClass").value.trim();
    const description = document.getElementById("evDescription").value.trim();
    const msg = document.getElementById("evMsg");
    const msgText = document.getElementById("evMsgText");

    if (!title || !date) {
        msgText.textContent = "Add at least a title and date.";
        msg.classList.add("show");
        return;
    }

    const { error } = await supabaseClient.from("calendar_events").insert({
        title,
        event_type: type,
        event_date: date,
        subject: subject || null,
        class_group: classGroup || null,
        description,
        created_by: calState.profile.id
    });

    if (error) {
        msgText.textContent = error.message;
        msg.classList.add("show");
        return;
    }

    closeModal("dayModal");
    await loadMonth();
    await renderHomeOverview(calState.profile);
}