/* ============================================================
   profile.js — profile tab. full_name and profile_picture are
   editable (the only columns your teammate's profiles table
   supports besides id/role); role is shown read-only since
   it's assigned by a teacher/admin, not the user themselves.
============================================================ */

let profileState = { profile: null };

function initProfileTab(profile) {
    profileState.profile = profile;

    document.getElementById("profName").value = profile.full_name || "";
    document.getElementById("profPicture").value = profile.profile_picture || "";

    document.getElementById("profileReadonly").innerHTML = `
        <div class="readonly-row"><span>Role</span><span>${profile.role || "Not set"}</span></div>
        <p class="muted-note" style="margin-top:10px;">Role is set by a teacher or admin and can't be edited here.</p>`;

    renderAvatarPreview();
    document.getElementById("profPicture").addEventListener("input", renderAvatarPreview);
    document.getElementById("profSaveBtn").addEventListener("click", saveProfile);
}

function renderAvatarPreview() {
    const url = document.getElementById("profPicture").value.trim();
    const preview = document.getElementById("avatarPreview");
    preview.innerHTML = avatarHtml({ full_name: profileState.profile.full_name, profile_picture: url });
}

async function saveProfile() {
    const fullName = document.getElementById("profName").value.trim();
    const profilePicture = document.getElementById("profPicture").value.trim();
    const msg = document.getElementById("profMsg");
    const msgText = document.getElementById("profMsgText");

    if (!fullName) return;

    const { error } = await supabaseClient
        .from("profiles")
        .update({ full_name: fullName, profile_picture: profilePicture || null })
        .eq("id", profileState.profile.id);

    if (error) {
        msgText.textContent = error.message;
        msg.className = "form-msg error show";
        return;
    }

    msgText.textContent = "Saved.";
    msg.className = "form-msg success show";

    profileState.profile.full_name = fullName;
    profileState.profile.profile_picture = profilePicture;
    currentProfile = profileState.profile;
    setupSidebar(profileState.profile);

    setTimeout(() => msg.classList.remove("show"), 2500);
}