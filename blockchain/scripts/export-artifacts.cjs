/**
 * Copies the compiled ABI and bytecode into the website (src/config) so the
 * frontend always matches the contract you just compiled and tested.
 *
 * Run automatically by `npm run compile`, and by the deploy script.
 */
const fs = require("fs");
const path = require("path");

const ARTIFACT = path.resolve(__dirname, "../artifacts/contracts/VotingDApp.sol/VotingDApp.json");
const FRONTEND_CONFIG = path.resolve(__dirname, "../../src/config");

function exportArtifacts() {
  if (!fs.existsSync(ARTIFACT)) {
    throw new Error("Artifact not found. Run `npx hardhat compile` first.");
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
  fs.mkdirSync(FRONTEND_CONFIG, { recursive: true });

  fs.writeFileSync(
    path.join(FRONTEND_CONFIG, "VotingDAppABI.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(FRONTEND_CONFIG, "VotingDAppBytecode.json"),
    JSON.stringify(
      {
        contractName: artifact.contractName,
        compiler: "0.8.28+commit.7893614a",
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "cancun",
        bytecode: artifact.bytecode,
      },
      null,
      2
    ) + "\n"
  );
  console.log("Exported ABI and bytecode to", FRONTEND_CONFIG);
}

if (require.main === module) exportArtifacts();
module.exports = { exportArtifacts };
