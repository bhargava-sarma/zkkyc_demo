const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function storeUser(name, dobDays, aadhaarHash, nameHash, genderCode) {
  console.log(`[SUPABASE] Inserting user — name: ${name}, hash: ${aadhaarHash.substring(0, 8)}..., gender: ${genderCode}`);

  const insertData = {
    name,
    dob_days: dobDays,
    aadhaar_hash: aadhaarHash,
  };

  // Only include new fields if they have values (for backward compatibility)
  if (nameHash) insertData.name_hash = nameHash;
  if (genderCode !== undefined && genderCode !== null) insertData.gender_code = genderCode;

  const { data, error } = await supabase
    .from('users')
    .insert([insertData])
    .select()
    .single();

  if (error) {
    console.log(`[SUPABASE] Insert FAILED: ${error.message}`);
    throw new Error(`Database error: ${error.message}`);
  }

  console.log(`[SUPABASE] Insert SUCCESS — user ID: ${data.id}`);
  return data;
}

async function getUserById(userId) {
  console.log(`[SUPABASE] Fetching user ID: ${userId}`);

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.log(`[SUPABASE] Fetch FAILED: ${error.message}`);
    throw new Error(`Database error: ${error.message}`);
  }

  console.log(`[SUPABASE] Fetch SUCCESS — user: ${data.name}`);
  return data;
}

module.exports = { storeUser, getUserById };
