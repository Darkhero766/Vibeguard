import { Router, type IRouter } from "express";
import { getCachedScanResult } from "../lib/scanCache";

const router: IRouter = Router();

// Approximate character width for DejaVu Sans at 11px
function charWidth(ch: string): number {
  if ("fijlrt! ".includes(ch)) return 5;
  if ("mwW".includes(ch)) return 10;
  return 7;
}

function textWidth(text: string): number {
  return Array.from(text).reduce((w, c) => w + charWidth(c), 0);
}

function makeBadgeSvg(label: string, value: string, color: string): string {
  const lw = textWidth(label) + 10;
  const rw = textWidth(value) + 10;
  const tw = lw + rw;
  const h = 20;
  const lx = Math.round(lw / 2);
  const rx = Math.round(lw + rw / 2);

  // Escape XML special characters for safe SVG embedding
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <title>${esc(label)}: ${esc(value)}</title>
  <rect rx="3" width="${tw}" height="${h}" fill="#555"/>
  <rect rx="3" x="${lw}" width="${rw}" height="${h}" fill="${color}"/>
  <rect x="${lw}" width="4" height="${h}" fill="${color}"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${lx}" y="14" fill="#010101" fill-opacity=".3">${esc(label)}</text>
    <text x="${lx}" y="13">${esc(label)}</text>
    <text x="${rx}" y="14" fill="#010101" fill-opacity=".3">${esc(value)}</text>
    <text x="${rx}" y="13">${esc(value)}</text>
  </g>
</svg>`;
}

function badgeForReport(findingsCount: number, hasCriticalOrHigh: boolean): string {
  if (findingsCount === 0) {
    return makeBadgeSvg("VibeSane", "passing", "#4c1");
  }
  if (hasCriticalOrHigh) {
    const label = findingsCount === 1 ? "1 issue" : `${findingsCount} issues`;
    return makeBadgeSvg("VibeSane", label, "#e05d44");
  }
  const label = findingsCount === 1 ? "1 issue" : `${findingsCount} issues`;
  return makeBadgeSvg("VibeSane", label, "#dfb317");
}

/**
 * GET /api/badge/:owner/:repo
 *
 * Returns an SVG badge showing the last scan result for the given repo.
 * No scan is triggered — reads only from the in-memory cache.
 * Returns a neutral "not scanned" badge if the repo has never been scanned.
 *
 * Cache-Control: 1-hour public cache so GitHub's CDN and browsers don't
 * hammer this endpoint on every README view.
 */
router.get("/badge/:owner/:repo", (req, res): void => {
  const { owner, repo } = req.params;

  // Validate path params (same character set as the GitHub URL pattern)
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    res.status(400).type("text/plain").send("Invalid owner or repo name.");
    return;
  }

  const repoKey = `${owner}/${repo}`;
  const cached = getCachedScanResult(repoKey);

  let svg: string;
  if (!cached) {
    svg = makeBadgeSvg("VibeSane", "not scanned", "#9f9f9f");
  } else {
    const hasCriticalOrHigh = cached.findings.some(
      (f) => f.severity === "Critical" || f.severity === "High",
    );
    svg = badgeForReport(cached.findings.length, hasCriticalOrHigh);
  }

  res
    .status(200)
    .set("Content-Type", "image/svg+xml")
    .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
    .set("X-Content-Type-Options", "nosniff")
    .send(svg);
});

export default router;
