const messagesEl = document.querySelector('#messages');
const form = document.querySelector('#message-form');
const input = document.querySelector('#message-input');
const errorEl = document.querySelector('#error');
const inviteForm = document.querySelector('#invite-form');
const inviteInput = document.querySelector('#invite-input');
const inviteError = document.querySelector('#invite-error');
const modelSelect = document.querySelector('#model-select');
const modelStatus = document.querySelector('#model-status');
const inviteButton = document.querySelector('#invite-button');
const participantCount = document.querySelector('#participant-count');

function render(messages) {
  messagesEl.replaceChildren();
  const models = [...new Set(messages.filter((message) => message.kind === 'model').map((message) => message.author))];
  participantCount.textContent = `You · ${models.length} local ${models.length === 1 ? 'model' : 'models'}`;
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<span class="empty-icon" aria-hidden="true">✧</span><p>This room is ready. Start with a question, a sketch of an idea, or something you want people and AI to figure out together.</p>';
    messagesEl.append(empty);
    return;
  }
  for (const message of messages) {
    const item = document.createElement('article');
    item.className = 'message';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('strong');
    author.textContent = message.author;
    if (message.kind === 'model') {
      item.classList.add('model');
      const badge = document.createElement('span');
      badge.className = 'message-model-badge';
      badge.textContent = 'LOCAL AI';
      meta.append(author, badge);
    } else {
      meta.append(author);
    }
    const time = document.createElement('span');
    time.textContent = new Date(message.created_at).toLocaleString();
    const text = document.createElement('p');
    text.textContent = message.text;
    meta.append(time);
    item.append(meta, text);
    messagesEl.append(item);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function refresh() {
  const response = await fetch('/api/messages');
  if (!response.ok) throw new Error('Could not load the conversation.');
  render(await response.json());
}

async function loadModels() {
  try {
    const response = await fetch('/api/models');
    const result = await response.json();
    modelSelect.replaceChildren();
    if (!result.available) {
      modelSelect.add(new Option('Ollama is not running', ''));
      modelStatus.textContent = 'Start Ollama to invite a model.';
      modelSelect.disabled = true;
      return;
    }
    if (!result.models.length) {
      modelSelect.add(new Option('No local models installed', ''));
      modelStatus.textContent = 'Install a local model with Ollama to get started.';
      modelSelect.disabled = true;
      return;
    }
    for (const model of result.models) modelSelect.add(new Option(model, model));
    modelSelect.disabled = false;
    inviteButton.disabled = false;
    modelStatus.textContent = 'Your question and the reply stay on this Mac.';
  } catch {
    modelSelect.replaceChildren(new Option('Local model status unavailable', ''));
    modelSelect.disabled = true;
    modelStatus.textContent = 'Could not check Ollama on this Mac.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  errorEl.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/messages', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text}),
    });
    if (!response.ok) throw new Error('Could not save your message.');
    input.value = '';
    await refresh();
  } catch (error) {
    errorEl.textContent = `${error.message} Please try again.`;
  } finally {
    button.disabled = false;
    input.focus();
  }
});

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = inviteInput.value.trim();
  if (!text || !modelSelect.value) return;
  inviteError.textContent = '';
  inviteButton.disabled = true;
  inviteButton.textContent = 'Thinking…';
  modelStatus.textContent = `${modelSelect.value} is considering your question locally…`;
  try {
    const response = await fetch('/api/ask', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, model: modelSelect.value}),
    });
    if (!response.ok) throw new Error(response.status === 503 ? 'Ollama is not running.' : 'The local model could not reply.');
    inviteInput.value = '';
    await refresh();
    modelStatus.textContent = 'Your question and the reply stay on this Mac.';
  } catch (error) {
    inviteError.textContent = `${error.message} Please try again.`;
    modelStatus.textContent = 'The model was not able to reply.';
  } finally {
    inviteButton.disabled = !modelSelect.value;
    inviteButton.innerHTML = 'Invite model <span aria-hidden="true">↗</span>';
    inviteInput.focus();
  }
});

refresh().catch(() => { errorEl.textContent = 'Could not connect to the local server. Please restart it and reload.'; });
loadModels();
