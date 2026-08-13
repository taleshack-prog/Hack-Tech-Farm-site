/* js/config.js — configuração pública do front-end.
 *
 * A anon key do Supabase é pública POR DESENHO: quem protege os dados é o
 * Row Level Security (ver supabase/schema.sql), não o segredo da chave.
 * Nunca coloque a service_role key aqui — ela vive só nas variáveis de
 * ambiente das funções em /api.
 *
 * Se você deixar estes campos vazios, o site funciona normalmente lendo
 * data/seed.json. O Supabase é um upgrade, não um pré-requisito.
 */
window.HTF_CONFIG = {
  supabaseUrl: '',      // ex.: https://xxxxxxxx.supabase.co
  supabaseAnonKey: '',  // ex.: eyJhbGciOi...
  siteUrl: 'https://hacktechfarm.com'
};
