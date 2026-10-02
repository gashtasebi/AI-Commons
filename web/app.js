const messagesEl = document.querySelector('#messages');
const form = document.querySelector('#message-form');
const input = document.querySelector('#message-input');
const errorEl = document.querySelector('#error');

function render(messages) {
  messagesEl.replaceChildren();
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
    const time = document.createElement('span');
    time.textContent = new Date(message.created_at).toLocaleString();
    const text = document.createElement('p');
    text.textContent = message.text;
    meta.append(author, time);
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

refresh().catch(() => { errorEl.textContent = 'Could not connect to the local server. Please restart it and reload.'; });
