/* ============================================================
   profile.js — profile editing (name/picture). Name-editing is
   gated on viewRole === "principal", not on comparing display
   names (which would break the moment anyone gets renamed).
   The real enforcement is a DB trigger in schema.sql - this is
   just the UI reflecting the same rule.
============================================================ */

let profileState = { profile: null };

function initProfileTab(profile) {
    profileState.profile = profile;

    document.getElementById("profName").value = profile.full_name || "";
    document.getElementById("profPicture").value = profile.profile_picture || "";

    const canEditName = profile.viewRole === "principal";
    const nameField = document.getElementById("profNameField");
    const nameInput = document.getElementById("profName");
    if (!canEditName) {
        nameField.style.opacity = "0.6";
        nameInput.disabled = true;
        nameInput.title = "Only the principal can change names — ask them if yours needs fixing.";
    } else {
        nameField.style.opacity = "";
        nameInput.disabled = false;
        nameInput.title = "";
    }

    document.getElementById("profileReadonly").innerHTML = `
        <div class="readonly-row"><span>Role</span><span>${profile.role || "Not set"}</span></div>`;

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

    const canEditName = profileState.profile.viewRole === "principal";
    if (canEditName && !fullName) return;

    const updateData = { profile_picture: profilePicture || null };
    if (canEditName) updateData.full_name = fullName;

    const { error } = await supabaseClient
        .from("profiles")
        .update(updateData)
        .eq("id", profileState.profile.id);

    if (error) {
        msg.className = "form-msg error show";
        msgText.textContent = error.message;
        return;
    }

    msg.className = "form-msg success show";
    msgText.textContent = "Saved.";

    profileState.profile.profile_picture = profilePicture;
    if (canEditName) profileState.profile.full_name = fullName;
    currentProfile = profileState.profile;
    setupSidebar(profileState.profile);

    setTimeout(() => msg.classList.remove("show"), 2500);
}