/**
 * Local end-to-end rehearsal of the whole Ballot flow.
 *
 *   node e2e/run-local.mjs
 *
 * What it does:
 *   1. starts a private Hardhat chain that uses Sepolia's chain ID (11155111),
 *   2. deploys VotingDApp with the real deploy script,
 *   3. builds the real website pointed at that chain,
 *   4. drives it in Chrome with a test wallet (see test-wallet.js),
 *   5. checks every receipt and count the UI showed against the chain itself.
 *
 * This proves the code paths end to end. It is NOT a Sepolia test: Sepolia needs
 * your own wallet and faucet ETH, which only you can provide.
 *
 * Env: CHROME_PATH (optional), E2E_HEADED=1 to watch it run.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import { testWalletScript } from './test-wallet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHAIN = path.join(ROOT, 'blockchain');
const OUT = path.join(__dirname, 'output');
const RPC = 'http://127.0.0.1:8545';
const APP_PORT = 4173;
const APP = `http://127.0.0.1:${APP_PORT}/`;
const SEPOLIA = 11155111;
const GOOGLE_FAUCET = 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia';
const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/VotingDAppABI.json'), 'utf8'));
const iface = new Interface(abi);

const children = [];
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.quiet ? 'pipe' : 'inherit', shell: process.platform === 'win32', ...opts });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.stderr?.on('data', (d) => (out += d));
    p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${out}`))));
  });
}
function background(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: 'pipe', ...opts });
  children.push(p);
  return p;
}
async function rpc(method, params = []) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}
async function waitFor(fn, label, ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (await fn()) return;
    } catch {
      /* retry */
    }
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = {
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
  }[process.platform] || [];
  return candidates.find((c) => c && fs.existsSync(c));
}

// ---------------------------------------------------------------------------
const results = [];
let step = 0;
async function check(name, fn) {
  step += 1;
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ step, name, ok: true, ms: Date.now() - t0, detail: detail || '' });
    console.log(`  ✔ ${step}. ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    results.push({ step, name, ok: false, ms: Date.now() - t0, error: String(err.message || err) });
    console.log(`  ✘ ${step}. ${name}\n      ${String(err.message || err).split('\n')[0]}`);
    throw err;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // 1. Local chain with Sepolia's chain ID
  let ours = false;
  try {
    const id = parseInt(await rpc('eth_chainId'), 16);
    if (id !== SEPOLIA) throw new Error(`A node on 8545 uses chain ${id}; stop it first.`);
    console.log('Using the Hardhat node already running on 8545.');
  } catch (err) {
    if (/stop it first/.test(err.message)) throw err;
    console.log('Starting a local Hardhat chain (chain ID 11155111)…');
    background(process.execPath, [path.join(CHAIN, 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js'), 'node', '--hostname', '127.0.0.1', '--port', '8545'], { cwd: CHAIN, env: { ...process.env, HARDHAT_CHAIN_ID: String(SEPOLIA) } });
    ours = true;
    await waitFor(async () => parseInt(await rpc('eth_chainId'), 16) === SEPOLIA, 'local chain');
  }
  await rpc('evm_setAutomine', [true]);

  const accounts = await rpc('eth_accounts');
  const [A0, A1, A2, A3, A4, A5, A6] = accounts;
  const deployerNonce = BigInt(await rpc('eth_getTransactionCount', [A0, 'latest']));
  await rpc('hardhat_setNonce', [A0, `0x${(deployerNonce + 1n).toString(16)}`]);

  // 2. Deploy with the real deploy script
  console.log('Deploying VotingDApp to the local chain…');
  await run('npx', ['hardhat', 'run', 'scripts/deploy.cjs', '--network', 'localhost'], { cwd: CHAIN, quiet: true, env: { ...process.env, HARDHAT_CHAIN_ID: String(SEPOLIA) } });
  const deployment = JSON.parse(fs.readFileSync(path.join(CHAIN, 'deployments/localhost.json'), 'utf8'));
  console.log(`  contract ${deployment.address}, block ${deployment.deploymentBlock}`);

  // 3. Build the real site pointed at the local chain
  console.log('Building the website for the local chain…');
  const dist = path.join(__dirname, '.dist');
  await run('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: ROOT,
    quiet: true,
    env: {
      ...process.env,
      VITE_SEPOLIA_RPC_URL: RPC,
      VITE_CONTRACT_ADDRESS: deployment.address,
      VITE_DEPLOYMENT_BLOCK: String(deployment.deploymentBlock),
      VITE_POLL_INTERVAL_MS: '1500',
    },
  });
  background(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', dist, '--port', String(APP_PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT });
  await waitFor(async () => (await fetch(APP)).ok, 'preview server');

  // Chain-side helpers for verification
  const provider = new JsonRpcProvider(RPC, SEPOLIA, { staticNetwork: true });
  const voting = new Contract(deployment.address, abi, provider);

  const executablePath = chromePath();
  if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome executable.');
  const browser = await chromium.launch({ executablePath, headless: process.env.E2E_HEADED !== '1', args: ['--no-sandbox'] });

  async function user(account, { chainId = SEPOLIA, wallet = true, viewport = { width: 1280, height: 900 } } = {}) {
    const context = await browser.newContext({ viewport });
    if (wallet) await context.addInitScript(testWalletScript({ rpcUrl: RPC, account, chainId }));
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => console.log('    [page error]', e.message));
    return { context, page };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const sentTx = (page) => page.evaluate(() => window.__testWallet.log.filter((m) => m === 'eth_sendTransaction').length);
  async function connect(page) {
    await page.locator('header .btn-wallet').click();
    await page.locator('a.wallet-chip').waitFor();
  }
  async function voteOn(page, pollId, optionIndex) {
    await page.goto(`${APP}#/poll/${pollId}`);
    await page.locator('.ballot-option').nth(optionIndex).click();
    await page.getByRole('button', { name: 'Vote', exact: true }).click();
  }
  async function readReceipt(page, scope = '.poll-aside') {
    const slip = page.locator(`${scope} .slip`);
    await slip.locator('.slip-stamp').waitFor();
    const row = async (label) => (await slip.locator(`.slip-row:has(dt:text-is("${label}")) dd`).innerText()).trim();
    return {
      hash: (await slip.locator('.slip-hash').innerText()).trim(),
      block: Number((await row('Block')).replace(/[^0-9]/g, '')),
      voter: await slip.locator('.slip-row:has(dt:text-is("Voter")) a').getAttribute('title'),
      choice: (await slip.locator('.slip-choice-text').innerText()).trim(),
      poll: (await row('Poll')).replace('#', ''),
    };
  }
  async function verifyReceiptOnChain(r, expect) {
    const rc = await provider.getTransactionReceipt(r.hash);
    assert(rc && rc.status === 1, 'transaction not mined successfully');
    assert(rc.blockNumber === r.block, `block mismatch UI ${r.block} vs chain ${rc.blockNumber}`);
    assert(rc.from.toLowerCase() === r.voter.toLowerCase(), 'voter mismatch');
    const ev = rc.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((e) => e?.name === 'Voted');
    assert(ev, 'no Voted event');
    assert(Number(ev.args.pollId) === expect.pollId, 'poll id mismatch');
    assert(Number(ev.args.optionIndex) === expect.optionIndex, 'option mismatch');
    const poll = await voting.getPoll(expect.pollId);
    assert(poll.options[expect.optionIndex] === r.choice, `choice text mismatch "${r.choice}"`);
    return `block ${rc.blockNumber}, voter ${rc.from.slice(0, 8)}…, option ${expect.optionIndex}`;
  }

  console.log('\nRunning the flow in Chrome:');
  const created = {};
  const votes = [];

  // ---- Browsing without a wallet ----
  const guest = await user(null, { wallet: false });
  await check('Open Ballot without a wallet: hero, live stats from the contract', async () => {
    await guest.page.addInitScript((address) => {
      localStorage.setItem('ballot.linkedContract.v1', JSON.stringify({ address, deploymentBlock: 1, source: 'linked' }));
    }, A0);
    await guest.page.goto(APP);
    await guest.page.getByRole('heading', { name: 'The poll everyone can recount.' }).waitFor();
    assert((await guest.page.evaluate(() => localStorage.getItem('ballot.linkedContract.v1'))) === null, 'stale contract was not cleared');
    await guest.page.locator('.stats').waitFor();
    await waitFor(async () => (await guest.page.locator('.stat dd').first().innerText()) === '1', 'stats');
    const vals = await guest.page.locator('.stat dd').allInnerTexts();
    const [tp, tv] = await voting.getStats();
    assert(vals[0] === String(tp) && vals[1] === String(tv) && vals[2] === '1', `stats ${vals} vs chain ${tp},${tv}`);
    await shot(guest.page, '01-home-no-wallet');
    return `polls ${vals[0]}, votes ${vals[1]}, open ${vals[2]}`;
  });
  await check('Browse live polls without a wallet (sample poll read from chain)', async () => {
    await guest.page.goto(`${APP}#/polls`);
    await guest.page.getByText('Which technology will have the biggest impact on the future?').first().waitFor();
    const opts = await guest.page.locator('.poll-row .result-label').allInnerTexts();
    assert(opts.length === 4 && opts[0].startsWith('Artificial Intelligence'), `options ${opts}`);
    await shot(guest.page, '02-polls-no-wallet');
  });
  await check('Connect with no wallet installed shows install guidance, not a fake connection', async () => {
    await guest.page.locator('header .btn-wallet').click();
    await guest.page.getByText('No browser wallet was found').waitFor();
    await guest.page.keyboard.press('Escape');
  });

  const homeConnector = await user(A0);
  await check('A successful home-page wallet connection opens Create a poll', async () => {
    await homeConnector.page.goto(APP);
    await homeConnector.page.locator('header .btn-wallet').click();
    await homeConnector.page.locator('a.wallet-chip').waitFor();
    await waitFor(async () => new URL(homeConnector.page.url()).hash === '#/create', 'Create a poll after connection');
    await homeConnector.page.getByRole('heading', { name: 'Create a poll', level: 1 }).waitFor();
    return 'connected on Sepolia and opened the create route';
  });
  await homeConnector.context.close();

  // ---- Creator: connect, wrong network, switch ----
  const creator = await user(A1, { chainId: 1 });
  await check('Rejected wallet connection is handled', async () => {
    await creator.page.goto(APP);
    await creator.page.evaluate(() => (window.__testWallet.rejectConnect = true));
    await creator.page.locator('header .btn-wallet').click();
    await creator.page.getByText('You declined the connection request').waitFor();
    assert(await creator.page.locator('header .btn-wallet').isVisible(), 'should still show Connect');
  });
  await check('Connect wallet on the wrong network shows the switch banner', async () => {
    await connect(creator.page);
    await creator.page.getByText('Your wallet is on chain 1.').waitFor();
    await shot(creator.page, '03-wrong-network');
  });
  await check('Switch to Sepolia from the banner', async () => {
    await creator.page.getByRole('button', { name: 'Switch to Sepolia' }).click();
    await creator.page.locator('.network-banner').waitFor({ state: 'detached' });
    const chip = await creator.page.locator('a.wallet-chip').getAttribute('title');
    assert(chip.toLowerCase() === A1.toLowerCase(), 'wallet chip address');
  });

  // ---- Create a poll ----
  await check('Create-poll validation blocks empty input without sending a transaction', async () => {
    await creator.page.goto(`${APP}#/create`);
    await creator.page.getByRole('button', { name: 'Create poll' }).click();
    await creator.page.getByText('Write the question voters will answer.').waitFor();
    await creator.page.getByText('Fill in this answer or remove it.').first().waitFor();
    assert((await sentTx(creator.page)) === 0, 'a transaction was sent');
  });
  await check('Create a poll on-chain and confirm the transaction', async () => {
    const p = creator.page;
    await p.locator('#q').fill('Which testnet feature should the club demo first?');
    await p.locator('#d').fill('Created by the end-to-end test.');
    await p.getByLabel('Answer 1', { exact: true }).fill('Gas estimation');
    await p.getByLabel('Answer 2', { exact: true }).fill('Event indexing');
    await p.getByRole('button', { name: /Add an answer/ }).click();
    await p.getByLabel('Answer 3', { exact: true }).fill('Wallet discovery');
    await p.getByRole('button', { name: '1 day' }).click();
    await shot(p, '04-create-form');
    await p.getByRole('button', { name: 'Create poll' }).click();
    await p.getByRole('heading', { name: /Poll #\d+ is live/ }).waitFor();
    const heading = await p.getByRole('heading', { name: /Poll #\d+ is live/ }).innerText();
    created.pollId = Number(heading.match(/#(\d+)/)[1]);
    created.hash = await p.locator('.facts a[href*="/tx/"]').first().getAttribute('title');
    const onchain = await voting.getPoll(created.pollId);
    assert(onchain.creator.toLowerCase() === A1.toLowerCase(), 'creator mismatch');
    assert(onchain.options.length === 3 && onchain.question.startsWith('Which testnet feature'), 'poll content mismatch');
    const dur = Number(onchain.endTime - onchain.createdAt);
    assert(dur === 86400, `duration ${dur}`);
    await shot(p, '05-poll-created');
    return `poll #${created.pollId}, tx ${created.hash.slice(0, 12)}…`;
  });

  // ---- Voting with another wallet ----
  const voter = await user(A2);
  await check('Account switching: a second wallet connects and the header follows accountsChanged', async () => {
    await voter.page.goto(APP);
    await connect(voter.page);
    await voter.page.evaluate((a) => window.__testWallet.switchAccount(a), A3);
    await waitFor(async () => (await voter.page.locator('a.wallet-chip').getAttribute('title')).toLowerCase() === A3.toLowerCase(), 'chip A3');
    await voter.page.evaluate((a) => window.__testWallet.switchAccount(a), A2);
    await waitFor(async () => (await voter.page.locator('a.wallet-chip').getAttribute('title')).toLowerCase() === A2.toLowerCase(), 'chip A2');
  });
  await check('Vote on the new poll, wait for the block, receipt prints', async () => {
    await voteOn(voter.page, created.pollId, 1);
    const r = await readReceipt(voter.page);
    votes.push({ ...r, pollId: created.pollId, optionIndex: 1 });
    await voter.page.locator('.ballot-paper .voted-tag').waitFor();
    await shot(voter.page, '06-voted-receipt');
    return verifyReceiptOnChain(r, { pollId: created.pollId, optionIndex: 1 });
  });
  await check('Updated results match the contract', async () => {
    await voter.page.goto(`${APP}#/polls`);
    const row = voter.page.locator('.poll-row', { hasText: 'Which testnet feature' });
    await waitFor(async () => (await row.locator('.poll-row-foot').innerText()).startsWith('1 vote'), 'count 1');
    const poll = await voting.getPoll(created.pollId);
    assert(Number(poll.votes[1]) === 1 && Number(poll.totalVotes) === 1, 'chain counts');
    assert(await row.locator('.voted-tag').isVisible(), 'You voted tag missing');
  });
  await check('Same wallet cannot vote again: the UI shows the final ballot instead', async () => {
    await voter.page.goto(`${APP}#/poll/${created.pollId}`);
    const finalState = voter.page.locator('.ballot-state.done');
    await finalState.waitFor();
    assert((await finalState.innerText()).includes('your vote is final'), 'final vote message missing');
    assert((await voter.page.getByRole('button', { name: 'Vote', exact: true }).count()) === 0, 'Vote button still shown');
  });
  await check('Duplicate vote from a stale page is rejected by the contract before the wallet opens', async () => {
    const stale = await user(A4);
    await stale.page.goto(APP);
    await connect(stale.page);
    await stale.page.goto(`${APP}#/poll/${created.pollId}`);
    await stale.page.locator('.ballot-option').nth(0).click(); // page now holds an unsent ballot
    const fresh = await user(A4);
    await fresh.page.goto(APP);
    await connect(fresh.page);
    await voteOn(fresh.page, created.pollId, 2);
    const r = await readReceipt(fresh.page);
    votes.push({ ...r, pollId: created.pollId, optionIndex: 2 });
    const before = await sentTx(stale.page);
    await stale.page.getByRole('button', { name: 'Vote', exact: true }).click();
    await stale.page.locator('.tx-error').getByText('You have already voted').waitFor();
    assert((await sentTx(stale.page)) === before, 'stale page sent a transaction');
    await shot(stale.page, '07-duplicate-rejected');
    await stale.context.close();
    await fresh.context.close();
    return 'revert reason shown, no transaction sent';
  });

  // ---- Insufficient gas and the faucet panel ----
  const broke = await user(A3);
  await check('Insufficient gas: gas assistance panel with the Google Cloud faucet, nothing sent', async () => {
    await rpc('hardhat_setBalance', [A3, '0x0']);
    await broke.page.goto(APP);
    await connect(broke.page);
    await voteOn(broke.page, 0, 0);
    await broke.page.getByRole('heading', { name: 'Need test ETH to cast your vote?' }).waitFor();
    await broke.page.getByText('You need Sepolia test ETH to pay the network gas fee.').first().waitFor();
    const href = await broke.page.getByRole('link', { name: /Get free Sepolia ETH/ }).getAttribute('href');
    assert(href === GOOGLE_FAUCET, `faucet ${href}`);
    const target = await broke.page.getByRole('link', { name: /Get free Sepolia ETH/ }).getAttribute('target');
    assert(target === '_blank', 'faucet should open a new tab');
    assert((await sentTx(broke.page)) === 0, 'a transaction was sent');
    await broke.page.locator('.gas-notes summary').click();
    await shot(broke.page, '08-gas-panel');
  });
  await check('After funding, Refresh balance then Try again completes the vote', async () => {
    await rpc('hardhat_setBalance', [A3, '0xDE0B6B3A7640000']); // 1 ETH
    await broke.page.getByRole('button', { name: 'Refresh balance' }).first().click();
    await broke.page.getByText('Your balance now covers this transaction').waitFor();
    await broke.page.locator('.gas-panel').getByRole('button', { name: 'Try again' }).click();
    const r = await readReceipt(broke.page);
    votes.push({ ...r, pollId: 0, optionIndex: 0 });
    return verifyReceiptOnChain(r, { pollId: 0, optionIndex: 0 });
  });
  await broke.context.close();

  // ---- Rejected transaction ----
  const rejecter = await user(A5);
  await check('Rejected transaction: clear message, no vote recorded, retry works', async () => {
    await rejecter.page.goto(APP);
    await connect(rejecter.page);
    await rejecter.page.evaluate(() => (window.__testWallet.rejectNextTx = true));
    await voteOn(rejecter.page, 0, 3);
    await rejecter.page.getByText('You rejected the transaction in your wallet. Nothing was sent.').waitFor();
    assert((await voting.hasVoted(0, A5)) === false, 'vote recorded after rejection');
    await shot(rejecter.page, '09-rejected');
    await rejecter.page.locator('.tx-error').getByRole('button', { name: 'Try again' }).click();
    const r = await readReceipt(rejecter.page);
    votes.push({ ...r, pollId: 0, optionIndex: 3 });
    return verifyReceiptOnChain(r, { pollId: 0, optionIndex: 3 });
  });
  await rejecter.context.close();

  // ---- Pending transaction ----
  const pending = await user(A6);
  await check('Pending transaction: shows waiting state, blocks resubmission, then confirms', async () => {
    await pending.page.goto(APP);
    await connect(pending.page);
    await rpc('evm_setAutomine', [false]);
    try {
      await voteOn(pending.page, 0, 2);
      await pending.page.locator('.tx-step.active', { hasText: 'Wait for a Sepolia block' }).waitFor();
      const btn = pending.page.getByRole('button', { name: 'Voting…' });
      assert(await btn.isDisabled(), 'vote button should be disabled while pending');
      assert((await pending.page.locator('.ballot-options').getAttribute('disabled')) !== null, 'ballot fieldset should be disabled');
      assert(await pending.page.locator('.ballot-option input').first().isDisabled(), 'options should be locked');
      await shot(pending.page, '10-pending');
      await rpc('evm_mine');
    } finally {
      await rpc('evm_setAutomine', [true]);
    }
    const r = await readReceipt(pending.page);
    votes.push({ ...r, pollId: 0, optionIndex: 2 });
    return verifyReceiptOnChain(r, { pollId: 0, optionIndex: 2 });
  });

  // ---- Closing ----
  await check('Only the creator sees Close poll early', async () => {
    await voter.page.goto(`${APP}#/poll/${created.pollId}`);
    await voter.page.locator('.ballot-q').waitFor();
    assert((await voter.page.getByRole('button', { name: 'Close poll early' }).count()) === 0, 'non-creator sees close');
    await creator.page.goto(`${APP}#/poll/${created.pollId}`);
    await creator.page.getByRole('button', { name: 'Close poll early' }).waitFor();
  });
  await check('Creator closes the poll early; chain and UI agree it is closed', async () => {
    await creator.page.getByRole('button', { name: 'Close poll early' }).click();
    await creator.page.getByRole('button', { name: 'Close poll now' }).click();
    await waitFor(async () => {
      const poll = await voting.getPoll(created.pollId);
      return poll.closedEarly && !poll.isOpen;
    }, 'poll close transaction');
    await creator.page.locator('.ballot-head .status-tag.is-closed').waitFor();
    await creator.page.getByText('Closed early by its creator').first().waitFor();
    const poll = await voting.getPoll(created.pollId);
    assert(poll.closedEarly === true && poll.isOpen === false, 'chain not closed');
    await shot(creator.page, '11-closed-early');
  });
  await check('A new wallet cannot vote on the closed poll', async () => {
    await pending.page.goto(`${APP}#/poll/${created.pollId}`);
    await pending.page.getByText('This poll is closed. The results below are final.').waitFor();
    assert((await pending.page.getByRole('button', { name: 'Vote', exact: true }).count()) === 0, 'Vote shown on closed poll');
  });

  // ---- Activity, receipt page, wallet page ----
  await check('Activity feed lists real events, newest first, with filters', async () => {
    await guest.page.goto(`${APP}#/activity`);
    await guest.page.locator('.activity-item').first().waitFor();
    const logs = await provider.getLogs({ address: deployment.address, fromBlock: deployment.deploymentBlock, toBlock: 'latest' });
    await waitFor(async () => (await guest.page.locator('.activity-item').count()) === logs.length, `${logs.length} items`);
    const first = await guest.page.locator('.activity-item').first().locator('.act-type').innerText();
    assert(first === 'Closed', `newest item is ${first}`);
    const allTypes = await guest.page.locator('.activity-item .act-type').allInnerTexts();
    assert(allTypes.includes('New poll') && allTypes.includes('Vote'), `expected Create Poll and Vote events, saw ${allTypes}`);
    await guest.page.getByRole('tab', { name: 'Votes' }).click();
    const types = await guest.page.locator('.activity-item .act-type').allInnerTexts();
    assert(types.length === votes.length && types.every((t) => t === 'Vote'), `vote filter ${types}`);
    await guest.page.getByRole('tab', { name: 'All' }).click();
    await shot(guest.page, '12-activity');
    return `${logs.length} events`;
  });
  await check('Receipt page rebuilds a receipt from a transaction hash', async () => {
    const v = votes[0];
    await guest.page.goto(`${APP}#/receipt/${v.hash}`);
    const r = await readReceipt(guest.page, '.receipt-page');
    assert(r.hash === v.hash && r.block === v.block && r.voter.toLowerCase() === v.voter.toLowerCase(), 'receipt mismatch');
    await shot(guest.page, '13-receipt-page');
  });
  await check('Wallet page shows address, balance and this wallet’s on-chain transactions', async () => {
    await voter.page.goto(`${APP}#/wallet`);
    await voter.page.getByText(new RegExp(A2, 'i')).first().waitFor();
    await voter.page.locator('.activity-item').first().waitFor();
    const n = await voter.page.locator('.activity-item').count();
    assert(n === 1, `expected 1 transaction for A2, saw ${n}`);
    await shot(voter.page, '14-wallet');
  });
  await check('Wrong network mid-session pauses voting until switched', async () => {
    await pending.page.goto(`${APP}#/poll/0`);
    await pending.page.evaluate(() => window.__testWallet.setChain(1));
    await pending.page.locator('.network-banner').waitFor();
    await pending.page.evaluate(() => window.__testWallet.setChain(11155111));
    await pending.page.locator('.network-banner').waitFor({ state: 'detached' });
  });

  // ---- Contract page ----
  await check('Contract page: live network information and contract details', async () => {
    await guest.page.goto(`${APP}#/contract`);
    await guest.page.getByText('confirmed by the RPC').waitFor();
    const block = await provider.getBlockNumber();
    await waitFor(async () => (await guest.page.locator('.network-info').innerText()).includes(block.toLocaleString('en-US')), 'latest block');
    assert((await guest.page.locator('.two-col').innerText()).includes(deployment.address), 'address shown');
    const details = await guest.page.locator('.two-col').innerText();
    assert(details.includes(deployment.deploymentBlock.toLocaleString('en-US')), 'deployment block shown');
    assert(details.includes('Polls') && details.includes('Votes'), 'poll and vote counts shown');
    assert(details.includes('Ethereum Sepolia'), 'network shown');
    assert((await guest.page.getByRole('textbox').count()) === 0, 'contract address input remains');
    assert((await guest.page.getByRole('button', { name: /deploy|link contract/i }).count()) === 0, 'link or deploy action remains');
    await shot(guest.page, '15-contract');
  });
  await guest.context.close();

  // ---- Expired poll ----
  await check('Expired poll: contract rejects the vote even from a page that still shows it open', async () => {
    const p = creator.page;
    await p.goto(`${APP}#/create`);
    await p.locator('#q').fill('One-minute poll');
    await p.getByLabel('Answer 1', { exact: true }).fill('Yes');
    await p.getByLabel('Answer 2', { exact: true }).fill('No');
    await p.locator('.duration-row input').fill('1');
    await p.locator('.duration-row select').selectOption('minutes');
    await p.getByRole('button', { name: 'Create poll' }).click();
    await p.getByRole('heading', { name: /is live/ }).waitFor();
    const id = Number((await p.getByRole('heading', { name: /is live/ }).innerText()).match(/#(\d+)/)[1]);
    await pending.page.goto(`${APP}#/poll/${id}`);
    await pending.page.locator('.ballot-option').nth(0).click();
    await rpc('evm_increaseTime', [120]);
    await rpc('evm_mine');
    const before = await sentTx(pending.page);
    await pending.page.getByRole('button', { name: 'Vote', exact: true }).click();
    await pending.page.locator('.tx-error').getByText('Poll is closed').waitFor();
    assert((await sentTx(pending.page)) === before, 'transaction sent for expired poll');
    await pending.page.reload();
    await pending.page.getByText('This poll is closed. The results below are final.').waitFor();
    return `poll #${id}`;
  });
  await creator.context.close();
  await pending.context.close();

  // ---- RPC failure ----
  await check('RPC failure: the site says Sepolia is unreachable instead of showing stale or fake data', async () => {
    const down = await user(null, { wallet: false });
    await down.context.route((url) => url.port === '8545', (route) => route.abort());
    await down.page.goto(APP);
    await down.page.getByRole('heading', { name: 'Sepolia is unreachable' }).first().waitFor();
    await down.page.getByRole('button', { name: 'Try again' }).first().waitFor();
    await down.page.getByText('Sepolia unreachable').waitFor();
    await shot(down.page, '16-rpc-down');
    await down.context.close();
  });

  // ---- Disconnect ----
  await check('Disconnect revokes the site’s wallet permission', async () => {
    await voter.page.goto(`${APP}#/wallet`);
    await voter.page.getByRole('button', { name: 'Disconnect' }).click();
    await voter.page.locator('header .btn-wallet').waitFor();
    const log = await voter.page.evaluate(() => window.__testWallet.log);
    assert(log.includes('wallet_revokePermissions'), 'revoke not requested');
  });
  await voter.context.close();

  // ---- Mobile ----
  await check('Mobile layout renders (390 px)', async () => {
    const m = await user(A2, { viewport: { width: 390, height: 844 } });
    await m.page.goto(APP);
    await m.page.locator('.stats').waitFor();
    await shot(m.page, '17-mobile-home');
    await m.page.goto(`${APP}#/receipt/${votes[0].hash}`);
    await m.page.locator('.slip-stamp').waitFor();
    await shot(m.page, '18-mobile-receipt');
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `horizontal overflow ${overflow}px`);
    await m.context.close();
  });

  // ---- Final reconciliation ----
  await check('Every receipt the UI showed matches the chain', async () => {
    for (const v of votes) await verifyReceiptOnChain(v, { pollId: v.pollId, optionIndex: v.optionIndex });
    const [tp, tv] = await voting.getStats();
    assert(Number(tv) === votes.length, `chain has ${tv} votes, UI recorded ${votes.length}`);
    return `${votes.length} votes, ${tp} polls`;
  });

  await browser.close();
  if (ours) console.log('Stopping the local chain.');
}

let failed = false;
try {
  await main();
} catch (err) {
  failed = true;
  console.error('\nStopped:', err.message);
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  for (const c of children) c.kill();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed. Screenshots in e2e/output/`);
  process.exit(failed ? 1 : 0);
}
