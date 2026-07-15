// =========================================================
// Cria o cliente Supabase a partir do config.js.
// Se ainda não foi configurado, window.sb fica null e o site
// roda em modo de pré-visualização (dados locais, sem salvar).
// =========================================================
(function () {
  const cfg = window.DIARY_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('COLE_AQUI');

  if (configured && window.supabase && window.supabase.createClient) {
    window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } else {
    window.sb = null;
    console.warn(
      '[diário] Supabase não configurado ainda — rodando em modo de pré-visualização local. ' +
      'Preencha config.js para ativar login, salvamento e upload de mídia.'
    );
  }
})();
