/* badges.js — bus badge system */

let badgeState = { profile: null, badges: {}, students: [] };

async function initBadges(profile) {
    badgeState.profile = profile;
    const container = document.getElementById("badgeContent");

    if (profile.viewRole === "student") {
        container.innerHTML = `<div id="studentBadgeCard"></div>`;
        await renderStudentBadge(profile.id, "studentBadgeCard");
    } else if (profile.viewRole === "teacher") {
        container.innerHTML = `
            <div class="panel-card">
                <input id="badgeSearch" type="text" placeholder="Search students…" class="search-input">
                <div id="badgeStudentList" class="badge-list"></div>
            </div>`;
        await loadTeacherBadgeList();
        document.getElementById("badgeSearch").addEventListener("input", (e) => renderTeacherBadgeList(e.target.value));
    }
}

async function renderStudentBadge(studentId, targetId) {
    const { data: badge } = await supabaseClient.from("bus_badges").select("*").eq("student_id", studentId).maybeSingle();
    const active = badge && badge.status === "active";
    const el = document.getElementById(targetId);

    el.innerHTML = `
        <div class="panel-card badge-status-card">
            <div class="badge-icon-large ${active ? "active" : ""}">
                <i class="fa-solid fa-bus"></i>
            </div>
            <h3>${active ? "✓ Bus badge active" : "No bus badge"}</h3>
            <p class="muted-note">${active
                ? `Granted by a teacher on ${new Date(badge.granted_at).toLocaleDateString()}`
                : "Not yet granted. Only a teacher can issue this."}</p>
            ${badge && badge.note ? `<p class="muted-note" style="margin-top:8px;font-style:italic;">"${badge.note}"</p>` : ""}
        </div>`;
}

async function loadTeacherBadgeList() {
    const { data: students } = await supabaseClient.from("class_roster").select("student_id").eq("teacher_id", badgeState.profile.id);
    const studentIds = (students || []).map((s) => s.student_id);

    if (!studentIds.length) {
        document.getElementById("badgeStudentList").innerHTML = `<p class="muted-note">No students in your class</p>`;
        return;
    }

    const { data: profiles } = await supabaseClient.from("profiles").select("*").in("id", studentIds).order("full_name");
    const { data: badges } = await supabaseClient.from("bus_badges").select("*").in("student_id", studentIds);

    badgeState.students = profiles || [];
    badgeState.badges = {};
    (badges || []).forEach((b) => { badgeState.badges[b.student_id] = b; });

    renderTeacherBadgeList("");
}

function renderTeacherBadgeList(filter) {
    const list = document.getElementById("badgeStudentList");
    const q = filter.trim().toLowerCase();
    const rows = badgeState.students.filter((s) => s.full_name.toLowerCase().includes(q));

    list.innerHTML = rows.length ? rows.map((s) => {
        const badge = badgeState.badges[s.id];
        const active = badge && badge.status === "active";
        return `
            <div class="badge-row">
                <div class="badge-row-info">
                    ${avatarHtml(s)}
                    <div>
                        <p class="upcoming-title">${s.full_name}</p>
                    </div>
                </div>
                <div class="badge-status ${active ? "active" : ""}">
                    <i class="fa-solid fa-bus"></i> ${active ? "Active" : "None"}
                </div>
                <button class="btn ${active ? "btn-ghost" : "btn-primary"} btn-sm" onclick="openBadgeModal('${s.id}', ${active})">
                    ${active ? "Revoke" : "Grant"}
                </button>
            </div>`;
    }).join("") : `<p class="muted-note">No matches</p>`;
}

function openBadgeModal(studentId, isActive) {
    const student = badgeState.students.find((s) => s.id === studentId);
    const body = document.getElementById("badgeModalBody");

    body.innerHTML = `
        <p style="margin-bottom:16px;"><strong>${student.full_name}</strong></p>
        <p class="muted-note" style="margin-bottom:16px;">
            ${isActive
                ? "Remove this student's permission to leave early for the bus?"
                : "Grant this student permission to leave early for the bus?"}
        </p>
        <div class="field">
            <label>Note (optional)</label>
            <textarea id="badgeNote" rows="2" placeholder="e.g. Approved by office"></textarea>
        </div>
        <button class="btn ${isActive ? "btn-ghost" : "btn-primary"} btn-block" id="badgeConfirmBtn">
            ${isActive ? "Revoke badge" : "Grant badge"}
        </button>`;

    openModal("badgeModal");
    document.getElementById("badgeConfirmBtn").addEventListener("click", () => confirmBadge(studentId, !isActive));
}

async function confirmBadge(studentId, grant) {
    const note = document.getElementById("badgeNote").value.trim();

    const { error } = await supabaseClient.from("bus_badges").upsert({
        student_id: studentId,
        status: grant ? "active" : "revoked",
        granted_by: badgeState.profile.id,
        granted_at: new Date().toISOString(),
        note,
        updated_at: new Date().toISOString()
    });

    if (error) {
        alert("Error: " + error.message);
        return;
    }

    closeModal("badgeModal");
    await loadTeacherBadgeList();
}