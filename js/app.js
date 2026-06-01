/* ============================================================================
   QuizPortal — app.js
   Auth, routing, vista studente (intro + timer + riepilogo laterale),
   vista professore (studenti + tempo + upload .docx + anteprima + export Excel).
   ========================================================================== */

"use strict";

/* --------------------------- Supabase client ----------------------------- */
const { createClient } = window.supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

/* ------------------------------- Stato ----------------------------------- */
const S = {
  user: null,
  profile: null,
  authMode: "login",
  // studente
  quiz: null,
  idx: 0,
  answers: {},
  deadline: null,        // timestamp ms in cui scade il tempo (null = nessun limite)
  timerInterval: null,
  // professore
  students: [],
  quizzesByStudent: {},
  responsesByStudent: {},
  uploadTarget: null,
};

const POINTS = { correct: 3, wrong: -1, blank: 0 };

/* ------------------------------ Helper ----------------------------------- */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

let toastTimer = null;
function toast(message, isError = false) {
  const t = $("toast");
  t.textContent = message;
  t.className = "toast" + (isError ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

function setLoading(id, on, restoreText) {
  const b = $(id);
  if (on) {
    b.dataset.txt = b.textContent;
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>';
  } else {
    b.disabled = false;
    b.textContent = restoreText || b.dataset.txt || b.textContent;
  }
}

function showView(name) {
  ["auth-view", "student-view", "teacher-view"].forEach((v) => {
    $(v).hidden = v !== name + "-view";
  });
  $("topbar").hidden = name === "auth";
}

/* ============================================================================
   AUTENTICAZIONE
   ========================================================================== */

function setAuthMode(mode) {
  S.authMode = mode;
  const register = mode === "register";
  $("name-field").hidden = !register;
  $("auth-sub").textContent = register ? "Crea l'account professore" : "Accedi per continuare";
  $("auth-submit").textContent = register ? "Registrati" : "Accedi";
  $("toggle-label").textContent = register ? "Hai già un account?" : "Prima volta come professore?";
  $("auth-toggle-btn").textContent = register ? "Accedi" : "Registrati";
  $("auth-msg").textContent = "";
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const name = $("auth-name").value.trim();
  const msg = $("auth-msg");
  msg.className = "msg";
  msg.textContent = "";
  setLoading("auth-submit", true);

  try {
    if (S.authMode === "register") {
      const role = email.toLowerCase() === CONFIG.TEACHER_EMAIL.toLowerCase() ? "teacher" : "student";
      const { data, error } = await db.auth.signUp({
        email, password,
        options: { data: { full_name: name, role } },
      });
      if (error) throw error;
      if (data.session) return; // già loggato -> il listener fa il routing
      setLoading("auth-submit", false, "Registrati");
      msg.className = "msg ok";
      msg.textContent = "Account creato. Ora puoi accedere.";
      setAuthMode("login");
      $("auth-email").value = email;
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    setLoading("auth-submit", false, S.authMode === "register" ? "Registrati" : "Accedi");
    msg.className = "msg error";
    msg.textContent = traduciErroreAuth(err);
  }
}

function traduciErroreAuth(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Email o password non corretti.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Questa email è già registrata.";
  if (m.includes("email not confirmed")) return "Email non confermata. Contatta il professore.";
  if (m.includes("password")) return "Password troppo corta (minimo 6 caratteri).";
  return err?.message || "Si è verificato un errore.";
}

async function handleLogout() {
  stopTimer();
  await db.auth.signOut();
  Object.assign(S, { user: null, profile: null, quiz: null, idx: 0, answers: {}, deadline: null });
  showView("auth");
  setAuthMode("login");
}

/* ============================================================================
   ROUTING
   ========================================================================== */

async function route() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { showView("auth"); return; }
  S.user = user;

  let profile = await fetchProfile(user.id);
  if (!profile) { await sleep(700); profile = await fetchProfile(user.id); }
  S.profile = profile;

  const roleLabel = profile?.role === "teacher" ? "Professore" : "Studente";
  $("who").textContent = `${profile?.full_name || profile?.email || ""} · ${roleLabel}`;

  if (profile?.role === "teacher") { showView("teacher"); loadTeacher(); }
  else { showView("student"); loadStudent(); }
}

async function fetchProfile(id) {
  const { data } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  return data;
}

/* ============================================================================
   VISTA STUDENTE
   ========================================================================== */

function hideAllStudentPanels() {
  ["student-quiz", "student-empty", "student-done", "student-intro"].forEach((id) => ($(id).hidden = true));
}

async function loadStudent() {
  hideAllStudentPanels();
  stopTimer();

  // ha già risposto?
  const { data: existing } = await db
    .from("responses").select("submitted_at").eq("student_id", S.user.id).maybeSingle();
  if (existing) { showStudentDone(existing.submitted_at); return; }

  // questionario SENZA risposte corrette (RPC security definer)
  const { data, error } = await db.rpc("get_my_quiz");
  if (error) { toast("Errore nel caricamento del questionario.", true); return; }

  const quiz = Array.isArray(data) ? data[0] : data;
  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    $("student-empty").hidden = false;
    return;
  }

  S.quiz = quiz;
  S.idx = 0;
  S.answers = {};
  S.deadline = null;

  // ripresa dopo un ricaricamento accidentale (stato salvato nella scheda)
  const saved = loadQuizState(quiz.id);
  if (saved) {
    S.answers = saved.answers || {};
    S.idx = Math.min(saved.idx || 0, quiz.questions.length - 1);
    S.deadline = saved.deadline || null;
    if (S.deadline && Date.now() >= S.deadline) { enterQuiz(); submitQuiz(true); return; }
    enterQuiz();
    return;
  }

  showIntro();
}

function showIntro() {
  hideAllStudentPanels();
  $("intro-title").textContent = S.quiz.title || "Questionario";
  $("intro-text").textContent = S.quiz.intro || "";
  const tl = S.quiz.time_limit_minutes || 0;
  $("intro-time").textContent = tl > 0
    ? `Tempo a disposizione: ${tl} minuti. Il conto alla rovescia parte appena inizi.`
    : "Nessun limite di tempo.";
  $("student-intro").hidden = false;
}

function startQuiz() {
  const tl = S.quiz.time_limit_minutes || 0;
  S.deadline = tl > 0 ? Date.now() + tl * 60 * 1000 : null;
  enterQuiz();
}

function enterQuiz() {
  hideAllStudentPanels();
  $("student-quiz").hidden = false;
  $("q-total").textContent = S.quiz.questions.length;
  renderQuestion();
  renderNavigator();
  persistQuizState();
  if (S.deadline) startTimer();
  else $("timer").hidden = true;
}

function renderQuestion() {
  const qs = S.quiz.questions;
  const q = qs[S.idx];

  $("q-current").textContent = S.idx + 1;
  $("progress-bar").style.width = ((S.idx + 1) / qs.length) * 100 + "%";
  $("q-text").textContent = q.text;

  const box = $("q-options");
  box.innerHTML = "";
  (q.options || []).forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "option" + (S.answers[q.number] === opt.key ? " selected" : "");
    b.innerHTML = `<span class="key">${escapeHtml(opt.key)}</span><span>${escapeHtml(opt.text)}</span>`;
    b.addEventListener("click", () => {
      S.answers[q.number] = opt.key;
      persistQuizState();
      renderQuestion();
      renderNavigator();
    });
    box.appendChild(b);
  });

  $("q-prev").disabled = S.idx === 0;
  $("q-next").disabled = S.idx === qs.length - 1;
  $("q-clear").disabled = !S.answers[q.number];
}

function renderNavigator() {
  const grid = $("nav-grid");
  grid.innerHTML = "";
  S.quiz.questions.forEach((q, i) => {
    const given = S.answers[q.number];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "nav-cell" + (given ? " answered" : "") + (i === S.idx ? " current" : "");
    cell.innerHTML = `<span class="num">${q.number}</span><span class="ans">${given ? escapeHtml(given) : "—"}</span>`;
    cell.addEventListener("click", () => goToQuestion(i));
    grid.appendChild(cell);
  });
}

function goToQuestion(i) {
  S.idx = i;
  persistQuizState();
  renderQuestion();
  renderNavigator();
}

function clearAnswer() {
  const q = S.quiz.questions[S.idx];
  delete S.answers[q.number];
  persistQuizState();
  renderQuestion();
  renderNavigator();
}

/* --- Timer --- */
function startTimer() {
  $("timer").hidden = false;
  tickTimer();
  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(tickTimer, 1000);
}
function stopTimer() {
  clearInterval(S.timerInterval);
  S.timerInterval = null;
}
function tickTimer() {
  if (!S.deadline) return;
  const remaining = Math.max(0, S.deadline - Date.now());
  const totSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totSec / 60)).padStart(2, "0");
  const ss = String(totSec % 60).padStart(2, "0");
  $("timer-val").textContent = `${mm}:${ss}`;
  $("timer").classList.toggle("danger", totSec <= 60);
  if (remaining <= 0) {
    stopTimer();
    toast("Tempo scaduto: invio automatico delle risposte.", true);
    submitQuiz(true);
  }
}

/* --- Invio --- */
async function submitQuiz(auto = false) {
  const qs = S.quiz.questions;
  const blanks = qs.filter((q) => !S.answers[q.number]).length;

  if (!auto) {
    let msg = "Inviare le risposte? Dopo l'invio non potrai più modificarle.";
    if (blanks > 0) msg = `Hai ${blanks} domande senza risposta (varranno 0 punti). ` + msg;
    if (!confirm(msg)) return;
  }

  stopTimer();
  setLoading("q-submit", true);
  const { error } = await db.from("responses").insert({
    quiz_id: S.quiz.id,
    student_id: S.user.id,
    answers: S.answers,
  });
  setLoading("q-submit", false, "Termina e invia");

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
      clearQuizState(S.quiz.id);
      showStudentDone(new Date().toISOString());
    } else {
      toast("Errore nell'invio: " + error.message, true);
    }
    return;
  }
  clearQuizState(S.quiz.id);
  showStudentDone(new Date().toISOString());
}

function showStudentDone(dateIso) {
  hideAllStudentPanels();
  $("student-done").hidden = false;
  $("done-meta").textContent = "Inviato il " + new Date(dateIso).toLocaleString("it-IT");
}

/* --- Persistenza nella scheda (sopravvive a un refresh accidentale) --- */
function stateKey(qid) { return "qp_state_" + qid; }
function persistQuizState() {
  try {
    sessionStorage.setItem(stateKey(S.quiz.id), JSON.stringify({
      answers: S.answers, idx: S.idx, deadline: S.deadline,
    }));
  } catch (_) {}
}
function loadQuizState(qid) {
  try {
    const raw = sessionStorage.getItem(stateKey(qid));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function clearQuizState(qid) {
  try { sessionStorage.removeItem(stateKey(qid)); } catch (_) {}
}

/* ============================================================================
   VISTA PROFESSORE
   ========================================================================== */

async function loadTeacher() {
  const body = $("students-body");
  body.innerHTML = `<tr><td colspan="6" class="muted center">Caricamento…</td></tr>`;

  const [profRes, quizRes, respRes] = await Promise.all([
    db.from("profiles").select("*").eq("role", "student").order("created_at", { ascending: true }),
    db.from("quizzes").select("*"),
    db.from("responses").select("*"),
  ]);

  if (profRes.error) {
    body.innerHTML = `<tr><td colspan="6" class="muted center">Errore: ${escapeHtml(profRes.error.message)}</td></tr>`;
    return;
  }

  S.students = profRes.data || [];
  S.quizzesByStudent = {};
  (quizRes.data || []).forEach((q) => (S.quizzesByStudent[q.student_id] = q));
  S.responsesByStudent = {};
  (respRes.data || []).forEach((r) => (S.responsesByStudent[r.student_id] = r));

  renderStudents();
}

function renderStudents() {
  const body = $("students-body");
  const nQuiz = Object.keys(S.quizzesByStudent).length;
  const nResp = Object.keys(S.responsesByStudent).length;
  $("teacher-stats").textContent =
    `${S.students.length} studenti · ${nQuiz} questionari · ${nResp} risposte ricevute`;

  if (S.students.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="muted center">Nessuno studente. Aggiungine uno qui sopra.</td></tr>`;
    return;
  }

  body.innerHTML = S.students.map((s) => {
    const quiz = S.quizzesByStudent[s.id];
    const resp = S.responsesByStudent[s.id];
    const quizPill = quiz
      ? `<span class="pill pill-quiz">${quiz.questions.length} domande</span>`
      : `<span class="pill pill-wait">—</span>`;
    const respPill = resp
      ? `<span class="pill pill-ok">Inviata</span>`
      : `<span class="pill pill-wait">In attesa</span>`;
    const timeInput = `<input type="number" min="0" class="time-input" data-act="time" data-id="${s.id}"
        value="${quiz ? (quiz.time_limit_minutes || 0) : 0}" ${quiz ? "" : "disabled"} />`;
    return `
      <tr>
        <td class="st-name">${escapeHtml(s.full_name || "—")}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${quizPill}</td>
        <td>${timeInput}</td>
        <td>${respPill}</td>
        <td>
          <div class="cell-actions">
            <button class="btn btn-ghost btn-sm" data-act="upload" data-id="${s.id}">
              ${quiz ? "Sostituisci .docx" : "Carica .docx"}
            </button>
            <button class="btn btn-ghost btn-sm" data-act="preview" data-id="${s.id}" ${quiz ? "" : "disabled"}>
              Anteprima
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

/* ----------------------- Aggiungi studente ------------------------------- */

async function handleAddStudent(e) {
  e.preventDefault();
  const name = $("st-name").value.trim();
  const email = $("st-email").value.trim();
  const password = $("st-password").value;
  const msg = $("teacher-msg");
  msg.className = "msg"; msg.textContent = "";

  if (password.length < 6) { msg.className = "msg error"; msg.textContent = "Password minimo 6 caratteri."; return; }
  setLoading("add-student-btn", true);

  // client temporaneo: non sostituisce la sessione del professore
  const tempClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "sb-temp-signup" },
  });
  const { error } = await tempClient.auth.signUp({
    email, password, options: { data: { full_name: name, role: "student" } },
  });
  setLoading("add-student-btn", false, "Aggiungi");

  if (error) { msg.className = "msg error"; msg.textContent = traduciErroreAuth(error); return; }

  $("add-student-form").reset();
  toast("Studente aggiunto: " + name);
  await sleep(500);
  loadTeacher();
}

/* --------------------- Tempo massimo per test ---------------------------- */

async function saveTimeLimit(studentId, minutes) {
  const val = Math.max(0, parseInt(minutes, 10) || 0);
  const { error } = await db.from("quizzes").update({ time_limit_minutes: val }).eq("student_id", studentId);
  if (error) { toast("Errore nel salvataggio del tempo.", true); return; }
  if (S.quizzesByStudent[studentId]) S.quizzesByStudent[studentId].time_limit_minutes = val;
  toast(val > 0 ? `Tempo impostato: ${val} min.` : "Nessun limite di tempo.");
}

/* --------------------- Upload + parsing .docx ---------------------------- */

function triggerUpload(studentId) {
  S.uploadTarget = studentId;
  const input = $("docx-input");
  input.value = "";
  input.click();
}

async function handleDocxSelected(e) {
  const file = e.target.files[0];
  const studentId = S.uploadTarget;
  if (!file || !studentId) return;

  toast("Analisi del file in corso…");
  let parsed;
  try { parsed = await parseDocxFile(file); }
  catch (err) { toast("Impossibile leggere il file .docx.", true); return; }

  const { intro, questions, timeLimit } = parsed;
  if (!questions.length) {
    toast("Nessuna domanda riconosciuta. Controlla il formato del file.", true);
    return;
  }

  const senzaRisposta = questions.filter((q) => !q.correct).length;
  const title = file.name.replace(/\.docx$/i, "");
  const existing = S.quizzesByStudent[studentId];
  // preserva il tempo già impostato; se nuovo, usa l'eventuale "Tempo:" del docx
  const time_limit_minutes = existing ? (existing.time_limit_minutes || 0) : (timeLimit || 0);

  const { error } = await db.from("quizzes").upsert(
    { student_id: studentId, title, intro, questions, time_limit_minutes, created_by: S.user.id },
    { onConflict: "student_id" }
  );
  if (error) { toast("Errore nel salvataggio: " + error.message, true); return; }

  let m = `Caricate ${questions.length} domande.`;
  if (senzaRisposta > 0) m += ` Attenzione: ${senzaRisposta} senza "Risposta:".`;
  toast(m);
  loadTeacher();
}

async function parseDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return parseQuizText(result.value);
}

/**
 * Trasforma il testo grezzo del .docx in { intro, questions, timeLimit }.
 *   (testo libero iniziale -> introduzione)
 *   Tempo: 30                       (opzionale)
 *   1. Testo della domanda?
 *   a) opzione A   b) opzione B ...
 *   Risposta: b
 */
function parseQuizText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const questions = [];
  const introLines = [];
  let current = null;
  let timeLimit = 0;

  const reAnswer = /^(?:risposta|soluzione)\s*(?:corretta)?\s*[:.\-]?\s*([a-dA-D])\b/i;
  const reQuestion = /^(\d+)\s*[\.\)\-]\s*(.+)$/;
  const reOption = /^([a-dA-D])\s*[\)\.\-]\s*(.+)$/;
  const reTime = /^(?:tempo|durata)\s*(?:massimo)?\s*[:.\-]?\s*(\d+)\s*(?:min|minuti)?\b/i;

  for (const line of lines) {
    let m;
    if (!current && (m = line.match(reTime))) {
      timeLimit = parseInt(m[1], 10);
    } else if ((m = line.match(reAnswer))) {
      if (current) current.correct = m[1].toLowerCase();
    } else if ((m = line.match(reQuestion))) {
      if (current) questions.push(current);
      current = { number: parseInt(m[1], 10), text: m[2].trim(), options: [], correct: null };
    } else if ((m = line.match(reOption))) {
      if (current) current.options.push({ key: m[1].toLowerCase(), text: m[2].trim() });
    } else if (current) {
      if (current.options.length > 0) current.options[current.options.length - 1].text += " " + line;
      else current.text += " " + line;
    } else {
      introLines.push(line); // testo prima della prima domanda = introduzione
    }
  }
  if (current) questions.push(current);

  return {
    intro: introLines.join("\n"),
    timeLimit,
    questions: questions.filter((q) => q.options.length >= 2),
  };
}

/* ----------------------------- Anteprima -------------------------------- */

function openPreview(studentId) {
  const quiz = S.quizzesByStudent[studentId];
  const student = S.students.find((s) => s.id === studentId);
  if (!quiz) return;

  $("preview-title").textContent = "Anteprima · " + (student?.full_name || student?.email || "");
  const introHtml = quiz.intro
    ? `<div class="preview-q"><div class="preview-q-text">Introduzione</div>
         <div class="preview-opt">${escapeHtml(quiz.intro).replace(/\n/g, "<br/>")}</div></div>`
    : "";
  const tlHtml = (quiz.time_limit_minutes || 0) > 0
    ? `<div class="preview-q"><div class="preview-q-text">Tempo massimo: ${quiz.time_limit_minutes} minuti</div></div>`
    : "";
  const qsHtml = quiz.questions.map((q) => {
    const opts = (q.options || []).map((o) => {
      const correct = o.key === q.correct ? " correct" : "";
      return `<div class="preview-opt${correct}">${escapeHtml(o.key)}) ${escapeHtml(o.text)}</div>`;
    }).join("");
    return `<div class="preview-q"><div class="preview-q-text">${q.number}. ${escapeHtml(q.text)}</div>${opts}</div>`;
  }).join("");

  $("preview-body").innerHTML = introHtml + tlHtml + qsHtml;
  $("preview-modal").hidden = false;
}
function closePreview() { $("preview-modal").hidden = true; }

/* ------------------------- Export in Excel ------------------------------ */

function computeScore(quiz, resp) {
  let points = 0, correct = 0, wrong = 0, blank = 0;
  for (const q of quiz.questions) {
    const chosen = resp ? resp.answers[String(q.number)] : undefined;
    if (!chosen) { blank++; points += POINTS.blank; }
    else if (chosen === q.correct) { correct++; points += POINTS.correct; }
    else { wrong++; points += POINTS.wrong; }
  }
  return { points, correct, wrong, blank, total: quiz.questions.length, max: quiz.questions.length * POINTS.correct };
}

function exportExcel() {
  if (S.students.length === 0) { toast("Nessun dato da esportare.", true); return; }
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  // --- Riepilogo ---
  const summary = [["Nome", "Email", "Questionario", "Risposta", "Corrette", "Sbagliate", "Vuote", "Punteggio", "Max", "Data invio"]];
  for (const s of S.students) {
    const quiz = S.quizzesByStudent[s.id];
    const resp = S.responsesByStudent[s.id];
    let row = [s.full_name || "", s.email, quiz ? `Sì (${quiz.questions.length})` : "No", resp ? "Sì" : "No", "", "", "", "", "", ""];
    if (quiz && resp) {
      const sc = computeScore(quiz, resp);
      row = [s.full_name || "", s.email, `Sì (${quiz.questions.length})`, "Sì",
             sc.correct, sc.wrong, sc.blank, sc.points, sc.max,
             new Date(resp.submitted_at).toLocaleString("it-IT")];
    }
    summary.push(row);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 26 }, { wch: 13 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 7 }, { wch: 10 }, { wch: 6 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Riepilogo");

  // --- Un foglio per studente ---
  const used = new Set(["Riepilogo"]);
  for (const s of S.students) {
    const quiz = S.quizzesByStudent[s.id];
    if (!quiz) continue;
    const resp = S.responsesByStudent[s.id];

    const rows = [["N.", "Domanda", "Risposta studente", "Risposta corretta", "Esito", "Punti"]];
    for (const q of quiz.questions) {
      const chosen = resp ? (resp.answers[String(q.number)] || "") : "";
      let esito = "—", punti = "";
      if (resp) {
        if (!chosen) { esito = "Non risposta"; punti = POINTS.blank; }
        else if (chosen === q.correct) { esito = "Corretto"; punti = POINTS.correct; }
        else { esito = "Errato"; punti = POINTS.wrong; }
      }
      rows.push([q.number, q.text, chosen || "(vuoto)", q.correct || "", esito, punti]);
    }
    if (resp) {
      const sc = computeScore(quiz, resp);
      rows.push([]);
      rows.push(["", "TOTALE", "", "", `${sc.correct} giuste · ${sc.wrong} sbagliate · ${sc.blank} vuote`, sc.points]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 56 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 7 }];
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(s.full_name || s.email, used));
  }

  XLSX.writeFile(wb, `quizportal_risultati_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function uniqueSheetName(raw, used) {
  let name = String(raw || "Studente").replace(/[\\\/\?\*\[\]:]/g, " ").trim().slice(0, 28) || "Studente";
  let candidate = name, i = 2;
  while (used.has(candidate)) { candidate = name.slice(0, 25) + " " + i; i++; }
  used.add(candidate);
  return candidate;
}

/* ============================================================================
   WIRING / AVVIO
   ========================================================================== */

function attachListeners() {
  // auth
  $("auth-form").addEventListener("submit", handleAuthSubmit);
  $("auth-toggle-btn").addEventListener("click", () =>
    setAuthMode(S.authMode === "login" ? "register" : "login"));
  $("logout-btn").addEventListener("click", handleLogout);

  // studente
  $("intro-start").addEventListener("click", startQuiz);
  $("q-prev").addEventListener("click", () => { if (S.idx > 0) goToQuestion(S.idx - 1); });
  $("q-next").addEventListener("click", () => { if (S.idx < S.quiz.questions.length - 1) goToQuestion(S.idx + 1); });
  $("q-clear").addEventListener("click", clearAnswer);
  $("q-submit").addEventListener("click", () => submitQuiz(false));

  // professore
  $("add-student-form").addEventListener("submit", handleAddStudent);
  $("refresh-btn").addEventListener("click", loadTeacher);
  $("export-btn").addEventListener("click", exportExcel);
  $("docx-input").addEventListener("change", handleDocxSelected);

  $("students-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "upload") triggerUpload(btn.dataset.id);
    if (btn.dataset.act === "preview") openPreview(btn.dataset.id);
  });
  $("students-body").addEventListener("change", (e) => {
    const inp = e.target.closest('input[data-act="time"]');
    if (inp) saveTimeLimit(inp.dataset.id, inp.value);
  });

  // modale
  $("preview-close").addEventListener("click", closePreview);
  $("preview-modal").addEventListener("click", (e) => { if (e.target.id === "preview-modal") closePreview(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePreview(); });
}

function checkConfig() {
  if (
    !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") ||
    !CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_KEY.includes("YOUR-ANON")
  ) {
    $("auth-msg").className = "msg error";
    $("auth-msg").textContent = "Configura js/config.js con i dati del tuo progetto Supabase.";
    return false;
  }
  return true;
}

function init() {
  attachListeners();
  setAuthMode("login");
  showView("auth");
  if (!checkConfig()) return;

  db.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showView("auth");
    else if (["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) route();
  });
}

document.addEventListener("DOMContentLoaded", init);
