/**
 * Normalize a pasted GitHub repository URL before any GitHub requests start.
 * Accept only a single ordinary trailing sentence full stop in the repo name.
 * A pasted https://github.com/OWASP/NodeGoat. must never trigger a 404,
 * a Git clone, and then an unauthenticated GitHub API retry.
 *
 * Keep existing supported ?ref and ?paths options for deliberate callers.
 */
export function normalizeScanRepositoryUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw Object.assign(new Error("Enter a valid GitHub repository URL."), { status: 400 });
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const valid = url.protocol === "https:" &&
    url.hostname === "github.com" &&
    !url.port && !url.username && !url.password && !url.hash &&
    segments.length === 2;
  if (!valid) {
    throw Object.assign(new Error("Use a URL like https://github.com/owner/repository."), { status: 400 });
  }

  const owner = segments[0];
  let repository = segments[1];
  // An ordinary dot copied from sentence punctuation is a common typo.
  // Reject ambiguous multiple trailing dots instead of guessing a repo.
  if (repository.endsWith(".") && !repository.endsWith("..")) {
    repository = repository.slice(0, -1);
  }
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) ||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(repository) ||
      repository === "." || repository === ".." || repository.endsWith(".")) {
    throw Object.assign(new Error("Check the GitHub repository name; remove trailing punctuation."), { status: 400 });
  }

  url.pathname = `/${owner}/${repository}`;
  return url.toString();
}
