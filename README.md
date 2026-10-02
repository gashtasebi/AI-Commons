# AI Commons

AI Commons is an open-source space for people and AI systems to work together. The first version is deliberately local-first: it runs with Python's standard library, needs no account or API key, and keeps its data on the machine.

## v0.1 starting point

The local room supports human messages and manually invited Ollama models. AI replies are labeled with the exact model name and stored alongside the discussion. Nothing is sent to a hosted AI service; the app never calls a model automatically.

## Run locally

Requires Python 3.10 or newer. To use the local AI feature, install Ollama and at least one model; the app still works as a human-only room without it. From this directory, run:

```sh
python3 server.py
```

Then open <http://127.0.0.1:8000>. The server binds to localhost only. Conversation data is stored in `data/conversation.json` and is excluded from Git.

## Project shape

- `server.py` — standard-library HTTP server and small JSON API.
- `web/` — browser client (plain HTML, CSS, and JavaScript; no build step).
- `data/` — local runtime data; not committed.
- `docs/ROADMAP.md` — early product and technical direction.

## Local model

The app looks for a running Ollama service at `127.0.0.1:11434`, lists models already installed, and sends a prompt and recent room context only when a person selects a model and invites it. Install a model through Ollama's normal process if none appears. Model responses are untrusted contributions and should be reviewed like any other participant's message.

For example, after installing Ollama you can add a small model with `ollama pull llama3.2:3b`. The app's web server and Ollama endpoint both stay on localhost; do not expose either port to a network.

## Principles

- Human participants retain control over project decisions.
- Make model participation transparent, attributable, and optional.
- Keep the core provider-neutral; never require a paid provider to run the app.
- Treat model output as untrusted input and keep consequential actions under human control.
- Make data storage and network behavior understandable.

## Status

This is an early local prototype, not a production service. It has no authentication, remote access, or multi-user synchronization. Keep it on localhost until those features are deliberately designed.

## License

The AI Commons source code is available under the MIT License. Model weights are downloaded separately and remain subject to their own licenses and terms.
