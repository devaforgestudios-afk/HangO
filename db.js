// Database removed for now. Export harmless stubs so imports won't break.
async function ensureSchema(){ return true; }
async function ping(){ return true; }
const pool = null;

module.exports = { pool, ensureSchema, ping };
