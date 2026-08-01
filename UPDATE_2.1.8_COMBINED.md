# Life Vault 2.1.8 combined recovery and structure update

This source update is intended for the repository that already completed the r6 Android build and contains the generated `package-lock.json`.

## Included changes

### Recovery setup

- The 24-word phrase is displayed in a bounded, scrollable area.
- **Cancel setup** and **Continue** remain fixed and visible at the bottom of the dialog.
- Setup confirmation requests three randomly selected words, one from each third of the phrase.
- Confirmation uses the app-owned private letter keypad and does not display answer choices.
- Actual disaster recovery still requires the complete 24-word phrase.

### Containers and project assets

- Projects, households/properties, people/dependants and businesses are containers.
- A project container contains separately linked assets such as its app, website, community, domain, repository, database, payment product and social channels.
- Project records no longer request website or login details when created.
- Existing project-level website and login values are preserved under **Legacy project web details**; they are not silently changed or deleted.
- Container detail pages group linked entries as assets, accounts/services and documents/records.
- Container actions adapt to the container type. Examples include **Add asset** for projects, **Add household item** and **Add subscription** for a home, and **Add health item** for a person.

### Categories and add flow

The add screen now starts with real-world areas and then presents individual choices:

- Projects and collections
- Money
- Household and property
- Digital and communications
- Identity and government
- Health and care
- People and family
- Vehicles and travel
- Subscriptions and memberships
- Work and business
- Custom

The template set contains 121 specific choices. Passwords, PINs, recovery codes and API keys remain credential types attached to entries rather than being treated as a life category.

### Interface

- Front-screen filter chips are horizontally scrollable, have fixed content sizing and cannot shrink to truncated labels.
- The home screen has clearer container, asset and renewal summaries.
- Add/edit forms use progressive sections for essential details, links, login/access, identifiers, details, renewals and advanced fields.

## Compatibility

- No dependency or workflow changes are included.
- `package.json`, `app.json` and `package-lock.json` are unchanged.
- The existing encrypted relational database schema and entity IDs are preserved.
- Legacy category IDs remain readable and are normalised only for display/filtering.
- No automatic conversion of legacy project website values is performed; this avoids silently creating or duplicating assets.

## Verification completed before packaging

- Dependency/build static check
- Security static check
- Relational structure and interface check
- Import and native API graph check
- Static-checker self-tests
- Build-script self-tests
- All-source TypeScript syntax/type-graph check using external-module stubs
- Executable entity-model checks across all 121 templates
- Executable recovery-position and comparison tests

A new GitHub Android build and phone test are still required for this combined update.
