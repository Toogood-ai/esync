/* profile.js — profile editing (name/picture) */

let profileState = { profile: null };

function initProfileTab(profile) {
    profileState.profile = profile;

    document.getElementById("profName").value = profile.full_name || "";
    document.getElementById("profPicture").value = profile.profile_picture || "";

    // Only allow Akash (admin) to edit names; others are read-only
    const isAdmin = profile.full_name.toLowerCase() === "akash";
    if (!isAdmin) {
        document.getElementById("profNameField").style.opacity = "0.6";
        document.getElementById("profName").disabled = true;
        document.getElementById("profName").title = "Only admin can edit names";
    }

    document.getElementById("profileReadonly").innerHTML = `
        <div class="readonly-row"><span>Email</span><span>${profile.email || "Not set"}</span></div>
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

    if (!fullName) return;

    const isAdmin = profileState.profile.full_name.toLowerCase() === "akash";
    const updateData = { profile_picture: profilePicture || null };
    if (isAdmin) {
        updateData.full_name = fullName;
    }

    const { error } = await supabaseClient
        .from("profiles")
        .update(updateData)
        .eq("id", profileState.profile.id);

    if (error) {
        msg.className = "form-msg error show";
        document.getElementById("profMsgText").textContent = error.message;
        return;
    }

    msg.className = "form-msg success show";
    document.getElementById("profMsgText").textContent = "Saved";

    profileState.profile.profile_picture = profilePicture;
    if (isAdmin) profileState.profile.full_name = fullName;
    currentProfile = profileState.profile;
    setupSidebar(profileState.profile);

    setTimeout(() => msg.classList.remove("show"), 2500);
}