const fs = require('node:fs');
const path = require('node:path');

const artifactPath = path.resolve(
  __dirname,
  '..',
  'blockchain',
  'artifacts',
  'contracts',
  'VotingDApp.sol',
  'VotingDApp.json'
);

if (!fs.existsSync(artifactPath)) {
  console.warn('Skipping ABI export: no compiled blockchain artifact found; using the checked-in ABI and bytecode.');
  process.exit(0);
}

require('../blockchain/scripts/export-artifacts.cjs').exportArtifacts();
