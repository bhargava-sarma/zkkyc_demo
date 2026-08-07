# RSA Baseline (validation only — not part of the pipeline)

A known-good reference point: the upstream [zk-email](https://github.com/zkemail/zk-email-verify)
RSA verification circuit, compiled and proven **on its own test vectors**, in isolation, before
any of this project's data touches it.

The point was to establish that the template works and to get real constraint numbers for ptau
sizing — not estimates. Nothing here is wired into `backend/` or `mock-issuer/`, and no
mock-issuer credential, key, or `circuit_inputs.json` is used.

## Results

| | |
|---|---|
| Circuit | `RSAVerifier65537(121, 17)` from `@zk-email/circuits` 6.3.4 |
| Limb layout | 17 limbs × 121 bits, least-significant first |
| **Constraints** | **190,945** (185,912 non-linear + 5,033 linear) |
| Wires | 190,035 |
| Public / private inputs | 17 / 34 |
| **Required ptau** | **pot18** (2^18 = 262,144 ≥ 190,945) |
| Compile time | ~2 s |
| Witness generation | ~0.72 s |
| **Proving time** | **~3.11 s** (3 runs: 3120 / 3106 / 3116 ms) |
| Groth16 setup | ~14 s + ~9.5 s contribute |
| Verification | `OK!`, and a tampered public signal is rejected |

Measured on a 13th Gen Intel i7-13620H, 16 threads, 14 GB RAM, snarkjs 0.7.6, circom 2.2.3.

This 121×17 layout is ~2.8× cheaper than the 64×32 layout used by
[circom-rsa-verify](https://github.com/zkp-application/circom-rsa-verify) (~536k constraints),
which is why `mock-issuer/sign_credential.js` emits 121×17.

**Note:** `RSAVerifier65537` does *not* hash the message. It takes the SHA-256 digest as an
input and verifies the signature over it. A full credential circuit is this **plus** a SHA-256
component (~2 blocks for the current 83-byte payload), plus wiring that binds the digest to the
message. The 190,945 figure is the RSA half only.

## What is tracked here

Only the small sources needed to reproduce the run. Everything else — the 289 MB ptau, two
99 MB zkeys, the 37 MB r1cs, the sym/wasm/witness/proof — is regenerable and ignored via the
deny-by-default block in the root `.gitignore`.

| Tracked | Purpose |
|---|---|
| `package.json`, `package-lock.json` | Pins `@zk-email/circuits` 6.3.4 and `circomlib` 2.0.5 |
| `circuits/rsa-test.circom` | zk-email's own test wrapper; only the include path differs |
| `gen_input.js` | Builds `input.json` from zk-email's own test vector |
| `vectors/test.eml` | zk-email's bundled test email, the source of the 2048-bit vector |

## Reproducing

```bash
cd experiments/rsa-baseline
npm install
circom circuits/rsa-test.circom --r1cs --wasm --sym -l node_modules -o .
snarkjs r1cs info rsa-test.r1cs

curl -sL -o powersOfTau28_hez_final_18.ptau \
  https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_18.ptau

node gen_input.js                                    # writes input.json
node rsa-test_js/generate_witness.js rsa-test_js/rsa-test.wasm input.json witness.wtns
snarkjs wtns check rsa-test.r1cs witness.wtns

snarkjs groth16 setup rsa-test.r1cs powersOfTau28_hez_final_18.ptau rsa_0000.zkey
snarkjs zkey contribute rsa_0000.zkey rsa_final.zkey -n="baseline" -e="not-for-production"
snarkjs zkey export verificationkey rsa_final.zkey verification_key.json

snarkjs groth16 prove rsa_final.zkey witness.wtns proof.json public.json
snarkjs groth16 verify verification_key.json public.json proof.json
```

`gen_input.js` resolves the DKIM key for `test.eml`, so it needs network access on first run.

The entropy above is a fixed throwaway string. This setup is **not** a trustworthy ceremony and
its zkey must never be used for anything real — it exists to prove the circuit proves.
