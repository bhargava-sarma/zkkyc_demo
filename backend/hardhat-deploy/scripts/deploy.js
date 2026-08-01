const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\nDeploying contracts with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MATIC\n");

  const deployedAddresses = {};

  // Deploy AgeVerifier
  console.log("Deploying AgeVerifier...");
  const AgeVerifier = await ethers.getContractFactory("AgeVerifier");
  const ageVerifier = await AgeVerifier.deploy();
  await ageVerifier.waitForDeployment();
  const ageAddress = await ageVerifier.getAddress();
  deployedAddresses.AgeVerifier = ageAddress;
  console.log("AgeVerifier deployed to:", ageAddress);

  // Deploy NameVerifier
  console.log("\nDeploying NameVerifier...");
  const NameVerifier = await ethers.getContractFactory("NameVerifier");
  const nameVerifier = await NameVerifier.deploy();
  await nameVerifier.waitForDeployment();
  const nameAddress = await nameVerifier.getAddress();
  deployedAddresses.NameVerifier = nameAddress;
  console.log("NameVerifier deployed to:", nameAddress);

  // Deploy GenderVerifier
  console.log("\nDeploying GenderVerifier...");
  const GenderVerifier = await ethers.getContractFactory("GenderVerifier");
  const genderVerifier = await GenderVerifier.deploy();
  await genderVerifier.waitForDeployment();
  const genderAddress = await genderVerifier.getAddress();
  deployedAddresses.GenderVerifier = genderAddress;
  console.log("GenderVerifier deployed to:", genderAddress);

  // Save addresses to JSON
  const outputPath = path.join(__dirname, "../abis/deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployedAddresses, null, 2));
  console.log("\n✅ All contracts deployed! Addresses saved to abis/deployed-addresses.json");
  console.log(JSON.stringify(deployedAddresses, null, 2));

  // Export ABIs
  const artifactsBase = path.join(__dirname, "../artifacts/contracts");
  const contracts = ["AgeVerifier", "NameVerifier", "GenderVerifier"];
  for (const name of contracts) {
    const artifactPath = path.join(artifactsBase, `${name}.sol/${name}.json`);
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath));
      const abiPath = path.join(__dirname, `../abis/${name}.json`);
      fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
      console.log(`ABI saved: abis/${name}.json`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
