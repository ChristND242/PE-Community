# Host updater bootstrap

The updater is an independent host service. The API receives access only to its Unix socket; no application container receives the Docker socket.

## Existing installations before the updater

PE Community v1.2.3 is the updater bootstrap release. An installation running v1.1.1 or another pre-updater version cannot install v1.2.3 automatically: the operator must perform one final manual application upgrade, then install and bootstrap the host updater service described below. Automatic updates become available only after that bootstrap is complete and the System Updates status check succeeds.

## Install once

1. Download the architecture-matched updater asset from the approved PE Community release: `pe-community-updater-<version>-linux-amd64.tar.gz` or `pe-community-updater-<version>-linux-arm64.tar.gz`. Verify it through the release contract, extract it as root into a staging directory, then atomically replace `/opt/pe-community-updater`. The archive records root ownership and safe non-writable modes; normalize the extracted tree with `chown -R root:root` and remove group/other write bits before the replacement.
2. The archive includes the pinned official GitHub CLI verifier at `/opt/pe-community-updater/bin/gh`, its MIT license notice, and the updater launcher. Do not install `gh` separately and do not replace the bundled verifier.
3. Create the system group `pe-community-updater` and add the host account used by the API container runtime to the matching socket-access arrangement.
4. Create root-owned directories `/etc/pe-community-updater` and `/opt/pe-community-backups` with mode `0700`. The unit creates `/var/lib/pe-community-updater` with mode `0700` and `/run/pe-community-updater` with mode `0750` through systemd's state/runtime directory lifecycle.
5. Copy `pe-community-updater.env.example` to `/etc/pe-community-updater/updater.env`, set mode `0600`, and replace the secret placeholder with a newly generated high-entropy value. Put the same value in the production application `.env` as `PE_UPDATER_SHARED_SECRET`.
6. Install `pe-community-updater.service`, run `systemctl daemon-reload`, then enable and start the service.
7. Recreate only the API container once so its read-only `/run/pe-community-updater` bind mount and shared secret take effect.

## Verify the bootstrap

Run these commands on the deployment host before enabling UI installation:

```bash
systemctl is-active pe-community-updater
systemctl show pe-community-updater -p User -p Group -p NoNewPrivileges -p ProtectSystem
/opt/pe-community-updater/bin/gh version
stat -c '%U %G %a %F' /run/pe-community-updater /run/pe-community-updater/updater.sock
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml exec -T api test -S /run/pe-community-updater/updater.sock
```

The directory must not be world-writable, the socket must report mode `660`, and only API receives the read-only runtime-directory mount. The status response must report agent `1.4.0`, protocol `2`, and topology `single-host`. Validate Settings → System Updates status before attempting an installation.

## Migrate an existing v1.2.3 updater host

The v1.2.3 updater expects the historical single updater asset and cannot discover the architecture-specific archive inventory introduced with updater 1.4.0. At the next maintenance window, stop the updater, verify the appropriate new release archive, extract it as root into a staging directory, validate `bin/gh` and its license notice, run `chown -R root:root <staging>/pe-community-updater` and `chmod -R go-w <staging>/pe-community-updater`, then atomically replace `/opt/pe-community-updater` and restart the service. This replaces the updater and its bundled verifier as one unit. Retain the previous directory until the restarted service reports healthy. Do not overwrite `bin/gh` in place and do not change application containers, PostgreSQL, Redis, or uploads as part of this host-side migration. PE Community no longer depends on `/usr/bin/gh`; leave any host installation intact unless the administrator independently knows it is unused.

## Maintainer supply-chain validation

Before the first production updater bootstrap, an authorized maintainer must run **Release and supply-chain validation** manually from an existing annotated release tag. This mode uses unique `validation-<run-id>` GHCR tags, builds and attests the API, Web, and Worker images, packages both updater architectures, validates their archive contracts, and uses the `gh` executable extracted from the generated amd64 updater archive to verify the live image attestations. It uploads the generated manifest and updater archives as short-retention workflow artifacts only.

Validation mode does not create a tag, GitHub Release, or deployment, and normal update discovery ignores it because discovery uses published GitHub Releases rather than GHCR tags or workflow artifacts. Validation tags may remain in GHCR temporarily; remove only the explicitly named validation tags through normal package administration. Stable tag pushes retain the release publication path.

The service intentionally runs with host Docker access, fixed paths, a strict image allowlist, and no remote listener. `ProtectSystem=strict` is paired with explicit `ReadWritePaths` for the deployment version file, backups, durable state, and runtime socket. Network address families remain available because release discovery and registry pulls require them.

## Automatic release contract

Automatic installation requires release contract version `1`: a published, non-draft, non-prerelease GitHub Release created from an annotated strict-semver tag on `main`; a strict schema-v2 manifest whose `version` and `releaseTag` match; a 40-character `sourceCommit` matching the tag target; official API/Web/Worker GHCR repositories with immutable digests; and valid GitHub build-provenance attestations for the exact manifest file and all three image digest subjects. Unsupported future contract versions fail with `RELEASE_CONTRACT_UNSUPPORTED`. Historical tags and releases without this complete contract remain manual; the first release successfully produced by this workflow establishes the updater-aware baseline without guessing a version.

The updater downloads the manifest under a 128 KiB bound, independently resolves the annotated release tag, writes the unparsed bytes to a private temporary file, and invokes the bundled official `gh attestation verify` before trusting any manifest field. The bundled verifier is the exact pinned GitHub CLI version shipped with the updater archive; it must be a root-owned, non-symlink regular executable that is not writable by group or other users. Both manifest and image verification use fixed repository `Pona-Ekolo/PE-Community`, fixed signer workflow `.github/workflows/publish-images.yml`, SLSA provenance v1, release tag ref, and source commit. Only after manifest verification does schema, compatibility, digest, migration, and rollback validation run. Manifest values cannot redefine the verifier, repository, organization, workflow, release source, or trust policy.

Digest-only manifests and historical tags without the complete release contract require manual operator handling. A missing attestation, unsupported verifier, signature/identity/workflow/digest/commit mismatch, GitHub API rate limit, or network failure blocks the run before migration or service recreation. There is no UI or environment override. The verifier receives a minimal fixed environment without application or GitHub tokens; public GitHub API limits therefore apply. Verification currently uses GitHub's online trust-root and attestation services; offline bundles are not enabled because a secure offline trust-root provisioning and rotation lifecycle has not been established.

The release workflow pins every action dependency to a reviewed full commit SHA. It downloads the exact official GitHub CLI 2.93.0 archive separately for Linux amd64 and arm64, verifies the upstream SHA-256 and expected archive layout, checks the embedded binary version, and includes the upstream MIT notice in each updater archive. It builds and attests images before creating any release, generates the final manifest and updater packages in the publication job, attests the exact manifest file, then creates or resumes only an empty draft. It uploads the manifest, attestation bundle, and both architecture-specific updater packages without overwrite; verifies the exact asset-name, size, and GitHub-reported SHA-256 inventory; and publishes once. A partial draft remains invisible for operator inspection and must be cleaned up deliberately before retry. A published release or non-empty draft causes a safe abort. Enable GitHub immutable releases and protected `v*.*.*` release tags in repository settings before the first updater-aware release; the workflow does not change those settings.

Kernel, control-group, clock, hostname, realtime, setuid/setgid, executable-memory, and home-directory restrictions are enabled. `PrivateNetwork` is intentionally omitted because GitHub/GHCR and health checks require networking. `CapabilityBoundingSet` and `PrivateUsers` are intentionally omitted because Docker socket access and existing root-owned deployment files must be validated across supported self-hosted distributions. The agent remains effectively host-privileged and must be treated accordingly.

## Rotate the IPC secret

1. Generate a new independent high-entropy secret.
2. Configure the host agent with the new value as `PE_UPDATER_SHARED_SECRET` and the old value as `PE_UPDATER_SHARED_SECRET_PREVIOUS`, then restart the agent.
3. Update the application `.env` to the new current secret and recreate API only.
4. Confirm updater status, remove `PE_UPDATER_SHARED_SECRET_PREVIOUS`, and restart the agent again.

Never place either secret in command arguments or logs. The previous-secret setting is a temporary overlap mechanism, not permanent configuration.

## Upgrade or disable

Stop the service before replacing the updater files, verify the release artifact, replace the directory atomically, and start it again. If a target manifest requires a newer updater, the application reports `MANUAL_REQUIRED` and does not install the release.

To disable automatic updates, stop and disable the service, remove the API socket bind mount at the next maintenance window, and retain `/var/lib/pe-community-updater` plus the latest backup until the deployment is verified.

To roll back the bootstrap itself, disable the service, restore the pre-bootstrap Compose file and `.env`, recreate API only, and verify normal application health. This removes updater access without changing PostgreSQL, Redis, Web, Worker, uploads, or application data.

Do not delete an active run lock or restore a database dump automatically. A run interrupted after migration requires an operator to inspect compatibility and the retained backup first.
