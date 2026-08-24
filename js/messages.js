/* messages.js — teacher-initiated messaging */

let msgState = { profile: null, messages: [], people: {} };

async function initMessages(profile) {
    msgState.profile = profile;
    document.getElementById("newMessageBtn").addEventListener("click", openNewMessageModal);
    await loadMessages();
}

async function loadMessages() {
    const { data } = await supabaseClient
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${msgState.profile.id},recipient_id.eq.${msgState.profile.id}`)
        .order("created_at", { ascending: false });

    msgState.messages = data || [];

    const ids = [...new Set(msgState.messages.flatMap((m) => [m.sender_id, m.recipient_id]))];
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
    if (!msgState.messages.length) {
        list.innerHTML = `<p class="muted-note" style="padding:16px;">No messages</p>`;
        return;
    }

    list.innerHTML = msgState.messages.map((m) => {
        const person = otherParty(m);
        const unread = !m.is_read && m.recipient_id === msgState.profile.id;
        return `
            <button class="message-row${unread ? " unread" : ""}" onclick="openThread('${m.id}')">
                ${avatarHtml(person)}
                <div class="message-row-body">
                    <p class="upcoming-title">${person.full_name}</p>
                    <p class="upcoming-meta">${m.subject || "(no subject)"}</p>
                </div>
            </button>`;
    }).join("");
}

async function openThread(messageId) {
    const m = msgState.messages.find((x) => x.id === messageId);
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
            <div><p class="upcoming-title">${person.full_name}</p><p class="upcoming-meta">${person.role || ""}</p></div>
        </div>
        <div class="thread-msg">
            <p style="font-weight:600;">${m.subject || "(no subject)"}</p>
            <p class="upcoming-meta">${formatDateTime(m.created_at)}</p>
            <p style="margin-top:12px;line-height:1.6;">${m.body}</p>
        </div>
        <button class="btn btn-primary btn-block" onclick="openReplyForm('${m.id}')"><i class="fa-solid fa-reply"></i> Reply</button>`;
}

function openReplyForm(messageId) {
    const m = msgState.messages.find((x) => x.id === messageId);
    const person = otherParty(m);
    const thread = document.getElementById("messagesThread");

    thread.innerHTML += `
        <div class="reply-form" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
            <textarea id="replyBody" rows="3" placeholder="Your reply…"></textarea>
            <button class="btn btn-primary" style="margin-top:10px;" onclick="sendReply('${messageId}')"><i class="fa-solid fa-send"></i> Send reply</button>
        </div>`;

    document.getElementById("replyBody").focus();
}

async function sendReply(messageId) {
    const m = msgState.messages.find((x) => x.id === messageId);
    const body = document.getElementById("replyBody").value.trim();

    if (!body) return;

    // Send as a new message, reversing sender/recipient
    await supabaseClient.from("messages").insert({
        sender_id: msgState.profile.id,
        recipient_id: otherParty(m).id,
        subject: `Re: ${m.subject}`,
        body
    });

    await loadMessages();
    const firstMsg = msgState.messages[0];
    await openThread(firstMsg.id);
}

async function openNewMessageModal() {
    if (msgState.profile.viewRole !== "teacher") {
        alert("Only teachers can start new messages");
        return;
    }

    const { data: recipients } = await supabaseClient.from("profiles").select("*").neq("id", msgState.profile.id).order("full_name");

    const body = document.getElementById("messageModalBody");
    body.innerHTML = `
        <div class="field">
            <label>To</label>
            <select id="msgRecipient" class="select-input">
                <option value="">Select recipient…</option>
                ${(recipients || []).map((r) => `<option value="${r.id}">${r.full_name} (${r.role})</option>`).join("")}
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

    if (!recipient || !body) {
        document.getElementById("msgFormMsgText").textContent = "Select recipient and write a message";
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
        document.getElementById("msgFormMsgText").textContent = error.message;
        msg.classList.add("show");
        return;
    }

    closeModal("messageModal");
    await loadMessages();
}