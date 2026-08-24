/* calendar.js — excursions/events */

let calState = { profile: null, excursions: [] };

async function initCalendar(profile) {
    calState.profile = profile;
    document.getElementById("calAddBtn").addEventListener("click", openExcursionForm);
    await loadExcursions();
}

async function loadExcursions() {
    const { data } = await supabaseClient.from("excursions").select("*").order("event_date");
    calState.excursions = data || [];
    renderExcursions();
}

function renderExcursions() {
    const list = document.getElementById("excursionsList");
    if (!list) return;
    
    if (calState.excursions.length === 0) {
        list.innerHTML = `<p class="muted-note">No excursions scheduled</p>`;
        return;
    }

    list.innerHTML = calState.excursions.map((e) => {
        const timeStr = e.start_time && e.end_time 
            ? `${e.start_time} - ${e.end_time}`
            : e.start_time 
            ? `From ${e.start_time}`
            : "All day";
        
        return `
            <div class="excursion-card">
                <div class="excursion-head">
                    <h4>${e.event_name}</h4>
                    <span class="excursion-date">${formatDate(e.event_date)}</span>
                </div>
                <p class="excursion-time"><i class="fa-solid fa-clock"></i> ${timeStr}</p>
                ${e.details ? `<p class="excursion-details">${e.details}</p>` : ""}
                ${calState.profile.viewRole === "teacher" ? `
                    <button class="btn btn-ghost btn-sm" onclick="deleteExcursion('${e.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
                ` : ""}
            </div>`;
    }).join("");
}

function openExcursionForm() {
    const body = document.getElementById("excursionModalBody");
    body.innerHTML = `
        <div class="field">
            <label>Event name</label>
            <div class="input-wrap"><i class="fa-solid fa-heading"></i><input id="excTitle" type="text" placeholder="e.g. Year 10 trip to museum"></div>
        </div>
        <div class="field">
            <label>Date</label>
            <div class="input-wrap"><i class="fa-solid fa-calendar"></i><input id="excDate" type="date"></div>
        </div>
        <div class="field">
            <label>Start time (optional)</label>
            <div class="input-wrap"><i class="fa-solid fa-clock"></i><input id="excStartTime" type="time"></div>
        </div>
        <div class="field">
            <label>End time (optional)</label>
            <div class="input-wrap"><i class="fa-solid fa-clock"></i><input id="excEndTime" type="time"></div>
        </div>
        <div class="field">
            <label>Details (optional)</label>
            <textarea id="excDetails" rows="3" placeholder="Meeting point, what to bring, etc."></textarea>
        </div>
        <div class="form-msg error" id="excMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="excMsgText"></span></div>
        <button class="btn btn-primary btn-block" id="excSaveBtn"><i class="fa-solid fa-check"></i> Add excursion</button>
    `;
    openModal("excursionModal");
    document.getElementById("excSaveBtn").addEventListener("click", saveExcursion);
}

async function saveExcursion() {
    const title = document.getElementById("excTitle").value.trim();
    const date = document.getElementById("excDate").value;
    const startTime = document.getElementById("excStartTime").value;
    const endTime = document.getElementById("excEndTime").value;
    const details = document.getElementById("excDetails").value.trim();
    const msg = document.getElementById("excMsg");

    if (!title || !date) {
        document.getElementById("excMsgText").textContent = "Event name and date required";
        msg.classList.add("show");
        return;
    }

    const { error } = await supabaseClient.from("excursions").insert({
        event_name: title,
        event_date: date,
        start_time: startTime || null,
        end_time: endTime || null,
        details: details || null,
        created_by: calState.profile.id
    });

    if (error) {
        document.getElementById("excMsgText").textContent = error.message;
        msg.classList.add("show");
        return;
    }

    closeModal("excursionModal");
    await loadExcursions();
}

async function deleteExcursion(id) {
    if (!confirm("Delete this excursion?")) return;
    await supabaseClient.from("excursions").delete().eq("id", id);
    await loadExcursions();
}

function editExcursion(id) {
    // TODO: implement edit form
}