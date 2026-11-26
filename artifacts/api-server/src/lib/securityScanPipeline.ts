import { scanApiFiles } from "./apiScanner";
import { scanExtendedFilesV2 } from "./extendedScannerV2";
import { readRepositoryFilesWithStats, type RepositoryFile, type RepositoryReadCoverage } from "./githubRepoReader";
import { mergeSecurityFindings, type SecurityFinding } from "./protectionDelta";

export type SecurityPipelineResult = {
  owner: string;
  repo: string;
  files: RepositoryFile[];
  filesScanned: number;
  coverage: RepositoryReadCoverage;
  findings: SecurityFinding[];
  scanIncomplete: false;
};

export function scanRepositoryFiles(files: RepositoryFile[]): SecurityFinding[] {
  const core = scanApiFiles(files) as SecurityFinding[];
  const extended = scanExtendedFilesV2(files).map(finding => ({
    ...finding,
    severity: finding.severity === "Low" ? "Medium" : finding.severity,
  })) as SecurityFinding[];
  return mergeSecurityFindings(core, extended);
}

/** Run both catalog engines against the exact same immutable repository snapshot. */
export async function scanRepositorySecurity(
  repoUrl: string,
  githubToken?: string,
  changedPaths?: string[],
): Promise<SecurityPipelineResult> {
  const result = await readRepositoryFilesWithStats(repoUrl, githubToken, changedPaths);
  return {
    owner: result.owner,
    repo: result.repo,
    files: result.files,
    filesScanned: result.files.length,
    coverage: result.coverage,
    findings: scanRepositoryFiles(result.files),
    scanIncomplete: false,
  };
}
