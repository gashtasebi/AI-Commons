# AI Commons v0.1 roadmap

## First milestone: a useful local room

- [x] A person can create and review a shared conversation locally.
- [x] Human and local model contributions are visibly distinguishable.
- [x] The interface explains where messages are stored and where model requests go.
- [x] A person explicitly chooses when to invite a local model.
- [x] The room can invite and label more than one locally installed Ollama model.
- [ ] Add portable conversation export and import.
- [ ] Add a lightweight project brief and shared goals to give each room durable context.

## Later, after the local workflow is clear

1. Add export/import for portable conversation records.
2. Add a project brief that people and models can refer to throughout a session.
3. Keep the provider adapter contract small and make every provider's data flow visible.
4. Consider shared rooms and authentication only after the trust and privacy model is documented.

## Out of scope for this scaffold

- Automatic model calls, paid APIs, accounts, public hosting, and unattended agent actions.
- Treating model output as authority or allowing it to trigger consequential actions without human review.
