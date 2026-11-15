import { useEffect, useState } from 'react';

/** Tiny hash router: #/poll/3?x=1 → { path: '/poll/3', segments: ['poll','3'], query } */
function parse() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = hash.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: Object.fromEntries(new URLSearchParams(queryPart)),
  };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}
