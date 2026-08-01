pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

template AgeVerification() {
    // Private input — never revealed in proof
    signal input dobDays;

    // Public inputs
    signal input todayDays;
    signal input thresholdDays;

    // Compute age in days
    signal ageDays;
    ageDays <== todayDays - dobDays;

    // Assert ageDays >= thresholdDays using GreaterEqThan
    // 32 bits is sufficient for days (covers ~11.7 million days ≈ 32,000 years)
    component gte = GreaterEqThan(32);
    gte.in[0] <== ageDays;
    gte.in[1] <== thresholdDays;

    // Constrain the output to be 1 (true)
    gte.out === 1;
}

component main {public [todayDays, thresholdDays]} = AgeVerification();
