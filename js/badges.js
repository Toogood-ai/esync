/* ============================================================
   badges.js — bus badge logic, shared everywhere it's needed.
   No standalone tab anymore: students see a small icon next to
   their name in the sidebar, teachers manage badges from their
   class roster, and principals get a searchable list of every
   student from the home dashboard.
============================================================ */

async function getBadgeStatus(studentId) {
    const { data } = await supabaseClient.from("bus_badges").select("*").eq("student_id", studentId).maybeSingle();
    return data;
}

async function setBadgeStatus(studentId, grant, grantedBy, note) {
    return await supabaseClient.from("bus_badges").upsert({
        student_id: studentId,
        status: grant ? "active" : "revoked",
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
        note: note || "",
        updated_at: new Date().toISOString()
    });
}

function busBadgeIconHtml(badge) {
    const active = badge && badge.status === "active";
    return `<span class="bus-badge-icon${active ? " active" : ""}" title="${active ? "Bus badge active" : "No bus badge"}">
        <i class="fa-solid fa-bus"></i>
    </span>`;
}

/* Opens the shared quick-manage modal. onSuccess is called after a
   successful grant/revoke so the caller can refresh its own list. */
async function openBadgeQuickManage(studentId, studentName, onSuccess) {
    const badge = await getBadgeStatus(studentId);
    const active = badge && badge.status === "active";
    const body = document.getElementById("badgeModalBody");

    body.innerHTML = `
        <p style="margin-bottom:16px;"><strong>${studentName}</strong></p>
        <p class="muted-note" style="margin-bottom:16px;">
            ${active ? "Remove this student's permission to leave early for the bus?" : "Grant this student permission to leave early for the bus?"}
        </p>
        <div class="field"><label>Note (optional)</label><textarea id="badgeNote" rows="2" placeholder="e.g. Approved by office"></textarea></div>
        <button class="btn ${active ? "btn-ghost" : "btn-primary"} btn-block" id="badgeConfirmBtn">
            ${active ? "Revoke badge" : "Grant badge"}
        </button>`;

    openModal("badgeModal");

    document.getElementById("badgeConfirmBtn").addEventListener("click", async () => {
        const note = document.getElementById("badgeNote").value.trim();
        const { error } = await setBadgeStatus(studentId, !active, currentProfile.id, note);
        if (error) { alert(error.message); return; }
        closeModal("badgeModal");
        if (onSuccess) await onSuccess();
    });
}

/* ---- Principal: manage any student's badge, not just a roster ---- */
let principalBadgeState = { students: [], badges: {} };

async function initPrincipalBadges(profile) {
    if (profile.viewRole !== "principal") return;

    const { data: allProfiles } = await supabaseClient.from("profiles").select("*").order("full_name");
    principalBadgeState.students = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "student");

    await refreshPrincipalBadges();

    const search = document.getElementById("principalBadgeSearch");
    if (search) search.addEventListener("input", (e) => renderPrincipalBadgeList(e.target.value));
}

async function refreshPrincipalBadges() {
    const ids = principalBadgeState.students.map((s) => s.id);
    if (ids.length) {
        const { data: badges } = await supabaseClient.from("bus_badges").select("*").in("student_id", ids);
        principalBadgeState.badges = {};
        (badges || []).forEach((b) => { principalBadgeState.badges[b.student_id] = b; });
    }
    renderPrincipalBadgeList(document.getElementById("principalBadgeSearch")?.value || "");
}

function renderPrincipalBadgeList(filter) {
    const el = document.getElementById("principalBadgeList");
    if (!el) return;

    const q = filter.trim().toLowerCase();
    const rows = principalBadgeState.students.filter((s) => s.full_name.toLowerCase().includes(q));

    el.innerHTML = rows.length ? rows.map((s) => {
        const badge = principalBadgeState.badges[s.id];
        const active = badge && badge.status === "active";
        return `
            <div class="badge-row">
                <div class="badge-row-info">${avatarHtml(s)}<div><p class="upcoming-title">${s.full_name}</p></div></div>
                <button class="bus-badge-icon${active ? " active" : ""}" onclick="openBadgeQuickManage('${s.id}', '${s.full_name.replace(/'/g, "\\'")}', refreshPrincipalBadges)" title="${active ? "Active — click to manage" : "No badge — click to grant"}">
                    <i class="fa-solid fa-bus"></i>
                </button>
            </div>`;
    }).join("") : `<p class="muted-note">${principalBadgeState.students.length ? "No matches." : "No student accounts exist yet."}</p>`;
}