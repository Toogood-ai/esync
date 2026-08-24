/* ============================================================
   dashboard.js — core controller
============================================================ */

let currentProfile = null;

function deriveViewRole(rawRole) {
    const r = (rawRole || "").toLowerCase();
    if (r.includes("teacher") || r.includes("principal") || r.includes("principle") || r.includes("staff") || r.includes("admin")) return "teacher";
    if (r.includes("parent") || r.includes("guardian")) return "parent";
    return "student";
}

function avatarHtml(person) {
    const initial = (person.full_name || "?").trim()[0].toUpperCase();
    if (person.profile_picture) {
        return `<span class="avatar avatar-photo"><img src="${person.profile_picture}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="avatar-fallback">${initial}</span></span>`;
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
    document.getElementById("sidebarAvatarSlot").innerHTML = avatarHtml(profile);
    document.getElementById("sidebarName").textContent = profile.full_name;
    const rolePill = document.getElementById("rolePill");
    rolePill.textContent = profile.role || "—";
    rolePill.className = `role-pill role-${profile.viewRole}`;
}

function setupTabs() {
    const items = document.querySelectorAll(".dash-nav-item");
    const titleEl = document.getElementById("dashTitle");
    const titles = { home: "Home", calendar: "Excursions", timetable: "Timetable", homework: "Homework", messages: "Messages", badge: "Bus badge", profile: "Profile" };

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
    document.getElementById("dashMenuToggle").addEventListener("click", () => {
        document.getElementById("dashSidebar").classList.toggle("open");
    });
}

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function formatDate(dateStr) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDateTime(ts) {
    return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function showSetupNeeded(diag) {
    const debugLine = diag ? `<div class="panel-card" style="max-width:520px;margin:20px auto 0;"><p class="muted-note" style="font-family:monospace;font-size:.78rem;">Logged in as: ${diag.email}<br>ID: ${diag.uid}</p></div>` : "";
    document.querySelector(".dash-main").innerHTML = `
        <div class="panel-card" style="max-width:520px;margin:60px auto 0;text-align:center;">
            <i class="fa-solid fa-user-slash" style="font-size:32px;color:var(--muted);margin-bottom:16px;"></i>
            <h3 style="margin-bottom:10px;">Your account isn't set up yet</h3>
            <p class="muted-note">Your login works, but there's no eSync profile linked to it yet.</p>
        </div>${debugLine}`;
    document.getElementById("dashSidebar").innerHTML = `
        <a href="index.html" class="brand"><span class="brand-mark-fallback" style="display:flex;">eS</span><span class="brand-name">eSync</span></a>
        <button class="btn btn-ghost" id="logoutBtnFallback" style="margin-top:20px;"><i class="fa-solid fa-arrow-right-from-bracket"></i> Log out</button>`;
    document.getElementById("logoutBtnFallback").addEventListener("click", logout);
}

async function renderHomeOverview(profile) {
    const today = new Date().toISOString().slice(0, 10);
    const todayName = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    const { data: excursions } = await supabaseClient.from("excursions").select("*").eq("event_date", today).order("start_time");
    
    let homework = [];
    if (profile.viewRole === "student") {
        // Students see only homework assigned to them
        const { data: hwData } = await supabaseClient
            .from("homework_students")
            .select("homework_id")
            .eq("student_id", profile.id);
        
        if (hwData && hwData.length > 0) {
            const hwIds = hwData.map((h) => h.homework_id);
            const { data: hwDetails } = await supabaseClient
                .from("homework")
                .select("*")
                .in("id", hwIds)
                .gte("due_date", today)
                .order("due_date")
                .limit(3);
            homework = hwDetails || [];
        }
    } else if (profile.viewRole === "teacher") {
        // Teachers see all homework they assigned
        const { data: hwData } = await supabaseClient
            .from("homework")
            .select("*")
            .eq("assigned_by", profile.id)
            .gte("due_date", today)
            .order("due_date")
            .limit(3);
        homework = hwData || [];
    } else {
        // Parents see homework for their linked students (if setup)
        const { data: hwData } = await supabaseClient
            .from("homework")
            .select("*")
            .gte("due_date", today)
            .order("due_date")
            .limit(3);
        homework = hwData || [];
    }

    document.getElementById("homeToday").innerHTML = `
        <p style="font-weight:600;margin-bottom:8px;">${todayName}</p>
        ${excursions && excursions.length ? excursions.map((e) => {
            const time = e.start_time ? `<span class="item-meta">${e.start_time}</span>` : "";
            return `<div class="home-item"><i class="fa-solid fa-bus"></i> ${e.event_name} ${time}</div>`;
        }).join("") : `<p class="muted-note">Nothing scheduled</p>`}`;

    document.getElementById("homeHomework").innerHTML = homework && homework.length
        ? homework.map((h) => `<div class="home-item"><i class="fa-solid fa-book"></i> ${h.title}<br><span class="item-meta">Due: ${formatDate(h.due_date)}</span></div>`).join("")
        : `<p class="muted-note">No homework</p>`;

    if (profile.viewRole === "teacher") {
        const { data: students } = await supabaseClient.from("class_roster").select("student_id").eq("teacher_id", profile.id);
        document.getElementById("homeClass").innerHTML = students && students.length ? `<p>${students.length} students in your class</p><button class="btn btn-ghost btn-sm" id="manageClassBtn"><i class="fa-solid fa-users"></i> Manage class</button>` : `<p class="muted-note">No students assigned</p>`;
    }
}

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

    [
        { id: "excursionModal", close: "excursionModalClose" },
        { id: "timetableModal", close: "timetableModalClose" },
        { id: "homeworkModal", close: "homeworkModalClose" },
        { id: "messageModal", close: "messageModalClose" },
        { id: "badgeModal", close: "badgeModalClose" }
    ].forEach(({ id, close }) => {
        document.getElementById(close).addEventListener("click", () => closeModal(id));
        document.getElementById(id).addEventListener("click", (e) => {
            if (e.target === document.getElementById(id)) closeModal(id);
        });
    });

    await renderHomeOverview(profile);
    if (typeof initCalendar === "function") initCalendar(profile);
    if (typeof initTimetable === "function") initTimetable(profile);
    if (typeof initHomework === "function") initHomework(profile);
    if (typeof initMessages === "function") initMessages(profile);
    if (typeof initBadges === "function") initBadges(profile);
    if (typeof initProfileTab === "function") initProfileTab(profile);
});