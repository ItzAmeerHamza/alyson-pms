// Embedded environment configuration for packaged app
// This template is populated at build time with actual credentials
module.exports = {
  VITE_SUPABASE_URL: '{{VITE_SUPABASE_URL}}',
  VITE_SUPABASE_ANON_KEY: '{{VITE_SUPABASE_ANON_KEY}}',
  SUPABASE_URL: '{{SUPABASE_URL}}',
  SUPABASE_ANON_KEY: '{{SUPABASE_ANON_KEY}}'
}; 