#!/usr/bin/env node
/**
 * Independent verification of signed_credential.json.
 *
 * This script is deliberately standalone. It reads ONLY signed_credential.json
 * and mock_issuer_public.pem - never the private key, never payload.json, and it
 * imports nothing from sign_credential.js. It also re-implements the canonical
 * serializer inline rather than sharing a helper, so that a mismatch between the
 * documented format and the signing implementation would surface here instead of
 * being hidden by shared code. The duplication is the point.
 *
 * Usage:
 *   node verify_credential.js
 *
 * Exits 0 only if every check passes.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CREDENTIAL_PATH = path.join(__dirname, 'signed_credential.json');
const PUBLIC_KEY_PATH = path.join(__dirname, 'mock_issuer_public.pem');

const REQUIRED_FIELDS = ['dob', 'gender', 'id_number', 'name'];

// =============================================================================
// Independent re-implementation of the canonical serialization
// =============================================================================

/**
 * Rebuilds the canonical byte string from a payload object, per the format
 * documented in README.md: keys sorted ascending, JSON.stringify with no space
 * argument, UTF-8 encoded.
 *
 * @param {object} payload The payload object read from signed_credential.json
 * @returns {string} The canonical serialization
 */
function canonicalSerialize(payload) {
  const sortedKeys = Object.keys(payload).sort();
  const ordered = {};
  for (const key of sortedKeys) {
    ordered[key] = payload[key];
  }
  return JSON.stringify(ordered);
}

// =============================================================================
// Reporting helpers
// =============================================================================

let failures = 0;

/**
 * Prints a single pass/fail line and records failures for the exit code.
 *
 * @param {boolean} passed Whether the check succeeded
 * @param {string} label Human-readable name of the check
 * @param {string} [detail] Extra context printed underneath
 * @returns {boolean} The passed value, for chaining
 */
function check(passed, label, detail) {
  console.log(`[VERIFY] ${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) {
    console.log(`[VERIFY]       ${detail}`);
  }
  if (!passed) {
    failures++;
  }
  return passed;
}

/**
 * Renders a buffer as an offset-prefixed hex dump with an ASCII gutter, so the
 * exact bytes that were hashed can be inspected by eye.
 *
 * @param {Buffer} buf Bytes to dump
 * @returns {string} Multi-line hex dump
 */
function hexDump(buf) {
  const lines = [];
  for (let offset = 0; offset < buf.length; offset += 16) {
    const slice = buf.subarray(offset, offset + 16);
    const hex = slice.toString('hex').match(/../g).join(' ').padEnd(47, ' ');
    const ascii = Array.from(slice)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`  ${offset.toString(16).padStart(4, '0')}  ${hex}  |${ascii}|`);
  }
  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

function main() {
  for (const [label, filePath] of [
    ['signed_credential.json', CREDENTIAL_PATH],
    ['mock_issuer_public.pem', PUBLIC_KEY_PATH],
  ]) {
    if (!fs.existsSync(filePath)) {
      console.error(`[VERIFY] Missing ${label}. Run: node generate_keypair.js && node sign_credential.js`);
      process.exit(1);
    }
  }

  const credential = JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf8'));
  const publicKeyPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  const publicKey = crypto.createPublicKey(publicKeyPem);

  console.log('='.repeat(72));
  console.log('MOCK ISSUER CREDENTIAL - INDEPENDENT VERIFICATION');
  console.log('='.repeat(72));
  console.log(`Credential: ${CREDENTIAL_PATH}`);
  console.log(`Public key: ${PUBLIC_KEY_PATH}`);
  console.log('');

  // ---- Check 0: structure -------------------------------------------------
  const structureOk =
    credential.payload &&
    typeof credential.serialized === 'string' &&
    typeof credential.sha256 === 'string' &&
    typeof credential.signature === 'string' &&
    REQUIRED_FIELDS.every((f) => typeof credential.payload[f] === 'string') &&
    Object.keys(credential.payload).length === REQUIRED_FIELDS.length;
  check(structureOk, 'Credential structure: payload(4 string fields), serialized, sha256, signature');
  if (!structureOk) {
    console.error('[VERIFY] Structure is malformed; remaining checks would be meaningless.');
    process.exit(1);
  }

  // ---- Report the payload -------------------------------------------------
  console.log('');
  console.log('PAYLOAD');
  console.log('-'.repeat(72));
  for (const key of Object.keys(credential.payload).sort()) {
    console.log(`  ${key.padEnd(12)} ${credential.payload[key]}`);
  }

  // ---- Check 1: re-serialize and byte-compare -----------------------------
  const reserialized = canonicalSerialize(credential.payload);
  const reserializedBytes = Buffer.from(reserialized, 'utf8');
  const storedBytes = Buffer.from(credential.serialized, 'utf8');

  console.log('');
  console.log('SERIALIZED BYTE STRING (this is what was hashed)');
  console.log('-'.repeat(72));
  console.log(reserialized);
  console.log('');
  console.log(`Byte length: ${reserializedBytes.length} bytes (${reserializedBytes.length * 8} bits)`);
  console.log('');
  console.log('HEX DUMP');
  console.log('-'.repeat(72));
  console.log(hexDump(reserializedBytes));
  console.log('');
  console.log('CHECKS');
  console.log('-'.repeat(72));

  check(
    Buffer.compare(reserializedBytes, storedBytes) === 0,
    'Re-serialized payload matches the stored `serialized` field byte for byte',
    `${reserializedBytes.length} bytes re-derived, ${storedBytes.length} bytes stored`
  );

  // ---- Check 2: re-hash ---------------------------------------------------
  const recomputedHash = crypto.createHash('sha256').update(reserializedBytes).digest('hex');
  check(
    recomputedHash === credential.sha256,
    'Recomputed SHA-256 matches the stored hash',
    `recomputed ${recomputedHash}`
  );

  // ---- Check 3: signature verification ------------------------------------
  const signatureBytes = Buffer.from(credential.signature, 'hex');
  const signatureValid = crypto.verify(
    'sha256',
    reserializedBytes,
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    signatureBytes
  );
  check(
    signatureValid,
    'RSASSA-PKCS1-v1_5 signature verifies against mock_issuer_public.pem',
    `${signatureBytes.length}-byte signature, ${publicKey.asymmetricKeyDetails.modulusLength}-bit key, ` +
      `e=${publicKey.asymmetricKeyDetails.publicExponent}`
  );

  // ---- Check 4 & 5: negative controls -------------------------------------
  // A verifier that accepts everything would pass checks 1-3 just as happily.
  // These two prove the check above is actually discriminating.
  const tamperedMessage = Buffer.from(reserializedBytes);
  const flipIndex = Math.floor(tamperedMessage.length / 2);
  tamperedMessage[flipIndex] ^= 0x01;
  const tamperedMessageAccepted = crypto.verify(
    'sha256',
    tamperedMessage,
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    signatureBytes
  );
  check(
    !tamperedMessageAccepted,
    'Negative control: message with one flipped bit is REJECTED',
    `flipped low bit of byte ${flipIndex}`
  );

  const tamperedSignature = Buffer.from(signatureBytes);
  tamperedSignature[tamperedSignature.length - 1] ^= 0x01;
  const tamperedSignatureAccepted = crypto.verify(
    'sha256',
    reserializedBytes,
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    tamperedSignature
  );
  check(
    !tamperedSignatureAccepted,
    'Negative control: signature with one flipped bit is REJECTED',
    'flipped low bit of the final signature byte'
  );

  // ---- Verdict ------------------------------------------------------------
  console.log('');
  console.log('='.repeat(72));
  if (failures === 0) {
    console.log('RESULT: SIGNATURE VALID - all 6 checks passed');
    console.log('='.repeat(72));
    process.exit(0);
  }
  console.log(`RESULT: FAILED - ${failures} check(s) did not pass`);
  console.log('='.repeat(72));
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`[VERIFY] ERROR: ${err.message}`);
  process.exit(1);
}
