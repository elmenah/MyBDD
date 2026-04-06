const { createClient } = require('@supabase/supabase-js');

let supabase;

function initDB() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas.');
  }

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  return supabase;
}

module.exports = { initDB };
