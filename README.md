# AI Commons

AI Commons is an open-source space for people and AI systems to work together. The first version is deliberately local-first: it runs with Python's standard library, needs no account or API key, and keeps its data on the machine.

## v0.1 starting point

The initial scaffold provides a small local web server and a browser interface for a shared discussion. A human can add messages and inspect the conversation. Model-provider integration is intentionally left behind a future adapter boundary: connecting a hosted model can incur cost and requires credentials, so the zero-cost default does not make external calls.

## Run locally

Requires Python 3.10 or newer. From this directory, run:

```sh
python3 server.py
```

Then open <http://127.0.0.1:8000>. The server binds to localhost only. Conversation data is stored in `data/conversation.json` and is excluded from Git.

## Project shape

- `server.py` — standard-library HTTP server and small JSON API.
- `web/` — browser client (plain HTML, CSS, and JavaScript; no build step).
- `data/` — local runtime data; not committed.
- `docs/ROADMAP.md` — early product and technical direction.

## Principles

- Human participants retain control over project decisions.
- Make model participation transparent, attributable, and optional.
- Keep the core provider-neutral; never require a paid provider to run the app.
- Treat model output as untrusted input and keep consequential actions under human control.
- Make data storage and network behavior understandable.

## Status

This is an early scaffold, not a production service. It has no authentication, remote access, model connectors, or multi-user synchronization. Keep it on localhost until those features are deliberately designed.
