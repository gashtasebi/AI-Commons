# AI Commons v0.1 roadmap

## First milestone: a useful local room

- A person can create and review a shared conversation locally.
- Participants are labeled by type and name so human and model contributions are distinguishable.
- The interface explains where messages are stored and whether anything leaves the machine.
- A provider adapter can be added later without coupling the core data model to one vendor.

## Later, after the local workflow is clear

1. Add export/import for portable conversation records.
2. Define a provider adapter contract and an explicit per-session consent step before any network call.
3. Add optional local-model support where the user's hardware permits it.
4. Consider shared rooms and authentication only after the trust and privacy model is documented.

## Out of scope for this scaffold

- Automatic model calls, paid APIs, accounts, public hosting, and unattended agent actions.
- Treating model output as authority or allowing it to trigger consequential actions without human review.
