/* ============================================================
   dashboard.js — core dashboard controller
   Loaded after auth.js. Boots the shell, then hands off to
   calendar.js / badges.js / messages.js / profile.js, each of
   which expose an init*(profile) function called at the bottom.
============================================================ */

let currentProfile = null;

/* profiles.role is free text ("Parent", "Creepy Gym Teacher", "Gooner"...)
   rather than a fixed set of values, so every place that needs to know
   "is this a student/parent/teacher view" goes through this function
   instead of comparing profile.role directly. Add keywords here if new
   role names don't sort the way you'd expect. */
function deriveViewRole(rawRole) {
    const r = (rawRole || "").toLowerCase();
    if (r.includes("teacher") || r.includes("principal") || r.includes("principle") || r.includes("staff") || r.includes("admin") || r.includes("faculty")) return "teacher";
    if (r.includes("parent") || r.includes("guardian")) return "parent";
    return "student";
}

/* Renders an avatar: the person's profile_picture if set (with a
   graceful fallback to initials if the image URL is missing or broken),
   otherwise just initials. Used anywhere a person's avatar shows up. */
function avatarHtml(person) {
    const initial = (person.full_name || "?").trim()[0].toUpperCase();
    if (person.profile_picture) {
        return `
            <span class="avatar avatar-photo">
                <img src="${person.profile_picture}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="avatar-fallback">${initial}</span>
            </span>`;
    }
    return `<span class="avatar">${initial}</span>`;
}

function applyRoleVisibility(role) {
    document.querySelectorAll("[data-role]").forEach((el) => {
        const allowed = el.dataset.role.split(",").map((r) => r.trim());
        el.style.display = allowed.includes(role) ? "" : "none";
    });
}

function setupSidebar(profile) {
    const avatarSlot = document.getElementById("sidebarAvatarSlot");
    const name = document.getElementById("sidebarName");
    const rolePill = document.getElementById("rolePill");

    avatarSlot.innerHTML = avatarHtml(profile);
    name.textContent = profile.full_name;

    rolePill.textContent = profile.role || "—";
    rolePill.className = `role-pill role-${profile.viewRole}`;
}

function setupTabs() {
    const items = document.querySelectorAll(".dash-nav-item");
    const titleEl = document.getElementById("dashTitle");
    const titles = { home: "Home", calendar: "Calendar", badge: "Bus badge", messages: "Messages", profile: "Profile" };

    items.forEach((btn) => {
        btn.addEventListener("click", () => {
            items.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
            document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
            titleEl.textContent = titles[btn.dataset.tab];
            document.getElementById("dashSidebar").classList.remove("open");
        });
    });
}

function setupMobileMenu() {
    const toggle = document.getElementById("dashMenuToggle");
    const sidebar = document.getElementById("dashSidebar");
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
}

function showSetupNeeded(diag) {
    const debugLine = diag ? `
        <div class="panel-card" style="max-width:520px;margin:20px auto 0;text-align:left;">
            <p style="font-weight:600;font-size:.85rem;margin-bottom:10px;">Debug info</p>
            <p class="muted-note" style="font-family:monospace;font-size:.78rem;word-break:break-all;line-height:1.8;">
                Logged in as: ${diag.email || "unknown"}<br>
                Your login id: ${diag.uid || "unknown"}<br>
                ${diag.reason === "error"
                    ? `Supabase error: ${diag.errorMessage}`
                    : diag.reason === "not-found"
                    ? "No row in the profiles table has an id matching this login id."
                    : diag.reason === "no-session"
                    ? "No active session was found."
                    : ""}
            </p>
        </div>` : "";

    document.querySelector(".dash-main").innerHTML = `
        <div class="panel-card" style="max-width:520px;margin:60px auto 0;text-align:center;">
            <i class="fa-solid fa-user-slash" style="font-size:32px;color:var(--muted);margin-bottom:16px;"></i>
            <h3 style="margin-bottom:10px;">Your account isn't set up yet</h3>
            <p class="muted-note">Your login works, but there's no eSync profile linked to it yet.
            Ask your teacher or admin to add you, then refresh this page.</p>
        </div>
        ${debugLine}`;
    document.getElementById("dashSidebar").innerHTML = `
        <a href="index.html" class="brand">
            <span class="brand-mark-fallback" style="display:flex;">eS</span>
            <span class="brand-name">eSync</span>
        </a>
        <button class="btn btn-ghost" id="logoutBtnFallback" style="margin-top:20px;">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> Log out
        </button>`;
    document.getElementById("logoutBtnFallback").addEventListener("click", logout);
}

async function renderHomeOverview(profile) {
    const statsEl = document.getElementById("homeStats");
    const upcomingEl = document.getElementById("homeUpcoming");
    const msgEl = document.getElementById("homeMessages");

    const today = new Date().toISOString().slice(0, 10);
    const { data: events } = await supabaseClient
        .from("calendar_events")
        .select("*")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(5);

    upcomingEl.innerHTML = (events && events.length)
        ? events.map((e) => `
            <div class="upcoming-item">
                <span class="dot ${e.event_type}"></span>
                <div>
                    <p class="upcoming-title">${e.title}</p>
                    <p class="upcoming-meta">${formatDate(e.event_date)} · ${capitalize(e.event_type)}</p>
                </div>
            </div>`).join("")
        : `<p class="muted-note">Nothing coming up.</p>`;

    const { data: messages } = await supabaseClient
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(3);

    msgEl.innerHTML = (messages && messages.length)
        ? messages.map((m) => `
            <div class="upcoming-item">
                <i class="fa-solid ${m.sender_id === profile.id ? "fa-arrow-up" : "fa-arrow-down"}" style="color:var(--muted);width:16px;margin-top:3px;"></i>
                <div>
                    <p class="upcoming-title">${m.subject || "(no subject)"}</p>
                    <p class="upcoming-meta">${formatDateTime(m.created_at)}</p>
                </div>
            </div>`).join("")
        : `<p class="muted-note">No messages yet.</p>`;

    let statsHtml = "";
    if (profile.viewRole === "student") {
        const { data: badge } = await supabaseClient.from("bus_badges").select("*").eq("student_id", profile.id).maybeSingle();
        const active = badge && badge.status === "active";
        statsHtml += statCard("fa-bus", "Bus badge", active ? "Active" : "Not issued", active ? "success" : "muted");
        statsHtml += statCard("fa-book-open", "Upcoming homework", (events || []).filter((e) => e.event_type === "homework").length, "primary");
    } else if (profile.viewRole === "teacher") {
        const { data: allProfiles } = await supabaseClient.from("profiles").select("id, role");
        const studentCount = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "student").length;
        statsHtml += statCard("fa-user-graduate", "Students", studentCount, "primary");
        statsHtml += statCard("fa-calendar-plus", "Your upcoming posts", (events || []).filter((e) => e.created_by === profile.id).length, "accent");
    } else if (profile.viewRole === "parent") {
        const { data: links } = await supabaseClient.from("parent_links").select("student_id").eq("parent_id", profile.id);
        statsHtml += statCard("fa-people-roof", "Linked children", links ? links.length : 0, "primary");
    }
    statsHtml += statCard("fa-inbox", "Unread messages", (messages || []).filter((m) => m.recipient_id === profile.id && !m.is_read).length, "danger");
    statsEl.innerHTML = statsHtml;
}

function statCard(icon, label, value, tone) {
    return `<div class="stat-card"><i class="fa-solid ${icon} stat-icon ${tone}"></i><div><p class="stat-value">${value}</p><p class="stat-label">${label}</p></div></div>`;
}

function formatDate(dateStr) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function formatDateTime(ts) {
    return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

document.addEventListener("DOMContentLoaded", async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = "login.html";
        return;
    }

    const profile = await getProfile();
    if (!profile) {
        const diag = await getProfileDiagnostic();
        showSetupNeeded(diag);
        return;
    }
    profile.viewRole = deriveViewRole(profile.role);
    currentProfile = profile;

    setupSidebar(profile);
    applyRoleVisibility(profile.viewRole);
    setupTabs();
    setupMobileMenu();

    document.getElementById("logoutBtn").addEventListener("click", logout);

    document.getElementById("dayModalClose").addEventListener("click", () => closeModal("dayModal"));
    document.getElementById("confirmClose").addEventListener("click", () => closeModal("confirmModal"));
    document.getElementById("messageModalClose").addEventListener("click", () => closeModal("messageModal"));
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("open");
        });
    });

    await renderHomeOverview(profile);
    if (typeof initCalendar === "function") initCalendar(profile);
    if (typeof initBadges === "function") initBadges(profile);
    if (typeof initMessages === "function") initMessages(profile);
    if (typeof initProfileTab === "function") initProfileTab(profile);
});