/* roster.js — class roster & parent-student linking (teacher only) */

let rosterState = { profile: null, allStudents: [], allParents: [], roster: [], links: [], badges: {} };

async function initRoster(profile) {
    if (profile.viewRole !== "teacher" && profile.viewRole !== "principal") return;
    rosterState.profile = profile;

    document.getElementById("rosterSearch").addEventListener("input", (e) => renderAvailableStudents(e.target.value));
    document.getElementById("addLinkBtn").addEventListener("click", addParentLink);

    await loadRosterData();
}

async function loadRosterData() {
    const { data: allProfiles } = await supabaseClient.from("profiles").select("*").order("full_name");
    rosterState.allStudents = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "student");
    rosterState.allParents = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "parent");

    const { data: roster } = await supabaseClient.from("class_roster").select("*").eq("teacher_id", rosterState.profile.id);
    rosterState.roster = roster || [];

    const rosterStudentIds = rosterState.roster.map((r) => r.student_id);
    if (rosterStudentIds.length) {
        const { data: badges } = await supabaseClient.from("bus_badges").select("*").in("student_id", rosterStudentIds);
        rosterState.badges = {};
        (badges || []).forEach((b) => { rosterState.badges[b.student_id] = b; });
    } else {
        rosterState.badges = {};
    }

    const { data: links } = await supabaseClient.from("parent_links").select("*");
    rosterState.links = links || [];

    renderRoster();
    renderAvailableStudents("");
    renderParentLinkOptions();
    renderParentLinks();
}

function isInRoster(studentId) {
    return rosterState.roster.some((r) => r.student_id === studentId);
}

function renderRoster() {
    const el = document.getElementById("currentRoster");
    const rosterStudents = rosterState.allStudents.filter((s) => isInRoster(s.id));

    el.innerHTML = rosterStudents.length
        ? rosterStudents.map((s) => {
            const badge = rosterState.badges[s.id];
            const active = badge && badge.status === "active";
            return `
            <div class="badge-row">
                <div class="badge-row-info">${avatarHtml(s)}<div><p class="upcoming-title">${s.full_name}</p></div></div>
                <button class="bus-badge-icon${active ? " active" : ""}" onclick="openBadgeQuickManage('${s.id}', '${s.full_name.replace(/'/g, "\\'")}', loadRosterData)" title="${active ? "Bus badge active — click to manage" : "No bus badge — click to grant"}">
                    <i class="fa-solid fa-bus"></i>
                </button>
                <button class="btn btn-ghost btn-sm" onclick="removeFromRoster('${s.id}')"><i class="fa-solid fa-xmark"></i></button>
            </div>`;
        }).join("")
        : `<p class="muted-note">No students in your class yet — add some from the list on the left.</p>`;
}

function renderAvailableStudents(filter) {
    const el = document.getElementById("availableStudents");
    const q = filter.trim().toLowerCase();
    const available = rosterState.allStudents.filter((s) => !isInRoster(s.id) && s.full_name.toLowerCase().includes(q));

    el.innerHTML = available.length
        ? available.map((s) => `
            <div class="badge-row">
                <div class="badge-row-info">${avatarHtml(s)}<div><p class="upcoming-title">${s.full_name}</p></div></div>
                <button class="btn btn-primary btn-sm" onclick="addToRoster('${s.id}')"><i class="fa-solid fa-plus"></i> Add</button>
            </div>`).join("")
        : `<p class="muted-note">${rosterState.allStudents.length ? "All students are already in your class." : "No student accounts exist yet — they need a profiles row with a student-type role first."}</p>`;
}

async function addToRoster(studentId) {
    const { error } = await supabaseClient.from("class_roster").insert({ teacher_id: rosterState.profile.id, student_id: studentId });
    if (error) { alert(error.message); return; }
    await loadRosterData();
}

async function removeFromRoster(studentId) {
    const row = rosterState.roster.find((r) => r.student_id === studentId);
    if (!row) return;
    if (!confirm("Remove this student from your class? Their existing homework history stays intact.")) return;
    const { error } = await supabaseClient.from("class_roster").delete().eq("id", row.id);
    if (error) { alert(error.message); return; }
    await loadRosterData();
}

function renderParentLinkOptions() {
    document.getElementById("linkParentSelect").innerHTML = rosterState.allParents.length
        ? rosterState.allParents.map((p) => `<option value="${p.id}">${p.full_name}</option>`).join("")
        : `<option value="">No parent accounts exist yet</option>`;

    document.getElementById("linkStudentSelect").innerHTML = rosterState.allStudents.length
        ? rosterState.allStudents.map((s) => `<option value="${s.id}">${s.full_name}</option>`).join("")
        : `<option value="">No student accounts exist yet</option>`;
}

function renderParentLinks() {
    const el = document.getElementById("parentLinksList");

    el.innerHTML = rosterState.links.length
        ? rosterState.links.map((l) => {
            const parent = rosterState.allParents.find((p) => p.id === l.parent_id) || { full_name: "Unknown parent" };
            const student = rosterState.allStudents.find((s) => s.id === l.student_id) || { full_name: "Unknown student" };
            return `
                <div class="badge-row">
                    <div class="badge-row-info"><div><p class="upcoming-title">${parent.full_name} <i class="fa-solid fa-arrow-right" style="color:var(--muted);font-size:.7rem;"></i> ${student.full_name}</p></div></div>
                    <button class="btn btn-ghost btn-sm" onclick="removeParentLink('${l.id}')"><i class="fa-solid fa-xmark"></i> Unlink</button>
                </div>`;
        }).join("")
        : `<p class="muted-note">No parent links yet.</p>`;
}

async function addParentLink() {
    const parentId = document.getElementById("linkParentSelect").value;
    const studentId = document.getElementById("linkStudentSelect").value;
    if (!parentId || !studentId) return;

    const { error } = await supabaseClient.from("parent_links").insert({ parent_id: parentId, student_id: studentId });
    if (error) { alert(error.message); return; }
    await loadRosterData();
}

async function removeParentLink(linkId) {
    if (!confirm("Remove this parent link?")) return;
    const { error } = await supabaseClient.from("parent_links").delete().eq("id", linkId);
    if (error) { alert(error.message); return; }
    await loadRosterData();
}