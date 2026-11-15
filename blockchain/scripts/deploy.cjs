/**
 * Deploy VotingDApp.
 *
 *   npx hardhat run scripts/deploy.cjs --network sepolia
 *   npx hardhat run scripts/deploy.cjs --network localhost   (local rehearsal)
 *
 * On Sepolia this:
 *   1. checks the deployer key is configured and has enough test ETH,
 *   2. deploys and waits for 2 confirmations,
 *   3. optionally creates the sample poll (SEED_SAMPLE_POLL, default true),
 *   4. writes the real address and deployment block to
 *        blockchain/deployments/sepolia.json  and  src/config/deployment.json
 *      so the website uses this contract by default.
 *
 * Nothing here invents an address: everything written comes from the receipt.
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { exportArtifacts } = require("./export-artifacts.cjs");

const SAMPLE_POLL = {
  question: "Which technology will have the biggest impact on the future?",
  description: "One vote per wallet. The count is read straight from the contract.",
  options: [
    "Artificial Intelligence (AI)",
    "Blockchain & Web3",
    "Quantum Computing",
    "Robotics & Automation",
  ],
  durationSeconds: 14 * 24 * 60 * 60, // 14 days
};

async function main() {
  const { ethers, network } = hre;
  const isSepolia = network.name === "sepolia";
  const confirmations = isSepolia ? 2 : 1;

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account. Set DEPLOYER_PRIVATE_KEY in .env (a throwaway test wallet, never your main wallet), " +
        "or deploy from the website's Contract page with MetaMask instead."
    );
  }
  const deployer = signers[0];
  const { chainId } = await ethers.provider.getNetwork();
  if (isSepolia && chainId !== 11155111n) {
    throw new Error(`RPC returned chain ID ${chainId}, expected 11155111 (Sepolia). Check SEPOLIA_RPC_URL.`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  const Factory = await ethers.getContractFactory("VotingDApp");
  const deployTx = await Factory.getDeployTransaction();
  const gasEstimate = await ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
  const fee = await ethers.provider.getFeeData();
  const maxFee = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  const worstCase = (gasEstimate * 12n) / 10n * maxFee;

  console.log("Network:          ", network.name, `(chain ${chainId})`);
  console.log("Deployer:         ", deployer.address);
  console.log("Balance:          ", ethers.formatEther(balance), "ETH");
  console.log("Estimated gas:    ", gasEstimate.toString());
  console.log("Worst-case cost:  ", ethers.formatEther(worstCase), "ETH");

  if (balance < worstCase) {
    throw new Error(
      "Not enough Sepolia ETH to deploy. Request test ETH for " +
        deployer.address +
        " from https://cloud.google.com/application/web3/faucet/ethereum/sepolia and try again."
    );
  }

  console.log("\nSending deployment transaction...");
  const contract = await Factory.deploy();
  const tx = contract.deploymentTransaction();
  console.log("Transaction:      ", tx.hash);
  const receipt = await tx.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error("Deployment transaction failed.");

  const address = await contract.getAddress();
  console.log("Deployed at:      ", address);
  console.log("Deployment block: ", receipt.blockNumber);

  const record = {
    network: network.name,
    chainId: Number(chainId),
    address,
    deploymentBlock: receipt.blockNumber,
    transactionHash: tx.hash,
    deployer: deployer.address,
    compiler: "0.8.28+commit.7893614a",
    optimizerRuns: 200,
    evmVersion: "cancun",
    deployedAt: new Date().toISOString(),
    samplePoll: null,
  };

  const seed = (process.env.SEED_SAMPLE_POLL ?? "true").toLowerCase() !== "false";
  if (seed) {
    console.log("\nCreating the sample poll...");
    const seedTx = await contract.createPoll(
      SAMPLE_POLL.question,
      SAMPLE_POLL.description,
      SAMPLE_POLL.options,
      SAMPLE_POLL.durationSeconds
    );
    const seedReceipt = await seedTx.wait(1);
    const parsed = seedReceipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "PollCreated");
    record.samplePoll = {
      pollId: parsed ? Number(parsed.args.pollId) : null,
      transactionHash: seedTx.hash,
      blockNumber: seedReceipt.blockNumber,
    };
    console.log("Sample poll ID:   ", record.samplePoll.pollId, "tx", seedTx.hash);
  }

  // Save deployment records
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentsDir, `${network.name}.json`), JSON.stringify(record, null, 2) + "\n");

  exportArtifacts();

  if (isSepolia) {
    const frontendDeployment = path.resolve(__dirname, "../../src/config/deployment.json");
    fs.writeFileSync(
      frontendDeployment,
      JSON.stringify(
        {
          chainId: 11155111,
          address,
          deploymentBlock: receipt.blockNumber,
          transactionHash: tx.hash,
        },
        null,
        2
      ) + "\n"
    );
    console.log("\nWebsite default contract updated:", frontendDeployment);
    console.log("Etherscan:", `https://sepolia.etherscan.io/address/${address}`);
    console.log("\nNext: npm run verify:sepolia   (needs ETHERSCAN_API_KEY in .env)");
  }
}

main().catch((error) => {
  console.error("\nDeployment failed:", error.message || error);
  process.exitCode = 1;
});
