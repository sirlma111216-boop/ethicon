import { useEffect, useState } from 'react';

export type Route =
  | { name: 'landing' }
  | { name: 'teacher-start' }
  | { name: 'teacher-console'; code: string }
  | { name: 'join'; code?: string }
  | { name: 'play'; code: string }
  | { name: 'board'; code: string; token: string }
  | { name: 'help' }
  | { name: 'not-found' };

export function parseRoute(pathname: string, search: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  const q = new URLSearchParams(search);
  if (parts.length === 0) return { name: 'landing' };
  if (parts[0] === 'teacher') return parts[1] ? { name: 'teacher-console', code: parts[1].toUpperCase() } : { name: 'teacher-start' };
  if (parts[0] === 'join' || parts[0] === 'j') return { name: 'join', code: parts[1]?.toUpperCase() };
  if (parts[0] === 'play' && parts[1]) return { name: 'play', code: parts[1].toUpperCase() };
  if (parts[0] === 'board' && parts[1]) return { name: 'board', code: parts[1].toUpperCase(), token: q.get('t') ?? '' };
  if (parts[0] === 'help') return { name: 'help' };
  return { name: 'not-found' };
}

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname, location.search));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.pathname, location.search));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return route;
}
