export const CONTRACT_ADDRESSES = {
  AgeVerifier: "0xAcA82391AA33bA2070df3e601e71c2b012752d72",
  NameVerifier: "0x23715a3216ACdF715a75463939A342b844dd01eE",
};

export const AMOY_CHAIN_ID = 80002;
export const AMOY_RPC = "https://rpc-amoy.polygon.technology";

// ABI from the deployed Groth16 verifier contracts (snarkjs-generated)
// AgeVerifier: 2 public signals (todayDays, thresholdDays)
export const AGE_VERIFIER_ABI = [
  "function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[2] calldata _pubSignals) public view returns (bool)",
];

// NameVerifier: 1 public signal (claimedNameHash)
export const NAME_VERIFIER_ABI = [
  "function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[1] calldata _pubSignals) public view returns (bool)",
];
