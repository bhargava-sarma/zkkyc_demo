# zkkyc_demo — Project A–Z

This document provides a comprehensive A–Z overview of the zkkyc_demo project (privacy-preserving KYC demo using zero-knowledge proofs).

Repository root: /home/obiwankenobi_05/Bhargav/zkkyc_demo

---

1) Project summary

- Name: zkkyc_demo
- Purpose: Demonstration of privacy-preserving Know-Your-Customer (KYC) flows using zero-knowledge proofs (ZK). The project includes a frontend, a backend, and circuit-related code used to generate and verify ZK proofs.
- High-level features:
  - Capture KYC documents/images
  - Extract text (OCR) via tesseract
  - Generate ZK proofs (snarkjs/circom flows)
  - Store or verify KYC attributes privately (example integration with Supabase)

2) Top-level structure

- backend/
  - Node/Express backend that accepts uploads, runs OCR, and works with snarkjs for proof generation/verification.
  - package.json lists runtime dependencies: express, cors, multer, dotenv, snarkjs, tesseract.js, @supabase/supabase-js
  - Entry: server.js (main) — start with `node server.js` or `npm start` in backend directory

- backend/circuits/
  - Circuit sources and supporting package.json (circom/snarkjs related tooling)

- frontend/
  - React + Vite frontend (name: zkkyc-frontend). Uses axios, ethers, and React.
  - Start dev server with `npm run dev` inside frontend

- other folders (node_modules, build artifacts) — standard dependencies and local modules

3) How to run (development)

Prerequisites:
- Node.js (recommended LTS >= 18)
- npm (or pnpm/yarn if you prefer; this repo uses package.json / npm by default)

Backend (development):
- cd backend
- npm install
- Set environment variables (create a .env file) — e.g., SUPABASE_URL, SUPABASE_KEY, any DB/secret values used by the backend
- npm run dev  # or npm start

Frontend (development):
- cd frontend
- npm install
- npm run dev
- Open the vite dev server URL (usually http://localhost:5173)

Circuits (if present):
- cd backend/circuits
- follow README in that folder to compile circuits and generate trusted setups (snarkjs/circom flows). Typical steps include: `circom` compile, `snarkjs` setup, `snarkjs` prove/verify

4) Key files of interest
- /backend/server.js — express server, endpoints for upload, proof generation, verification
- /backend/package.json — runtime deps; scripts: start/dev
- /frontend/package.json — dev tooling (vite) and react deps
- /backend/circuits/ — circom circuit sources and package.json for tooling

5) Dependencies (quick view)
- Backend: @supabase/supabase-js, cors, dotenv, express, multer, snarkjs, tesseract.js
- Frontend: axios, ethers, react, react-dom
- Dev tooling (frontend): vite, @vitejs/plugin-react, @types/react, etc.

6) Development notes & recommendations
- Keep secrets out of source control. Use .env for environment config and do not commit it.
- Circuits and zk artifacts can be large; add them to .gitignore if not already ignored.
- If adding CI/CD, only store artifacts needed for verification; avoid storing sensitive or PII-related test data.
- Use modern node LTS and keep snarkjs/circom versions pinned to reproducible releases.

7) Typical workflow summary
- Developer runs frontend dev server to test UI flows
- Upload KYC document/images via UI → backend receives and runs OCR
- Backend/worker generates witness + proof using circom/snarkjs and returns proof or verification result to the client
- Optionally persist minimal verifiable state or send proof to on-chain verifier

8) Troubleshooting pointers
- If tesseract fails: check system-level tesseract installation and language packs
- If snarkjs commands fail: ensure circom/snarkjs versions match the circuits' expectations
- If CORS or network errors: verify backend CORS configuration and frontend dev server proxy settings

9) Next steps & TODOs
- Add a single README (this file) and remove redundant markdown files across the repo (this has been done)
- Add CI scripts for building circuits and running basic verification tests
- Add automated tests for backend endpoints

10) Contact / Maintainers
- No explicit maintainer listed in repo. If this is a personal/demo project, use the repository owner/contact details externally.

---

Notes about cleanup performed:
- All existing .md files were removed across the repository, and this single PROJECT_A-Z.md was created at the repository root to centralize documentation.

If any details are missing or require deeper, file-level documentation (e.g., circuit compilation steps in backend/circuits), ask to include those as dedicated sections in this file.
