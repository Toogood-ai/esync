/* ============================================================
   messages.js — messaging grouped into real conversations.
   Teachers/principal can start a new conversation with anyone;
   students/parents can only reply to an existing one (enforced
   both here and at the RLS level in schema.sql).
============================================================ */

let msgState = { profile: null, messages: [], people: {}, conversations: [], activePartnerId: null };

async function initMessages(profile) {
    msgState.profile = profile;
    const newBtn = document.getElementById("newMessageBtn");
    if (newBtn) newBtn.addEventListener("click", openNewMessageModal);
    await loadMessages();
}

async function loadMessages() {
    const { data, error } = await supabaseClient
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${msgState.profile.id},recipient_id.eq.${msgState.profile.id}`)
        .order("created_at", { ascending: true });

    if (error) {
        document.getElementById("messagesList").innerHTML = `<p class="muted-note" style="padding:16px;">Couldn't load messages: ${error.message}</p>`;
        return;
    }

    msgState.messages = data || [];

    const ids = [...new Set(msgState.messages.flatMap((m) => [m.sender_id, m.recipient_id]))];
    if (ids.length) {
        const { data: people } = await supabaseClient.from("profiles").select("id, full_name, profile_picture, role").in("id", ids);
        (people || []).forEach((p) => { msgState.people[p.id] = p; });
    }

    buildConversations();
    renderMessageList();

    // If a thread is currently open, refresh it in place
    if (msgState.activePartnerId && msgState.conversations.some((c) => c.partnerId === msgState.activePartnerId)) {
        renderThread(msgState.activePartnerId);
    }
}

function buildConversations() {
    const map = {};
    msgState.messages.forEach((m) => {
        const partnerId = m.sender_id === msgState.profile.id ? m.recipient_id : m.sender_id;
        (map[partnerId] = map[partnerId] || []).push(m);
    });

    msgState.conversations = Object.entries(map)
        .map(([partnerId, msgs]) => {
            const sorted = msgs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const last = sorted[sorted.length - 1];
            const unread = sorted.filter((m) => !m.is_read && m.recipient_id === msgState.profile.id).length;
            return { partnerId, messages: sorted, last, unread };
        })
        .sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
}

function personFor(id) {
    return msgState.people[id] || { full_name: "Unknown" };
}

function renderMessageList() {
    const list = document.getElementById("messagesList");

    if (!msgState.conversations.length) {
        list.innerHTML = `<p class="muted-note" style="padding:16px;">No messages yet.</p>`;
        return;
    }

    list.innerHTML = msgState.conversations.map((c) => {
        const person = personFor(c.partnerId);
        const isActive = c.partnerId === msgState.activePartnerId;
        return `
            <button class="message-row${c.unread ? " unread" : ""}${isActive ? " selected" : ""}" onclick="openThread('${c.partnerId}')">
                ${avatarHtml(person)}
                <div class="message-row-body">
                    <p class="upcoming-title">${person.full_name}</p>
                    <p class="upcoming-meta">${(c.last.body || "").slice(0, 40)}${c.last.body && c.last.body.length > 40 ? "…" : ""}</p>
                </div>
                ${c.unread ? `<span class="unread-count">${c.unread}</span>` : ""}
            </button>`;
    }).join("");
}

async function openThread(partnerId) {
    msgState.activePartnerId = partnerId;
    const convo = msgState.conversations.find((c) => c.partnerId === partnerId);
    if (!convo) return;

    // Mark any unread messages from this person as read
    const unreadIds = convo.messages.filter((m) => !m.is_read && m.recipient_id === msgState.profile.id).map((m) => m.id);
    if (unreadIds.length) {
        const { error } = await supabaseClient.from("messages").update({ is_read: true }).in("id", unreadIds);
        if (!error) {
            convo.messages.forEach((m) => { if (unreadIds.includes(m.id)) m.is_read = true; });
            convo.unread = 0;
        }
    }

    renderMessageList();
    renderThread(partnerId);
}

function renderThread(partnerId) {
    const convo = msgState.conversations.find((c) => c.partnerId === partnerId);
    if (!convo) return;

    const person = personFor(partnerId);
    const thread = document.getElementById("messagesThread");

    thread.innerHTML = `
        <div class="thread-head">
            ${avatarHtml(person)}
            <div><p class="upcoming-title">${person.full_name}</p><p class="upcoming-meta">${person.role || ""}</p></div>
        </div>
        <div class="thread-messages" id="threadMessages">
            ${convo.messages.map((m) => threadBubble(m)).join("")}
        </div>
        <div class="reply-form">
            <textarea id="replyBody" rows="2" placeholder="Write a reply…"></textarea>
            <div class="form-msg error" id="replyMsg"><i class="fa-solid fa-circle-exclamation"></i><span id="replyMsgText"></span></div>
            <button class="btn btn-primary" id="replySendBtn"><i class="fa-solid fa-paper-plane"></i> Send</button>
        </div>`;

    document.getElementById("replySendBtn").addEventListener("click", () => sendReply(partnerId));

    const threadMessages = document.getElementById("threadMessages");
    threadMessages.scrollTop = threadMessages.scrollHeight;
}

function threadBubble(m) {
    const mine = m.sender_id === msgState.profile.id;
    const showSubject = m.subject && !m.subject.startsWith("Re:");
    return `
        <div class="thread-bubble ${mine ? "mine" : "theirs"}">
            ${showSubject ? `<p class="bubble-subject">${m.subject}</p>` : ""}
            <p class="bubble-body">${m.body}</p>
            <p class="bubble-time">${formatDateTime(m.created_at)}</p>
        </div>`;
}

async function sendReply(partnerId) {
    const body = document.getElementById("replyBody").value.trim();
    const msg = document.getElementById("replyMsg");

    if (!body) return;

    const convo = msgState.conversations.find((c) => c.partnerId === partnerId);
    const baseSubject = convo && convo.last.subject ? convo.last.subject.replace(/^Re:\s*/, "") : "";
    const subject = baseSubject ? `Re: ${baseSubject}` : "";

    const { error } = await supabaseClient.from("messages").insert({
        sender_id: msgState.profile.id,
        recipient_id: partnerId,
        subject,
        body
    });

    if (error) {
        document.getElementById("replyMsgText").textContent = error.message;
        msg.classList.add("show");
        return;
    }

    document.getElementById("replyBody").value = "";
    await loadMessages();
}

async function openNewMessageModal() {
    if (msgState.profile.viewRole !== "teacher" && msgState.profile.viewRole !== "principal") {
        alert("Only teachers and the principal can start a new conversation. If someone has already messaged you, open it from your message list to reply.");
        return;
    }

    const { data: recipients, error } = await supabaseClient.from("profiles").select("*").neq("id", msgState.profile.id).order("full_name");

    const body = document.getElementById("messageModalBody");

    if (error) {
        body.innerHTML = `<p class="muted-note">Couldn't load recipients: ${error.message}</p>`;
        openModal("messageModal");
        return;
    }

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
        document.getElementById("msgFormMsgText").textContent = "Select a recipient and write a message.";
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
    msgState.activePartnerId = recipient;
    await loadMessages();
    openThread(recipient);
}