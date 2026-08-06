#!/usr/bin/env node
/**
 * Mock issuer keypair generation.
 *
 * Produces the RSA-2048 keypair that stands in for a government issuer's signing
 * key. Kept separate from sign_credential.js on purpose: re-signing a payload must
 * never silently rotate the key, because rotating it invalidates every credential
 * and every circuit input derived from the old modulus.
 *
 * Usage:
 *   node generate_keypair.js            # generates, refuses to clobber existing keys
 *   node generate_keypair.js --force    # rotates the key (invalidates signed_credential.json)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Parameters
// =============================================================================

// 2048 bits mirrors real-world RSA issuer key sizing. The payload format in this
// project is custom, but the key strength is not a toy value.
const KEY_BITS = 2048;

// e = 65537 is not merely Node's default; it is effectively mandatory here.
// The common Circom RSA templates (zk-email's RSAVerify65537, circom-rsa-verify)
// hardcode this exponent, so any other value would make Task 2's circuit unusable.
const PUBLIC_EXPONENT = 65537;

const PRIVATE_KEY_PATH = path.join(__dirname, 'mock_issuer_private.pem');
const PUBLIC_KEY_PATH = path.join(__dirname, 'mock_issuer_public.pem');

// =============================================================================
// Main
// =============================================================================

function main() {
  const force = process.argv.includes('--force');

  const existing = [PRIVATE_KEY_PATH, PUBLIC_KEY_PATH].filter((p) => fs.existsSync(p));
  if (existing.length > 0 && !force) {
    console.error('[KEYGEN] Refusing to overwrite existing key material:');
    existing.forEach((p) => console.error(`[KEYGEN]   ${path.basename(p)}`));
    console.error('[KEYGEN]');
    console.error('[KEYGEN] Re-run with --force only if you intend to ROTATE the issuer key.');
    console.error('[KEYGEN] Rotation invalidates signed_credential.json and circuit_inputs.json;');
    console.error('[KEYGEN] re-run sign_credential.js immediately afterwards.');
    process.exit(1);
  }

  console.log(`[KEYGEN] Generating RSA keypair: ${KEY_BITS}-bit, e=${PUBLIC_EXPONENT}`);
  const started = Date.now();

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: KEY_BITS,
    publicExponent: PUBLIC_EXPONENT,
    // SPKI ("BEGIN PUBLIC KEY") is what `openssl dgst -verify` expects, so the
    // credential stays verifiable outside Node without a format conversion.
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  console.log(`[KEYGEN] Generated in ${Date.now() - started}ms`);

  // 0600 on the private key. It is mock material with no real-world value, but
  // treating it as a secret keeps the demo from teaching the wrong habit.
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);

  // Echo the modulus so the caller can eyeball that the key actually changed.
  const jwk = crypto.createPublicKey(publicKey).export({ format: 'jwk' });
  const modulusHex = Buffer.from(jwk.n, 'base64url').toString('hex');

  console.log(`[KEYGEN] Wrote ${path.basename(PRIVATE_KEY_PATH)} (mode 0600)`);
  console.log(`[KEYGEN] Wrote ${path.basename(PUBLIC_KEY_PATH)}`);
  console.log(`[KEYGEN] Modulus (first 32 hex chars): ${modulusHex.substring(0, 32)}...`);
  console.log(`[KEYGEN] Modulus length: ${modulusHex.length / 2} bytes`);
  console.log('[KEYGEN] Next: node sign_credential.js');
}

main();
