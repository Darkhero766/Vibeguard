# Foxy license, copyright and ownership

Status: proposed public-distribution terms for the Foxy package. Copyright attribution is set to **Md Faizal** at the maintainer's direction.

## License decision

The distributable npm package `@vibesane/foxy` is licensed under the **Apache License 2.0**. The package metadata uses the SPDX identifier `Apache-2.0`. The package archive must contain `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES.txt`.

This is a scoped license for the Foxy distributable only. It does **not** grant a license to the rest of the `Darkhero766/Vibeguard` repository, VibeSane website, hosted API/backend, dashboard, database schema/data, billing code, cloud services, marketing assets, or other products merely because they share this repository. No repository-root `LICENSE` is added by this change.

The scope is the Foxy source and generated runtime components actually selected by `artifacts/api-server/scripts/package-agentshield-beta.mjs`: the Foxy CLI/MCP/connector/installer/queue/baseline/gate sources copied into the archive, the Foxy skill, the scanner bundle built from those Foxy sources, package README/metadata, and the small runtime configuration file shipped with the archive. The package builder's explicit file manifest is the definitive distribution boundary. If a new file is added to that manifest, review its authorship and third-party licensing before release.

## Copyright attribution and rights check

The package NOTICE identifies **Copyright 2026 Md Faizal** for original Foxy-authored material in the package. This is an attribution instruction, not an independent investigation of ownership. Before public distribution, the maintainer must confirm that:
- Md Faizal owns or is authorized to license each Foxy-authored contribution included in the package;
- no employer, client, contractor, co-founder, prior contributor, or other party has a conflicting assignment or license claim;
- any contributions from other people are covered by their applicable grants/agreements or remain separately attributed and licensed;
- copied or generated material has a compatible license and required notices are preserved.

Do not put passwords, access tokens, private keys, or personal identity documents in this repository. Copyright attribution does not transfer ownership of third-party code or bundled dependencies.

## Third-party software

The package builder generates `THIRD_PARTY_NOTICES.txt` from the licenses for bundled Model Context Protocol SDK modules, Zod, and TypeScript. Those components are not relicensed as Md Faizal's work. The notice-generation step must fail when an expected bundled license file cannot be found. Before release, inspect the final archive and verify the dependency inventory against the exact bundle output; update the notice logic whenever a dependency is added, removed or replaced.

## Contributions

Foxy contributions are accepted under Apache-2.0. The initial policy is the Developer Certificate of Origin (DCO), not a Contributor License Agreement (CLA). Contributors must sign off each commit with `git commit -s` and use a name/email they are authorized to publish. The sign-off certifies that they have the right to submit the work under the project's stated license or that the work is otherwise properly licensed. Do not accept code copied from another project, generated from a restricted source, or supplied by an employer/client unless the contributor can establish permission.

A CLA is not required for the current single-license distribution model. Reconsider a CLA only before adopting a dual-license or relicensing model that requires additional rights. DCO sign-off does not replace review of third-party notices, employee invention-assignment obligations, or copyright ownership.

## Trademarks and brand

Apache-2.0 grants copyright and patent permissions under its terms; it does not grant general permission to use the Foxy or VibeSane names, logos, product marks, or branding. You may truthfully refer to the software as Foxy and identify its origin, but do not imply endorsement or official affiliation, reuse logos, or market a fork as an official VibeSane/Foxy release without written permission. Trademark registration and formal enforcement are separate legal steps and are not completed by this repository change.

## Release controls

- The package generator must embed the Apache-2.0 license and both notice files.
- CI must assert the exact package metadata, license, notice contents, and expected packaged file set.
- npm publication must use a verified `@vibesane` organization/package owner and npm Trusted Publishing (OIDC), not a long-lived publish token in CI.
- A dedicated protected GitHub Environment (for example, `npm-release`) and an owner-approved release workflow are required before publication is possible.
- No publication, website install-button activation, or production deployment is authorized by this document or its implementation PR.

## Owner actions still required

1. Verify the legal copyright/assignment position for every Foxy source file and third-party item in the package.
2. Sign in to npm using the account that should own the package. Confirm that the `vibesane` organization exists and that Md Faizal's intended publishing account has organization-owner/admin control. Do not assume the scope is free or owned because a package lookup returns 404.
3. Enable strong account security and 2FA; limit package write/publish roles to the minimum number of maintainers.
4. After a dedicated publish workflow is reviewed, create a protected GitHub Environment and configure npm Trusted Publishing for the exact repository, workflow filename and environment.
5. Complete the independent Foxy security review, all-platform exact-source qualification and live-host acceptance before considering a beta release.
6. Obtain a final owner/legal review of this license scope, attribution and contributor process.

This document is release guidance, not legal advice. A public software release should receive legal review where employment, contractor, prior-contributor, or trademark ownership is uncertain.
