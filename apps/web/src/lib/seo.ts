// The one public URL of a page (canonical, og:url, JSON-LD `url`). Site links use paths without a
// trailing slash (`/cv`), and Caddy serves both `/cv` and `/cv/` (infra/Caddyfile, try_files), so the
// canonical form drops the slash; only the root keeps it.
export function canonicalUrl(pathname: string, site: URL | undefined): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  return new URL(path, site).href;
}
