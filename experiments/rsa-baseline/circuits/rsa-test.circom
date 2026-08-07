pragma circom 2.1.6;

// Verbatim reproduction of zk-email's own test wrapper:
//   zk-email-verify/packages/circuits/tests/test-circuits/rsa-test.circom
// Only the include path differs (npm package path instead of a repo-relative one).
// No project data is involved here - this compiles the upstream circuit as-is.
include "@zk-email/circuits/lib/rsa.circom";

component main { public [modulus] } = RSAVerifier65537(121, 17);
