# Environment Configuration and Secret Handling

## 1. Purpose

This document defines how configuration and credentials must be handled
across local development, testing, staging, and production.

## 2. Non-negotiable rule

**A secret must never be shipped to a browser or mobile client.**
Anything bundled into frontend code can potentially be inspected,
extracted, or replayed, regardless of whether it originated from an
environment file.

## 3. Configuration categories

### Public client configuration

Only values intentionally designed for public exposure may be included
in client configuration. Examples may include a public application
endpoint or a publishable identifier, subject to the provider's
documentation and security model.

### Server-only secrets

Examples include: - private AI-provider API keys; - database passwords
and privileged database credentials; - service-role keys; - signing
secrets; - OAuth client secrets and refresh tokens; - private storage
credentials; - webhook signing secrets.

These must remain in trusted server-side runtime configuration or a
managed secret store.

## 4. Environment variable naming

Use descriptive names, for example: - `AI_PROVIDER_API_KEY` -
`DATABASE_URL` - `DATABASE_SERVICE_ROLE_KEY` -
`SESSION_SIGNING_SECRET` - `STORAGE_PRIVATE_ACCESS_KEY`

These names are examples only. Confirm the actual names required by the
selected framework and providers. Do not put values in this document.

Never use public-prefixed variables for secrets. For example, framework
conventions such as `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` indicate
client-exposed configuration and must not contain secrets.

## 5. `.env` files

-   Add local secret files to `.gitignore`.
-   Commit a `.env.example` with variable names, comments, and empty or
    clearly fake placeholders only.
-   Never copy production credentials into development or test
    environments.
-   Do not paste `.env` contents into tickets, AI prompts, chat
    messages, screenshots, or logs.
-   Check the final build output and repository history for accidental
    secret exposure.
-   Environment variables are not automatically private: build-time
    frontend variables may be embedded in the output.

## 6. Server-side access pattern

1.  Client calls an authenticated application endpoint.
2.  Server authenticates the user.
3.  Server authorizes access to the requested workspace and records.
4.  Server validates the payload and applies rate/size limits.
5.  Server retrieves the required secret from server-side configuration.
6.  Server calls the external provider.
7.  Server validates the response and returns only necessary safe data.
8.  Server records redacted operational metadata.

Never give the client a secret so that it can call a privileged provider
directly.

## 7. CI/CD and deployment

-   Configure secrets through the hosting platform's protected secret
    settings or a managed secret manager.
-   Restrict which maintainers and workflows can read or deploy secrets.
-   Do not print secrets in CI logs.
-   Avoid exposing secrets to untrusted pull-request jobs.
-   Rotate credentials after staff changes or suspected exposure.
-   Use least-privilege credentials and separate environments.

## 8. Incident response for a leaked secret

1.  Revoke or rotate the exposed credential immediately.
2.  Identify where it was exposed: repository, build artifact, source
    map, log, deployment output, or external system.
3.  Review access and usage logs where available.
4.  Remove the exposed value from current files and follow
    repository-history cleanup policy if needed.
5.  Verify that the replacement is stored only server-side.
6.  Record the incident and preventive action without copying the secret
    into the report.
