/**
 * Verify the deployed VotingDApp source on Sepolia Etherscan (and Sourcify).
 *
 *   npx hardhat run scripts/verify.cjs --network sepolia
 *
 * Reads the address from deployments/sepolia.json, or CONTRACT_ADDRESS if set.
 * Requires ETHERSCAN_API_KEY in .env (free key from etherscan.io → API Keys).
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  let address = process.env.CONTRACT_ADDRESS;
  if (!address) {
    const file = path.resolve(__dirname, `../deployments/${hre.network.name}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`No ${file}. Deploy first or set CONTRACT_ADDRESS=0x...`);
    }
    address = JSON.parse(fs.readFileSync(file, "utf8")).address;
  }
  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error("Set ETHERSCAN_API_KEY in .env to verify on Etherscan.");
  }
  console.log("Verifying", address, "on", hre.network.name);
  await hre.run("verify:verify", {
    address,
    contract: "contracts/VotingDApp.sol:VotingDApp",
    constructorArguments: [],
  });
}

main().catch((error) => {
  const msg = String(error.message || error);
  if (/already verified/i.test(msg)) {
    console.log("Already verified.");
    return;
  }
  console.error(msg);
  process.exitCode = 1;
});
