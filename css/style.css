/* ============================================================================
   QuizPortal — style.css
   Aesthetic: editorial / "carta d'esame" — avorio caldo, inchiostro, ocra.
   ========================================================================== */

:root {
  /* Palette ACM-e (logo: #3f6aa1 blu, #4cbcee azzurro) */
  --paper:      #eef3f9;
  --paper-2:    #ffffff;
  --ink:        #1b2733;
  --ink-soft:   #45525f;
  --muted:      #74828f;
  --line:       #e1e9f2;
  --line-2:     #cad7e6;
  --ochre:      #3f6aa1;   /* accent principale ACM-e */
  --ochre-dk:   #335887;
  --brand-lt:   #4cbcee;   /* azzurro chiaro ACM-e */
  --olive:      #3f6aa1;
  --green:      #2f8f5b;
  --red:        #c0392b;
  --shadow:     0 1px 2px rgba(32,33,29,.05), 0 14px 40px -22px rgba(32,33,29,.35);
  --radius:     14px;
  --radius-sm:  9px;
}

* { box-sizing: border-box; }

/* Garantisce che gli elementi con attributo "hidden" restino davvero nascosti,
   anche quando hanno display:flex / display:grid (topbar, modale, campo nome). */
[hidden] { display: none !important; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Hanken Grotesk", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

/* atmosfera: leggera trama + alone caldo */
body {
  background-image:
    radial-gradient(1100px 700px at 85% -10%, #dceaf8 0%, transparent 60%),
    radial-gradient(900px 600px at -10% 110%, #e3edf8 0%, transparent 55%);
  background-attachment: fixed;
  min-height: 100vh;
}
.grain {
  position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: .5;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  mix-blend-mode: multiply;
}

h1, h2, h3 { font-family: "Fraunces", Georgia, serif; font-weight: 600; letter-spacing: -.01em; }
.muted { color: var(--muted); }
.center { text-align: center; }
.ta-right { text-align: right; }

/* ----------------------------- Topbar ----------------------------------- */
.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px clamp(16px, 5vw, 56px);
  background: rgba(247,241,230,.82);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark { color: var(--ochre); font-size: 18px; }
.brand-name { font-family: "Fraunces", serif; font-weight: 600; font-size: 20px; letter-spacing: -.02em; }
.topbar-right { display: flex; align-items: center; gap: 14px; }
.who { font-size: 14px; color: var(--ink-soft); }

/* ------------------------------ Shell ----------------------------------- */
.shell {
  position: relative; z-index: 1;
  max-width: 980px;
  margin: 0 auto;
  padding: clamp(20px, 5vw, 48px) clamp(16px, 5vw, 40px) 80px;
}
.view { animation: rise .5s cubic-bezier(.2,.7,.2,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(10px);} to { opacity: 1; transform: none;} }

/* ------------------------------ Buttons --------------------------------- */
.btn {
  font-family: inherit; font-size: 15px; font-weight: 600;
  border: 1px solid transparent; border-radius: 999px;
  padding: 10px 18px; cursor: pointer;
  transition: transform .12s ease, background .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.btn:active { transform: translateY(1px); }
.btn-primary { background: var(--ochre); color: #fff; box-shadow: 0 8px 18px -10px var(--ochre); }
.btn-primary:hover { background: var(--ochre-dk); }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--line-2); }
.btn-ghost:hover { background: #1b27330a; border-color: var(--ink-soft); }
.btn-block { width: 100%; padding: 13px; }
.btn-sm { padding: 7px 13px; font-size: 13.5px; }
.btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.link {
  background: none; border: none; color: var(--ochre-dk); font: inherit;
  font-weight: 600; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; padding: 0;
}

/* ------------------------------- Auth ----------------------------------- */
#auth-view { display: grid; place-items: center; min-height: 72vh; }
.auth-card {
  width: 100%; max-width: 410px;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 38px 34px 30px;
  box-shadow: var(--shadow);
  text-align: center;
}
.auth-mark {
  width: 52px; height: 52px; margin: 0 auto 14px; border-radius: 14px;
  display: grid; place-items: center; font-size: 22px;
  color: #fff; background: linear-gradient(150deg, var(--brand-lt), var(--ochre-dk));
  box-shadow: 0 10px 22px -10px var(--ochre);
}
.auth-title { margin: 0; font-size: 32px; }
.auth-sub { margin: 4px 0 26px; color: var(--muted); }
.form { display: grid; gap: 15px; text-align: left; }
.field { display: grid; gap: 6px; }
.field span { font-size: 13px; font-weight: 600; color: var(--ink-soft); }
input[type=text], input[type=email], input[type=password] {
  font: inherit; color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line-2); border-radius: var(--radius-sm);
  padding: 11px 13px; width: 100%;
  transition: border-color .15s ease, box-shadow .15s ease;
}
input:focus { outline: none; border-color: var(--ochre); box-shadow: 0 0 0 3px rgba(194,104,58,.15); }
input::placeholder { color: #9aa7b5; }
.auth-toggle { margin-top: 20px; font-size: 14px; color: var(--muted); }
.msg { min-height: 20px; font-size: 14px; margin: 12px 0 0; }
.msg.error { color: var(--red); }
.msg.ok { color: var(--green); }

/* ------------------------------ Panels ---------------------------------- */
.panel {
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 24px 26px;
  box-shadow: var(--shadow);
  margin-bottom: 22px;
}
.panel-title { margin: 0 0 16px; font-size: 21px; }
.panel-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.panel-title-row .panel-title { margin: 0; }
.center-panel { text-align: center; padding: 56px 30px; }
.big-emoji { font-size: 48px; margin-bottom: 8px; }

/* ----------------------------- Teacher ---------------------------------- */
.teacher-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px; margin-bottom: 24px; flex-wrap: wrap;
}
.page-title { margin: 0; font-size: 34px; }
.row-form { display: flex; gap: 10px; flex-wrap: wrap; }
.row-form input { flex: 1 1 160px; }
.row-form .btn { flex: 0 0 auto; }

.table-wrap { overflow-x: auto; margin: 0 -6px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 620px; }
.data-table th {
  text-align: left; font-weight: 600; color: var(--muted);
  font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
  padding: 0 12px 10px; border-bottom: 1px solid var(--line-2);
}
.data-table td { padding: 13px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.st-name { font-weight: 600; }
.cell-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

.pill { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.pill-ok    { background: #dff0e6; color: var(--green); }
.pill-wait  { background: #eef2f7; color: var(--muted); }
.pill-quiz  { background: #e1ecf7; color: var(--ochre-dk); }

/* ------------------------------- Quiz ----------------------------------- */
.quiz-panel { max-width: 700px; margin: 6px auto 0; padding: 32px 34px 30px; }
.quiz-head { margin-bottom: 26px; }
.quiz-progress-text { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 9px; letter-spacing: .02em; }
.progress { height: 8px; background: var(--line); border-radius: 999px; overflow: hidden; }
.progress-bar { height: 100%; width: 0; background: linear-gradient(90deg, var(--brand-lt), var(--ochre)); border-radius: 999px; transition: width .4s cubic-bezier(.2,.7,.2,1); }

.q-text { font-size: 25px; line-height: 1.3; margin: 0 0 22px; }
.options { display: grid; gap: 11px; margin-bottom: 28px; }
.option {
  display: flex; align-items: center; gap: 14px;
  text-align: left; width: 100%;
  background: var(--paper); border: 1.5px solid var(--line-2);
  border-radius: var(--radius-sm); padding: 15px 16px;
  font: inherit; color: var(--ink); cursor: pointer;
  transition: border-color .15s ease, background .15s ease, transform .12s ease;
}
.option:hover { border-color: var(--ink-soft); transform: translateX(2px); }
.option .key {
  flex: 0 0 30px; height: 30px; border-radius: 8px;
  display: grid; place-items: center; font-weight: 700; font-size: 14px;
  background: #dde8f4; color: var(--ink-soft); text-transform: uppercase;
  transition: background .15s ease, color .15s ease;
}
.option.selected { border-color: var(--ochre); background: #e4eef9; }
.option.selected .key { background: var(--ochre); color: #fff; }

.quiz-nav { display: flex; gap: 12px; align-items: center; }
.quiz-nav .btn-ghost { margin-right: auto; }

.check-circle {
  width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 50%;
  display: grid; place-items: center; font-size: 38px; color: #fff;
  background: linear-gradient(150deg, var(--green), #2f6340);
  box-shadow: 0 14px 30px -14px var(--green);
}
.done-meta { margin-top: 14px; font-size: 13.5px; color: var(--muted); }

/* ------------------------------ Modal ----------------------------------- */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(32,33,29,.45); backdrop-filter: blur(3px);
  display: grid; place-items: center; padding: 20px;
  animation: fade .2s ease both;
}
@keyframes fade { from { opacity: 0;} to { opacity: 1;} }
.modal {
  width: 100%; max-width: 620px; max-height: 86vh; display: flex; flex-direction: column;
  background: var(--paper-2); border: 1px solid var(--line-2);
  border-radius: var(--radius); box-shadow: 0 30px 70px -30px rgba(0,0,0,.5);
  overflow: hidden;
}
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.modal-head h3 { margin: 0; font-size: 19px; }
.modal-body { padding: 8px 22px 22px; overflow-y: auto; }

.preview-q { padding: 16px 0; border-bottom: 1px solid var(--line); }
.preview-q:last-child { border-bottom: none; }
.preview-q-text { font-weight: 600; margin-bottom: 8px; }
.preview-opt { padding: 4px 0 4px 20px; color: var(--ink-soft); font-size: 14.5px; }
.preview-opt.correct { color: var(--green); font-weight: 600; }
.preview-opt.correct::before { content: "✓ "; }

/* ------------------------------ Toast ----------------------------------- */
.toast {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
  z-index: 60; background: var(--ink); color: var(--paper-2);
  padding: 12px 20px; border-radius: 999px; font-size: 14px; font-weight: 500;
  box-shadow: 0 16px 34px -16px rgba(0,0,0,.6);
  animation: toastIn .25s ease both;
}
.toast.err { background: var(--red); }
@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 12px);} to { opacity: 1; transform: translate(-50%,0);} }

/* spinner inline */
.spin { display: inline-block; width: 15px; height: 15px; border: 2px solid #ffffff70; border-top-color: #fff; border-radius: 50%; animation: sp .7s linear infinite; vertical-align: -2px; }
@keyframes sp { to { transform: rotate(360deg);} }

/* --------------------------- Responsive --------------------------------- */
@media (max-width: 640px) {
  .auth-card { padding: 30px 22px; }
  .quiz-panel { padding: 24px 20px; }
  .q-text { font-size: 21px; }
  .teacher-head { align-items: stretch; }
  .teacher-head .btn { width: 100%; }
  .row-form { flex-direction: column; }
  .row-form input, .row-form .btn { width: 100%; flex: none; }
  .quiz-nav { flex-wrap: wrap; }
  .quiz-nav .btn { flex: 1 1 auto; }
  .quiz-nav .btn-ghost { margin-right: 0; }
}

/* ============================================================================
   Aggiunte: introduzione, timer, layout a due colonne, riepilogo laterale
   ========================================================================== */

/* --- Schermata introduttiva --- */
.intro-text {
  max-width: 560px; margin: 6px auto 4px; text-align: left;
  white-space: pre-wrap; color: var(--ink-soft); line-height: 1.6;
}
.intro-text:empty { display: none; }
.intro-time { margin: 14px 0 22px; font-weight: 600; }

/* --- Layout a due colonne (domanda + riepilogo) --- */
.quiz-layout {
  display: grid;
  grid-template-columns: 1fr 248px;
  gap: 20px;
  align-items: start;
  max-width: 940px;
  margin: 6px auto 0;
  animation: rise .5s cubic-bezier(.2,.7,.2,1) both;
}
.quiz-main { padding: 30px 32px 26px; }

.quiz-head { margin-bottom: 24px; }
.quiz-head-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.quiz-progress-text { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: .02em; }

/* --- Timer --- */
.timer {
  font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums;
  background: #dde8f4; color: var(--ink-soft);
  padding: 5px 12px; border-radius: 999px; white-space: nowrap;
  transition: background .2s ease, color .2s ease;
}
.timer.danger { background: #fbe2de; color: var(--red); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .55; } }

/* --- Riepilogo laterale --- */
.quiz-aside { padding: 20px 18px; position: sticky; top: 78px; }
.aside-title { margin: 0 0 14px; font-size: 17px; }
.nav-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 56vh; overflow-y: auto; padding-right: 2px; }
.nav-cell {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 7px 2px 5px; border-radius: 9px; cursor: pointer;
  border: 1.5px solid var(--line-2); background: var(--paper);
  font-family: inherit; color: var(--ink); transition: all .12s ease;
}
.nav-cell:hover { border-color: var(--ink-soft); }
.nav-cell .num { font-size: 13px; font-weight: 700; line-height: 1; }
.nav-cell .ans { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; line-height: 1; }
.nav-cell.answered { background: #e4eef9; border-color: var(--ochre); }
.nav-cell.answered .ans { color: var(--ochre-dk); }
.nav-cell.current { box-shadow: 0 0 0 2px var(--ink); border-color: var(--ink); }

.aside-legend { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; font-size: 12.5px; color: var(--muted); }
.aside-legend span { display: flex; align-items: center; gap: 7px; }
.dot { width: 12px; height: 12px; border-radius: 4px; display: inline-block; }
.dot-done { background: #e4eef9; border: 1.5px solid var(--ochre); }
.dot-empty { background: var(--paper); border: 1.5px solid var(--line-2); }

/* --- Campo tempo nella tabella professore --- */
.time-input {
  width: 72px; padding: 7px 9px; text-align: center;
  font: inherit; border: 1px solid var(--line-2); border-radius: 8px; background: var(--paper);
}
.time-input:disabled { opacity: .45; cursor: not-allowed; }
.table-note { font-size: 12.5px; margin: 14px 2px 0; }

/* --- Responsive: impila le due colonne --- */
@media (max-width: 760px) {
  .quiz-layout { grid-template-columns: 1fr; }
  .quiz-aside { position: static; order: 2; }
  .nav-grid { grid-template-columns: repeat(6, 1fr); }
}
@media (max-width: 480px) {
  .nav-grid { grid-template-columns: repeat(5, 1fr); }
}

/* ============================================================================
   Logo ACM-e in basso a destra (pagine del test)
   ========================================================================== */
.acme-badge {
  position: fixed; right: 18px; bottom: 16px; z-index: 30;
  background: rgba(255,255,255,.9); backdrop-filter: blur(6px);
  border: 1px solid var(--line-2); border-radius: 12px;
  padding: 9px 14px; box-shadow: var(--shadow);
  display: flex; align-items: center; gap: 8px;
  pointer-events: none;
}
.acme-badge .acme-label { font-size: 10px; font-weight: 600; color: var(--muted); letter-spacing: .08em; text-transform: uppercase; }
.acme-badge svg { display: block; height: 22px; width: auto; }
@media (max-width: 600px) {
  .acme-badge { right: 10px; bottom: 10px; padding: 7px 10px; }
  .acme-badge svg { height: 18px; }
  .acme-badge .acme-label { display: none; }
}

/* Pulsante elimina */
.btn-danger { background: transparent; color: var(--red); border-color: #e6c4bf; }
.btn-danger:hover { background: #fbe9e6; border-color: var(--red); }
