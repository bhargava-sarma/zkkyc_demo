#!/usr/bin/env node
/**
 * STEP 3 -- builds input.json for RSAVerifier65537(121, 17) from OUR mock issuer
 * data, replacing zk-email's bundled test vector.
 *
 * Input shape, per the template and its RSAPad component:
 *   signature[17]  our signature, 121-bit limbs, least-significant first
 *   modulus[17]    our public key modulus, same layout (declared public)
 *   message[17]    the SHA-256 DIGEST as a big-endian integer, same layout
 *
 * The message[] gotcha: circuit_inputs.json's `message_bytes` is the 83-byte
 * serialized payload -- the preimage, not the digest. RSAPad constrains
 * messageBits[i] === 0 for i >= 256 and lays the digest into the low 256 bits
 * of the encoded message, so message[] must be the 32-byte digest read as a
 * number. Feeding the preimage bytes here would fail witness generation.
 *
 * Reads mock-issuer/circuit_inputs.json. Writes input.json.
 *
 * Usage:
 *   node gen_input_mock_issuer.js                    -> input.json
 *   node gen_input_mock_issuer.js --tamper=signature -> input_tampered_signature.json
 *   node gen_input_mock_issuer.js --tamper=message   -> input_tampered_message.json
 *   node gen_input_mock_issuer.js --tamper=modulus   -> input_tampered_modulus.json
 *
 * Each --tamper mode flips the low bit of limb 0 of the named field and leaves
 * the other two untouched, so the circuit's rejection is attributable to exactly
 * one changed bit. All three must be rejected at witness generation; the
 * untampered input must still be accepted. Keeping these in the script rather
 * than in throwaway shell commands is the point -- a negative control nobody can
 * re-run is not evidence.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOCK_ISSUER = path.join(__dirname, '..', '..', 'mock-issuer');
const LIMB_BITS = 121;
const LIMB_COUNT = 17;

/**
 * Splits a BigInt into fixed-width limbs, least-significant first.
 *
 * @param {bigint} value
 * @param {number} limbBits
 * @param {number} limbCount
 * @returns {string[]} Decimal-string limbs
 */
function toLimbs(value, limbBits, limbCount) {
  const mask = (1n << BigInt(limbBits)) - 1n;
  const limbs = [];
  let remaining = value;
  for (let i = 0; i < limbCount; i++) {
    limbs.push((remaining & mask).toString());
    remaining >>= BigInt(limbBits);
  }
  if (remaining !== 0n) {
    throw new Error(`Value does not fit in ${limbCount} limbs of ${limbBits} bits.`);
  }
  return limbs;
}

const TAMPER_FIELDS = ['signature', 'message', 'modulus'];

function main() {
  const tamperArg = process.argv.find((a) => a.startsWith('--tamper='));
  const tamper = tamperArg ? tamperArg.split('=')[1] : null;
  if (tamper && !TAMPER_FIELDS.includes(tamper)) {
    throw new Error(`--tamper must be one of: ${TAMPER_FIELDS.join(', ')}. Got "${tamper}".`);
  }

  const ci = JSON.parse(fs.readFileSync(path.join(MOCK_ISSUER, 'circuit_inputs.json'), 'utf8'));

  // Recompute the digest from the preimage rather than trusting a stored field.
  const messageBytes = Buffer.from(ci.message_bytes);
  const digest = crypto.createHash('sha256').update(messageBytes).digest();
  const messageLimbs = toLimbs(BigInt('0x' + digest.toString('hex')), LIMB_BITS, LIMB_COUNT);

  const input = {
    signature: [...ci.signature_limbs],
    modulus: [...ci.modulus_limbs],
    message: messageLimbs,
  };

  if (tamper) {
    // One bit, in exactly one field. Enough to break the RSA equation; small
    // enough that the input shape is otherwise untouched, so a rejection cannot
    // be blamed on a malformed input.
    input[tamper][0] = (BigInt(input[tamper][0]) ^ 1n).toString();
  }

  const outPath = path.join(__dirname, tamper ? `input_tampered_${tamper}.json` : 'input.json');
  fs.writeFileSync(outPath, JSON.stringify(input, null, 2) + '\n');

  const tag = tamper ? `MOCK-ISSUER/TAMPER:${tamper}` : 'MOCK-ISSUER';
  console.log(`[${tag}] source        : mock-issuer/circuit_inputs.json`);
  console.log(`[${tag}] preimage      : ${messageBytes.length} bytes`);
  console.log(`[${tag}] digest        : ${digest.toString('hex')}`);
  console.log(`[${tag}] signature[17] : ${input.signature.length} limbs, [0]=${input.signature[0].substring(0, 24)}...`);
  console.log(`[${tag}] modulus[17]   : ${input.modulus.length} limbs, [0]=${input.modulus[0].substring(0, 24)}...`);
  console.log(`[${tag}] message[17]   : ${input.message.length} limbs, ` +
    `${input.message.filter((l) => l !== '0').length} non-zero (digest is 256 bits => 3 limbs)`);
  if (tamper) {
    console.log(`[${tag}] TAMPERED      : flipped low bit of ${tamper} limb 0`);
  }
  console.log(`[${tag}] wrote ${path.basename(outPath)}`);
}

try {
  main();
} catch (err) {
  console.error(`[MOCK-ISSUER] ERROR: ${err.message}`);
  process.exit(1);
}
