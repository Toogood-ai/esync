/* ============================================================
   messages.js — direct messaging for parent/teacher/student
   communication. Teachers can message any parent or student;
   parents and students can message any teacher.
============================================================ */

let msgState = { profile: null, all: [], people: {} };

async function initMessages(profile) {
    msgState.profile = profile;
    await loadMessages();
    document.getElementById("newMessageBtn").addEventListener("click", openNewMessageModal);
}

async function loadMessages() {
    const { data } = await supabaseClient
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${msgState.profile.id},recipient_id.eq.${msgState.profile.id}`)
        .order("created_at", { ascending: false });

    msgState.all = data || [];

    const ids = [...new Set(msgState.all.flatMap((m) => [m.sender_id, m.recipient_id]))];
    if (ids.length) {
        const { data: people } = await supabaseClient.from("profiles").select("id, full_name, profile_picture, role").in("id", ids);
        (people || []).forEach((p) => { msgState.people[p.id] = p; });
    }

    renderMessageList();
}

function otherParty(m) {
    const otherId = m.sender_id === msgState.profile.id ? m.recipient_id : m.sender_id;
    return msgState.people[otherId] || { full_name: "Unknown" };
}

function renderMessageList() {
    const list = document.getElementById("messagesList");
    if (!msgState.all.length) {
        list.innerHTML = `<p class="muted-note" style="padding:16px;">No messages yet.</p>`;
        return;
    }

    list.innerHTML = msgState.all.map((m) => {
        const person = otherParty(m);
        const unread = !m.is_read && m.recipient_id === msgState.profile.id;
        return `
            <button class="message-row${unread ? " unread" : ""}" data-id="${m.id}">
                ${avatarHtml(person)}
                <div class="message-row-body">
                    <p class="upcoming-title">${person.full_name}</p>
                    <p class="upcoming-meta">${m.subject || "(no subject)"}</p>
                </div>
            </button>`;
    }).join("");

    list.querySelectorAll(".message-row").forEach((row) => {
        row.addEventListener("click", () => openThread(row.dataset.id));
    });
}

async function openThread(messageId) {
    const m = msgState.all.find((x) => x.id === messageId);
    if (!m) return;

    if (!m.is_read && m.recipient_id === msgState.profile.id) {
        await supabaseClient.from("messages").update({ is_read: true }).eq("id", m.id);
        m.is_read = true;
        renderMessageList();
    }

    const person = otherParty(m);
    const thread = document.getElementById("messagesThread");
    thread.innerHTML = `
        <div class="thread-head">
            ${avatarHtml(person)}
            <div>
                <p class="upcoming-title">${person.full_name}</p>
                <p class="upcoming-meta">${capitalize(person.role || "")}</p>
            </div>
        </div>
        <div class="thread-msg">
            <p class="upcoming-title">${m.subject || "(no subject)"}</p>
            <p class="upcoming-meta">${new Date(m.created_at).toLocaleString()}</p>
            <p style="margin-top:10px;">${m.body}</p>
        </div>`;
}

async function openNewMessageModal() {
    const { data: allProfiles } = await supabaseClient.from("profiles").select("*").order("full_name");
    const others = (allProfiles || []).filter((p) => p.id !== msgState.profile.id);
    const recipients = msgState.profile.viewRole === "teacher"
        ? others.filter((p) => deriveViewRole(p.role) !== "teacher")
        : others.filter((p) => deriveViewRole(p.role) === "teacher");

    const body = document.getElementById("messageModalBody");

    if (!recipients.length) {
        body.innerHTML = `<p class="muted-note">No one to message yet.</p>`;
        openModal("messageModal");
        return;
    }

    body.innerHTML = `
        <div class="field">
            <label>To</label>
            <select id="msgRecipient" class="select-input">
                ${recipients.map((r) => `<option value="${r.id}">${r.full_name} (${capitalize(r.role)})</option>`).join("")}
            </select>
        </div>
        <div class="field">
            <label>Subject</label>
            <div class="input-wrap"><i class="fa-solid fa-heading"></i><input id="msgSubject" type="text"></div>
        </div>
        <div class="field">
            <label>Message</label>
            <textarea id="msgBody" rows="4"></textarea>
        </div>
        <div class="form-msg error" id="msgFormMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="msgFormMsgText"></span></div>
        <button class="btn btn-primary btn-block" id="msgSendBtn"><i class="fa-solid fa-paper-plane"></i> Send</button>
    `;

    openModal("messageModal");
    document.getElementById("msgSendBtn").addEventListener("click", sendNewMessage);
}

async function sendNewMessage() {
    const recipient = document.getElementById("msgRecipient").value;
    const subject = document.getElementById("msgSubject").value.trim();
    const body = document.getElementById("msgBody").value.trim();
    const msg = document.getElementById("msgFormMsg");
    const msgText = document.getElementById("msgFormMsgText");

    if (!body) {
        msgText.textContent = "Write a message before sending.";
        msg.classList.add("show");
        return;
    }

    const { error } = await supabaseClient.from("messages").insert({
        sender_id: msgState.profile.id,
        recipient_id: recipient,
        subject,
        body
    });

    if (error) {
        msgText.textContent = error.message;
        msg.classList.add("show");
        return;
    }

    closeModal("messageModal");
    await loadMessages();
}