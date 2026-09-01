/* ============================================================
   dashboard.js — core controller
============================================================ */

let currentProfile = null;

function deriveViewRole(rawRole) {
    const r = (rawRole || "").toLowerCase();
    if (r.includes("principal") || r.includes("principle")) return "principal";
    if (r.includes("teacher") || r.includes("staff") || r.includes("admin") || r.includes("faculty")) return "teacher";
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

async function setupSidebar(profile) {
    document.getElementById("sidebarAvatarSlot").innerHTML = avatarHtml(profile);
    document.getElementById("sidebarName").textContent = profile.full_name;
    const rolePill = document.getElementById("rolePill");
    rolePill.textContent = profile.role || "—";
    rolePill.className = `role-pill role-${profile.viewRole}`;

    const badgeSlot = document.getElementById("sidebarBadgeSlot");
    if (profile.viewRole === "student" && typeof getBadgeStatus === "function") {
        const badge = await getBadgeStatus(profile.id);
        badgeSlot.innerHTML = busBadgeIconHtml(badge);
    } else {
        badgeSlot.innerHTML = "";
    }
}

function setupTabs() {
    const items = document.querySelectorAll(".dash-nav-item");
    const titleEl = document.getElementById("dashTitle");
    const titles = { home: "Home", calendar: "Calendar", timetable: "Timetable", roster: "My class", homework: "Homework", messages: "Messages", profile: "Profile" };

    // Cross-tab data can go stale (e.g. adding a student on My Class should
    // be reflected immediately if you then switch to Homework), so each
    // tab re-pulls its own data the moment it becomes active.
    const refreshOnActivate = {
        home: () => currentProfile && renderHomeOverview(currentProfile),
        calendar: () => typeof loadMonth === "function" && loadMonth(),
        timetable: () => typeof loadTimetable === "function" && loadTimetable(),
        roster: () => (currentProfile.viewRole === "teacher" || currentProfile.viewRole === "principal") && typeof loadRosterData === "function" && loadRosterData(),
        homework: () => typeof loadHomework === "function" && loadHomework(),
        messages: () => typeof loadMessages === "function" && loadMessages()
    };

    items.forEach((btn) => {
        btn.addEventListener("click", () => {
            items.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
            document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
            titleEl.textContent = titles[btn.dataset.tab];
            document.getElementById("dashSidebar").classList.remove("open");

            const refresh = refreshOnActivate[btn.dataset.tab];
            if (refresh) {
                Promise.resolve(refresh()).catch((err) => {
                    console.error(`Refreshing ${btn.dataset.tab} failed:`, err);
                    showBootError(titles[btn.dataset.tab], err);
                });
            }
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

function getCurrentPeriod() {
    if (typeof PERIODS === "undefined") return null;
    const now = new Date();
    const weekday = now.getDay();
    if (weekday < 1 || weekday > 5) return null;
    const mins = now.getHours() * 60 + now.getMinutes();
    for (const p of PERIODS) {
        const [s, e] = p.time.split(" - ");
        const [sh, sm] = s.split(":").map(Number);
        const [eh, em] = e.split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        if (mins >= startMins && mins < endMins) return p;
    }
    return null;
}

function renderTodayHero(profile) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
    const dateLabel = now.toLocaleDateString(undefined, { day: "numeric", month: "long" });
    const currentPeriod = getCurrentPeriod();

    document.getElementById("todayHero").innerHTML = `
        <div class="hero-card">
            <div class="hero-left">
                <p class="hero-eyebrow">Today</p>
                <h2>${dayName}, ${dateLabel}</h2>
                ${currentPeriod
                    ? `<p class="hero-period"><i class="fa-solid fa-clock"></i> Right now: <strong>${currentPeriod.label}</strong> · ${currentPeriod.time}</p>`
                    : `<p class="hero-period hero-period-muted"><i class="fa-solid fa-mug-hot"></i> No class in session right now</p>`}
            </div>
            <button class="btn btn-primary hero-btn" id="heroOpenDayBtn"><i class="fa-solid fa-magnifying-glass-plus"></i> View today</button>
        </div>`;

    document.getElementById("heroOpenDayBtn").addEventListener("click", () => {
        if (typeof openDayModal === "function") openDayModal(dateStr);
    });
}

function renderWeekStrip() {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);

    let html = "";
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const isToday = dateStr === todayStr;
        html += `
            <button class="week-day${isToday ? " active" : ""}" data-date="${dateStr}">
                <span class="week-day-name">${d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span class="week-day-num">${d.getDate()}</span>
            </button>`;
    }

    document.getElementById("weekStrip").innerHTML = html;
    document.querySelectorAll(".week-day").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (typeof openDayModal === "function") openDayModal(btn.dataset.date);
        });
    });
}

async function loadHomeworkForRole(profile) {
    if (profile.viewRole === "student") {
        const { data: hwLinks } = await supabaseClient.from("homework_students").select("*").eq("student_id", profile.id);
        const links = hwLinks || [];
        const map = {};
        links.forEach((l) => { map[l.homework_id] = l; });
        const hwIds = links.map((l) => l.homework_id);
        if (!hwIds.length) return { items: [], completionMap: {} };
        const { data } = await supabaseClient.from("homework").select("*").in("id", hwIds).order("due_date");
        return { items: data || [], completionMap: map };
    }
    if (profile.viewRole === "teacher") {
        const { data } = await supabaseClient.from("homework").select("*").eq("assigned_by", profile.id).order("due_date");
        return { items: data || [], completionMap: {} };
    }
    if (profile.viewRole === "principal") {
        const { data } = await supabaseClient.from("homework").select("*").order("due_date");
        return { items: data || [], completionMap: {} };
    }
    // parent
    const { data: links } = await supabaseClient.from("parent_links").select("student_id").eq("parent_id", profile.id);
    const studentIds = (links || []).map((l) => l.student_id);
    if (!studentIds.length) return { items: [], completionMap: {} };
    const { data: hwLinks } = await supabaseClient.from("homework_students").select("*").in("student_id", studentIds);
    const hwIds = [...new Set((hwLinks || []).map((l) => l.homework_id))];
    if (!hwIds.length) return { items: [], completionMap: {} };
    const { data } = await supabaseClient.from("homework").select("*").in("id", hwIds).order("due_date");
    return { items: data || [], completionMap: {} };
}

function homeworkStatus(h, completionMap) {
    const today = todayISO_dashboard();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const completion = completionMap[h.id];
    if (completion && completion.is_complete) return "complete";
    if (h.due_date < today) return "overdue";
    if (h.due_date === tomorrow) return "due-tomorrow";
    return "upcoming";
}

function todayISO_dashboard() {
    return new Date().toISOString().slice(0, 10);
}

async function renderHomeworkAlerts(profile) {
    const { items, completionMap } = await loadHomeworkForRole(profile);
    const relevant = items
        .filter((h) => h.type !== "assessment")
        .filter((h) => homeworkStatus(h, completionMap) !== "complete")
        .slice(0, 6);

    document.getElementById("homeHomeworkAlerts").innerHTML = relevant.length
        ? relevant.map((h) => {
            const status = homeworkStatus(h, completionMap);
            const badge = status === "overdue"
                ? `<span class="hw-alert-badge overdue"><i class="fa-solid fa-triangle-exclamation"></i> Unfinished homework</span>`
                : status === "due-tomorrow"
                ? `<span class="hw-alert-badge due-soon"><i class="fa-solid fa-clock"></i> Due tomorrow</span>`
                : `<span class="hw-alert-badge"><i class="fa-solid fa-calendar"></i> ${formatDate(h.due_date)}</span>`;
            return `<div class="home-item"><span>${h.title}</span>${badge}</div>`;
        }).join("")
        : `<p class="muted-note">Nothing outstanding.</p>`;
}

async function renderUpcomingAssessments(profile) {
    const { items } = await loadHomeworkForRole(profile);
    const today = todayISO_dashboard();
    const assessments = items.filter((h) => h.type === "assessment" && h.due_date >= today).slice(0, 5);

    document.getElementById("homeAssessments").innerHTML = assessments.length
        ? assessments.map((a) => `
            <div class="assessment-item">
                <div class="assessment-icon"><i class="fa-solid fa-file-pen"></i></div>
                <div>
                    <p class="upcoming-title">${a.title}</p>
                    <p class="upcoming-meta">${a.subject || "General"} · ${formatDate(a.due_date)}</p>
                    ${a.description ? `<p class="assessment-desc">${a.description}</p>` : ""}
                </div>
            </div>`).join("")
        : `<p class="muted-note">No assessments coming up.</p>`;
}

async function renderClassCard(profile) {
    const el = document.getElementById("homeClass");
    if (!el) return;
    const { data: students } = await supabaseClient.from("class_roster").select("student_id").eq("teacher_id", profile.id);
    el.innerHTML = students && students.length
        ? `<p>${students.length} student${students.length === 1 ? "" : "s"} in your class</p>`
        : `<p class="muted-note">No students yet — add some from <strong>My class</strong>.</p>`;
}

async function renderSchoolOverview(profile) {
    const el = document.getElementById("homeSchoolStats");
    if (!el) return;

    const { data: allProfiles } = await supabaseClient.from("profiles").select("*");
    const students = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "student").length;
    const teachers = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "teacher").length;
    const parents = (allProfiles || []).filter((p) => deriveViewRole(p.role) === "parent").length;

    const { data: badges } = await supabaseClient.from("bus_badges").select("*").eq("status", "active");
    const { count: rosterCount } = await supabaseClient.from("class_roster").select("*", { count: "exact", head: true });

    el.innerHTML = `
        <div class="stat-row"><span>Students</span><strong>${students}</strong></div>
        <div class="stat-row"><span>Teachers</span><strong>${teachers}</strong></div>
        <div class="stat-row"><span>Parents</span><strong>${parents}</strong></div>
        <div class="stat-row"><span>Active bus badges</span><strong>${(badges || []).length}</strong></div>
        <div class="stat-row"><span>Students rostered to a class</span><strong>${rosterCount ?? 0}</strong></div>`;
}

async function renderHomeOverview(profile) {
    renderTodayHero(profile);
    renderWeekStrip();
    await renderUpcomingAssessments(profile);
    await renderHomeworkAlerts(profile);
    if (profile.viewRole === "teacher") await renderClassCard(profile);
    if (profile.viewRole === "principal") await renderSchoolOverview(profile);
}

function showBootError(label, err) {
    const main = document.querySelector(".dash-main");
    if (!main) return;
    const banner = document.createElement("div");
    banner.className = "form-msg error show";
    banner.style.margin = "0 0 16px";
    banner.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span><strong>${label}</strong> didn't load properly: ${(err && err.message) || err}</span>`;
    main.prepend(banner);
}

async function safeRun(label, fn, profile) {
    if (typeof fn !== "function") return;
    try {
        await fn(profile);
    } catch (err) {
        console.error(`${label} failed:`, err);
        showBootError(label, err);
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

    await safeRun("Sidebar", setupSidebar, profile);
    applyRoleVisibility(profile.viewRole);
    setupTabs();
    setupMobileMenu();

    document.getElementById("logoutBtn").addEventListener("click", logout);

    [
        { id: "dayModal", close: "dayModalClose" },
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

    // Each of these runs independently - if one throws, the rest still wire
    // up their buttons normally instead of the whole page going dead.
    await safeRun("Home overview", renderHomeOverview, profile);
    await safeRun("Calendar", initCalendar, profile);
    await safeRun("Timetable", initTimetable, profile);
    await safeRun("My class", initRoster, profile);
    await safeRun("Homework", initHomework, profile);
    await safeRun("Messages", initMessages, profile);
    await safeRun("Bus badges", initPrincipalBadges, profile);
    await safeRun("Manage names", initAdminNames, profile);
    await safeRun("Profile", initProfileTab, profile);
});