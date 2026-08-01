# Life Vault relational data model

The user interface is not the data model. React Native pages may be redesigned or replaced while these native operations and encrypted SQLCipher tables remain stable.

## Core entities

- **Project / App** — Guidance, SpeechMe, ProtectMe, a household, a business or another top-level area.
- **Platform / Provider** — Paddle, Meta, Pinterest, Supabase, Barclays, British Gas and similar providers.
- **Account** — One specific login or customer account. Multiple accounts may belong to the same platform.
- **Resource / Asset** — Domain, Facebook Page, Pinterest profile, Supabase project, GitHub repository, Paddle product, ad account or app.
- **Other Record** — Identity, health or standalone personal information that is not naturally an account or resource.

## Child information

Each entity may contain:

- Aliases and tags
- Searchable or sensitive attributes
- Multiple credentials (login, PIN, password, TOTP, recovery codes, API keys)
- Multiple identifiers (account number, merchant ID, project ID, customer reference)
- Multiple renewal dates
- Outgoing relationships to other entities

## Relationship types

- `used_by_project`
- `account_on_platform`
- `controls_resource`
- `paid_from`
- `uses_email`
- `hosted_on`
- `domain_points_to`
- `login_owned_by`
- `production_of`
- `sandbox_of`
- `related`

Relationships are real SQL rows with foreign keys, not text notes.

## Example

```text
Guidance (project)
├── Guidance Paddle production (account)
│   └── Paddle (platform)
├── Guidance Supabase account (account)
│   ├── Supabase (platform)
│   └── Guidance production database (resource)
├── guidanceinfaith.com (resource)
│   └── Cloudflare (platform/account)
└── Guidance Meta Business Portfolio (account/resource)
    ├── Meta (platform)
    └── Guidance Facebook Page (resource)
```

Searching `Guidance` returns the project plus its linked accounts and resources, then the parent platforms reached through those records. Traversal stops at a shared platform boundary so unrelated sibling accounts on Paddle or Meta are not pulled into the Guidance result.

## Search safety

Graph search includes:

- Entity names, aliases and tags
- Descriptions, subtype, category, status and environment
- Website and login URLs
- Non-sensitive searchable attributes
- Searchable identifiers, including account/customer/project IDs
- Credential labels and usernames/emails
- Linked entity names through the relationship graph

Graph search never reads or matches:

- Passwords
- PINs or CVVs
- TOTP secrets
- API secrets
- Recovery codes
- Other credential secret values
- Sensitive attributes

Identifier values may be searchable while the vault is unlocked, but sensitive identifiers are masked in the interface until explicitly revealed.

## Migration

Database schema version 2 creates the relational tables and automatically migrates schema-version-1 flat `vault_records` into entities. Existing record IDs are retained. Fields are classified into attributes, credentials, identifiers and renewals using conservative key-name rules. The original flat table remains only for compatibility and is not used by the new interface.
