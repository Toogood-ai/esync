/* ============================================================
   badges.js — bus badge tab. Only a teacher can grant or
   revoke a badge; students and parents get a read-only view.
============================================================ */

let badgeState = { profile: null, students: [], badges: {} };

async function initBadges(profile) {
    badgeState.profile = profile;
    const container = document.getElementById("badgeContent");

    if (profile.viewRole === "student") {
        container.innerHTML = `<div id="studentBadgeCard"></div>`;
        await renderStudentBadge(profile.id, "studentBadgeCard");
    } else if (profile.viewRole === "teacher") {
        container.innerHTML = `
            <div class="panel-card">
                <div class="input-wrap" style="max-width:320px;margin-bottom:18px;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="badgeSearch" type="text" placeholder="Search students…">
                </div>
                <div id="badgeStudentList" class="badge-list"></div>
            </div>`;
        await loadTeacherBadgeList();
        document.getElementById("badgeSearch").addEventListener("input", (e) => renderTeacherBadgeList(e.target.value));
    } else if (profile.viewRole === "parent") {
        container.innerHTML = `<div id="parentBadgeList" class="badge-list"></div>`;
        await renderParentBadges(profile.id);
    }
}

async function renderStudentBadge(studentId, targetId) {
    const { data: badge } = await supabaseClient.from("bus_badges").select("*").eq("student_id", studentId).maybeSingle();
    const active = badge && badge.status === "active";
    const el = document.getElementById(targetId);
    el.innerHTML = `
        <div class="panel-card badge-status-card">
            <i class="fa-solid fa-bus badge-icon ${active ? "active" : ""}"></i>
            <h3>${active ? "Bus badge active" : "No bus badge issued"}</h3>
            <p class="muted-note">${active
                ? `Granted by a teacher on ${new Date(badge.granted_at).toLocaleDateString()}. Clear to leave early for the bus.`
                : "No permission to leave early for the bus yet. Only a teacher can grant this."}</p>
            ${badge && badge.note ? `<p class="muted-note" style="margin-top:8px;">Note: ${badge.note}</p>` : ""}
        </div>`;
}

async function loadTeacherBadgeList() {
    const { data: allProfiles } = await supabaseClient.from("profiles").select("*").order("full_name");
    const { data: badges } = await supabaseClient.from("bus_badges").select("*");

    badgeState.students = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "student");
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
                        <p class="upcoming-meta">${s.role || ""}</p>
                    </div>
                </div>
                <span class="status-pill ${active ? "active" : "inactive"}">${active ? "Active" : "None"}</span>
                <button class="btn ${active ? "btn-ghost" : "btn-primary"} btn-sm" data-student="${s.id}" data-action="${active ? "revoke" : "grant"}">
                    ${active ? "Revoke" : "Grant"}
                </button>
            </div>`;
    }).join("") : `<p class="muted-note">No students found.</p>`;

    list.querySelectorAll("button[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => confirmBadgeAction(btn.dataset.student, btn.dataset.action));
    });
}

function confirmBadgeAction(studentId, action) {
    const student = badgeState.students.find((s) => s.id === studentId);
    document.getElementById("confirmTitle").textContent = action === "grant" ? "Grant bus badge" : "Revoke bus badge";
    document.getElementById("confirmBody").innerHTML = `
        <p class="muted-note" style="margin-bottom:16px;">
            ${action === "grant"
                ? `Give ${student.full_name} permission to leave early for the bus.`
                : `Remove ${student.full_name}'s permission to leave early.`}
        </p>
        <div class="field"><label>Note (optional)</label><textarea id="badgeNote" rows="2" placeholder="e.g. Approved by front office"></textarea></div>
        <button class="btn ${action === "grant" ? "btn-primary" : "btn-ghost"} btn-block" id="badgeConfirmBtn">
            ${action === "grant" ? "Confirm grant" : "Confirm revoke"}
        </button>`;
    openModal("confirmModal");

    document.getElementById("badgeConfirmBtn").addEventListener("click", async () => {
        const note = document.getElementById("badgeNote").value.trim();
        await supabaseClient.from("bus_badges").upsert({
            student_id: studentId,
            status: action === "grant" ? "active" : "revoked",
            granted_by: badgeState.profile.id,
            granted_at: new Date().toISOString(),
            note,
            updated_at: new Date().toISOString()
        });
        closeModal("confirmModal");
        await loadTeacherBadgeList();
    });
}

async function renderParentBadges(parentId) {
    const { data: links } = await supabaseClient.from("parent_links").select("student_id").eq("parent_id", parentId);
    const list = document.getElementById("parentBadgeList");

    if (!links || links.length === 0) {
        list.innerHTML = `<p class="muted-note">No children linked to your account yet.</p>`;
        return;
    }

    const studentIds = links.map((l) => l.student_id);
    const { data: students } = await supabaseClient.from("profiles").select("*").in("id", studentIds);

    list.innerHTML = (students || []).map((s) => `
        <div class="panel-card">
            <p class="upcoming-title" style="margin-bottom:10px;">
                <i class="fa-solid fa-child-reaching"></i> ${s.full_name}
            </p>
            <div id="parentBadge-${s.id}"></div>
        </div>`).join("");

    for (const s of (students || [])) {
        await renderStudentBadge(s.id, `parentBadge-${s.id}`);
    }
}