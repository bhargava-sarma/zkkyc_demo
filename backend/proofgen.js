const snarkjs = require('snarkjs');
const path = require('path');
const fs = require('fs');

const CIRCUITS_DIR = path.join(__dirname, 'circuits');

// Age circuit paths
const AGE_WASM = path.join(CIRCUITS_DIR, 'AgeVerification_js', 'AgeVerification.wasm');
const AGE_ZKEY = path.join(CIRCUITS_DIR, 'age_final.zkey');
const AGE_VKEY = path.join(CIRCUITS_DIR, 'age_vkey.json');
// Fallback for backward compatibility
const AGE_VKEY_LEGACY = path.join(CIRCUITS_DIR, 'verification_key.json');

// Name circuit paths
const NAME_WASM = path.join(CIRCUITS_DIR, 'NameVerification_js', 'NameVerification.wasm');
const NAME_ZKEY = path.join(CIRCUITS_DIR, 'name_final.zkey');
const NAME_VKEY = path.join(CIRCUITS_DIR, 'name_vkey.json');

// Gender circuit paths
const GENDER_WASM = path.join(CIRCUITS_DIR, 'GenderVerification_js', 'GenderVerification.wasm');
const GENDER_ZKEY = path.join(CIRCUITS_DIR, 'gender_final.zkey');
const GENDER_VKEY = path.join(CIRCUITS_DIR, 'gender_vkey.json');

/**
 * Check that required circuit artifacts exist
 */
function checkArtifacts(wasmPath, zkeyPath, vkeyPath, circuitName) {
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`${circuitName} WASM not found. Run the circuit setup script first.`);
  }
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(`${circuitName} zkey not found. Run the circuit setup script first.`);
  }
  if (!fs.existsSync(vkeyPath)) {
    throw new Error(`${circuitName} verification key not found. Run the circuit setup script first.`);
  }
}

/**
 * Generic proof generation and verification
 */
async function runProof(input, wasmPath, zkeyPath, vkeyPath, tag) {
  console.log(`[PROOF:${tag}] Starting proof generation...`);

  const proofStart = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const proofDuration = Date.now() - proofStart;
  console.log(`[PROOF:${tag}] Proof generated in ${proofDuration}ms`);

  const verifyStart = Date.now();
  const vkeyJson = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const isValid = await snarkjs.groth16.verify(vkeyJson, publicSignals, proof);
  const verificationDuration = Date.now() - verifyStart;
  console.log(`[PROOF:${tag}] Verification complete in ${verificationDuration}ms — result: ${isValid ? 'VALID' : 'INVALID'}`);

  return { proof, publicSignals, isValid, proofDuration, verificationDuration };
}

// =============================================
// Age Proof
// =============================================
async function generateProof(dobDays) {
  const vkeyPath = fs.existsSync(AGE_VKEY) ? AGE_VKEY : AGE_VKEY_LEGACY;
  checkArtifacts(AGE_WASM, AGE_ZKEY, vkeyPath, 'AgeVerification');

  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const todayDays = Math.floor(todayMs / (1000 * 60 * 60 * 24));
  const thresholdDays = 6570; // 18 * 365

  const input = { dobDays, todayDays, thresholdDays };
  console.log(`[PROOF:AGE] todayDays: ${todayDays}, threshold: ${thresholdDays}`);

  try {
    const result = await runProof(input, AGE_WASM, AGE_ZKEY, vkeyPath, 'AGE');
    return {
      ...result,
      message: result.isValid ? 'AGE_OVER_18: VERIFIED' : 'VERIFICATION FAILED',
      todayDays,
      thresholdDays,
    };
  } catch (err) {
    console.log(`[PROOF:AGE] Generation FAILED: ${err.message}`);
    if (err.message && err.message.includes('Assert Failed')) {
      throw new Error('Proof generation failed. Age condition not satisfied.');
    }
    throw err;
  }
}

// =============================================
// Name Proof
// =============================================
async function generateNameProof(nameHash, claimedNameHash) {
  checkArtifacts(NAME_WASM, NAME_ZKEY, NAME_VKEY, 'NameVerification');

  const input = { nameHash, claimedNameHash };
  console.log(`[PROOF:NAME] claimedHash: ${claimedNameHash.toString().substring(0, 16)}...`);

  try {
    const result = await runProof(input, NAME_WASM, NAME_ZKEY, NAME_VKEY, 'NAME');
    return {
      ...result,
      message: result.isValid ? 'NAME_MATCH: VERIFIED' : 'NAME VERIFICATION FAILED',
      claimedNameHash,
    };
  } catch (err) {
    console.log(`[PROOF:NAME] Generation FAILED: ${err.message}`);
    if (err.message && err.message.includes('Assert Failed')) {
      throw new Error('Proof generation failed. Name does not match claimed identity.');
    }
    throw err;
  }
}

// =============================================
// Gender Proof
// =============================================
async function generateGenderProof(genderCode, claimedGender) {
  checkArtifacts(GENDER_WASM, GENDER_ZKEY, GENDER_VKEY, 'GenderVerification');

  const input = { genderCode, claimedGender };
  const genderLabels = { 1: 'Male', 2: 'Female', 3: 'Other' };
  console.log(`[PROOF:GENDER] claiming: ${genderLabels[claimedGender] || claimedGender}`);

  try {
    const result = await runProof(input, GENDER_WASM, GENDER_ZKEY, GENDER_VKEY, 'GENDER');
    return {
      ...result,
      message: result.isValid ? 'GENDER_MATCH: VERIFIED' : 'GENDER VERIFICATION FAILED',
      claimedGender,
      claimedGenderLabel: genderLabels[claimedGender] || 'Unknown',
    };
  } catch (err) {
    console.log(`[PROOF:GENDER] Generation FAILED: ${err.message}`);
    if (err.message && err.message.includes('Assert Failed')) {
      throw new Error('Proof generation failed. Gender does not match claimed value.');
    }
    throw err;
  }
}

module.exports = { generateProof, generateNameProof, generateGenderProof };
