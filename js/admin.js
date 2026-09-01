/* ============================================================
   admin.js — principal-only: rename any account. This is the
   client-side convenience; the actual enforcement ("only a
   principal can rename someone") lives in a database trigger
   in schema.sql, so it can't be bypassed by calling the API
   directly even if this UI is skipped.
============================================================ */

let adminState = { people: [] };

async function initAdminNames(profile) {
    if (profile.viewRole !== "principal") return;

    const { data, error } = await supabaseClient.from("profiles").select("*").order("full_name");
    const el = document.getElementById("adminNameList");
    if (error) {
        if (el) el.innerHTML = `<p class="muted-note">Couldn't load: ${error.message}</p>`;
        return;
    }

    adminState.people = data || [];
    renderAdminNameList("");

    const search = document.getElementById("adminNameSearch");
    if (search) search.addEventListener("input", (e) => renderAdminNameList(e.target.value));
}

function renderAdminNameList(filter) {
    const el = document.getElementById("adminNameList");
    if (!el) return;

    const q = filter.trim().toLowerCase();
    const rows = adminState.people.filter((p) => p.full_name.toLowerCase().includes(q));

    el.innerHTML = rows.length
        ? rows.map((p) => `
            <div class="badge-row">
                <div class="badge-row-info">${avatarHtml(p)}<div><p class="upcoming-title">${p.full_name}</p><p class="upcoming-meta">${p.role}</p></div></div>
                <button class="btn btn-ghost btn-sm" onclick="openRenamePrompt('${p.id}', '${p.full_name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen"></i> Rename</button>
            </div>`).join("")
        : `<p class="muted-note">No matches.</p>`;
}

function openRenamePrompt(id, currentName) {
    const newName = prompt("New name:", currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) return;
    saveRename(id, trimmed);
}

async function saveRename(id, newName) {
    const { error } = await supabaseClient.from("profiles").update({ full_name: newName }).eq("id", id);
    if (error) {
        alert(`Couldn't rename: ${error.message}`);
        return;
    }

    const person = adminState.people.find((p) => p.id === id);
    if (person) person.full_name = newName;
    renderAdminNameList(document.getElementById("adminNameSearch")?.value || "");

    // If the principal just renamed themself, refresh the sidebar too
    if (currentProfile && currentProfile.id === id) {
        currentProfile.full_name = newName;
        setupSidebar(currentProfile);
    }
}