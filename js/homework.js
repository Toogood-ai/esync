\/* ============================================================
   homework.js — assign homework/assessments, track completion,
   and surface overdue / due-tomorrow status clearly.
============================================================ */

let hwState = { profile: null, homework: [], students: [], completionMap: {} };

async function initHomework(profile) {
    hwState.profile = profile;
    const btn = document.getElementById("hwNewBtn");
    if (btn) {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openHomeworkForm();
        });
    }
    await loadHomework();
}

async function loadHomework() {
    if (hwState.profile.viewRole === "student") {
        const { data: hwLinks } = await supabaseClient.from("homework_students").select("*").eq("student_id", hwState.profile.id);
        const links = hwLinks || [];
        hwState.completionMap = {};
        links.forEach((l) => { hwState.completionMap[l.homework_id] = l; });

        const hwIds = links.map((l) => l.homework_id);
        hwState.homework = hwIds.length
            ? (await supabaseClient.from("homework").select("*").in("id", hwIds).order("due_date")).data || []
            : [];
    } else if (hwState.profile.viewRole === "teacher") {
        const { data: hwData } = await supabaseClient.from("homework").select("*").eq("assigned_by", hwState.profile.id).order("due_date");
        hwState.homework = hwData || [];

        const { data: studentData } = await supabaseClient.from("class_roster").select("student_id").eq("teacher_id", hwState.profile.id);
        hwState.students = (studentData || []).map((s) => s.student_id);
    } else if (hwState.profile.viewRole === "principal") {
        // Principal sees everything assigned school-wide, for oversight
        const { data: hwData } = await supabaseClient.from("homework").select("*").order("due_date");
        hwState.homework = hwData || [];
    } else {
        // Parent: homework for their linked children
        const { data: links } = await supabaseClient.from("parent_links").select("student_id").eq("parent_id", hwState.profile.id);
        const studentIds = (links || []).map((l) => l.student_id);

        if (studentIds.length) {
            const { data: hwLinks } = await supabaseClient.from("homework_students").select("*").in("student_id", studentIds);
            const hwIds = [...new Set((hwLinks || []).map((l) => l.homework_id))];
            hwState.homework = hwIds.length
                ? (await supabaseClient.from("homework").select("*").in("id", hwIds).order("due_date")).data || []
                : [];
        } else {
            hwState.homework = [];
        }
    }

    renderHomework();
}

function dueStatusBadge(h, completionMap) {
    const status = homeworkStatus(h, completionMap || {});
    if (status === "overdue") return `<span class="hw-alert-badge overdue"><i class="fa-solid fa-triangle-exclamation"></i> Unfinished homework</span>`;
    if (status === "due-tomorrow") return `<span class="hw-alert-badge due-soon"><i class="fa-solid fa-clock"></i> Due tomorrow</span>`;
    if (status === "complete") return `<span class="hw-alert-badge complete"><i class="fa-solid fa-circle-check"></i> Completed</span>`;
    return "";
}

function renderHomework() {
    const list = document.getElementById("homeworkList");
    const role = hwState.profile.viewRole;

    if (role === "teacher" || role === "principal") {
        const rosterWarning = role === "teacher" && hwState.students.length === 0
            ? `<div class="form-msg error show" style="margin-bottom:16px;"><i class="fa-solid fa-circle-exclamation"></i><span>Your class roster is empty — go to <strong>My class</strong> to add students, or what you assign won't reach anyone.</span></div>`
            : "";

        list.innerHTML = rosterWarning + (hwState.homework.length
            ? hwState.homework.map((h) => `
                <div class="hw-card">
                    <div class="hw-card-head">
                        <span class="type-badge ${h.type === "assessment" ? "assessment" : "homework"}">${h.type === "assessment" ? "Assessment" : "Homework"}</span>
                        <h4>${h.title}</h4>
                    </div>
                    <p class="hw-meta">Due: ${formatDate(h.due_date)} ${h.due_time ? `at ${h.due_time}` : ""}</p>
                    <p class="hw-meta">Subject: ${h.subject || "—"}</p>
                    ${h.description ? `<p class="hw-desc">${h.description}</p>` : ""}
                    ${h.file_url ? `<a href="${h.file_url}" target="_blank" class="btn btn-ghost btn-sm"><i class="fa-solid fa-link"></i> View file</a>` : ""}
                    <button class="btn btn-ghost btn-sm" onclick="deleteHomework('${h.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>`)
                .join("")
            : `<p class="muted-note">Nothing assigned yet.</p>`);
    } else {
        // Student or parent view
        list.innerHTML = hwState.homework.length
            ? hwState.homework.map((h) => {
                const completion = hwState.completionMap[h.id];
                const isComplete = completion && completion.is_complete;
                const checkbox = role === "student" && completion
                    ? `<label class="hw-checkbox">
                           <input type="checkbox" ${isComplete ? "checked" : ""} onchange="toggleHomeworkComplete('${h.id}', this.checked)">
                           <span>Mark as done</span>
                       </label>`
                    : "";

                return `
                <div class="hw-card ${isComplete ? "hw-complete" : ""}">
                    <div class="hw-card-head">
                        <span class="type-badge ${h.type === "assessment" ? "assessment" : "homework"}">${h.type === "assessment" ? "Assessment" : "Homework"}</span>
                        <h4>${h.title}</h4>
                    </div>
                    <p class="hw-meta">Due: ${formatDate(h.due_date)} ${h.due_time ? `at ${h.due_time}` : ""}</p>
                    <p class="hw-meta">Subject: ${h.subject || "—"}</p>
                    ${h.description ? `<p class="hw-desc">${h.description}</p>` : ""}
                    ${h.file_url ? `<a href="${h.file_url}" target="_blank" class="btn btn-ghost btn-sm"><i class="fa-solid fa-link"></i> View file</a>` : ""}
                    ${dueStatusBadge(h, hwState.completionMap)}
                    ${checkbox}
                </div>`;
            }).join("")
            : `<p class="muted-note">No homework${role === "parent" ? " for your linked children" : ""} right now.</p>`;
    }
}

async function toggleHomeworkComplete(homeworkId, checked) {
    const completion = hwState.completionMap[homeworkId];
    if (!completion) return;
    const { error } = await supabaseClient.from("homework_students").update({ is_complete: checked }).eq("id", completion.id);
    if (error) { alert(error.message); return; }
    completion.is_complete = checked;
    renderHomework();
}

function openHomeworkForm() {
    const body = document.getElementById("homeworkModalBody");
    body.innerHTML = `
        <div class="field">
            <label>Type</label>
            <select id="hwType" class="select-input">
                <option value="homework">Homework</option>
                <option value="assessment">Assessment (test/exam)</option>
            </select>
        </div>
        <div class="field">
            <label>Title</label>
            <div class="input-wrap"><i class="fa-solid fa-heading"></i><input id="hwTitle" type="text" placeholder="e.g. Chapter 4 questions"></div>
        </div>
        <div class="field">
            <label>Subject</label>
            <div class="input-wrap"><i class="fa-solid fa-book"></i><input id="hwSubject" type="text" placeholder="e.g. Mathematics"></div>
        </div>
        <div class="field">
            <label>Description</label>
            <textarea id="hwDescription" rows="3" placeholder="Details for students"></textarea>
        </div>
        <div class="field">
            <label>Due date <span style="color:var(--danger);">*</span></label>
            <div class="input-wrap"><i class="fa-solid fa-calendar"></i><input id="hwDueDate" type="date" required></div>
        </div>
        <div class="field">
            <label>Due time (optional)</label>
            <div class="input-wrap"><i class="fa-solid fa-clock"></i><input id="hwDueTime" type="time"></div>
        </div>
        <div class="field">
            <label>File URL (optional)</label>
            <div class="input-wrap"><i class="fa-solid fa-link"></i><input id="hwFileUrl" type="text" placeholder="https://…"></div>
        </div>
        <div class="form-msg error" id="hwMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="hwMsgText"></span></div>
        <button class="btn btn-primary btn-block" id="hwSaveBtn"><i class="fa-solid fa-check"></i> Assign</button>
    `;
    openModal("homeworkModal");
    document.getElementById("hwSaveBtn").addEventListener("click", saveHomework);
}

async function saveHomework() {
    const type = document.getElementById("hwType").value;
    const title = document.getElementById("hwTitle").value.trim();
    const subject = document.getElementById("hwSubject").value.trim();
    const description = document.getElementById("hwDescription").value.trim();
    const dueDate = document.getElementById("hwDueDate").value;
    const dueTime = document.getElementById("hwDueTime").value;
    const fileUrl = document.getElementById("hwFileUrl").value.trim();
    const msg = document.getElementById("hwMsg");

    if (!title || !dueDate) {
        document.getElementById("hwMsgText").textContent = "Title and a due date are required.";
        msg.classList.add("show");
        return;
    }

    const { data: hw, error } = await supabaseClient.from("homework").insert({
        title,
        type,
        subject: subject || null,
        description: description || null,
        due_date: dueDate,
        due_time: dueTime || null,
        file_url: fileUrl || null,
        assigned_by: hwState.profile.id
    }).select();

    if (error) {
        document.getElementById("hwMsgText").textContent = error.message;
        msg.classList.add("show");
        return;
    }

    // Assign to every student currently in the teacher's class. Fetched
    // fresh here rather than relying on hwState.students, which is only
    // populated once at page load and would otherwise miss anyone added
    // to the roster later in the same session.
    if (hw && hw[0] && hwState.profile.viewRole === "teacher") {
        const hwId = hw[0].id;
        const { data: currentRoster, error: rosterError } = await supabaseClient
            .from("class_roster")
            .select("student_id")
            .eq("teacher_id", hwState.profile.id);

        if (rosterError) {
            alert(`Homework was created, but couldn't check your class roster: ${rosterError.message}`);
        } else if (currentRoster && currentRoster.length) {
            const inserts = currentRoster.map((r) => ({ homework_id: hwId, student_id: r.student_id }));
            const { error: assignError } = await supabaseClient.from("homework_students").insert(inserts);
            if (assignError) {
                msg.classList.remove("show");
                alert(`Homework was created, but assigning it to your class failed: ${assignError.message}`);
            }
        }
    }

    closeModal("homeworkModal");
    await loadHomework();
}

async function deleteHomework(id) {
    if (!confirm("Delete this?")) return;
    const { error } = await supabaseClient.from("homework").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await loadHomework();
}