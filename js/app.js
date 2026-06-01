/* ============================================================================
   QuizPortal — app.js
   Tutta la logica: autenticazione, routing, vista studente, vista professore.
   ========================================================================== */

"use strict";

/* --------------------------- Supabase client ----------------------------- */
const { createClient } = window.supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

/* ------------------------------- Stato ----------------------------------- */
const S = {
  user: null,
  profile: null,
  authMode: "login",          // "login" | "register"
  // studente
  quiz: null,
  idx: 0,
  answers: {},
  // professore
  students: [],
  quizzesByStudent: {},
  responsesByStudent: {},
  uploadTarget: null,
};

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
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
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
        email,
        password,
        options: { data: { full_name: name, role } },
      });
      if (error) throw error;

      if (data.session) {
        // confirm email disattivato: già loggato -> il listener fa il routing
        return;
      }
      // confirm email attivo: serve verifica
      setLoading("auth-submit", false, "Registrati");
      msg.className = "msg ok";
      msg.textContent = "Account creato. Ora puoi accedere.";
      setAuthMode("login");
      $("auth-email").value = email;
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // il listener onAuthStateChange si occupa del routing
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
  await db.auth.signOut();
  Object.assign(S, { user: null, profile: null, quiz: null, idx: 0, answers: {} });
  showView("auth");
  setAuthMode("login");
}

/* ============================================================================
   ROUTING (in base al ruolo del profilo)
   ========================================================================== */

async function route() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { showView("auth"); return; }
  S.user = user;

  // recupera il profilo (con un piccolo retry: il trigger potrebbe essere appena scattato)
  let profile = await fetchProfile(user.id);
  if (!profile) { await sleep(700); profile = await fetchProfile(user.id); }
  S.profile = profile;

  const roleLabel = profile?.role === "teacher" ? "Professore" : "Studente";
  $("who").textContent = `${profile?.full_name || profile?.email || ""} · ${roleLabel}`;

  if (profile?.role === "teacher") {
    showView("teacher");
    loadTeacher();
  } else {
    showView("student");
    loadStudent();
  }
}

async function fetchProfile(id) {
  const { data } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  return data;
}

/* ============================================================================
   VISTA STUDENTE
   ========================================================================== */

async function loadStudent() {
  $("student-quiz").hidden = true;
  $("student-empty").hidden = true;
  $("student-done").hidden = true;

  // ha già risposto?
  const { data: existing } = await db
    .from("responses")
    .select("submitted_at")
    .eq("student_id", S.user.id)
    .maybeSingle();

  if (existing) { showStudentDone(existing.submitted_at); return; }

  // carica il questionario SENZA risposte corrette (RPC security definer)
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
  $("student-quiz").hidden = false;
  renderQuestion();
}

function renderQuestion() {
  const qs = S.quiz.questions;
  const q = qs[S.idx];

  $("q-current").textContent = S.idx + 1;
  $("q-total").textContent = qs.length;
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
      renderQuestion();
    });
    box.appendChild(b);
  });

  $("q-prev").disabled = S.idx === 0;
  const last = S.idx === qs.length - 1;
  $("q-next").hidden = last;
  $("q-submit").hidden = !last;
}

async function submitQuiz() {
  const qs = S.quiz.questions;
  const firstUnanswered = qs.findIndex((q) => !S.answers[q.number]);
  if (firstUnanswered !== -1) {
    S.idx = firstUnanswered;
    renderQuestion();
    toast("Rispondi a tutte le domande prima di inviare.", true);
    return;
  }
  if (!confirm("Inviare le risposte? Dopo l'invio non potrai più modificarle.")) return;

  setLoading("q-submit", true);
  const { error } = await db.from("responses").insert({
    quiz_id: S.quiz.id,
    student_id: S.user.id,
    answers: S.answers,
  });
  setLoading("q-submit", false, "Invia risposte");

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
      showStudentDone(new Date().toISOString()); // aveva già inviato
    } else {
      toast("Errore nell'invio: " + error.message, true);
    }
    return;
  }
  showStudentDone(new Date().toISOString());
}

function showStudentDone(dateIso) {
  $("student-quiz").hidden = true;
  $("student-empty").hidden = true;
  $("student-done").hidden = false;
  const d = new Date(dateIso);
  $("done-meta").textContent = "Inviato il " + d.toLocaleString("it-IT");
}

/* ============================================================================
   VISTA PROFESSORE
   ========================================================================== */

async function loadTeacher() {
  const body = $("students-body");
  body.innerHTML = `<tr><td colspan="5" class="muted center">Caricamento…</td></tr>`;

  const [profRes, quizRes, respRes] = await Promise.all([
    db.from("profiles").select("*").eq("role", "student").order("created_at", { ascending: true }),
    db.from("quizzes").select("*"),
    db.from("responses").select("*"),
  ]);

  if (profRes.error) {
    body.innerHTML = `<tr><td colspan="5" class="muted center">Errore: ${escapeHtml(profRes.error.message)}</td></tr>`;
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
    body.innerHTML = `<tr><td colspan="5" class="muted center">Nessuno studente. Aggiungine uno qui sopra.</td></tr>`;
    return;
  }

  body.innerHTML = S.students
    .map((s) => {
      const quiz = S.quizzesByStudent[s.id];
      const resp = S.responsesByStudent[s.id];
      const quizPill = quiz
        ? `<span class="pill pill-quiz">${quiz.questions.length} domande</span>`
        : `<span class="pill pill-wait">—</span>`;
      const respPill = resp
        ? `<span class="pill pill-ok">Inviata</span>`
        : `<span class="pill pill-wait">In attesa</span>`;
      return `
        <tr>
          <td class="st-name">${escapeHtml(s.full_name || "—")}</td>
          <td>${escapeHtml(s.email)}</td>
          <td>${quizPill}</td>
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
    })
    .join("");
}

/* ----------------------- Aggiungi studente ------------------------------- */

async function handleAddStudent(e) {
  e.preventDefault();
  const name = $("st-name").value.trim();
  const email = $("st-email").value.trim();
  const password = $("st-password").value;
  const msg = $("teacher-msg");
  msg.className = "msg";
  msg.textContent = "";

  if (password.length < 6) { msg.className = "msg error"; msg.textContent = "Password minimo 6 caratteri."; return; }

  setLoading("add-student-btn", true);

  // Client temporaneo: persistSession=false così la registrazione dello studente
  // NON sostituisce la sessione del professore (che resta loggato).
  const tempClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: "sb-temp-signup",
    },
  });

  const { error } = await tempClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, role: "student" } },
  });

  setLoading("add-student-btn", false, "Aggiungi");

  if (error) {
    msg.className = "msg error";
    msg.textContent = traduciErroreAuth(error);
    return;
  }

  $("add-student-form").reset();
  toast("Studente aggiunto: " + name);
  await sleep(500); // dà tempo al trigger di creare il profilo
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
  let questions;
  try {
    questions = await parseDocxFile(file);
  } catch (err) {
    toast("Impossibile leggere il file .docx.", true);
    return;
  }

  if (!questions.length) {
    toast("Nessuna domanda riconosciuta. Controlla il formato del file.", true);
    return;
  }

  const senzaRisposta = questions.filter((q) => !q.correct).length;
  const title = file.name.replace(/\.docx$/i, "");

  const { error } = await db.from("quizzes").upsert(
    { student_id: studentId, title, questions, created_by: S.user.id },
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
 * Trasforma il testo grezzo del .docx in array di domande.
 * Formato atteso:
 *   1. Testo della domanda?
 *   a) opzione A
 *   b) opzione B
 *   c) opzione C
 *   d) opzione D
 *   Risposta: b
 */
function parseQuizText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const questions = [];
  let current = null;

  const reAnswer = /^(?:risposta|soluzione)\s*(?:corretta)?\s*[:.\-]?\s*([a-dA-D])\b/i;
  const reQuestion = /^(\d+)\s*[\.\)\-]\s*(.+)$/;
  const reOption = /^([a-dA-D])\s*[\)\.\-]\s*(.+)$/;

  for (const line of lines) {
    let m;
    if ((m = line.match(reAnswer))) {
      if (current) current.correct = m[1].toLowerCase();
    } else if ((m = line.match(reQuestion))) {
      if (current) questions.push(current);
      current = { number: parseInt(m[1], 10), text: m[2].trim(), options: [], correct: null };
    } else if ((m = line.match(reOption))) {
      if (current) current.options.push({ key: m[1].toLowerCase(), text: m[2].trim() });
    } else if (current) {
      // riga di continuazione: appendi all'ultima opzione o al testo della domanda
      if (current.options.length > 0) {
        current.options[current.options.length - 1].text += " " + line;
      } else {
        current.text += " " + line;
      }
    }
  }
  if (current) questions.push(current);

  // tieni solo domande con almeno 2 opzioni
  return questions.filter((q) => q.options.length >= 2);
}

/* ----------------------------- Anteprima -------------------------------- */

function openPreview(studentId) {
  const quiz = S.quizzesByStudent[studentId];
  const student = S.students.find((s) => s.id === studentId);
  if (!quiz) return;

  $("preview-title").textContent = "Anteprima · " + (student?.full_name || student?.email || "");
  $("preview-body").innerHTML = quiz.questions
    .map((q) => {
      const opts = (q.options || [])
        .map((o) => {
          const correct = o.key === q.correct ? " correct" : "";
          return `<div class="preview-opt${correct}">${escapeHtml(o.key)}) ${escapeHtml(o.text)}</div>`;
        })
        .join("");
      return `
        <div class="preview-q">
          <div class="preview-q-text">${q.number}. ${escapeHtml(q.text)}</div>
          ${opts}
        </div>`;
    })
    .join("");
  $("preview-modal").hidden = false;
}

function closePreview() { $("preview-modal").hidden = true; }

/* ------------------------- Export in Excel ------------------------------ */

function exportExcel() {
  if (S.students.length === 0) { toast("Nessun dato da esportare.", true); return; }

  const wb = window.XLSX.utils.book_new();

  // --- Foglio riepilogo ---
  const summary = [["Nome", "Email", "Questionario", "Risposta", "Punteggio", "Percentuale", "Data invio"]];
  for (const s of S.students) {
    const quiz = S.quizzesByStudent[s.id];
    const resp = S.responsesByStudent[s.id];
    let score = "", pct = "", date = "";

    if (quiz && resp) {
      const { correct, total } = computeScore(quiz, resp);
      score = `${correct}/${total}`;
      pct = total ? Math.round((correct / total) * 100) + "%" : "";
      date = new Date(resp.submitted_at).toLocaleString("it-IT");
    }
    summary.push([
      s.full_name || "",
      s.email,
      quiz ? `Sì (${quiz.questions.length})` : "No",
      resp ? "Sì" : "No",
      score, pct, date,
    ]);
  }
  const wsSummary = window.XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 20 }];
  window.XLSX.utils.book_append_sheet(wb, wsSummary, "Riepilogo");

  // --- Un foglio per studente (con questionario) ---
  const usedNames = new Set(["Riepilogo"]);
  for (const s of S.students) {
    const quiz = S.quizzesByStudent[s.id];
    if (!quiz) continue;
    const resp = S.responsesByStudent[s.id];

    const rows = [["N.", "Domanda", "Risposta studente", "Risposta corretta", "Esito"]];
    for (const q of quiz.questions) {
      const chosen = resp ? (resp.answers[String(q.number)] || "") : "";
      let esito = "—";
      if (resp) esito = chosen === q.correct ? "Corretto" : "Errato";
      rows.push([q.number, q.text, chosen, q.correct || "", esito]);
    }
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
    window.XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(s.full_name || s.email, usedNames));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  window.XLSX.writeFile(wb, `quizportal_risultati_${stamp}.xlsx`);
}

function computeScore(quiz, resp) {
  const total = quiz.questions.length;
  let correct = 0;
  for (const q of quiz.questions) {
    if (resp.answers[String(q.number)] === q.correct) correct++;
  }
  return { correct, total };
}

function uniqueSheetName(raw, used) {
  let name = String(raw || "Studente").replace(/[\\\/\?\*\[\]:]/g, " ").trim().slice(0, 28) || "Studente";
  let candidate = name, i = 2;
  while (used.has(candidate)) {
    candidate = name.slice(0, 25) + " " + i;
    i++;
  }
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
    setAuthMode(S.authMode === "login" ? "register" : "login")
  );
  $("logout-btn").addEventListener("click", handleLogout);

  // studente
  $("q-prev").addEventListener("click", () => { if (S.idx > 0) { S.idx--; renderQuestion(); } });
  $("q-next").addEventListener("click", () => {
    if (S.idx < S.quiz.questions.length - 1) { S.idx++; renderQuestion(); }
  });
  $("q-submit").addEventListener("click", submitQuiz);

  // professore
  $("add-student-form").addEventListener("submit", handleAddStudent);
  $("refresh-btn").addEventListener("click", loadTeacher);
  $("export-btn").addEventListener("click", exportExcel);
  $("docx-input").addEventListener("change", handleDocxSelected);

  $("students-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === "upload") triggerUpload(id);
    if (btn.dataset.act === "preview") openPreview(id);
  });

  // modale
  $("preview-close").addEventListener("click", closePreview);
  $("preview-modal").addEventListener("click", (e) => {
    if (e.target.id === "preview-modal") closePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePreview();
  });
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

  // Routing reattivo: login, logout, sessione iniziale.
  db.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      showView("auth");
    } else if (["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) {
      route();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
