pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

template GenderVerification() {
    // Private input — the actual gender code from KYC (1=Male, 2=Female, 3=Other)
    // Never revealed in the proof
    signal input genderCode;

    // Public input — the gender code the verifier wants to check against
    signal input claimedGender;

    // Check equality: genderCode === claimedGender
    component eq = IsEqual();
    eq.in[0] <== genderCode;
    eq.in[1] <== claimedGender;

    // Constrain the output to be 1 (match)
    eq.out === 1;
}

component main {public [claimedGender]} = GenderVerification();
