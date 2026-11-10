/* =====================================================================
   CONFIGURATION — le SEUL fichier à modifier pour brancher Supabase.

   Où trouver ces deux valeurs ?
   Supabase > votre projet > bouton "Connect" (ou Project Settings > API)
     - Project URL           → SUPABASE_URL
     - Publishable key        → SUPABASE_KEY   (commence par sb_publishable_…)
       (ou l'ancienne clé "anon public" si c'est celle qui est affichée)

   Ces deux valeurs sont PUBLIQUES : elles peuvent être sur GitHub sans risque.
   La sécurité est assurée par la base de données (fichier supabase/schema.sql).
   ⚠️ Ne mettez JAMAIS ici la clé "secret" ou "service_role".

   Tant que les deux champs sont vides, le site fonctionne en MODE DÉMO :
   vous pouvez tester la carte, mais aucune commande n'est envoyée.
   ===================================================================== */
window.TLE_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_KEY: ''
};
