/**
 * Produces input.json for the zk-email RSAVerifier65537(121,17) baseline.
 *
 * Uses ZK-EMAIL'S OWN test vector, not ours:
 *   - signature + modulus derived from their bundled tests/test-emails/test.eml
 *     via their own generateEmailVerifierInputs helper
 *   - the `message` limb array copied verbatim from their rsa.test.ts
 *     ("should verify 2048 bit rsa signature correctly")
 *
 * No mock-issuer data, no project key, nothing from circuit_inputs.json.
 */
const fs = require('fs');
const { generateEmailVerifierInputs } = require('@zk-email/helpers/dist/input-generators');

// Verbatim from zk-email-verify/packages/circuits/tests/rsa.test.ts
const MESSAGE = [
  '1156466847851242602709362303526378170',
  '191372789510123109308037416804949834',
  '7204',
  '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
];

(async () => {
  const rawEmail = fs.readFileSync('vectors/test.eml');
  const inputs = await generateEmailVerifierInputs(rawEmail, {
    maxHeadersLength: 640,
    maxBodyLength: 768,
  });

  const circuitInput = {
    signature: inputs.signature,
    modulus: inputs.pubkey,
    message: MESSAGE,
  };

  fs.writeFileSync('input.json', JSON.stringify(circuitInput, null, 2) + '\n');
  console.log(`[BASELINE] signature limbs: ${circuitInput.signature.length}`);
  console.log(`[BASELINE] modulus limbs:   ${circuitInput.modulus.length}`);
  console.log(`[BASELINE] message limbs:   ${circuitInput.message.length}`);
  console.log(`[BASELINE] modulus[0]:      ${circuitInput.modulus[0]}`);
  console.log(`[BASELINE] signature[0]:    ${circuitInput.signature[0]}`);
  console.log('[BASELINE] wrote input.json');
})().catch((e) => { console.error(`[BASELINE] ERROR: ${e.message}`); process.exit(1); });
