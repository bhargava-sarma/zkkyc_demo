# zkkyc_demo

Privacy-preserving Know-Your-Customer (KYC) demo using zero-knowledge proofs. A user uploads an Aadhaar card image; the system extracts the identity fields, irreversibly transforms them, and can then prove facts about that identity — age over 18, name match, gender match — **without revealing the underlying values**.

Proofs are Groth16 (circom + snarkjs), verified both locally and on-chain against verifier contracts deployed to the Polygon Amoy testnet.

---

## 1) What it does

- Capture a KYC document image (held in memory, never written to disk)
- Extract text via OCR (tesseract.js)
- Transform to circuit-friendly values: DOB → days since Unix epoch, name and Aadhaar number → SHA-256 hashes, gender → integer code
- Store **only the derived values** in Supabase; the raw Aadhaar number is discarded
- Generate and verify ZK proofs over those values
- Optionally re-verify the age and name proofs on-chain

## 2) Repository structure

```
backend/                  Express API: upload, OCR, preprocessing, proof generation
  ocr.js                  Tesseract extraction + field regexes
  preprocessing.js        DOB→days, SHA-256 hashing, gender encoding
  db.js                   Supabase client (stores derived values only)
  proofgen.js             snarkjs Groth16 prove + verify
  circuits/               circom 2.0 circuits and build artifacts
  hardhat-deploy/         Solidity verifier contracts and deploy script
frontend/                 React + Vite four-step UI
  src/components/         UploadStep, PreprocessStep, StorageStep, ProofStep
  src/contracts/          On-chain verification via ethers
```

## 3) The circuits

| Circuit | Private input | Public input | Proves |
|---|---|---|---|
| `AgeVerification` | `dobDays` | `todayDays`, `thresholdDays` | Age ≥ threshold, without revealing DOB |
| `NameVerification` | `nameHash` | `claimedNameHash` | Stored name matches a claim, without revealing the name |
| `GenderVerification` | `genderCode` | `claimedGender` | Stored gender matches a claim, without revealing it |

## 4) Setup

Prerequisites: Node.js LTS ≥ 18, npm. For rebuilding circuits you also need `circom` (2.x) and `snarkjs` installed globally.

**Environment** — the backend reads `.env` from the **repository root** (not from `backend/`):

```bash
cp .env.example .env      # then fill in SUPABASE_URL and SUPABASE_ANON_KEY
```

The Supabase project needs a `users` table with columns: `id`, `name`, `dob_days`, `aadhaar_hash`, `name_hash`, `gender_code`, `created_at`.

**Backend:**

```bash
cd backend
npm install
npm run dev               # http://localhost:3001
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The Vite dev server proxies `/api` to `localhost:3001`, so run the backend first.

**Circuits** — prebuilt artifacts (`.wasm`, `.zkey`, vkeys) are committed, so the app runs without this step:

```bash
cd backend/circuits
bash setup_circuit.sh     # downloads the ptau file, compiles, runs Groth16 setup
```

> Re-running the setup produces **new** proving/verifying keys, which will no longer match the already-deployed verifier contracts. Redeploy from `backend/hardhat-deploy/` if you rebuild.

## 5) On-chain verification

Verifier contracts on Polygon Amoy (chain ID 80002), addresses in `frontend/src/contracts/contractConfig.js`:

- `AgeVerifier` — `0xAcA82391AA33bA2070df3e601e71c2b012752d72`
- `NameVerifier` — `0x23715a3216ACdF715a75463939A342b844dd01eE`

Verification is a read-only `view` call, so no wallet or gas is needed. To redeploy, copy `backend/hardhat-deploy/.env.example` to `.env.hardhat`, add a funded deployer key, and run `npx hardhat run scripts/deploy.js --network amoy`.

## 6) Typical flow

1. Upload a document image in the UI (or use one of the built-in demo scenarios: valid / OCR failure / underage)
2. Backend runs OCR and preprocessing, stores derived values, returns a user ID
3. Client requests a proof; backend generates and verifies it with snarkjs
4. Client optionally re-verifies the same proof on-chain

## 7) Known limitations

This is a demonstration, not production KYC:

- The age threshold is hardcoded to `6570` days (18 × 365, ignoring leap years) in `backend/proofgen.js`
- `GenderVerifier` is compiled but not deployed, so gender proofs verify locally only
- OCR field extraction is regex-based against a specific Aadhaar layout and is sensitive to image quality
- The name/gender circuits prove equality against a hash the server computes, so they demonstrate the ZK pattern rather than a full trustless attestation

## 8) Troubleshooting

- **Tesseract fails** — check the language pack downloaded correctly (`backend/eng.traineddata`)
- **snarkjs errors** — ensure circom/snarkjs versions match what the circuits were built with
- **On-chain verification fails** — most often the circuit artifacts were rebuilt without redeploying the verifiers
- **CORS or network errors** — confirm the backend is running and the Vite proxy target matches its port

## 9) Security notes

- Secrets live in `.env` (root) and `backend/hardhat-deploy/.env.hardhat`; both are gitignored and must stay that way
- Raw Aadhaar numbers are hashed and discarded, never stored or returned to the client
- Uploaded images are held in memory only and never written to disk
