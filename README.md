English | [Français](README.fr.md)

[![Status: Stable](https://img.shields.io/badge/status-stable-34d399)](#overview)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-22c55e)](LICENSE)
![Self-hosted](https://img.shields.io/badge/deployment-self--hosted-18181b)
![Documentation: EN · FR](https://img.shields.io/badge/docs-EN%20%C2%B7%20FR-0f766e)

# PE Community

PE Community is a self-hosted workspace for operating a private community. It brings member administration, events, announcements, task boards, automation, notifications, audit logs, and encrypted participant chat into one bilingual application.

<img width="957" height="473" alt="pe-admin-dashboard-light" src="https://github.com/user-attachments/assets/ac2a557a-a14c-4f42-bc94-36d9afa447ea" />


<img width="957" height="473" alt="pe-admin-dashboard-light" src="https://github.com/user-attachments/assets/f194a6c7-d528-4abd-9664-0f11b95e8841" />




## Overview

The project provides separate owner, administrator, and member workspaces over a shared community platform. It is distributed as a source-built Docker Compose stack and includes a bilingual product and operator documentation site.

## Features

- Role-based owner, administrator, and member workspaces
- Member directory, profiles, registrations, announcements, and feed
- Events, calendar, RSVPs, task boards, and task automation
- Email delivery, templates, operational notifications, and audit logs
- Direct and group chat with browser-side encryption and encrypted attachments
- English and French interfaces and documentation
- Guided first-run setup for the initial community and Owner account

## Architecture

Browser traffic enters through Caddy's same-origin edge. Caddy routes application pages to Next.js and API, upload, and Socket.IO requests to NestJS. The API uses PostgreSQL, Redis, and private upload storage; BullMQ workers consume queued work and deliver email through the configured provider.

```mermaid
flowchart LR
    Browser --> Caddy
    Caddy --> Web[Next.js Web]
    Caddy --> API[NestJS API]
    API --> PostgreSQL[(PostgreSQL)]
    API --> Redis[(Redis)]
    API --> Uploads[(Private uploads)]
    Redis --> Worker[BullMQ Worker]
    Worker --> PostgreSQL
    Worker --> Uploads
    Worker --> Email[Email provider]
```

The monorepo also contains a separate Next.js site for public product and operator documentation. It is not part of the authenticated application request path shown above.

## Integrated chat

## Private, secure conversations built into the community

Discussion is PE Community's integrated communication space for everyday collaboration between members and teams. Participants can move naturally between private one-to-one and group conversations, exchange encrypted messages and attachments in realtime, follow unread activity, and organize important discussions without leaving the platform. Encrypted key backup also helps users recover supported conversation history when moving to another browser or device.

<img width="1064" height="616" alt="chat-preview-en" src="https://github.com/user-attachments/assets/5a3f53a1-5fc3-4acf-a298-5306f4ee87c9" />


### Designed for everyday communication

| Capability | What it provides |
| --- | --- |
| Direct and group conversations | Private individual discussions and shared spaces for teams, projects, or community groups. |
| Realtime interaction | Live messages, typing indicators, reactions, delivery updates, and automatic reconnection when connectivity returns. |
| Encrypted messages and files | Browser-side encryption for text and supported media, images, and documents before normal transport and storage. Direct conversations can also use view-once images. |
| Conversation organization | Unread counts, conversation search, All / Unread / Groups / Favourites filters, and local pinning for quick access. |
| Presence and activity | Online status and last-seen information help participants understand when others are available. |
| Secure recovery | Password-protected encrypted key backups can restore applicable encrypted history on another supported browser or device. |

The workspace also includes familiar message controls such as replies, reactions, editing, personal stars, and participant-scoped clear or delete actions. These tools keep active conversations manageable while preserving the privacy boundary between participants.

### Encryption designed around the participants

PE Community uses browser-side end-to-end encryption for conversation content. Messages are encrypted before they enter normal realtime transport or server storage, and intended participants decrypt them locally in their browsers. Private chat identity material remains client-side; the platform handles encrypted content and the limited information required to deliver it.

Supported attachments follow the same principle. Files are encrypted in the browser before upload, and the information needed to open them travels inside the encrypted conversation content. This allows participants to share media and documents without storing ordinary readable copies as part of the normal attachment flow.

```mermaid
flowchart LR
    A[Sender] --> B[Encrypt in browser]
    B --> C[Encrypted transport and storage]
    C --> D[Recipient]
    D --> E[Decrypt in browser]
```

> [!NOTE]
> Private chat keys remain on the client side. As with any browser-based encrypted application, the security of the browser session and the application code delivered to it remains part of the overall trust model.

### Move devices without losing encrypted history

Users can export an encrypted backup of their chat identity from the **Secure keys** controls. The backup is protected by a recovery password that is used locally and is not sent to the server. Importing that backup on another supported browser or device can make the applicable encrypted conversation history readable again.

Restoring a backup does not automatically grant permission to send. The new browser or device must still be authorized for active encrypted messaging. Keys retained for older conversations may continue to unlock historical content locally without becoming permission to create new messages.

### Realtime communication with visible delivery results

`Socket.IO` keeps active conversations synchronized and reconnects the selected discussion when connectivity returns. PE Community waits for server acknowledgement before treating an encrypted message as successfully sent, so a timeout, lost connection, or authorization problem appears as a visible error rather than a silent failure.

## Requirements

The supported self-hosted path requires Docker Engine with Docker Compose v2. Local source development additionally requires Node.js 22 and pnpm 11.5.2 through Corepack.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Replace every required secret placeholder with an independent value. `openssl rand -hex 32` is suitable for the application secrets.
3. Set `APP_DOMAIN` and `WEB_ORIGIN` to the address members will open.
4. Build and start the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Open `WEB_ORIGIN` and complete the one-time setup flow. Do not run the development seed for a real community.

## Configuration

The [`.env.example`](.env.example) lists the supported public deployment variables.

Treat JWT secrets, password peppers, encryption keys, database credentials, setup and recovery tokens, and SMTP credentials as production secrets.

## First-Run Setup

On an unconfigured installation, open the application and follow the guided setup to create the community, defaults, email settings, and initial Owner account. The setup endpoint closes after successful completion.

## Security

Passwords use Argon2id with an application pepper. Sessions use signed HTTP-only cookies with server-side records. The platform also provides MFA, permission checks, audit logging, upload validation, participant-scoped chat access, and browser-side chat encryption.

Encrypted chat protects message and attachment content from normal server-side reading, but metadata and endpoint security still matter. Review the public operator security guide and [SECURITY.md](SECURITY.md) before exposing an installation.

## Documentation

The full English and French product, administration, deployment, backup, security, and troubleshooting guides are maintained in `apps/site` or the official [Docs](https://community.ponaekolo.com/docs).

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

`pnpm dev` starts the API, authenticated web application, worker, and shared-package watcher. Start the documentation site separately with `pnpm site:dev`.

Common checks:

```bash
pnpm exec prisma validate --schema prisma/schema.prisma
pnpm db:generate
pnpm --filter @pe/api test
pnpm --filter @pe/api build
pnpm --filter @pe/worker test
pnpm --filter @pe/worker build
pnpm --filter @pe/web test
pnpm --filter @pe/web exec tsc --noEmit
pnpm --filter @pe/web build
pnpm --filter @pe/site exec tsc --noEmit
pnpm --filter @pe/site build
```

## Repository Structure

- `apps/api`: NestJS API and Socket.IO server
- `apps/web`: authenticated community application
- `apps/worker`: email and automation workers
- `apps/site`: public product and operator documentation site
- `packages/shared`: shared permissions, email, and automation contracts
- `prisma`: schema, migrations, and fictional development seed
- `deploy`: reverse-proxy configuration and deployment contract tests

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues must follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Security Reporting

Vulnerabilities should be reported through GitHub Private Vulnerability Reporting. Do not open a public issue. See [SECURITY.md](SECURITY.md) for the reporting policy.

## License

PE Community is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for the full terms.
