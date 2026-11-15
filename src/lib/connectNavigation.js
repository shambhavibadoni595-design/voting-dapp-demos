const CONNECT_ROUTES = new Set(['/']);

export function routePathFromHash(hash) {
  const path = String(hash || '').replace(/^#/, '').split('?')[0] || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function shouldNavigateToCreateAfterConnect({
  userInitiated,
  routeAtStart,
  routeAtCompletion,
  connected,
  isSepolia,
  hasDefaultContract,
}) {
  return Boolean(
    userInitiated &&
      connected &&
      isSepolia &&
      hasDefaultContract &&
      CONNECT_ROUTES.has(routeAtStart) &&
      CONNECT_ROUTES.has(routeAtCompletion)
  );
}
