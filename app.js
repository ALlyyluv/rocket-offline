const ui = {
  canvas: document.querySelector("#canvas"),
  multiplier: document.querySelector("#multiplier"),
  status: document.querySelector("#status"),
  authBox: document.querySelector("#authBox"),
  accountBox: document.querySelector("#accountBox"),
  playerBox: document.querySelector("#playerBox"),
  adminBox: document.querySelector("#adminBox"),
  loginMode: document.querySelector("#loginMode"),
  registerMode: document.querySelector("#registerMode"),
  authForm: document.querySelector("#authForm"),
  authSubmit: document.querySelector("#authSubmit"),
  authMessage: document.querySelector("#authMessage"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  accountName: document.querySelector("#accountName"),
  accountRole: document.querySelector("#accountRole"),
  logoutButton: document.querySelector("#logoutButton"),
  balance: document.querySelector("#balance"),
  topupForm: document.querySelector("#topupForm"),
  topupAmount: document.querySelector("#topupAmount"),
  topupMessage: document.querySelector("#topupMessage"),
  withdrawForm: document.querySelector("#withdrawForm"),
  withdrawAmount: document.querySelector("#withdrawAmount"),
  withdrawMessage: document.querySelector("#withdrawMessage"),
  betForm: document.querySelector("#betForm"),
  betAmount: document.querySelector("#betAmount"),
  autoCashout: document.querySelector("#autoCashout"),
  autoEnabled: document.querySelector("#autoEnabled"),
  placeBetButton: document.querySelector("#placeBetButton"),
  cashoutButton: document.querySelector("#cashoutButton"),
  betMessage: document.querySelector("#betMessage"),
  activeBet: document.querySelector("#activeBet"),
  potentialWin: document.querySelector("#potentialWin"),
  roundCount: document.querySelector("#roundCount"),
  historyList: document.querySelector("#historyList"),
  adminUsers: document.querySelector("#adminUsers"),
  adminPending: document.querySelector("#adminPending"),
  adminTopups: document.querySelector("#adminTopups"),
  adminActivities: document.querySelector("#adminActivities"),
};

const ctx = ui.canvas.getContext("2d");
const dbKey = "rocket-pages-demo-db-v1";
const sessionKey = "rocket-pages-demo-session-v1";
const topupRateIdr = 1000;
const bettingMs = 5000;
const intermissionMs = 1800;

let mode = "login";
let db = loadDb();
let game = {
  phase: "betting",
  multiplier: 1,
  crashPoint: 0,
  round: 0,
  phaseEndsAt: Date.now() + bettingMs,
  flightStartedAt: 0,
  bet: null,
};
let stars = [];

function loadDb() {
  try {
    const stored = JSON.parse(localStorage.getItem(dbKey));
    if (stored?.users) return ensureDb(stored);
  } catch {
    // Fresh demo database.
  }
  return ensureDb({ users: [], topups: [], activities: [] });
}

function ensureDb(next) {
  if (!next.users.some((user) => user.role === "admin")) {
    next.users.unshift({ id: "admin", username: "admin", password: "admin123", role: "admin", balance: 0, history: [] });
  }
  next.topups ||= [];
  next.activities ||= [];
  saveDb(next);
  return next;
}

function saveDb(next = db) {
  localStorage.setItem(dbKey, JSON.stringify(next));
}

function currentUser() {
  const id = localStorage.getItem(sessionKey);
  return db.users.find((user) => user.id === id) || null;
}

function setSession(id) {
  if (id) localStorage.setItem(sessionKey, id);
  else localStorage.removeItem(sessionKey);
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function number(value) {
  return Math.round(value || 0).toLocaleString("id-ID");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addActivity(user, detail) {
  db.activities.unshift({ user: user?.username || "system", detail, at: new Date().toISOString() });
  db.activities = db.activities.slice(0, 50);
}

function crashPoint() {
  const roll = Math.random();
  const raw = 0.94 / Math.max(0.01, 1 - roll);
  return clamp(Math.floor(raw * 100) / 100, 1.05, 35);
}

function calcMultiplier(seconds) {
  return Math.max(1, 1 + seconds * 0.18 + Math.pow(seconds, 1.55) * 0.035);
}

function setMode(next) {
  mode = next;
  ui.loginMode.classList.toggle("active", mode === "login");
  ui.registerMode.classList.toggle("active", mode === "register");
  ui.authSubmit.textContent = mode === "login" ? "Login" : "Buat Akun";
  ui.authMessage.textContent = "";
}

function submitAuth(event) {
  event.preventDefault();
  const username = ui.username.value.trim();
  const password = ui.password.value;

  if (mode === "register") {
    if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      ui.authMessage.textContent = "Username sudah dipakai.";
      return;
    }
    const user = { id: id("user"), username, password, role: "player", balance: 0, history: [] };
    db.users.push(user);
    addActivity(user, "Daftar akun");
    saveDb();
    setSession(user.id);
    ui.authForm.reset();
    renderUi();
    return;
  }

  const user = db.users.find((item) => item.username === username && item.password === password);
  if (!user) {
    ui.authMessage.textContent = "Username/password salah.";
    return;
  }
  setSession(user.id);
  addActivity(user, "Login");
  saveDb();
  ui.authForm.reset();
  renderUi();
}

function logout() {
  setSession(null);
  renderUi();
}

function submitTopup(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user) return;
  const amount = clamp(parseInt(ui.topupAmount.value, 10) || 10, 10, 100000);
  db.topups.unshift({ id: id("topup"), userId: user.id, username: user.username, amount, priceIdr: amount * topupRateIdr, status: "pending" });
  addActivity(user, `Ajukan top up ${number(amount)} saldo`);
  saveDb();
  ui.topupMessage.textContent = "Top up menunggu admin demo approve.";
  renderUi();
}

function submitWithdraw(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user) return;
  const amount = clamp(parseInt(ui.withdrawAmount.value, 10) || 10, 10, 100000);
  if (amount > user.balance) {
    ui.withdrawMessage.textContent = "Saldo tidak cukup.";
    return;
  }
  user.balance -= amount;
  addActivity(user, `Withdraw demo auto approved ${number(amount)} saldo`);
  saveDb();
  ui.withdrawMessage.textContent = "Withdraw demo otomatis approved.";
  renderUi();
}

function submitBet(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user || game.phase !== "betting") {
    ui.betMessage.textContent = "Bet hanya saat countdown.";
    return;
  }
  const amount = clamp(parseInt(ui.betAmount.value, 10) || 1, 1, Math.max(1, user.balance));
  if (amount > user.balance) {
    ui.betMessage.textContent = "Saldo tidak cukup.";
    return;
  }
  if (game.bet) user.balance += game.bet.amount;
  user.balance -= amount;
  game.bet = {
    userId: user.id,
    amount,
    cashed: false,
    autoEnabled: ui.autoEnabled.checked,
    autoAt: clamp(parseFloat(ui.autoCashout.value) || 2, 1.01, 99),
  };
  addActivity(user, `Pasang bet ${number(amount)} saldo`);
  saveDb();
  ui.betMessage.textContent = "Bet terpasang.";
  renderUi();
}

function cashOut(auto = false) {
  const user = currentUser();
  if (!user || !game.bet || game.bet.cashed || game.phase !== "flying") return;
  const payout = Math.floor(game.bet.amount * game.multiplier);
  game.bet.cashed = true;
  game.bet.payout = payout;
  game.bet.cashoutAt = game.multiplier;
  user.balance += payout;
  user.history.unshift({ win: true, multiplier: game.multiplier, bet: game.bet.amount, amount: payout - game.bet.amount });
  addActivity(user, `${auto ? "Auto cash out" : "Cash out"} di ${game.multiplier.toFixed(2)}x`);
  saveDb();
  renderUi();
}

function reviewTopup(topupId, approved) {
  const topup = db.topups.find((item) => item.id === topupId);
  if (!topup || topup.status !== "pending") return;
  topup.status = approved ? "approved" : "rejected";
  const user = db.users.find((item) => item.id === topup.userId);
  if (approved && user) user.balance += topup.amount;
  addActivity(currentUser(), `${approved ? "Approve" : "Reject"} top up ${topup.username}`);
  saveDb();
  renderUi();
}

function tickGame() {
  const now = Date.now();
  if (game.phase === "betting" && now >= game.phaseEndsAt) {
    game.phase = "flying";
    game.round += 1;
    game.crashPoint = crashPoint();
    game.flightStartedAt = now;
    game.multiplier = 1;
  }
  if (game.phase === "flying") {
    game.multiplier = calcMultiplier((now - game.flightStartedAt) / 1000);
    if (game.bet && !game.bet.cashed && game.bet.autoEnabled && game.multiplier >= game.bet.autoAt) cashOut(true);
    if (game.multiplier >= game.crashPoint) {
      const user = game.bet ? db.users.find((item) => item.id === game.bet.userId) : null;
      if (user && !game.bet.cashed) {
        user.history.unshift({ win: false, multiplier: game.crashPoint, bet: game.bet.amount, amount: game.bet.amount });
        addActivity(user, `Kalah di ${game.crashPoint.toFixed(2)}x`);
      }
      game.phase = "crashed";
      game.multiplier = game.crashPoint;
      game.phaseEndsAt = now + intermissionMs;
      saveDb();
    }
  }
  if (game.phase === "crashed" && now >= game.phaseEndsAt) {
    game.phase = "betting";
    game.multiplier = 1;
    game.bet = null;
    game.phaseEndsAt = now + bettingMs;
  }
  renderUi();
}

function renderUi() {
  const user = currentUser();
  const isPlayer = user?.role === "player";
  const isAdmin = user?.role === "admin";
  const remaining = Math.max(0, Math.ceil((game.phaseEndsAt - Date.now()) / 1000));

  ui.authBox.classList.toggle("hidden", Boolean(user));
  ui.accountBox.classList.toggle("hidden", !user);
  ui.playerBox.classList.toggle("hidden", !isPlayer);
  ui.adminBox.classList.toggle("hidden", !isAdmin);
  if (user) {
    ui.accountName.textContent = user.username;
    ui.accountRole.textContent = user.role === "admin" ? "Admin" : "Player";
  }
  if (isPlayer) ui.balance.textContent = number(user.balance);

  ui.multiplier.textContent = `${game.multiplier.toFixed(2)}x`;
  ui.status.textContent =
    game.phase === "betting" ? `Pasang bet: ${remaining}s` : game.phase === "flying" ? "Roket melaju" : `Crash ${game.multiplier.toFixed(2)}x`;
  ui.roundCount.textContent = String(game.round);
  ui.activeBet.textContent = number(game.bet?.amount || 0);
  ui.potentialWin.textContent = game.phase === "flying" && game.bet && !game.bet.cashed ? number(game.bet.amount * game.multiplier) : "0";
  ui.placeBetButton.disabled = !isPlayer || game.phase !== "betting";
  ui.cashoutButton.disabled = !isPlayer || game.phase !== "flying" || !game.bet || game.bet.cashed;

  ui.historyList.innerHTML = "";
  (user?.history || []).slice(0, 10).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong class="${item.win ? "win" : "lose"}">${item.multiplier.toFixed(2)}x</strong> ${item.win ? "+" : "-"}${number(item.amount)} saldo`;
    ui.historyList.append(li);
  });

  ui.adminUsers.textContent = String(db.users.filter((item) => item.role === "player").length);
  ui.adminPending.textContent = String(db.topups.filter((item) => item.status === "pending").length);
  ui.adminTopups.innerHTML = "";
  db.topups.slice(0, 12).forEach((topup) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<strong>${topup.username}</strong><br>${number(topup.amount)} saldo - ${topup.status}<br>${
      topup.status === "pending" ? `<button data-approve="${topup.id}">Approve</button> <button data-reject="${topup.id}">Reject</button>` : ""
    }`;
    ui.adminTopups.append(row);
  });
  ui.adminActivities.innerHTML = db.activities
    .slice(0, 15)
    .map((activity) => `<div class="row"><strong>${activity.user}</strong><br>${activity.detail}</div>`)
    .join("");
}

function resize() {
  const rect = ui.canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ui.canvas.width = rect.width * dpr;
  ui.canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stars = Array.from({ length: 100 }, () => ({ x: Math.random() * rect.width, y: Math.random() * rect.height, s: Math.random() * 2 + 0.5 }));
}

function draw() {
  const rect = ui.canvas.getBoundingClientRect();
  ctx.fillStyle = "#080910";
  ctx.fillRect(0, 0, rect.width, rect.height);
  stars.forEach((star) => {
    star.y += game.phase === "flying" ? 1 : 0.35;
    if (star.y > rect.height) star.y = 0;
    ctx.fillStyle = "rgba(248,244,232,.75)";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2);
    ctx.fill();
  });
  const progress = game.phase === "flying" || game.phase === "crashed" ? clamp((game.multiplier - 1) / 12, 0, 1) : 0;
  const x = rect.width / 2 + Math.sin(Date.now() / 350) * 20;
  const y = rect.height - 84 - rect.height * 0.62 * progress;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#f8f4e8";
  ctx.beginPath();
  ctx.moveTo(0, -70);
  ctx.bezierCurveTo(34, -40, 28, 18, 14, 42);
  ctx.lineTo(-14, 42);
  ctx.bezierCurveTo(-28, 18, -34, -40, 0, -70);
  ctx.fill();
  ctx.fillStyle = "#ff5b6e";
  ctx.beginPath();
  ctx.moveTo(-16, 20);
  ctx.lineTo(-48, 55);
  ctx.lineTo(-12, 42);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, 20);
  ctx.lineTo(48, 55);
  ctx.lineTo(12, 42);
  ctx.fill();
  ctx.fillStyle = "#47d7ff";
  ctx.beginPath();
  ctx.arc(0, -28, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  requestAnimationFrame(draw);
}

ui.loginMode.addEventListener("click", () => setMode("login"));
ui.registerMode.addEventListener("click", () => setMode("register"));
ui.authForm.addEventListener("submit", submitAuth);
ui.logoutButton.addEventListener("click", logout);
ui.topupForm.addEventListener("submit", submitTopup);
ui.withdrawForm.addEventListener("submit", submitWithdraw);
ui.betForm.addEventListener("submit", submitBet);
ui.cashoutButton.addEventListener("click", () => cashOut(false));
ui.adminTopups.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.approve) reviewTopup(target.dataset.approve, true);
  if (target.dataset.reject) reviewTopup(target.dataset.reject, false);
});
window.addEventListener("resize", resize);

resize();
renderUi();
setInterval(tickGame, 120);
draw();
