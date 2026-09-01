/* timetable.js — weekly schedule with periods 1-7 */

let ttState = { profile: null, timetable: {}, isEditing: false };

const PERIODS = [
    { num: "TG", time: "08:45 - 08:55", label: "Tutor Group" },
    { num: "A", time: "08:55 - 09:40", label: "Assembly" },
    { num: 2, time: "09:40 - 10:25", label: "Period 2" },
    { num: "B", time: "10:25 - 10:45", label: "Break" },
    { num: 3, time: "10:45 - 11:30", label: "Period 3" },
    { num: 4, time: "11:30 - 12:15", label: "Period 4" },
    { num: "L", time: "12:15 - 13:00", label: "Lunch" },
    { num: 5, time: "13:00 - 13:45", label: "Period 5" },
    { num: 6, time: "13:45 - 14:30", label: "Period 6" },
    { num: 7, time: "14:30 - 15:15", label: "Period 7" }
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

async function initTimetable(profile) {
    ttState.profile = profile;
    document.getElementById("ttEditBtn").addEventListener("click", () => {
        ttState.isEditing = !ttState.isEditing;
        renderTimetable();
    });
    await loadTimetable();
}

async function loadTimetable() {
    const { data } = await supabaseClient.from("timetable").select("*");
    ttState.timetable = {};
    (data || []).forEach((row) => {
        const key = `${row.weekday}-${row.period}`;
        ttState.timetable[key] = row;
    });
    renderTimetable();
}

function renderTimetable() {
    const grid = document.getElementById("timetableGrid");
    let html = `<div class="tt-grid">`;

    // Header
    html += `<div class="tt-cell tt-header"></div>`;
    WEEKDAYS.forEach((day) => {
        html += `<div class="tt-cell tt-header tt-day">${day}</div>`;
    });

    // Periods
    PERIODS.forEach((period) => {
        html += `<div class="tt-cell tt-period">${period.label}<br><span class="period-time">${period.time}</span></div>`;

        WEEKDAYS.forEach((day, dayIdx) => {
            const weekday = dayIdx + 1; // 1-5
            const key = `${weekday}-${period.num}`;
            const row = ttState.timetable[key];
            const subject = row ? row.subject : "—";
            const classroom = row ? row.classroom : "";

            // Non-editable breaks: TG, A, B, L
            if (["TG", "A", "B", "L"].includes(period.num)) {
                html += `<div class="tt-cell tt-break">${subject}</div>`;
            } else if (ttState.isEditing && (ttState.profile.viewRole === "teacher" || ttState.profile.viewRole === "principal")) {
                html += `<button class="tt-cell tt-editable" onclick="openTimetableEdit(${weekday}, '${period.num}')" title="Click to edit">
                    <div class="tt-subject">${subject}</div>
                    ${classroom ? `<div class="tt-classroom">${classroom}</div>` : ""}
                </button>`;
            } else {
                html += `<div class="tt-cell">
                    <div class="tt-subject">${subject}</div>
                    ${classroom ? `<div class="tt-classroom">${classroom}</div>` : ""}
                </div>`;
            }
        });
    });

    html += `</div>`;
    grid.innerHTML = html;

    // Update button text
    document.getElementById("ttEditBtn").innerHTML = ttState.isEditing
        ? `<i class="fa-solid fa-check"></i> Done editing`
        : `<i class="fa-solid fa-edit"></i> Edit timetable`;
}

function openTimetableEdit(weekday, period) {
    period = String(period); // Ensure it's a string for comparison
    const key = `${weekday}-${period}`;
    const row = ttState.timetable[key];
    const dayName = WEEKDAYS[weekday - 1];
    const periodLabel = PERIODS.find((p) => String(p.num) === period);

    const body = document.getElementById("timetableModalBody");
    body.innerHTML = `
        <p style="font-weight:600;margin-bottom:16px;">${dayName} — Period ${period} (${periodLabel.time})</p>
        <div class="field">
            <label>Subject</label>
            <div class="input-wrap"><i class="fa-solid fa-book"></i><input id="ttSubject" type="text" value="${row ? row.subject : ""}" placeholder="e.g. Mathematics"></div>
        </div>
        <div class="field">
            <label>Classroom</label>
            <div class="input-wrap"><i class="fa-solid fa-door-open"></i><input id="ttClassroom" type="text" value="${row ? row.classroom || "" : ""}" placeholder="e.g. Room 101"></div>
        </div>
        <div class="form-msg error" id="ttMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="ttMsgText"></span></div>
        <button class="btn btn-primary btn-block" id="ttSaveBtn"><i class="fa-solid fa-check"></i> Save</button>
        ${row ? `<button class="btn btn-ghost btn-block" id="ttDeleteBtn"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
    `;

    openModal("timetableModal");
    document.getElementById("ttSaveBtn").addEventListener("click", () => saveTimetableEntry(weekday, period, key));
    if (row) {
        document.getElementById("ttDeleteBtn").addEventListener("click", () => deleteTimetableEntry(key));
    }
}

async function saveTimetableEntry(weekday, period, key) {
    const subject = document.getElementById("ttSubject").value.trim();
    const classroom = document.getElementById("ttClassroom").value.trim();
    const msg = document.getElementById("ttMsg");
    const msgText = document.getElementById("ttMsgText");

    if (!subject) {
        msgText.textContent = "Subject is required.";
        msg.classList.add("show");
        return;
    }

    const row = ttState.timetable[key];
    const periodNum = Number(period);
    let error;

    if (row) {
        ({ error } = await supabaseClient
            .from("timetable")
            .update({ subject, classroom, updated_at: new Date().toISOString() })
            .eq("id", row.id));
    } else {
        ({ error } = await supabaseClient
            .from("timetable")
            .insert({ weekday, period: periodNum, subject, classroom, teacher_id: ttState.profile.id }));
    }

    if (error) {
        msgText.textContent = error.message;
        msg.classList.add("show");
        return;
    }

    closeModal("timetableModal");
    await loadTimetable();
}

async function deleteTimetableEntry(key) {
    if (!confirm("Delete this period?")) return;
    const row = ttState.timetable[key];
    const { error } = await supabaseClient.from("timetable").delete().eq("id", row.id);
    if (error) { alert(error.message); return; }
    closeModal("timetableModal");
    await loadTimetable();
}