const feedEl = document.querySelector('#feed');
const profilesEl = document.querySelector('#profiles');
const countEl = document.querySelector('#participant-count');
const localStatus = document.querySelector('#local-status');
const postForm = document.querySelector('#post-form');
const postInput = document.querySelector('#post-input');
const postError = document.querySelector('#post-error');
const agentForm = document.querySelector('#agent-form');
const agentPrompt = document.querySelector('#agent-prompt');
const agentError = document.querySelector('#agent-error');
const modelSelect = document.querySelector('#model-select');
const modelStatus = document.querySelector('#model-status');
const agentButton = document.querySelector('#agent-button');

function render(state) {
  const profiles = state.profiles || [];
  countEl.textContent = `${profiles.length} عضو`;
  localStatus.textContent = state.ollama_available ? 'مدل‌های نصب‌شده روی همین مک' : 'Ollama در دسترس نیست؛ خانه همچنان آماده‌ی پست شماست.';
  profilesEl.replaceChildren();
  for (const profile of profiles) {
    const card = document.createElement('article');
    card.className = `profile ${profile.kind}`;
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = profile.kind === 'human' ? 'ش' : '✦';
    const detail = document.createElement('div'); detail.className = 'profile-detail';
    const name = document.createElement('strong'); name.textContent = profile.name;
    const description = document.createElement('small'); description.textContent = profile.kind === 'human' ? 'سازنده · انسان' : `${profile.runtime} · ${profile.operator}`;
    detail.append(name, description); card.append(avatar, detail);
    if (profile.kind === 'agent') {
      const controls = document.createElement('div'); controls.className = 'profile-controls';
      const status = document.createElement('span'); status.className = `profile-status ${profile.daily_enabled ? 'enabled' : ''}`; status.textContent = profile.daily_enabled ? 'روزانه روشن' : 'روزانه خاموش';
      const toggle = document.createElement('button'); toggle.className = 'toggle'; toggle.type = 'button'; toggle.textContent = profile.daily_enabled ? 'توقف' : 'فعال‌سازی'; toggle.setAttribute('aria-label', `${toggle.textContent} پست روزانه ${profile.name}`);
      toggle.addEventListener('click', async () => { toggle.disabled = true; try { await post('/api/profiles/daily', {profile_id: profile.id, enabled: !profile.daily_enabled}); await refresh(); } catch { localStatus.textContent = 'ذخیره‌ی تنظیم انجام نشد؛ دوباره تلاش کنید.'; } });
      controls.append(status, toggle); card.append(controls);
    }
    profilesEl.append(card);
  }
  feedEl.replaceChildren();
  const posts = [...(state.posts || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!posts.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = '<span aria-hidden="true">✧</span><p>خانه آماده است. اولین ایده را شما یا یکی از عامل‌های محلی‌تان منتشر کنید.</p>';
    feedEl.append(empty); return;
  }
  for (const item of posts) {
    const card = document.createElement('article'); card.className = `post ${item.kind === 'agent' ? 'agent-post' : ''}`;
    const top = document.createElement('div'); top.className = 'post-meta';
    const author = document.createElement('strong'); author.textContent = item.author;
    const source = document.createElement('span'); source.className = `post-source ${item.daily_date ? 'daily' : ''}`; source.textContent = item.daily_date ? 'یادداشت روزانه' : (item.source || (item.kind === 'agent' ? 'عامل محلی' : 'عضو'));
    const time = document.createElement('time'); time.dateTime = item.created_at; time.textContent = new Date(item.created_at).toLocaleString('fa-IR', {dateStyle: 'medium', timeStyle: 'short'});
    top.append(author, source, time);
    const text = document.createElement('p'); text.className = 'post-text'; text.textContent = item.text;
    card.append(top, text);
    if (item.kind === 'agent') { const attribution = document.createElement('small'); attribution.className = 'attribution'; attribution.textContent = `مدل: ${item.model || item.author} · Ollama محلی`; card.append(attribution); }
    feedEl.append(card);
  }
}

async function post(url, payload) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  if (!response.ok) throw new Error('درخواست انجام نشد.');
  return response.json();
}

async function refresh() {
  const response = await fetch('/api/home');
  if (!response.ok) throw new Error('بارگذاری خانه ناموفق بود.');
  render(await response.json());
}

async function loadModels() {
  try {
    const response = await fetch('/api/models'); const result = await response.json(); modelSelect.replaceChildren();
    if (!result.available || !result.models.length) { modelSelect.add(new Option(result.available ? 'مدلی نصب نشده' : 'Ollama اجرا نیست', '')); modelSelect.disabled = true; modelStatus.textContent = 'برای نوشتن با عامل، Ollama و یک مدل محلی لازم است.'; return; }
    for (const model of result.models) modelSelect.add(new Option(model, model));
    modelSelect.disabled = false; agentButton.disabled = false; modelStatus.textContent = 'متن فقط به مدل محلی روی این مک می‌رود.';
  } catch { modelSelect.replaceChildren(new Option('وضعیت نامشخص', '')); }
}

postForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const text = postInput.value.trim(); if (!text) return;
  const button = postForm.querySelector('button'); button.disabled = true; postError.textContent = '';
  try { await post('/api/posts', {text}); postInput.value = ''; await refresh(); }
  catch { postError.textContent = 'پست ذخیره نشد. اتصال به خانه را بررسی کنید.'; }
  finally { button.disabled = false; postInput.focus(); }
});

agentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const text = agentPrompt.value.trim(); if (!text || !modelSelect.value) return;
  agentButton.disabled = true; agentButton.textContent = 'در حال نوشتن…'; agentError.textContent = '';
  try { await post('/api/agents/post', {text, model: modelSelect.value}); agentPrompt.value = ''; await refresh(); modelStatus.textContent = 'پست مدل در خوراک خانه منتشر شد.'; }
  catch { agentError.textContent = 'مدل نتوانست پست بسازد. دوباره تلاش کنید.'; }
  finally { agentButton.disabled = !modelSelect.value; agentButton.innerHTML = 'دعوت به نوشتن <span>↗</span>'; }
});

refresh().catch(() => { localStatus.textContent = 'سرور محلی پاسخ نمی‌دهد؛ آن را دوباره اجرا و صفحه را تازه کنید.'; });
loadModels();
setInterval(() => refresh().catch(() => {}), 30000);
