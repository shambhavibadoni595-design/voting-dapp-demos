require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Load ../.env (project root) without an extra dependency.
// Real environment variables always win over the file.
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const SOLC_VERSION = "0.8.28";
const SOLC_LONG_VERSION = "0.8.28+commit.7893614a";

// ---------------------------------------------------------------------------
// Compile with the solc build bundled in node_modules (npm package "solc"),
// so compiling never needs to download from binaries.soliditylang.org.
// The bytecode is identical to the native compiler for the same settings,
// which is what Etherscan verification checks.
// Set Demos_NATIVE_SOLC=1 to let Hardhat download the native compiler instead.
// ---------------------------------------------------------------------------
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION && process.env.DEMOS_NATIVE_SOLC !== "1") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: SOLC_LONG_VERSION,
    };
  }
  return runSuper();
});

function normalisePrivateKey(raw) {
  if (!raw) return null;
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  return /^0x[0-9a-fA-F]{64}$/.test(key) ? key : null;
}

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const DEPLOYER_KEY = normalisePrivateKey(process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY);
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// The in-process Hardhat network normally uses chain ID 31337. For a local
// rehearsal of the website (which only talks to chain 11155111) you can run
// `HARDHAT_CHAIN_ID=11155111 npx hardhat node`. That is still a private local
// chain, not Sepolia.
const HARDHAT_CHAIN_ID = Number(process.env.HARDHAT_CHAIN_ID || 31337);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: HARDHAT_CHAIN_ID,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: HARDHAT_CHAIN_ID,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  // A single Etherscan.io key uses the multichain v2 API, which covers Sepolia.
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: true,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "1",
    currency: "USD",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 60000,
  },
};
