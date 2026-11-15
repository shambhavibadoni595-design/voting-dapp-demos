export const LEGACY_CONTRACT_KEY = 'ballot.linkedContract.v1';

/** Clear a browser-specific contract left by older builds and always select this build's default. */
export function selectConfiguredContract(configured, storage) {
  try { (storage ?? globalThis.window?.localStorage)?.removeItem(LEGACY_CONTRACT_KEY); } catch { /* storage may be unavailable */ }
  return configured;
}
