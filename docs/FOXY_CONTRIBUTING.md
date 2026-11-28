# Contributing to Foxy

This policy applies only to the Foxy distributable described in [FOXY_LICENSE_AND_OWNERSHIP.md](./FOXY_LICENSE_AND_OWNERSHIP.md). It does not change contribution terms for the rest of the VibeSane repository.

## Before opening a pull request

- Confirm that you own the contribution or have permission to submit it under Apache-2.0.
- Do not submit employer/client code, proprietary code, copied snippets, datasets, binaries, or generated output unless the rights and required notices are clear.
- Do not add a runtime dependency without updating the package's dependency/license inventory and the generated third-party notices.
- Never include credentials, customer source, private repository data, or agent transcripts in tests, fixtures, snapshots or logs.
- Keep Foxy local-first; any telemetry or cloud upload requires a separately reviewed opt-in design.

## DCO sign-off

Every commit that contributes Foxy code must include a Developer Certificate of Origin sign-off. Use:

```bash
git commit -s -m "Describe the change"
```

The `Signed-off-by` line must use the contributor's real name and an email address they are authorized to publish. By signing off, the contributor certifies that they created the contribution or otherwise have the right to submit it under the stated open-source license, that any third-party material is properly licensed, and that they understand the contribution and sign-off become part of the public project record.

Do not sign off on behalf of another person. If a commit lacks a valid sign-off, ask the author to add one before accepting the contribution. Maintainers should verify sign-offs and ownership evidence during review; this document does not itself install a GitHub enforcement rule.

## Review expectations

- Include tests for security-sensitive behavior and fail-closed paths.
- Document threat-model changes and residual limitations.
- Keep package allowlists explicit and review every new packaged file.
- Keep generated package metadata and notices in sync with actual contents.
- Do not claim a security certification, real-world precision/recall, or support for an AI host/OS without matching evidence.
- Do not add publishing, deployment, secret, shell, patch, commit or other write-capable MCP tools without a separate security design and review.

A CLA is not required for the current Apache-2.0 contribution model. Revisit only with legal review before dual licensing or relicensing.
