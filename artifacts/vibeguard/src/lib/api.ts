/**
 * Prepends VITE_API_BASE_URL to any root-relative /api path.
 *
 * On Replit dev the Vite proxy forwards /api → localhost:8080 so leave it empty.
 * On Render (or any deployment where the frontend and API are separate services)
 * set VITE_API_BASE_URL to the API server's origin, e.g. https://vibeguard-api.onrender.com
 */
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

export function apiUrl(path: string): string {
  // path must start with /
  return `${apiBase}${path}`;
}
