#!/usr/bin/env node
/**
 * STEP 2 PRE-CHECK -- pure JS/BigInt, no circom involved.
 *
 * Confirms our mock issuer's limbs satisfy the RSA verification equation that
 * RSAVerifier65537 checks in-circuit:
 *
 *     signature^65537 mod modulus  ==  RSAPad(sha256_digest, modulus)
 *
 * If this fails, the circuit cannot possibly pass, and debugging it here is far
 * cheaper than reading witness-generation errors.
 *
 * The right-hand side is reconstructed independently from the EMSA-PKCS1-v1_5
 * spec rather than lifted from the circuit, so agreement is real evidence and
 * not a tautology.
 *
 * Reads only mock-issuer/{circuit_inputs.json, signed_credential.json,
 * mock_issuer_public.pem}. Writes nothing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOCK_ISSUER = path.join(__dirname, '..', '..', 'mock-issuer');

const LIMB_BITS = 121;
const LIMB_COUNT = 17;
const EXPONENT = 65537n;
const MODULUS_BYTES = 256;

// DER DigestInfo prefix for SHA-256, per RFC 8017 section 9.2 notes.
const SHA256_DIGEST_INFO = Buffer.from('3031300d060960864801650304020105000420', 'hex');

let failures = 0;
function check(passed, label, detail) {
  console.log(`[PRECHECK] ${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`[PRECHECK]       ${detail}`);
  if (!passed) failures++;
  return passed;
}

/**
 * Recombines least-significant-first limbs into a BigInt.
 *
 * @param {string[]} limbs Decimal-string limbs
 * @param {number} limbBits Bits per limb
 * @returns {bigint}
 */
function fromLimbs(limbs, limbBits) {
  const shift = BigInt(limbBits);
  let value = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) {
    value = (value << shift) + BigInt(limbs[i]);
  }
  return value;
}

/**
 * Square-and-multiply modular exponentiation.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} mod
 * @returns {bigint} base^exp mod mod
 */
function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/**
 * Builds the EMSA-PKCS1-v1_5 encoded message for a SHA-256 digest.
 *
 *   EM = 0x00 || 0x01 || PS(0xFF...) || 0x00 || DigestInfo || H
 *
 * This is what RSAPad reconstructs inside the circuit; here it is built straight
 * from the spec so the two can be compared independently.
 *
 * @param {Buffer} digest 32-byte SHA-256 digest
 * @param {number} emLen Encoded message length in bytes (modulus size)
 * @returns {Buffer} The encoded message
 */
function emsaPkcs1v15(digest, emLen) {
  const t = Buffer.concat([SHA256_DIGEST_INFO, digest]);
  const psLen = emLen - t.length - 3;
  if (psLen < 8) throw new Error('Modulus too small for PKCS#1 v1.5 padding.');
  return Buffer.concat([
    Buffer.from([0x00, 0x01]),
    Buffer.alloc(psLen, 0xff),
    Buffer.from([0x00]),
    t,
  ]);
}

function main() {
  const ci = JSON.parse(fs.readFileSync(path.join(MOCK_ISSUER, 'circuit_inputs.json'), 'utf8'));
  const cred = JSON.parse(fs.readFileSync(path.join(MOCK_ISSUER, 'signed_credential.json'), 'utf8'));
  const pubPem = fs.readFileSync(path.join(MOCK_ISSUER, 'mock_issuer_public.pem'), 'utf8');

  console.log('='.repeat(72));
  console.log('STEP 2 PRE-CHECK: RSA equation in plain BigInt (no circom)');
  console.log('='.repeat(72));
  console.log('');

  // ---- Recombine our limbs ------------------------------------------------
  const modulus = fromLimbs(ci.modulus_limbs, LIMB_BITS);
  const signature = fromLimbs(ci.signature_limbs, LIMB_BITS);

  check(
    ci.modulus_limbs.length === LIMB_COUNT && ci.signature_limbs.length === LIMB_COUNT,
    `circuit_inputs.json carries ${LIMB_COUNT} limbs each for modulus and signature`,
    `modulus_limbs=${ci.modulus_limbs.length}, signature_limbs=${ci.signature_limbs.length}, ` +
      `limb_bits=${ci.limb_layout.limb_bits}`
  );

  // Anchor the recombined modulus to the actual key file, so a wrong limb
  // layout cannot quietly agree with itself.
  const jwk = crypto.createPublicKey(pubPem).export({ format: 'jwk' });
  const modulusFromPem = BigInt('0x' + Buffer.from(jwk.n, 'base64url').toString('hex'));
  check(
    modulus === modulusFromPem,
    'Recombined modulus equals the modulus in mock_issuer_public.pem',
    `${modulus.toString(2).length} bits`
  );
  check(
    BigInt(Buffer.from(jwk.e, 'base64url').readUIntBE(0, Buffer.from(jwk.e, 'base64url').length)) === EXPONENT,
    'Public exponent is 65537, as RSAVerifier65537 hardcodes'
  );

  // ---- The digest the circuit will be given -------------------------------
  // NOTE: circuit_inputs.json's message_bytes is the 83-byte serialized PAYLOAD,
  // i.e. the preimage -- NOT the digest. RSAVerifier65537's message[] input is
  // the SHA-256 digest. Recomputing it here from message_bytes proves the two
  // are consistent rather than trusting the stored hash.
  const messageBytes = Buffer.from(ci.message_bytes);
  const digest = crypto.createHash('sha256').update(messageBytes).digest();
  check(
    digest.toString('hex') === cred.sha256,
    'SHA-256 of message_bytes matches the credential\'s stored digest',
    `${messageBytes.length}-byte preimage -> ${digest.toString('hex')}`
  );

  // ---- The actual RSA equation --------------------------------------------
  const recovered = modPow(signature, EXPONENT, modulus);
  const expectedEm = emsaPkcs1v15(digest, MODULUS_BYTES);
  const expectedEmInt = BigInt('0x' + expectedEm.toString('hex'));

  const equationHolds = recovered === expectedEmInt;
  check(
    equationHolds,
    'signature^65537 mod modulus == EMSA-PKCS1-v1_5(SHA-256 digest)',
    `recovered ${recovered.toString(16).length * 4}-bit value from a ${signature.toString(2).length}-bit signature`
  );

  // ---- Show the recovered block so the structure is inspectable -----------
  const recoveredBytes = Buffer.from(recovered.toString(16).padStart(MODULUS_BYTES * 2, '0'), 'hex');
  let ffRun = 0;
  for (let i = 2; i < recoveredBytes.length && recoveredBytes[i] === 0xff; i++) ffRun++;
  console.log('');
  console.log('RECOVERED ENCODED MESSAGE (signature^65537 mod modulus)');
  console.log('-'.repeat(72));
  console.log(`  leading bytes : ${recoveredBytes.subarray(0, 2).toString('hex')}  (expect 0001)`);
  console.log(`  0xFF run      : ${ffRun} bytes  (expect ${MODULUS_BYTES - 3 - 19 - 32})`);
  console.log(`  separator     : ${recoveredBytes.subarray(2 + ffRun, 3 + ffRun).toString('hex')}  (expect 00)`);
  console.log(`  DigestInfo    : ${recoveredBytes.subarray(3 + ffRun, 3 + ffRun + 19).toString('hex')}`);
  console.log(`  expect        : ${SHA256_DIGEST_INFO.toString('hex')}`);
  console.log(`  trailing hash : ${recoveredBytes.subarray(3 + ffRun + 19).toString('hex')}`);
  console.log(`  our digest    : ${digest.toString('hex')}`);
  console.log('');

  // ---- What message[] the circuit needs -----------------------------------
  // RSAPad constrains messageBits[i] === 0 for i >= 256, so message[] is the
  // digest read as a big-endian integer, split LSB-first into 121-bit limbs.
  const digestInt = BigInt('0x' + digest.toString('hex'));
  check(
    digestInt < 1n << 256n,
    'Digest fits the 256-bit window RSAPad enforces (messageBits[i]===0 for i>=256)',
    `${digestInt.toString(2).length} bits used of 256`
  );

  console.log('');
  console.log('='.repeat(72));
  if (failures === 0) {
    console.log('RESULT: PRE-CHECK PASSED - the circuit should accept this data');
    console.log('='.repeat(72));
    process.exit(0);
  }
  console.log(`RESULT: PRE-CHECK FAILED - ${failures} check(s) did not pass`);
  console.log('Do not proceed to the circuit until these are resolved.');
  console.log('='.repeat(72));
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`[PRECHECK] ERROR: ${err.message}`);
  process.exit(1);
}
