# Mock Issuer — Signed Identity Credential

Task 1 of the ZK-KYC demo. Generates an RSA-2048 keypair standing in for a government
issuer's signing key, signs a synthetic identity payload with it, and verifies that
signature independently — all before any Circom work begins.

The existing demo circuits (`backend/circuits/`) prove facts about values **the server
itself computed** from OCR, which is why the root README lists "not a full trustless
attestation" as a known limitation. This directory supplies the missing piece: a
signature from an external party that Task 2's circuit can verify *inside* the proof.

---

## SCOPE NOTE

Real Aadhaar Secure QR codes use a packed binary format with SHA-1+RSA signing, specific to
UIDAI's actual infrastructure. This project does NOT replicate that exact wire format. Instead,
it demonstrates the same underlying cryptographic mechanism (RSA signature verification inside
a ZK circuit) using a simpler, self-defined payload format and SHA-256+RSA. This is a deliberate
scope decision, not an oversight — replicating Aadhaar's exact QR byte-packing was out of scope
given project timeline.

---

## Files

| File | Committed | Description |
|---|---|---|
| `generate_keypair.js` | yes | Generates the RSA-2048 keypair. Refuses to overwrite without `--force`. |
| `payload.json` | yes | The synthetic identity data, as editable data rather than hardcoded values. |
| `sign_credential.js` | yes | Serializes → hashes → signs. Writes the two output JSON files. |
| `verify_credential.js` | yes | Independent verifier. Reads only the credential, public key, and circuit inputs. |
| `mock_issuer_private.pem` | yes | Issuer private key (PKCS#8 PEM, mode 0600). See *Key handling* below. |
| `mock_issuer_public.pem` | yes | Issuer public key (SPKI PEM). |
| `signed_credential.json` | yes | *Generated.* Payload, exact serialized bytes, SHA-256, signature. |
| `circuit_inputs.json` | yes | *Generated.* The same values pre-chewed for Circom (limbs, lengths). |

No npm dependencies — Node built-ins only (`crypto`, `fs`, `path`). Requires Node 16+
(`base64url` buffer encoding); developed and verified on Node v22.22.1.

---

## Quick start

```bash
cd mock-issuer
node generate_keypair.js     # once — writes both .pem files
node sign_credential.js      # writes signed_credential.json + circuit_inputs.json
node verify_credential.js    # independent check; exits 0 only if everything passes
```

Or via npm scripts: `npm run keygen`, `npm run sign`, `npm run verify`.

---

## The payload

```json
{
  "name":      "Test User One",
  "dob":       "1998-04-12",
  "id_number": "000000000000",
  "gender":    "M"
}
```

| Field | Type | Constraint |
|---|---|---|
| `name` | string | Printable ASCII, non-empty |
| `dob` | string | `YYYY-MM-DD` |
| `id_number` | string | Exactly 12 digits |
| `gender` | string | One of `M`, `F`, `O` |

All values are synthetic. `id_number` is `000000000000` — twelve digits, but structurally
invalid as any real government identifier (real Aadhaar numbers never begin with 0 or 1),
and unmistakably a dummy. No field, filename, or variable in this directory is named after
any specific issuing authority; the format is deliberately issuer-agnostic, per the scope note.

---

## Serialization format

**This is the contract with Task 2's circuit.** The circuit hashes these exact bytes, so
any deviation — one space, one reordered key — produces a different digest and the proof
fails. The rule in full:

1. The payload object contains **exactly** the four keys above. No extras, no omissions.
2. Keys are sorted **ascending by JS default sort** (UTF-16 code-unit order). For these
   ASCII keys that is plain lexicographic:
   ```
   dob, gender, id_number, name
   ```
   The object is rebuilt by re-inserting keys in that order, because insertion order is
   what drives `JSON.stringify`'s output order.
3. `JSON.stringify(obj)` with **no `space` argument**. No whitespace is emitted anywhere:
   no space after `:` or `,`, no newlines, **no trailing newline**.
4. The string is encoded **UTF-8** (`Buffer.from(s, 'utf8')`).

### The ASCII guard

`sign_credential.js` rejects any value that is not printable ASCII (`0x20`–`0x7E`), or that
contains `"` or `\`. Those two are the only printable characters `JSON.stringify` would
escape, and an escape changes the byte count.

The guarantee this buys: **UTF-8 bytes == ASCII bytes == the literal characters you see**,
and the serialized length is exactly predictable. A payload that would break that assumption
fails loudly at signing time instead of silently desynchronizing the circuit.

### Current serialized bytes

```
{"dob":"1998-04-12","gender":"M","id_number":"000000000000","name":"Test User One"}
```

**83 bytes / 664 bits.** Hex dump:

```
0000  7b 22 64 6f 62 22 3a 22 31 39 39 38 2d 30 34 2d  |{"dob":"1998-04-|
0010  31 32 22 2c 22 67 65 6e 64 65 72 22 3a 22 4d 22  |12","gender":"M"|
0020  2c 22 69 64 5f 6e 75 6d 62 65 72 22 3a 22 30 30  |,"id_number":"00|
0030  30 30 30 30 30 30 30 30 30 30 22 2c 22 6e 61 6d  |0000000000","nam|
0040  65 22 3a 22 54 65 73 74 20 55 73 65 72 20 4f 6e  |e":"Test User On|
0050  65 22 7d                                         |e"}|
```

SHA-256 of those bytes:

```
14578f55489de0bcc174d9b56339094ad2379e31f7022d0f366572175d2e24ef
```

> ⚠️ **83 is a function of the current values, not a constant of the format.** Change the
> name from `Test User One` to anything of a different length and the byte count moves,
> which moves the SHA-256 block count and the circuit's `Sha256(n)` width. This is why
> `circuit_inputs.json` *emits* `payload_byte_length` and `payload_bit_length` rather than
> anyone hardcoding 664. Task 2 should read them.

---

## Cryptographic parameters

| Parameter | Value | Why |
|---|---|---|
| Key size | **2048-bit RSA** | Mirrors real-world issuer key sizing. The payload format here is custom, but the key strength is not a toy value. |
| Public exponent | **65537** | Effectively mandatory: the common Circom RSA templates (zk-email `RSAVerifier65537`, `circom-rsa-verify`) hardcode this exponent. `sign_credential.js` throws if the key uses anything else. |
| Hash | **SHA-256** | Circom-friendly (`circomlib/circuits/sha256`). Note this differs from real Aadhaar QR signing, which uses SHA-1 — see the scope note. |
| Signature scheme | **RSASSA-PKCS1-v1_5** | **No deviation.** The standard scheme that circom RSA-verify templates expect. Not PSS — PSS's salted, randomized encoding is substantially more expensive to verify in-circuit. |
| Signature size | 256 bytes | 2048 bits. |

`RSA_PKCS1_PADDING` is passed explicitly at every `crypto.sign` / `crypto.verify` call site
rather than relying on Node's default, so the scheme is visible in the code and cannot drift
if a future Node release changes its defaults.

---

## Byte-level layout for the Task 2 circuit

Everything below was verified empirically against the generated credential, not just
derived on paper.

### SHA-256 message padding

The circuit's SHA-256 component must be sized for the *padded* message. For the current
83-byte payload:

```
664 message bits (83 bytes)
  + 0x80                     1 byte   (the mandatory 1 bit, byte-aligned)
  + 0x00 × 36               36 bytes  (zero padding)
  + 0x0000000000000298       8 bytes  (message length in bits, 64-bit big-endian; 664 = 0x298)
  ─────────────────────────────────
  = 128 bytes = 1024 bits   = 2 SHA-256 blocks
```

`circomlib`'s `Sha256(nBits)` performs this padding internally — instantiate it with
`nBits = 664` (i.e. `payload_bit_length` from `circuit_inputs.json`), not 1024.

### EMSA-PKCS1-v1_5 encoded message

What the circuit reconstructs and compares against `sig^e mod n`. For a 256-byte modulus
with a SHA-256 digest:

```
00 01 | FF × 202 | 00 | DigestInfo (19 bytes) | H (32 bytes)     = 256 bytes
```

The SHA-256 `DigestInfo` DER prefix is constant:

```
3031300d060960864801650304020105000420
```

The padding run is `256 − 3 − 19 − 32 = 202` bytes of `0xFF`. Confirmed by applying the raw
RSA public operation (`RSA_NO_PADDING`) to the generated signature: the recovered block has
exactly this structure and its trailing 32 bytes equal the stored SHA-256.

### Limb decomposition (`circuit_inputs.json`)

Circom bigint arithmetic works on limb arrays. The modulus and signature are each split into:

- **17 limbs of 121 bits** (`17 × 121 = 2057 ≥ 2048`)
- **Least-significant limb first** — `limbs[0]` holds the low-order 121 bits. This is the
  layout `RSAVerifier65537(121, 17)` from `@zk-email/circuits` expects, and the output is
  byte-identical to that library's own `bigIntToChunkedBytes` packer for the same value.
- **Decimal strings**, not JSON numbers: a 121-bit limb exceeds `Number.MAX_SAFE_INTEGER`
  and would lose precision as a number literal.

**Why 121 × 17 and not 64 × 32.** A limb must stay below half the ~254-bit circom field so
that limb products cannot overflow, and 17 is the fewest 121-bit limbs that clear 2048.
Fewer, wider limbs means far fewer cross-limb multiplications in the modular exponentiation:
measured at **190,945 constraints** for 121 × 17, against the ~536k a 64 × 32 layout costs —
roughly 2.8× cheaper, and the difference between needing a pot18 ptau and a pot20. The
baseline that produced those numbers lives in `experiments/rsa-baseline/`.

`toLimbs()` in `sign_credential.js` is parameterized by `LIMB_BITS` / `LIMB_COUNT` and
throws if a value does not fit the requested geometry, so changing the layout again is a
two-constant edit that fails loudly rather than silently truncating. Both output documents
are built in memory before either is written, so a failure there leaves **neither** file
touched rather than pairing a fresh credential with stale circuit inputs.

`circuit_inputs.json` also carries `message_bytes` (the 83 serialized bytes, one per array
element), `modulus_hex`, `exponent`, `payload_byte_length`, `payload_bit_length`, and
`sha256_block_count`.

Nothing in `circuit_inputs.json` is authoritative — it is a convenience derivation.
`signed_credential.json` and `mock_issuer_public.pem` are the source of truth.

---

## Verification

`verify_credential.js` is deliberately standalone. It reads **only** `signed_credential.json`,
`mock_issuer_public.pem`, and — when present — `circuit_inputs.json`; never the private key,
never `payload.json`, and it imports nothing from `sign_credential.js`. It also
**re-implements the canonical serializer inline** rather than sharing a helper module, so a
mismatch between this documented format and the signing implementation would surface as a
failure instead of being masked by shared code. The duplication is intentional.

Eleven checks, each reported separately.

**Credential checks (1–6)** — need only the credential and the public key:

1. Credential structure is well-formed.
2. Re-serializing `payload` reproduces the stored `serialized` field **byte for byte**
   (`Buffer.compare`).
3. Re-hashing those bytes reproduces the stored `sha256`.
4. The signature verifies against the public key.
5. **Negative control** — a message with one flipped bit is rejected.
6. **Negative control** — a signature with one flipped bit is rejected.

**Circuit input checks (7–11)** — validate `circuit_inputs.json`:

7. Limb geometry is 17 × 121-bit, checked against constants hardcoded in the verifier rather
   than against the layout the file declares about itself.
8. Every limb is `< 2^121`. An oversized limb still recombines correctly but would blow the
   circuit's `Num2Bits(121)` range check, so this catches a failure the round-trip cannot.
9. Modulus limbs recombine to the modulus **in `mock_issuer_public.pem`** — not to the
   `modulus_hex` sitting beside them, which would only prove the file is self-consistent.
10. Signature limbs recombine to the signature in `signed_credential.json`.
11. `message_bytes` and the declared byte/bit lengths match the serialized payload.

Checks 5 and 6 exist because a verifier that accepted everything would pass 1–4 just as
happily. If `circuit_inputs.json` is absent, checks 7–11 report **SKIP** — deliberately
distinct from PASS, so a missing file can never read as a success. Exit code is 0 only if
every check that ran passed.

### External cross-check

To confirm the signature is valid under a standard implementation and not just Node's:

```bash
node -e 'const c=require("./signed_credential.json");process.stdout.write(c.serialized)' > /tmp/msg.bin
node -e 'const c=require("./signed_credential.json");process.stdout.write(Buffer.from(c.signature,"hex"))' > /tmp/sig.bin
openssl dgst -sha256 -verify mock_issuer_public.pem -signature /tmp/sig.bin /tmp/msg.bin
# Verified OK
```

Note the first command writes `c.serialized` with **no trailing newline** — that is the
whole point of the format. `echo` would append `0x0a` and the verification would fail.

---

## Key handling

The private key **is committed to this repository, deliberately.** It is throwaway mock
material with no real-world value, and committing it means anyone cloning the repo can
re-sign credentials and reproduce Task 2 exactly.

If GitHub push protection or a secret scanner objects to the tracked `.pem`, the fallback is
to add `mock-issuer/mock_issuer_private.pem` to the root `.gitignore` (there is a commented
block there marking the spot). Verification and the Task 2 circuit still work without it —
they need only the public key and the signature. Only *re-signing* would then require
regenerating the keypair.

**This key must never be used for anything real.**

---

## How to regenerate

### Re-sign after changing the payload

Edit `payload.json`, then:

```bash
node sign_credential.js
node verify_credential.js
```

The keypair is untouched. **The serialized byte length will change if any value's length
changes** — check the `[SIGN] Serialized: N bytes` line and update Task 2's circuit sizing
(`Sha256(nBits)`) to the new `payload_bit_length`. Any previously generated proof or witness
becomes invalid.

### Rotate the keypair

```bash
node generate_keypair.js --force    # refuses without --force
node sign_credential.js             # mandatory — old signature is now invalid
node verify_credential.js
```

Rotation changes the modulus, so **every downstream artifact must be rebuilt**: the
credential, `circuit_inputs.json`, and anything in Task 2 that embeds the issuer's public
key. `sign_credential.js` will not detect a stale credential on its own — always re-sign
immediately after rotating.

---

## Known gap for Task 2

`backend/circuits/pot12_final.ptau` supports roughly 4,096 constraints. SHA-256 over two
blocks plus RSA-2048 verification in-circuit lands in the 10⁵–10⁶ constraint range, so Task 2
will need a much larger Powers of Tau file (pot20/pot21 or higher) and a corresponding change
to the hardcoded ptau URL in `backend/circuits/setup_circuit.sh`. Nothing in this directory
touches that.
