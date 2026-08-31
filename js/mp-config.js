/* ===========================================================
   Clés Supabase (publiques — la "anon key" est faite pour être
   dans le code client ; c'est la sécurité RLS de la base qui
   protège les données).
   NE JAMAIS mettre le "Client Secret" Discord ici : il reste
   uniquement dans la config du provider Discord sur Supabase.
   =========================================================== */

window.MP_CONFIG = {
  SUPABASE_URL: 'https://ayptnkxkzvntijgzcatx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5cHRua3hrenZudGlqZ3pjYXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzQzNTksImV4cCI6MjEwMzUxMDM1OX0.6_dtv62mYiHgtVJoEzuyszIrk-aHRtTHfKoJwyHuDmo',

  // Où Discord/Supabase renvoient après connexion, selon la plateforme.
  REDIRECT_ELECTRON: 'http://localhost:8788/evelatro-auth',
  REDIRECT_NATIVE: 'com.eve.evelatro.demo://auth',
};
