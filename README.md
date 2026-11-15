# Demos

**The poll everyone can recount.** Polls on the Ethereum Sepolia testnet: connect a wallet, cast one vote, and every ballot is a public transaction anyone can check on Etherscan.

- Smart contract: `VotingDApp.sol`, Solidity 0.8.28, no owner and no admin
- Network: Ethereum Sepolia (chain ID 11155111) only
- Frontend: React + Vite, ethers.js v6, EIP-6963 wallet discovery
- Explorer: Sepolia Etherscan. Faucet: Google Cloud Web3

There is no server and no database. The contract is the only source of truth; the site reads it through public RPC endpoints and writes to it through your wallet.

## Built-in Sepolia contract

Every visitor uses the same contract. No wallet is needed to browse polls, stats, or activity.

- Address: [0x9E5cA66E99dA712c6A709a6C916b2ca8068BD30E](https://sepolia.etherscan.io/address/0x9E5cA66E99dA712c6A709a6C916b2ca8068BD30E)
- Network: Ethereum Sepolia (chain ID 11155111)
- Deployment block: [12140019](https://sepolia.etherscan.io/block/12140019)

---

## Project layout

```
voting-dapp/
  blockchain/                  Hardhat project (contract, tests, scripts)
    contracts/VotingDApp.sol
    test/VotingDApp.test.cjs   33 tests, 100% line/branch coverage
    scripts/deploy.cjs         deploy, seed sample poll, write site config
    scripts/verify.cjs         Etherscan + Sourcify verification
    scripts/export-artifacts.cjs  copies ABI + bytecode into src/config
  src/
    config/contractConfig.js   network, RPCs, faucet, active-contract selection
    config/deployment.json     the built-in public contract and deployment block
    config/VotingDAppABI.json  generated
    services/
      votingService.js         the only module the UI imports
      walletService.js         EIP-6963 discovery, connect, switch/add Sepolia
      contractService.js       reads, event-log indexing, live block watcher
      transactionService.js    gas preflight, lifecycle, receipts
    state/DemosContext.jsx    app state + useTransaction hook
    components/ pages/         UI
  e2e/                         local end-to-end rehearsal (Chrome + test wallet)
  .env.example
```

## Run it

Requires Node.js 18 or newer.

```bash
npm install
cd blockchain && npm install && cd ..
npm run dev            # http://localhost:3000
```

The built-in contract is configured in `src/config/deployment.json`. `VITE_CONTRACT_ADDRESS` and `VITE_DEPLOYMENT_BLOCK` are optional developer overrides for local builds; the deployed site does not depend on Vercel environment variables.

---

## Developer only: deploying a separate contract

You need a wallet holding a little Sepolia test ETH. Deploying costs about 1.23M gas; creating a poll about 220k; a vote about 95k.

**Get test ETH:** open the [Google Cloud Web3 Sepolia faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), sign in with a Google account, paste your wallet address and request. Google sets the amount and daily limit. Test ETH has no monetary value.

For a separate developer test deployment, use Hardhat:

1. Create a **throwaway** MetaMask account used only for deploying, fund it from the faucet, and export its private key (MetaMask → account menu → Account details → Show private key). Never use the key of a wallet that holds real funds.
2. `cp .env.example .env` and set `DEPLOYER_PRIVATE_KEY=` (and optionally a more reliable `SEPOLIA_RPC_URL`).
3. Run:
   ```bash
   cd blockchain
   npx hardhat test          # deploy only after these pass
   npm run deploy:sepolia
   ```
   The script checks the balance, deploys, waits for 2 confirmations, creates the sample poll (set `SEED_SAMPLE_POLL=false` to skip), and writes the real address and block into `src/config/deployment.json` and `blockchain/deployments/sepolia.json`.

### Verify the source on Etherscan

1. Get a free API key at https://etherscan.io/myapikey and set `ETHERSCAN_API_KEY=` in `.env`.
2. If you used Option A, also add `CONTRACT_ADDRESS=0x...` to `.env`.
3. `cd blockchain && npm run verify:sepolia`

Settings used (needed if you verify by hand): Solidity **v0.8.28+commit.7893614a**, optimizer **on, 200 runs**, EVM **cancun**, no constructor arguments, MIT licence.

After verification, Etherscan's *Read Contract* tab lets anyone call `getPoll`, `getVoterChoice` and `getStats` themselves.

### Publish the site

`npm run build` produces `dist/`, a static site you can host anywhere (Netlify, Vercel, GitHub Pages, Cloudflare Pages). It uses hash routes (`#/polls`), so no server rewrites are needed.

---

## Tests

```bash
npm run test:contracts    # 33 Hardhat tests
npm run test:e2e          # full flow in Chrome against a local chain
```

`test:e2e` starts a private Hardhat chain that uses Sepolia's chain ID, deploys a local test contract, builds the site against it, and drives it in Chrome with a test-only wallet (`e2e/test-wallet.js`, never bundled into the app). It checks wallet-free browsing, configured contract selection despite stale local storage, rejected connection, wrong network and switching, poll validation, creating a poll, account switching, voting and the receipt, duplicate votes, insufficient gas, rejected and pending transactions, creator-only closing, an expired poll, activity history, network info, RPC failure, disconnect and mobile layout. It reconciles every receipt the UI showed against the local chain. Screenshots go to `e2e/output/`. It needs Google Chrome installed (set `CHROME_PATH` if it is somewhere unusual).

This rehearsal is not a Sepolia test. Real Sepolia needs your wallet and faucet ETH; use the checklist below.

### Sepolia checklist (needs two MetaMask accounts with test ETH)

1. Open the site without a wallet; polls and stats load.
2. Connect MetaMask; if on another network, approve the switch to Sepolia.
3. Check the balance in the header; if low, use the faucet button and **Refresh balance**.
4. Create a poll and approve it in MetaMask; note the poll ID and transaction.
5. Switch MetaMask to the second account (the header follows).
6. Vote on the new poll; approve; wait for the receipt to print.
7. Try to vote again with the same account; the ballot shows as final.
8. Open **View on Etherscan** on the receipt; check the block, the sender and the `Voted` event match.
9. Check **Activity** lists the poll creation and the vote.
10. Switch back to the creator and close the poll early; confirm nobody can vote after.

---

## How it works

| Concern | Where | Notes |
| --- | --- | --- |
| Rules | `VotingDApp.sol` | 2–10 options, 1 min–30 days, one vote per address per poll, creator-only early close, byte limits on text |
| Reading | `contractService.js` | Public RPC (`VITE_SEPOLIA_RPC_URL`, fallback list), paged `getPolls` |
| Writing | `transactionService.js` | Wallet signer; before opening the wallet it checks network, simulates with `eth_estimateGas` (catches "already voted", "poll closed" for free), reads balance, compares with gas limit × max fee |
| Gas help | `GasAssistPanel.jsx` | Opens the Google faucet in a new tab, copy address, refresh balance, retry. Never requests funds for you |
| Live updates | `contractService.watchChain` | Polls `eth_getLogs` every block for `PollCreated` / `Voted` / `PollClosed`; public RPCs often drop server-side filters |
| History | `LogIndex` | Pages backwards from the deployment block, halving the block range when an RPC refuses a large query |
| Receipts | `votingService.getReceipt` | Rebuilt from the transaction receipt, its `Voted` event, the block and `getPoll` |

`votingService.js` exposes `connectWallet`, `getAccount`, `getAllPolls`, `getPoll`, `getVoterChoice`, `createPoll`, `vote`, `closePoll`, `getTransactionHistory`, `getReceipt`, `createActivityFeed`, `getStats`, `getNetworkInfo`, `linkContract` and `deployNewContract`. Components use nothing else, so the UI can be redesigned without touching blockchain code.

## Limits worth knowing

- **One vote per wallet, not per person.** Someone with several funded addresses can vote several times. The contract cannot tell.
- **Votes are public**: address and choice. Not anonymous.
- Public RPCs can be slow or rate-limited. For a demo, set `VITE_SEPOLIA_RPC_URL` to your own Alchemy, Infura or Google Cloud Blockchain RPC endpoint.
- The site keeps a short list of your own transaction hashes in the browser for convenience; everything shown is re-read from the chain.

## Security

- No private keys, seed phrases or API secrets in the frontend. `VITE_` variables are public by design; only put addresses and URLs there.
- `.env` is git-ignored. The deployer key, if you use Option B, should belong to a throwaway testnet wallet.
- The contract has no owner, no upgrade path and no external calls.
