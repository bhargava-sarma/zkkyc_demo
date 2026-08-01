import { ethers } from "ethers";
import {
  CONTRACT_ADDRESSES,
  AMOY_RPC,
  AGE_VERIFIER_ABI,
  NAME_VERIFIER_ABI,
} from "./contractConfig";

/**
 * Convert snarkjs proof output to Solidity-compatible calldata format.
 *
 * snarkjs format:
 *   proof.pi_a = [x, y, "1"]
 *   proof.pi_b = [[x1, x2], [y1, y2], ["1", "0"]]   ← note: snarkjs stores b[i] as [x, y]
 *   proof.pi_c = [x, y, "1"]
 *
 * Solidity format (Groth16Verifier):
 *   pA = [x, y]
 *   pB = [[x2, x1], [y2, y1]]   ← reversed per snarkjs/circom convention
 *   pC = [x, y]
 */
function formatProofForSolidity(proof) {
  const pA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];

  // pB indices are swapped: snarkjs stores [[b00,b01],[b10,b11]]
  // but the Solidity verifier expects [[b01,b00],[b11,b10]]
  const pB = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];

  const pC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  return { pA, pB, pC };
}

/**
 * Verify a Groth16 proof on-chain via a read-only call to the Polygon Amoy testnet.
 *
 * @param {Object} proof      — snarkjs proof object (pi_a, pi_b, pi_c)
 * @param {string[]} publicSignals — snarkjs public signals array (string numbers)
 * @param {"age"|"name"} proofType — which verifier contract to call
 * @returns {Promise<{onChainValid: boolean, txHash: null, contractAddress: string, error: null|string}>}
 */
export async function verifyOnChain(proof, publicSignals, proofType) {
  // Only age and name have deployed contracts
  if (proofType !== "age" && proofType !== "name") {
    return {
      onChainValid: false,
      txHash: null,
      contractAddress: null,
      error: `No on-chain verifier deployed for "${proofType}" proofs.`,
    };
  }

  const contractAddress =
    proofType === "age"
      ? CONTRACT_ADDRESSES.AgeVerifier
      : CONTRACT_ADDRESSES.NameVerifier;

  const abi =
    proofType === "age" ? AGE_VERIFIER_ABI : NAME_VERIFIER_ABI;

  try {
    // Read-only provider — no wallet needed for view functions
    const provider = new ethers.JsonRpcProvider(AMOY_RPC);
    const contract = new ethers.Contract(contractAddress, abi, provider);

    // Convert proof to Solidity calldata format
    const { pA, pB, pC } = formatProofForSolidity(proof);
    const pubSignals = publicSignals.map((s) => BigInt(s));

    // Call the view function on-chain
    const result = await contract.verifyProof(pA, pB, pC, pubSignals);

    return {
      onChainValid: Boolean(result),
      txHash: null,
      contractAddress,
      error: null,
    };
  } catch (err) {
    console.error(`[ON-CHAIN:${proofType.toUpperCase()}] Verification error:`, err);

    // Extract a user-friendly error message
    let errorMessage = err.message || "Unknown error during on-chain verification.";
    if (errorMessage.length > 200) {
      errorMessage = errorMessage.substring(0, 200) + "...";
    }

    return {
      onChainValid: false,
      txHash: null,
      contractAddress,
      error: errorMessage,
    };
  }
}
