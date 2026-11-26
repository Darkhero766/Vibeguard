export type RepositoryFile = {
  path: string;
  content: string;
};

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 12_000_000;
const MAX_FILES = 300;
const BLOB_CONCURRENCY = 8;

const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "vendor"]);

const SELF_SCAN_EXCLUDED_PATHS = [
  "artifacts/api-server/src/lib/apiScanner.ts",
  "artifacts/api-server/src/lib/extendedScanner.ts",
  "artifacts/api-server/src/lib/extendedScannerV2.ts",
  "artifacts/api-server/src/lib/securityCheckCatalog.ts",
  "artifacts/api-server/src/lib/scanner.ts",
  "artifacts/mockup-sandbox/",
  "lib/api-client-react/src/generated/",
  "lib/api-zod/src/generated/",
  "CHANGELOG.md",
  "pnpm-lock.yaml",
];

function isSelfScanExcluded(path: string): boolean {
  return SELF_SCAN_EXCLUDED_PATHS.some((excluded) => excluded.endsWith("/") ? path.startsWith(excluded) : path === excluded);
}

export function shouldRead(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    /\.(?:[cm]?[jt]sx?|sql|json|ya?ml|md|mdx|toml|ini|conf|xml|html|css|scss|sh|bash|py|rb|go|rs|java|php|pem|key)$/i.test(path) ||
    /^Dockerfile(?:\..*)?$/i.test(base) ||
    /^\.npmrc$/i.test(base) ||
    /^\.gitignore$/i.test(base) ||
    /(^|\/)\.env(?:\.[\w-]+)?$/i.test(path)
  ) && !path.split("/").some((part) => IGNORED.has(part));
}

function parseRepo(repoUrl: string): { owner: string; repo: string; ref?: string; paths?: Set<string> } {
  const parsed = new URL(repoUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const repo = parts[1]?.replace(/\.git$/, "");
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parts.length !== 2 || !repo) {
    throw Object.assign(new Error("Only valid github.com repository URLs are supported."), { status: 400 });
  }
  const ref = parsed.searchParams.get("ref")?.trim() || undefined;
  const encodedPaths = parsed.searchParams.get("paths")?.trim();
  let paths: Set<string> | undefined;
  if (encodedPaths) {
    const parsedPaths = encodedPaths.split("\n").map((path) => path.trim()).filter(Boolean);
    if (parsedPaths.length > MAX_FILES) {
      throw Object.assign(new Error("Changed-path scope exceeds the scanner's 300-file limit; no clean verdict is available."), { status: 413 });
    }
    if (parsedPaths.some((path) => path.startsWith("/") || path.includes("\\")
      || path.split("/").some((part) => !part || part === "." || part === ".."))) {
      throw Object.assign(new Error("Invalid scan paths parameter."), { status: 400 });
    }
    if (parsedPaths.length) paths = new Set(parsedPaths);
  }
  return { owner: parts[0], repo, ref, paths };
}

function headers(token?: string): Record<string, string> {
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

export type RepositoryReadCoverage = {
  treeTruncated: boolean;
  eligibleFileCount: number;
  selectedFileCount: number;
  filesScanned: number;
  omittedByFileLimit: number;
  oversizedPaths: string[];
  unreadablePaths: string[];
  missingRequestedPaths: string[];
  unsupportedRequestedPaths: string[];
  selfExcludedPaths: string[];
  complete: boolean;
};
export type RepositoryReadResult = {
  owner: string;
  repo: string;
  files: RepositoryFile[];
  coverage: RepositoryReadCoverage;
};

export function planRepositoryRead(
  treeEntries: Array<{ path?: string; type?: string; size?: number }> | null | undefined,
  requestedPaths: string[] | null,
  selfScan: boolean,
) {
  const entries = Array.isArray(treeEntries) ? treeEntries : [];
  const blobPaths = new Set(entries.filter((entry) => entry?.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path as string));
  const unsupportedRequestedPaths = requestedPaths
    ? requestedPaths.filter((item) => !shouldRead(item))
    : [];
  const selfExcludedPaths = selfScan
    ? (requestedPaths
      ? requestedPaths.filter((item) => isSelfScanExcluded(item))
      : entries.filter((entry) => entry?.type === "blob" && typeof entry.path === "string"
        && isSelfScanExcluded(entry.path)).map((entry) => entry.path as string))
    : [];
  const eligibleRequested = requestedPaths
    ? requestedPaths.filter((item) => shouldRead(item) && !(selfScan && isSelfScanExcluded(item)))
    : null;
  const missingRequestedPaths = eligibleRequested
    ? eligibleRequested.filter((item) => !blobPaths.has(item))
    : [];
  const eligibleEntries = entries
    .filter((entry) => entry?.type === "blob" && typeof entry.path === "string" && shouldRead(entry.path))
    .filter((entry) => !requestedPaths || requestedPaths.includes(entry.path!))
    .filter((entry) => !selfScan || !isSelfScanExcluded(entry.path!));
  const selectedEntries = eligibleEntries.slice(0, MAX_FILES);
  return {
    eligibleEntries,
    selectedEntries,
    omittedByFileLimit: Math.max(0, eligibleEntries.length - selectedEntries.length),
    missingRequestedPaths,
    unsupportedRequestedPaths,
    selfExcludedPaths,
  };
}

export async function readRepositoryFilesWithStats(
  repoUrl: string,
  token?: string,
  requestedPaths?: string[],
): Promise<RepositoryReadResult> {
  const parsed = parseRepo(repoUrl);
  const owner = parsed.owner;
  const repo = parsed.repo;
  const ref = parsed.ref;
  const paths = requestedPaths === undefined ? parsed.paths : new Set(requestedPaths);
  if (paths && paths.size > MAX_FILES) {
    throw Object.assign(new Error("Changed-path scope exceeds the scanner's 300-file limit; no clean verdict is available."), { status: 413 });
  }
  const treeRef = ref ? encodeURIComponent(ref) : "HEAD";
  const selfScan = owner.toLowerCase() === "darkhero766" && repo.toLowerCase() === "vibeguard";
  const tree = await githubGet(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${treeRef}?recursive=1`, token);

  if (tree?.truncated) {
    const error = new Error("GitHub repository tree is too large for a single scan.");
    Object.assign(error, { status: 413 });
    throw error;
  }

  if (!Array.isArray(tree?.tree)) {
    throw Object.assign(new Error("GitHub returned an invalid repository tree; scan status is UNKNOWN."), { status: 502 });
  }
  const plan = planRepositoryRead(tree.tree, paths ? [...paths] : null, selfScan);
  const oversizedPaths: string[] = [];
  const unreadablePaths: string[] = [];
  const selectedEntries: typeof plan.selectedEntries = [];
  let selectedBytes = 0;
  for (const entry of plan.selectedEntries) {
    const declaredSize = Number(entry.size ?? 0);
    if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > MAX_FILE_BYTES
      || selectedBytes + declaredSize > MAX_TOTAL_BYTES) {
      oversizedPaths.push(entry.path!);
      continue;
    }
    selectedEntries.push(entry);
    selectedBytes += declaredSize;
  }

  // Network requests are concurrent, but results are stored by tree index so
  // aggregate-byte decisions remain deterministic.
  const loaded: Array<{ path: string; content: string } | null> = new Array(selectedEntries.length).fill(null);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= selectedEntries.length) return;
      const entry = selectedEntries[index];
      let blob: any;
      try {
        const blobUrl = API_ROOT + "/repos/" + encodeURIComponent(owner) + "/" +
          encodeURIComponent(repo) + "/git/blobs/" + entry.sha;
        blob = await githubGet(blobUrl, token);
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status: unknown }).status) : 0;
        if (status === 404 || status === 415) {
          unreadablePaths.push(entry.path!);
          continue;
        }
        throw error;
      }
      if (blob?.encoding !== "base64" || typeof blob.content !== "string") {
        unreadablePaths.push(entry.path!);
        continue;
      }
      let content: string;
      try {
        const bytes = Buffer.from(blob.content.replace(/\n/g, ""), "base64");
        if (bytes.length > MAX_FILE_BYTES) {
          oversizedPaths.push(entry.path!);
          continue;
        }
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        unreadablePaths.push(entry.path!);
        continue;
      }
      loaded[index] = { path: entry.path!, content };
    }
  };
  await Promise.all(Array.from({ length: Math.min(BLOB_CONCURRENCY, selectedEntries.length) }, () => worker()));

  const files: RepositoryFile[] = [];
  let actualBytes = 0;
  for (const item of loaded) {
    if (!item) continue;
    const size = Buffer.byteLength(item.content, "utf8");
    if (actualBytes + size > MAX_TOTAL_BYTES) {
      oversizedPaths.push(item.path);
      continue;
    }
    actualBytes += size;
    files.push(item);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const treeTruncated = tree.truncated === true;
  const complete = !treeTruncated
    && plan.omittedByFileLimit === 0
    && oversizedPaths.length === 0
    && unreadablePaths.length === 0
    && plan.missingRequestedPaths.length === 0
    && plan.unsupportedRequestedPaths.length === 0
    && plan.selfExcludedPaths.length === 0;
  const coverage: RepositoryReadCoverage = {
    treeTruncated,
    eligibleFileCount: plan.eligibleEntries.length,
    selectedFileCount: selectedEntries.length,
    filesScanned: files.length,
    omittedByFileLimit: plan.omittedByFileLimit,
    oversizedPaths: [...new Set(oversizedPaths)].sort(),
    unreadablePaths: [...new Set(unreadablePaths)].sort(),
    missingRequestedPaths: plan.missingRequestedPaths.sort(),
    unsupportedRequestedPaths: plan.unsupportedRequestedPaths.sort(),
    selfExcludedPaths: plan.selfExcludedPaths.sort(),
    complete,
  };
  return { owner, repo, files, coverage };
}

export async function readRepositoryFiles(
  repoUrl: string,
  token?: string,
): Promise<{ owner: string; repo: string; files: RepositoryFile[] }> {
  const result = await readRepositoryFilesWithStats(repoUrl, token);
  return { owner: result.owner, repo: result.repo, files: result.files };
}
