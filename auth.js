(() => {
  const cfg = window.MRA_SUPABASE || {};
  const configured = Boolean(cfg.url && cfg.anonKey && window.supabase?.createClient);
  const client = configured
    ? window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  let user = null;
  let readyPromise = null;

  async function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      if (!client) return null;
      const { data } = await client.auth.getUser();
      user = data.user || null;
      client.auth.onAuthStateChange((_event, session) => {
        user = session?.user || null;
      });
      return user;
    })();
    return readyPromise;
  }

  async function getUser() {
    await init();
    return user;
  }

  function isConfigured() {
    return configured;
  }

  function label() {
    if (!configured) return "Guest mode";
    return user ? "Account" : "Sign in";
  }

  function syncLabel() {
    if (!configured) return "✓ Saved in this browser";
    return user ? "☁ Synced to account" : "✓ Guest progress saved in this browser";
  }

  async function signUp(email, password) {
    if (!client) throw new Error("Supabase is not configured yet.");
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    user = data.user || null;
    return data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Supabase is not configured yet.");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user || null;
    return data;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    user = null;
  }

  async function loadCloudProgress() {
    const u = await getUser();
    if (!client || !u) return [];
    const { data, error } = await client
      .from("study_progress")
      .select("*")
      .eq("user_id", u.id)
      .order("answered_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(row => ({
      key: row.event_key,
      qid: row.question_id,
      variant: row.variant || undefined,
      topic: row.topic || "",
      run: row.run_id,
      world: row.world || "",
      mode: row.mode || "",
      total: row.total || 0,
      correct: row.correct,
      guessed: row.guessed === true,
      at: row.answered_at,
    }));
  }

  async function saveCloudEvents(events) {
    const u = await getUser();
    if (!client || !u || !events?.length) return;
    const rows = events.map(e => ({
      user_id: u.id,
      event_key: e.key,
      question_id: e.qid,
      variant: e.variant || null,
      topic: e.topic || null,
      run_id: e.run,
      world: e.world || null,
      mode: e.mode || null,
      total: Number(e.total || 0),
      correct: Boolean(e.correct),
      guessed: e.guessed === true,
      answered_at: e.at || new Date().toISOString(),
    }));
    const { error } = await client
      .from("study_progress")
      .upsert(rows, { onConflict: "user_id,event_key", ignoreDuplicates: true });
    if (error) throw error;
  }

  async function mergeWithCloud(localEvents) {
    const u = await getUser();
    if (!u) return localEvents;
    await saveCloudEvents(localEvents);
    const cloud = await loadCloudProgress();
    const merged = new Map();
    for (const e of [...cloud, ...localEvents]) {
      if (!merged.has(e.key)) merged.set(e.key, e);
    }
    return [...merged.values()].sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0));
  }

  function modalHtml() {
    const account = user;
    const setupNote = configured
      ? ""
      : '<p class="small">Account sync is ready in the code, but the site owner still needs to add the Supabase project URL and public key in <code>supabase-config.js</code>. Guest mode works normally meanwhile.</p>';
    return '<div class="account-backdrop" data-account-close></div>' +
      '<section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">' +
      '<button class="account-close" data-account-close aria-label="Close">×</button>' +
      '<h2 id="account-title">' + (account ? "Your account" : "Sign in or create an account") + '</h2>' +
      setupNote +
      (account
        ? '<p>Signed in as <b>' + escapeHtml(account.email || "student") + '</b>.</p>' +
          '<p class="small">Progress from this browser is merged into your account automatically, and account progress follows you to other devices.</p>' +
          '<button id="account-signout">Sign out</button>'
        : '<form id="account-form">' +
          '<label>Email<input id="account-email" type="email" autocomplete="email" required></label>' +
          '<label>Password<input id="account-password" type="password" autocomplete="current-password" minlength="6" required></label>' +
          '<div class="account-actions"><button class="primary" type="submit" data-account-mode="signin">Sign in</button><button type="button" id="account-signup">Create account</button></div>' +
          '<p class="small">No account? Keep using guest mode. Your progress stays on this browser until you create/sign into an account.</p>' +
          '<p id="account-status" role="status"></p>' +
          '</form>') +
      '</section>';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  async function openDialog() {
    await init();
    closeDialog();
    const wrap = document.createElement("div");
    wrap.id = "account-dialog";
    wrap.innerHTML = modalHtml();
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-account-close]").forEach(el => {
      el.onclick = closeDialog;
    });
    const form = wrap.querySelector("#account-form");
    const status = wrap.querySelector("#account-status");
    const runAuth = async mode => {
      if (!configured) {
        status.textContent = "Supabase still needs to be connected by the site owner.";
        return;
      }
      const email = wrap.querySelector("#account-email").value.trim();
      const password = wrap.querySelector("#account-password").value;
      status.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
      try {
        const result = mode === "signup"
          ? await signUp(email, password)
          : await signIn(email, password);
        if (mode === "signup" && !result.session) {
          status.textContent = "Account created. Check your email if confirmation is enabled, then sign in.";
          return;
        }
        status.textContent = "Signed in. Linking your saved progress…";
        location.reload();
      } catch (e) {
        status.textContent = e.message || "Account request failed.";
      }
    };
    if (form) form.onsubmit = e => { e.preventDefault(); runAuth("signin"); };
    const signup = wrap.querySelector("#account-signup");
    if (signup) signup.onclick = () => runAuth("signup");
    const signout = wrap.querySelector("#account-signout");
    if (signout) signout.onclick = async () => {
      await signOut();
      location.reload();
    };
  }

  function closeDialog() {
    document.querySelector("#account-dialog")?.remove();
  }

  window.MRAAuth = {
    init,
    getUser,
    isConfigured,
    label,
    syncLabel,
    mergeWithCloud,
    saveCloudEvents,
    openDialog,
    closeDialog,
  };

  init().catch(() => {});
})();
