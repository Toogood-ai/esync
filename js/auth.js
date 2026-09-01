const SUPABASE_URL = "https://mahrmguulgepcgtvytbo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1haHJtZ3V1bGdlcGNndHZ5dGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTg4NDQsImV4cCI6MjEwMTQ3NDg0NH0.H6twSqQ5IWGld0szqQCEzAVfziCUVE4hdqrqgqH_sxw";

// `supabase` here is the global exposed by the Supabase JS CDN script.
// It must be loaded on the page BEFORE this file - see the <script> tag
// added to each HTML page.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------------------------------------------------
   Login only - no signup flow. Demo users are created directly
   in the Supabase dashboard (Authentication > Users > Add user),
   then given a matching row in the `profiles` table.
--------------------------------------------------------- */

async function loginUser({ email, password }) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

async function getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) return null;
    return data.session;
}

/* Fetches the current user's row from `profiles`. Returns null if the
   user is logged in but no profile row exists for them yet. */
async function getProfile() {
    const session = await getSession();
    if (!session) return null;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

    if (error) {
        console.error("getProfile() failed for user id:", session.user.id, error);
        return null;
    }
    if (!data) {
        console.warn("No profiles row found for logged-in user id:", session.user.id);
        return null;
    }
    return data;
}

/* Used only when getProfile() comes back empty, to show exactly why
   directly on the page - no DevTools needed. */
async function getProfileDiagnostic() {
    const session = await getSession();
    if (!session) return { reason: "no-session" };

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

    return {
        reason: error ? "error" : (!data ? "not-found" : "found"),
        uid: session.user.id,
        email: session.user.email,
        errorMessage: error ? error.message : null
    };
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

/* ---------------------------------------------------------
   Nav rendering - async since getSession()/getProfile() are async.
   Only used on public pages (index.html, login.html). The
   dashboard has its own sidebar, built by dashboard.js.
--------------------------------------------------------- */

async function initNav() {
    const toggle = document.getElementById("menuToggle");
    const links = document.getElementById("navLinks");
    if (toggle && links) {
        toggle.addEventListener("click", () => links.classList.toggle("open"));
    }

    const actions = document.getElementById("navActions");
    if (!actions) return;

    const session = await getSession();
    if (!session) return;

    const profile = await getProfile();
    const name = profile?.full_name || session.user.user_metadata?.name || session.user.email;
    const initial = name.trim()[0].toUpperCase();
    const avatarMarkup = profile?.profile_picture
        ? `<span class="avatar avatar-photo">
               <img src="${profile.profile_picture}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <span class="avatar-fallback">${initial}</span>
           </span>`
        : `<span class="avatar">${initial}</span>`;

    actions.innerHTML = `
        <a href="dashboard.html" class="btn btn-ghost">
            <i class="fa-solid fa-gauge"></i> Dashboard
        </a>
        <div class="user-chip">
            ${avatarMarkup}
            <span>${name}</span>
        </div>
        <button class="btn btn-ghost" id="logoutBtn">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> Log out
        </button>
    `;
    document.getElementById("logoutBtn").addEventListener("click", logout);
}

document.addEventListener("DOMContentLoaded", initNav);