# Mock Issuer → RSA Circuit (first integration)

Proves our **own** mock issuer's public key and signature through
`RSAVerifier65537(121, 17)` — the same circuit `../rsa-baseline/` validated on zk-email's
bundled vectors. This is the first point where project data meets the circuit.

Still an experiment: nothing here is wired into `backend/`, and the existing
Age/Name/Gender circuits are untouched.

## Why a separate directory from `rsa-baseline/`

The baseline's value is being a known-good control on *someone else's* vectors. If our data
ever fails, that pristine reference is what distinguishes "our data is wrong" from "the
circuit broke." So nothing is written into it.

The circuit itself is identical — same template, same parameters — so this directory
**reuses the baseline's compiled `rsa-test.r1cs`, `rsa-test_js/`, `rsa_final.zkey`, and
`verification_key.json`** by path rather than repeating a ~24s setup. A zkey binds to the
circuit, not to the inputs, so any difference in results is attributable purely to the data.

Consequence: run the baseline first. Without its artifacts, the commands below have nothing
to prove against.

## Results

| | Baseline (zk-email vectors) | **Ours** |
|---|---|---|
| Witness generation | 0.72 s | **0.73 s — succeeds** |
| `snarkjs wtns check` | correct | **WITNESS IS CORRECT** |
| Constraints | 190,945 | **190,945** (same r1cs) |
| Proving | ~3.11 s | **~3.19 s** (3243 / 3184 / 3144 ms) |
| Verification | `OK!` | **`OK!`** |

The ~2.5% proving difference is run-to-run noise, not a data-shape signal — identical
circuit, identical witness size.

`public.json` is exactly our 17 modulus limbs: the modulus is the only public input, so the
signature and the digest stay private. A verifier learns *which issuer signed*, not what was
signed.

### Negative controls

A circuit that "verifies" without discriminating is worse than useless. One bit is flipped in
limb 0 of exactly one field, leaving the other two untouched:

| Input | Result |
|---|---|
| `input.json` (valid) | **ACCEPTED** ← rules out a harness that rejects everything |
| `--tamper=signature` | REJECTED |
| `--tamper=message` | REJECTED |
| `--tamper=modulus` | REJECTED |

Rejection happens at **witness generation**, not at proving:

```
Error: Assert Failed. Error in template RSAVerifier65537_14 line: 44
```

Line 44 is `bigPow.out[i] === padder.out[i]` — the RSA equation itself. There is no provable
witness for a bad signature.

## The `message[17]` gotcha

`mock-issuer/circuit_inputs.json`'s `message_bytes` is the **83-byte serialized payload** —
the preimage. `RSAVerifier65537`'s `message[]` input is the **32-byte SHA-256 digest** read as
a big-endian integer, in 121-bit limbs, least-significant first.

This is not a matter of taste: `RSAPad` constrains `messageBits[i] === 0` for `i >= 256` and
lays the digest into the low 256 bits of the encoded message, adding the DigestInfo prefix and
the `0xFF` run in-circuit. Packing the preimage bytes into `message[]` fails witness
generation. `gen_input_mock_issuer.js` recomputes the digest from `message_bytes` rather than
trusting the stored `sha256`, and the resulting limbs are byte-identical to zk-email's own
`toCircomBigIntBytes` output.

## Files

| Tracked | Purpose |
|---|---|
| `precheck_rsa.js` | Pure BigInt verification of the RSA equation, before any circom |
| `gen_input_mock_issuer.js` | Builds `input.json` and the three tampered variants |
| `README.md` | This file |

Generated and ignored: `input*.json`, `witness*.wtns`, `proof.json`, `public.json`. They are
derived from `mock-issuer/circuit_inputs.json` and would go stale the moment the credential is
re-signed — a tracked-but-stale `input.json` sitting beside a fresh credential is worse than
no file at all. `proof.json` is additionally bound to a zkey that is not tracked.

## Running

```bash
cd experiments/rsa-mock-issuer
B=../rsa-baseline

# 1. Pre-check in plain JS. If this fails, the circuit cannot pass.
node precheck_rsa.js

# 2. Build circuit inputs from our credential
node gen_input_mock_issuer.js

# 3. Witness + proof + verify
node $B/rsa-test_js/generate_witness.js $B/rsa-test_js/rsa-test.wasm input.json witness.wtns
snarkjs wtns check $B/rsa-test.r1cs witness.wtns
snarkjs groth16 prove $B/rsa_final.zkey witness.wtns proof.json public.json
snarkjs groth16 verify $B/verification_key.json public.json proof.json

# 4. Negative controls -- all three must fail witness generation
for f in signature message modulus; do
  node gen_input_mock_issuer.js --tamper=$f
  node $B/rsa-test_js/generate_witness.js $B/rsa-test_js/rsa-test.wasm \
    input_tampered_$f.json /tmp/w.wtns && echo "!! $f WAS ACCEPTED - BUG !!"
done
```

`precheck_rsa.js` is the step worth keeping in the loop: it reconstructs the expected
EMSA-PKCS1-v1_5 block straight from RFC 8017 and compares it against
`signature^65537 mod modulus`, so a mismatch is diagnosable in plain JS instead of as an
opaque assert deep in witness generation.

## Not yet done

The circuit verifies a signature over a digest **it is handed**. Nothing yet binds that digest
to our 83-byte payload inside the proof — that needs a SHA-256 component (2 blocks for the
current payload) wired so the circuit hashes the message itself. Until then this proves
"the issuer signed *some* digest", not "the issuer signed *this payload*".
