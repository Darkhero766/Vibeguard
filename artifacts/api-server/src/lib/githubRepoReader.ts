import type { RepositoryFile } from "./repositoryTypes";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 12_000_000;
const MAX_FILES = 300;

const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "vendor"]);

function shouldRead(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    /\.(?:[cm]?[jt]sx?|sql|json|ya?ml|md|mdx|toml|ini|conf|xml|html|css|scss|sh|bash|py|rb|go|rs|java|php)$/i.test(path) ||
    /^Dockerfile(?:\..*)?$/i.test(base) ||
    /^\.npmrc$/i.test(base) ||
    /^\.gitignore$/i.test(base) ||
    /(^|\/)\.env(?:\.[\w-]+)?$/i.test(path)
  ) && !path.split("/").some((part) => IGNORED.has(part));
}

function parseRepo(repoUrl: string): { owner: string; repo: string } {
  const parsed = new URL(repoUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const repo = parts[1]?.replace(/\.git$/, "");
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parts.length !== 2 || !repo) {
    throw Object.assign(new Error("Only valid github.com repository URLs are supported."), { status: 400 });
  }
  return { owner: parts[0], repo };
}

function headers(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "VibeSane-Security-Scanner",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubGet(url: string, token?: string): Promise<any> {
  const response = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`GitHub API ${response.status}: ${body.slice(0, 300) || response.statusText}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.json();
}

export async function readRepositoryFiles(repoUrl: string, token?: string): Promise<{ owner: string; repo: string; files: RepositoryFile[] }> {
  const { owner, repo } = parseRepo(repoUrl);
  const tree = await githubGet(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`, token);

  if (tree?.truncated) {
    const error = new Error("GitHub repository tree is too large for a single scan.");
    Object.assign(error, { status: 413 });
    throw error;
  }

  const entries = Array.isArray(tree?.tree)
    ? tree.tree.filter((entry: any) => entry?.type === "blob" && typeof entry.path === "string" && shouldRead(entry.path)).slice(0, MAX_FILES)
    : [];

  const files: RepositoryFile[] = [];
  let totalBytes = 0;

  // Fetch blobs serially to avoid GitHub secondary-rate-limit spikes.
  for (const entry of entries) {
    const declaredSize = Number(entry.size ?? 0);
    if (declaredSize > MAX_FILE_BYTES || totalBytes + declaredSize > MAX_TOTAL_BYTES) continue;

    try {
      const blob = await githubGet(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${entry.sha}`, token);
      if (blob?.encoding !== "base64" || typeof blob.content !== "string") continue;
      const content = Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
      const size = Buffer.byteLength(content, "utf8");
      if (!content || size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_BYTES) continue;
      totalBytes += size;
      files.push({ path: entry.path, content });
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 0;
      // A single unreadable/binary blob should not abort the whole repository scan.
      if (status === 404 || status === 415) continue;
      throw error;
    }
  }

  return { owner, repo, files };
}
