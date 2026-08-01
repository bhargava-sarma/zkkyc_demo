#!/bin/bash

# =============================================================
# ZK-KYC Circuit Setup Script
# Run this once before starting the backend
# Prerequisites: circom (Circom 2.0) and snarkjs installed globally
# =============================================================

set -e

CIRCUIT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$CIRCUIT_DIR"

echo "=== ZK-KYC Circuit Setup ==="
echo ""

# Step 1: Install circomlib (needed for comparators.circom)
echo "[1/5] Installing circomlib..."
if [ ! -d "node_modules/circomlib" ]; then
    npm init -y > /dev/null 2>&1
    npm install circomlib > /dev/null 2>&1
fi
echo "  ✓ circomlib installed"

# Step 2: Download Powers of Tau (bn128, power 12)
echo "[2/5] Downloading Powers of Tau ceremony file..."
if [ ! -f "pot12_final.ptau" ]; then
    wget -q https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau -O pot12_final.ptau
fi
echo "  ✓ Powers of Tau file ready"

# =============================================
# Function to compile and setup a single circuit
# =============================================
setup_circuit() {
    local CIRCUIT_NAME=$1
    local ZKEY_PREFIX=$2

    echo ""
    echo "--- Setting up ${CIRCUIT_NAME} ---"

    # Compile
    echo "  [a] Compiling ${CIRCUIT_NAME}..."
    circom "${CIRCUIT_NAME}.circom" --r1cs --wasm --sym -o .
    echo "    ✓ Compiled (R1CS + WASM + SYM)"

    # Groth16 setup
    echo "  [b] Running Groth16 setup..."
    snarkjs groth16 setup "${CIRCUIT_NAME}.r1cs" pot12_final.ptau "${ZKEY_PREFIX}_0000.zkey"
    echo "    ✓ Initial zkey generated"

    # Contribute to ceremony
    echo "  [c] Contributing to ceremony..."
    snarkjs zkey contribute "${ZKEY_PREFIX}_0000.zkey" "${ZKEY_PREFIX}_final.zkey" \
        --name="ZK-KYC Demo" -v -e="zkkyc-${ZKEY_PREFIX}-entropy"
    echo "    ✓ Final zkey generated"

    # Export verification key
    echo "  [d] Exporting verification key..."
    snarkjs zkey export verificationkey "${ZKEY_PREFIX}_final.zkey" "${ZKEY_PREFIX}_vkey.json"
    echo "    ✓ Verification key exported"

    # Cleanup intermediate zkey
    rm -f "${ZKEY_PREFIX}_0000.zkey"

    echo "  ✓ ${CIRCUIT_NAME} setup complete"
}

# =============================================
# Step 3-5: Setup all three circuits
# =============================================

echo ""
echo "[3/5] Setting up AgeVerification circuit..."
setup_circuit "AgeVerification" "age"

echo ""
echo "[4/5] Setting up NameVerification circuit..."
setup_circuit "NameVerification" "name"

echo ""
echo "[5/5] Setting up GenderVerification circuit..."
setup_circuit "GenderVerification" "gender"

# Rename age vkey for backward compatibility
if [ -f "age_vkey.json" ] && [ ! -f "verification_key.json" ]; then
    cp age_vkey.json verification_key.json
fi

echo ""
echo "=== Setup Complete ==="
echo "Circuit artifacts are ready in: $CIRCUIT_DIR"
echo ""
echo "  AgeVerification:"
echo "    - AgeVerification_js/AgeVerification.wasm"
echo "    - age_final.zkey"
echo "    - age_vkey.json"
echo ""
echo "  NameVerification:"
echo "    - NameVerification_js/NameVerification.wasm"
echo "    - name_final.zkey"
echo "    - name_vkey.json"
echo ""
echo "  GenderVerification:"
echo "    - GenderVerification_js/GenderVerification.wasm"
echo "    - gender_final.zkey"
echo "    - gender_vkey.json"
