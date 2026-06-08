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
  startedAt: null,       // timestamp ms di inizio sessione
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
  const badge = $("acme-badge");
  if (badge) badge.hidden = false;   // logo ACM-e sempre visibile
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

  const roleLabel = profile?.role === "teacher" ? "Professore" : "User";
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
    S.startedAt = saved.startedAt || Date.now();
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
  const tl = S.quiz.time_limit_minutes || 0;   // durata impostata dal professore
  $("intro-time").textContent = tl > 0 ? `Durata: ${tl} minuti` : "Nessun limite di tempo";
  $("student-intro").hidden = false;
}

function startQuiz() {
  S.startedAt = Date.now();
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
    cell.className = "nav-cell" + (given ? " answered" : " empty") + (i === S.idx ? " current" : "");
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
    started_at: S.startedAt ? new Date(S.startedAt).toISOString() : null,
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
      answers: S.answers, idx: S.idx, deadline: S.deadline, startedAt: S.startedAt,
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
            <button class="btn btn-danger btn-sm" data-act="delete" data-id="${s.id}" data-name="${escapeHtml(s.full_name || s.email)}">
              Elimina
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

/* --------------------------- Elimina studente --------------------------- */

async function deleteStudent(studentId, name) {
  if (!confirm(`Eliminare definitivamente lo studente "${name}"?\n\nVerranno cancellati l'account di accesso, il profilo, il questionario e le risposte. L'operazione non è reversibile.`))
    return;

  // funzione nel database (security definer): elimina anche l'utente di login
  const { error } = await db.rpc("delete_student", { target: studentId });
  if (error) { toast("Errore nell'eliminazione: " + error.message, true); return; }

  toast("Studente eliminato: " + name);
  loadTeacher();
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

  const { intro, questions } = parsed;
  if (!questions.length) {
    toast("Nessuna domanda riconosciuta. Controlla il formato del file.", true);
    return;
  }

  const senzaRisposta = questions.filter((q) => !q.correct).length;
  const title = file.name.replace(/\.docx$/i, "");
  const existing = S.quizzesByStudent[studentId];
  // la durata la gestisce il professore dalla tabella: qui la lasciamo invariata
  const time_limit_minutes = existing ? (existing.time_limit_minutes || 0) : 0;

  const { error } = await db.from("quizzes").upsert(
    { student_id: studentId, title, intro, questions, time_limit_minutes, created_by: S.user.id },
    { onConflict: "student_id" }
  );
  if (error) { toast("Errore nel salvataggio: " + error.message, true); return; }

  let m = `Caricate ${questions.length} domande con le relative risposte corrette.`;
  if (senzaRisposta > 0)
    m = `Caricate ${questions.length} domande, ma ${senzaRisposta} senza risposta corretta riconosciuta. Controlla che ci sia una riga "Risposta: <lettera>".`;
  toast(m, senzaRisposta > 0);
  loadTeacher();
}

async function parseDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  // Leggiamo direttamente word/document.xml così cogliamo anche l'EVIDENZIATORE
  // VERDE (che la sola estrazione di testo perderebbe).
  try {
    if (window.JSZip) {
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const entry = zip.file("word/document.xml");
      if (entry) {
        const xml = await entry.async("string");
        const parsed = parseQuizParagraphs(extractDocxParagraphs(xml));
        if (parsed.questions.length) return parsed;
      }
    }
  } catch (e) {
    /* se qualcosa va storto, si ripiega sul solo testo qui sotto */
  }
  // Ripiego: solo testo via mammoth (formati con ✓ o riga "Risposta:")
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return parseQuizText(result.value);
}

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

// Estrae i paragrafi del .docx come { text, green }.
// green = true se nel paragrafo c'è un run evidenziato in verde.
function extractDocxParagraphs(xml) {
  const paras = [];
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pm;
  while ((pm = pRe.exec(xml)) !== null) {
    const body = pm[1];
    let text = "";
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm;
    while ((tm = tRe.exec(body)) !== null) text += decodeXmlEntities(tm[1]);
    const green = /<w:highlight\s+w:val="[^"]*[Gg]reen[^"]*"\s*\/?>/.test(body);
    paras.push({ text: text.trim(), green });
  }
  return paras;
}

// Versione testuale (ripiego mammoth): nessuna info di evidenziatore.
function parseQuizText(text) {
  const paras = text.split(/\r?\n/).map((l) => ({ text: l.trim(), green: false }));
  return parseQuizParagraphs(paras);
}

/**
 * Nucleo del parsing. Riconosce la risposta corretta in TRE modi:
 *   1) opzione EVIDENZIATA IN VERDE          (paragrafo con green = true)
 *   2) un segno di spunta ✓ davanti:  ✓ C) testo
 *   3) una riga dedicata:  Risposta: c   (anche "Risposta corretta: C", "Soluzione: c")
 * Domande numerate (1.), opzioni a)/A). La durata la imposta il professore.
 */
function parseQuizParagraphs(paras) {
  const questions = [];
  const introLines = [];
  let current = null;

  const reAnswerStart = /^(?:risposta|risp\.?|soluzione|sol\.?|corretta|esatta|giusta|answer)\b/i;
  const reQuestion = /^(\d+)\s*[\.\)\-]\s*(.+)$/;
  const reOption = /^([\u2713\u2714\u2705\u221A\u2611])?\s*([A-Da-d])\s*[\)\.\-]\s*(.+)$/;

  for (const para of paras) {
    const line = para.text;
    if (!line) continue;
    const mq = reQuestion.exec(line);
    const mo = reOption.exec(line);

    if (mq && !mo) {
      if (current) questions.push(current);
      current = { number: parseInt(mq[1], 10), text: mq[2].trim(), options: [], correct: null };
    } else if (mo) {
      const marker = mo[1];
      const key = mo[2].toLowerCase();
      if (current) {
        current.options.push({ key, text: mo[3].trim() });
        if (marker || para.green) current.correct = key;   // ✓ oppure evidenziatore verde
      }
    } else if (current && reAnswerStart.test(line)) {
      const lm = line.match(/\b([a-dA-D])\b/);
      if (lm) current.correct = lm[1].toLowerCase();
    } else if (current) {
      if (current.options.length > 0) current.options[current.options.length - 1].text += " " + line;
      else current.text += " " + line;
    } else {
      introLines.push(line);
    }
  }
  if (current) questions.push(current);

  return {
    intro: introLines.join("\n"),
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

// Mappatura banca (prefisso del codice domanda) -> ruolo, nell'ordine dei fogli ISS.
const ROLE_BANKS = [
  { code: "TL",  role: "Site TS Lead" },
  { code: "ST",  role: "Sup. Tecnico" },
  { code: "SP",  role: "Sup. Presidio" },
  { code: "HD1", role: "Help Desk L1" },
  { code: "HD2", role: "Help Desk L2" },
  { code: "IQ",  role: "Ispettore Q/HSE" },
  { code: "SC",  role: "Scheduler" },
  { code: "EAM", role: "EAM Manager" },
  { code: "IM",  role: "Ing. Manutenzione" },
  { code: "NP",  role: "Prev./Nuovi Proj." },
];

// Banca di una domanda = prefisso del codice prima del trattino ([SC-05] -> SC).
function bancaOf(text) {
  const c = questionCode(text);
  const i = c.indexOf("-");
  return (i > 0 ? c.slice(0, i) : c).toUpperCase();
}

// Per uno studente, % per ruolo = corrette nella banca / domande della banca (nel suo test).
// Restituisce un array di 10 valori (frazione 0..1) o null se la banca non è nel test.
function roleValues(quiz, resp) {
  const tot = {}, ok = {};
  for (const q of quiz.questions) {
    const b = bancaOf(q.text);
    tot[b] = (tot[b] || 0) + 1;
    const chosen = resp ? resp.answers[String(q.number)] : undefined;
    if (chosen && chosen === q.correct) ok[b] = (ok[b] || 0) + 1;
  }
  return ROLE_BANKS.map((rb) => (tot[rb.code] > 0 ? (ok[rb.code] || 0) / tot[rb.code] : null));
}

function exportExcel() {
  if (S.students.length === 0) { toast("Nessun dato da esportare.", true); return; }
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const fmt = (d) => (d ? new Date(d).toLocaleString("it-IT") : "");

  addIssSheets(wb, XLSX);   // fogli "Risultati" e "Radar" in stile ISS

  // --- Riepilogo ---
  const summary = [["Nome", "Email", "Questionario", "Risposta", "Corrette", "Sbagliate", "Vuote",
                    "Punteggio", "Max", "%", "Inizio sessione", "Fine sessione"]];
  for (const s of S.students) {
    const quiz = S.quizzesByStudent[s.id];
    const resp = S.responsesByStudent[s.id];
    let row = [s.full_name || "", s.email, quiz ? `Sì (${quiz.questions.length})` : "No",
               resp ? "Sì" : "No", "", "", "", "", "", "", "", ""];
    if (quiz && resp) {
      const sc = computeScore(quiz, resp);
      let pct = sc.max ? Math.round((sc.points / sc.max) * 100) : 0;
      if (pct < 0) pct = 0;                       // percentuale negativa -> 0%
      row = [s.full_name || "", s.email, `Sì (${quiz.questions.length})`, "Sì",
             sc.correct, sc.wrong, sc.blank, sc.points, sc.max, pct + "%",
             fmt(resp.started_at), fmt(resp.submitted_at)];
    }
    summary.push(row);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 26 }, { wch: 13 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
                        { wch: 7 }, { wch: 10 }, { wch: 6 }, { wch: 7 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Riepilogo");

  // --- Statistiche per domanda (aggregate per codice [SC-xx]) ---
  const stats = {};
  for (const s of S.students) {
    const quiz = S.quizzesByStudent[s.id];
    const resp = S.responsesByStudent[s.id];
    if (!quiz || !resp) continue;                 // solo chi ha consegnato
    for (const q of quiz.questions) {
      const code = questionCode(q.text);
      if (!stats[code]) stats[code] = { code, text: questionLabel(q.text), pres: 0, ok: 0, ko: 0, na: 0 };
      const e = stats[code];
      e.pres++;
      const chosen = resp.answers[String(q.number)];
      if (!chosen) e.na++;
      else if (chosen === q.correct) e.ok++;
      else e.ko++;
    }
  }
  const statRows = Object.values(stats).sort((a, b) => a.code.localeCompare(b.code, "it", { numeric: true }));
  if (statRows.length > 0) {
    const pct = (n, t) => (t ? Math.round((n / t) * 100) + "%" : "0%");
    const rows = [["Codice", "Domanda", "Presenze", "Corrette", "Sbagliate", "Mancate",
                   "% Corrette", "% Sbagliate", "% Mancate"]];
    for (const e of statRows) {
      rows.push([e.code, e.text, e.pres, e.ok, e.ko, e.na,
                 pct(e.ok, e.pres), pct(e.ko, e.pres), pct(e.na, e.pres)]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 50 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 9 },
                   { wch: 11 }, { wch: 12 }, { wch: 11 }];
    XLSX.utils.book_append_sheet(wb, ws, "Statistiche domande");
  }

  // --- Un foglio per studente ---
  const used = new Set(["Riepilogo", "Statistiche domande", "Risultati", "Radar"]);
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

// Codice della domanda: il testo tra parentesi quadre [SC-05]; altrimenti i primi caratteri.
function questionCode(text) {
  const m = String(text).match(/\[([^\]]+)\]/);
  return m ? m[1].trim() : String(text).slice(0, 40).trim();
}
// Testo della domanda senza il codice iniziale, per leggibilità.
function questionLabel(text) {
  return String(text).replace(/^\s*\[[^\]]+\]\s*/, "").trim();
}

// Costruisce i fogli "Risultati" e "Radar" in stile correzione ISS.
function addIssSheets(wb, XLSX) {
  const withQuiz = S.students.filter((s) => S.quizzesByStudent[s.id]);
  if (withQuiz.length === 0) return;

  const nRoles = ROLE_BANKS.length;
  // valori per ruolo di ogni candidato + accumulo per la media
  const perStudent = withQuiz.map((s) => {
    const quiz = S.quizzesByStudent[s.id];
    const resp = S.responsesByStudent[s.id];
    const sc = computeScore(quiz, resp || { answers: {} });
    return { name: s.full_name || s.email, sc, roles: roleValues(quiz, resp) };
  });
  const roleAvg = ROLE_BANKS.map((_, i) => {
    const vals = perStudent.map((p) => p.roles[i]).filter((v) => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  // ---------- Foglio "Risultati" ----------
  const roleNames = ROLE_BANKS.map((r) => r.role);
  const ris = [];
  ris.push(["Correzione Assessment TO-BE — ISS Technical Services"]);
  ris.push(["+3 punti risposta esatta", " 0 nessuna risposta", " -1 risposta errata"]);
  ris.push([]);
  ris.push(["Candidato", "N. Dom.", "Pt. Max", "Corrette", "Errate", "N. Risp.",
            "Pt. Totale", "% su Max", ...roleNames]);
  for (const p of perStudent) {
    const pctMax = p.sc.max ? p.sc.points / p.sc.max : 0;
    ris.push([p.name, p.sc.total, p.sc.max, p.sc.correct, p.sc.wrong, p.sc.blank,
              p.sc.points, pctMax, ...p.roles]);
  }
  ris.push(["Media % per banca (tra chi ha svolto quel ruolo)", "", "", "", "", "", "", "", ...roleAvg]);

  const wsR = XLSX.utils.aoa_to_sheet(ris);
  wsR["!cols"] = [{ wch: 34 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 8 },
                  { wch: 9 }, { wch: 9 }, ...roleNames.map(() => ({ wch: 13 }))];
  applyPercentFormats(wsR, XLSX, 7, 8, 8 + nRoles - 1);   // H = % su Max ; I..R = ruoli
  XLSX.utils.book_append_sheet(wb, wsR, "Risultati");

  // ---------- Foglio "Radar" (tabella dati; il grafico si inserisce in Excel) ----------
  const rad = [["Candidato", ...roleNames]];
  for (const p of perStudent) rad.push([p.name, ...p.roles]);
  rad.push(["Media per banca", ...roleAvg]);

  const wsRad = XLSX.utils.aoa_to_sheet(rad);
  wsRad["!cols"] = [{ wch: 34 }, ...roleNames.map(() => ({ wch: 13 }))];
  applyPercentFormats(wsRad, XLSX, -1, 1, nRoles);        // B..K = ruoli
  XLSX.utils.book_append_sheet(wb, wsRad, "Radar");
}

// Imposta il formato percentuale: colonna pctCol -> 0.0% ; colonne da..a (incluse) -> 0%.
function applyPercentFormats(ws, XLSX, pctCol, roleFrom, roleTo) {
  const ref = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = ref.s.r; R <= ref.e.r; R++) {
    for (let C = ref.s.c; C <= ref.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || cell.t !== "n") continue;
      if (C === pctCol) cell.z = "0.0%";
      else if (C >= roleFrom && C <= roleTo) cell.z = "0%";
    }
  }
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
    if (btn.dataset.act === "delete") deleteStudent(btn.dataset.id, btn.dataset.name);
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
