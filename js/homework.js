/* homework.js — homework assignment and tracking */

let hwState = { profile: null, homework: [], students: [] };

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
    const { data: hwData } = await supabaseClient.from("homework").select("*").order("due_date");
    hwState.homework = hwData || [];

    if (hwState.profile.viewRole === "teacher") {
        const { data: studentData } = await supabaseClient.from("class_roster").select("student_id").eq("teacher_id", hwState.profile.id);
        hwState.students = (studentData || []).map((s) => s.student_id);
    }

    renderHomework();
}

function renderHomework() {
    const list = document.getElementById("homeworkList");

    if (hwState.profile.viewRole === "teacher") {
        list.innerHTML = hwState.homework.length
            ? hwState.homework.map((h) => `
                <div class="hw-card">
                    <h4>${h.title}</h4>
                    <p class="hw-meta">Due: ${formatDate(h.due_date)} ${h.due_time ? `at ${h.due_time}` : ""}</p>
                    <p class="hw-meta">Subject: ${h.subject || "—"}</p>
                    ${h.description ? `<p class="hw-desc">${h.description}</p>` : ""}
                    <button class="btn btn-ghost btn-sm" onclick="editHomework('${h.id}')"><i class="fa-solid fa-edit"></i> Edit</button>
                    <button class="btn btn-ghost btn-sm" onclick="deleteHomework('${h.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>`)
                .join("")
            : `<p class="muted-note">No homework assigned</p>`;
    } else {
        // Student view
        list.innerHTML = hwState.homework.length
            ? hwState.homework.map((h) => `
                <div class="hw-card">
                    <h4>${h.title}</h4>
                    <p class="hw-meta">Due: ${formatDate(h.due_date)} ${h.due_time ? `at ${h.due_time}` : ""}</p>
                    <p class="hw-meta">Subject: ${h.subject || "—"}</p>
                    ${h.description ? `<p class="hw-desc">${h.description}</p>` : ""}
                    ${h.file_url ? `<a href="${h.file_url}" target="_blank" class="btn btn-ghost btn-sm"><i class="fa-solid fa-download"></i> Download</a>` : ""}
                </div>`)
                .join("")
            : `<p class="muted-note">No homework</p>`;
    }
}

function openHomeworkForm() {
    const body = document.getElementById("homeworkModalBody");
    body.innerHTML = `
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
            <label>Due date</label>
            <div class="input-wrap"><i class="fa-solid fa-calendar"></i><input id="hwDueDate" type="date"></div>
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
        <button class="btn btn-primary btn-block" id="hwSaveBtn"><i class="fa-solid fa-check"></i> Assign homework</button>
    `;
    openModal("homeworkModal");
    document.getElementById("hwSaveBtn").addEventListener("click", saveHomework);
}

async function saveHomework() {
    const title = document.getElementById("hwTitle").value.trim();
    const subject = document.getElementById("hwSubject").value.trim();
    const description = document.getElementById("hwDescription").value.trim();
    const dueDate = document.getElementById("hwDueDate").value;
    const dueTime = document.getElementById("hwDueTime").value;
    const fileUrl = document.getElementById("hwFileUrl").value.trim();
    const msg = document.getElementById("hwMsg");

    if (!title || !dueDate) {
        document.getElementById("hwMsgText").textContent = "Title and due date required";
        msg.classList.add("show");
        return;
    }

    const { data: hw, error } = await supabaseClient.from("homework").insert({
        title,
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

    // Assign to all students in teacher's class
    if (hw && hw[0] && hwState.students.length) {
        const hwId = hw[0].id;
        const inserts = hwState.students.map((sid) => ({ homework_id: hwId, student_id: sid }));
        await supabaseClient.from("homework_students").insert(inserts);
    }

    closeModal("homeworkModal");
    await loadHomework();
}

async function deleteHomework(id) {
    if (!confirm("Delete this homework?")) return;
    await supabaseClient.from("homework").delete().eq("id", id);
    await loadHomework();
}

function editHomework(id) {
    // TODO: implement edit form
}