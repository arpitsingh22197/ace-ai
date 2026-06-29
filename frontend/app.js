const STORAGE = {
  users: "interviewace.users",
  session: "interviewace.session",
  sessions: "interviewace.sessions"
};

const state = {
  authMode: "register",
  user: null,
  sessions: [],
  activeSessionId: null,
  loading: false
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  bindEvents();
  state.user = readJSON(STORAGE.session, null);

  if (state.user) {
    openApp();
  } else {
    showAuth();
  }
}

function bindEvents() {
  $("toggleAuth").addEventListener("click", toggleAuthMode);
  $("authForm").addEventListener("submit", handleAuth);
  $("logoutBtn").addEventListener("click", logout);
  $("newSessionBtn").addEventListener("click", () => createSession());
  $("sessionSearch").addEventListener("input", renderSessionList);
  $("chatForm").addEventListener("submit", sendMessage);
  $("messageInput").addEventListener("input", autoResize);
  $("clearBtn").addEventListener("click", clearSessionMessages);
  $("exportBtn").addEventListener("click", exportSession);

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      $("messageInput").value = button.dataset.prompt;
      $("messageInput").focus();
      autoResize({ target: $("messageInput") });
    });
  });
}

function showAuth() {
  $("authView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}

function openApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("avatar").textContent = initials(state.user.name);
  $("profileName").textContent = state.user.name;
  $("profileEmail").textContent = state.user.email;

  state.sessions = userSessions();
  if (!state.sessions.length) {
    createSession("Frontend Developer Practice", false);
  } else {
    state.activeSessionId = state.sessions[0].id;
  }

  renderAll();
}

function toggleAuthMode() {
  state.authMode = state.authMode === "register" ? "login" : "register";
  const isLogin = state.authMode === "login";
  $("authTitle").textContent = isLogin ? "Sign in" : "Create account";
  $("toggleAuth").textContent = isLogin ? "Create account" : "Sign in";
  $("nameWrap").classList.toggle("hidden", isLogin);
}

async function handleAuth(event) {
  event.preventDefault();
  const name = $("nameInput").value.trim();
  const email = $("emailInput").value.trim().toLowerCase();
  const password = $("passwordInput").value;
  const users = readJSON(STORAGE.users, []);

  try {
    if (state.authMode === "register") {
      if (!name) throw new Error("Please enter your name.");
      if (users.some((item) => item.email === email)) throw new Error("Account already exists.");

      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
      };
      users.push(user);
      writeJSON(STORAGE.users, users);
      state.user = publicUser(user);
    } else {
      const user = users.find((item) => item.email === email);
      if (!user || user.passwordHash !== await hashPassword(password)) {
        throw new Error("Invalid email or password.");
      }
      state.user = publicUser(user);
    }

    writeJSON(STORAGE.session, state.user);
    toast("Welcome to InterviewAce AI");
    openApp();
  } catch (error) {
    toast(error.message);
  }
}

function logout() {
  localStorage.removeItem(STORAGE.session);
  state.user = null;
  state.sessions = [];
  state.activeSessionId = null;
  showAuth();
  toast("Logged out");
}

function createSession(title = "New interview session", shouldRender = true) {
  const session = {
    id: crypto.randomUUID(),
    userId: state.user.id,
    title,
    role: $("roleInput")?.value || "Frontend Developer",
    level: $("levelInput")?.value || "Intermediate",
    mode: $("modeInput")?.value || "Mock Interview",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  persistSessions();
  if (shouldRender) renderAll();
  return session;
}

function activeSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId);
}

function renderAll() {
  renderSessionList();
  renderMessages();
}

function renderSessionList() {
  const query = $("sessionSearch").value.toLowerCase();
  const filtered = state.sessions.filter((session) => session.title.toLowerCase().includes(query));

  $("sessionList").innerHTML = filtered.map(sessionRow).join("") || `
    <div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px;">No sessions yet</div>
  `;

  document.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSessionId = button.dataset.sessionId;
      const session = activeSession();
      $("roleInput").value = session.role;
      $("levelInput").value = session.level;
      $("modeInput").value = session.mode;
      renderAll();
    });
  });
}

function sessionRow(session) {
  const active = session.id === state.activeSessionId ? "active" : "";
  return `
    <button class="session-row ${active}" data-session-id="${session.id}">
      <span class="session-icon">✦</span>
      <span style="min-width:0;flex:1;">
        <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(session.title)}</strong>
        <small style="display:block;margin-top:4px;color:#94a3b8;">${escapeHTML(session.mode)} · ${escapeHTML(session.level)}</small>
      </span>
    </button>
  `;
}

function renderMessages() {
  const session = activeSession();
  const messages = $("messages");
  $("sessionTitle").textContent = session?.title || "Interview Practice";
  messages.querySelectorAll(".message").forEach((node) => node.remove());

  if (!session || !session.messages.length) {
    $("emptyState").classList.remove("hidden");
    return;
  }

  $("emptyState").classList.add("hidden");
  session.messages.forEach((message) => messages.appendChild(messageNode(message)));
  messages.scrollTop = messages.scrollHeight;
}

function messageNode(message) {
  const wrap = document.createElement("article");
  wrap.className = `message ${message.role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.text;
  wrap.appendChild(bubble);
  return wrap;
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.loading) return;

  const input = $("messageInput");
  const text = input.value.trim();
  if (!text) return;

  let session = activeSession();
  if (!session) session = createSession("New interview session", false);

  session.role = $("roleInput").value.trim() || "Frontend Developer";
  session.level = $("levelInput").value;
  session.mode = $("modeInput").value;

  if (session.title === "New interview session" || session.title === "Frontend Developer Practice") {
    session.title = text.split(/\s+/).slice(0, 6).join(" ");
  }

  session.messages.push({
    role: "user",
    text,
    createdAt: new Date().toISOString()
  });

  const thinking = {
    role: "assistant",
    text: "Thinking like an interviewer...",
    createdAt: new Date().toISOString()
  };
  session.messages.push(thinking);

  input.value = "";
  autoResize({ target: input });
  state.loading = true;
  $("sendBtn").disabled = true;
  persistAndRender();

  try {
    const response = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        role: session.role,
        level: session.level,
        mode: session.mode,
        history: session.messages
          .filter((item) => item !== thinking)
          .slice(-10)
          .map((item) => ({ role: item.role, text: item.text }))
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");

    thinking.text = data.reply;
    session.updatedAt = new Date().toISOString();
  } catch (error) {
    thinking.text = `Error: ${error.message}`;
  } finally {
    state.loading = false;
    $("sendBtn").disabled = false;
    persistAndRender();
  }
}

function clearSessionMessages() {
  const session = activeSession();
  if (!session || !confirm("Clear this session?")) return;
  session.messages = [];
  session.updatedAt = new Date().toISOString();
  persistAndRender();
}

function exportSession() {
  const session = activeSession();
  if (!session) return;

  const content = session.messages
    .map((message) => `[${message.role.toUpperCase()}]\n${message.text}`)
    .join("\n\n");

  const blob = new Blob([`${session.title}\n${session.role} · ${session.level} · ${session.mode}\n\n${content}`], {
    type: "text/plain"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.title.replace(/[^\w-]+/g, "-").toLowerCase() || "interview-session"}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function persistAndRender() {
  persistSessions();
  renderAll();
}

function persistSessions() {
  const all = readJSON(STORAGE.sessions, []);
  const others = all.filter((session) => session.userId !== state.user.id);
  writeJSON(STORAGE.sessions, [...others, ...state.sessions]);
}

function userSessions() {
  return readJSON(STORAGE.sessions, [])
    .filter((session) => session.userId === state.user.id)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function autoResize(event) {
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
}

function toast(message) {
  const toastEl = $("toast");
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(`interviewace:${password}`));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
