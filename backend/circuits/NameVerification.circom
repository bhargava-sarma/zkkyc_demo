pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

template NameVerification() {
    // Private input — the actual name hash from KYC, never revealed in proof
    signal input nameHash;

    // Public input — the hash the verifier is checking against
    signal input claimedNameHash;

    // Check equality: nameHash === claimedNameHash
    component eq = IsEqual();
    eq.in[0] <== nameHash;
    eq.in[1] <== claimedNameHash;

    // Constrain the output to be 1 (match)
    eq.out === 1;
}

component main {public [claimedNameHash]} = NameVerification();
