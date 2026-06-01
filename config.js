// ============================================================================
//  QuizPortal — configurazione
//  Compila i tre valori qui sotto. Questo file è l'UNICO da modificare.
// ============================================================================

const CONFIG = {
  // Supabase -> Project Settings -> Data API -> Project URL
  SUPABASE_URL: "https://lvfqnuuzyhdktgidkvke.supabase.co",

  // Supabase -> Project Settings -> API Keys -> chiave "anon public".
  // È sicuro esporla nel frontend: l'accesso ai dati è protetto da RLS.
  SUPABASE_KEY: "sb_publishable_jtLoHg_ADq3Y9gXF3xfQOg_O3HDgqDO",

  // Email dell'account professore.
  // DEVE essere identica a quella scritta in supabase_setup.sql
  // (funzione handle_new_user, riga "CHANGE_ME@example.com").
  TEACHER_EMAIL: "andrea.delcadia@acm-e.com",
};
