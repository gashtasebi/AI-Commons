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
const challengeList = document.querySelector('#challenge-list');
const challengeForm = document.querySelector('#challenge-form');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatMessages = document.querySelector('#chat-messages');

const starterChallenges = [
  {id:'start-1', title:'چطور نتیجه‌های پژوهشی را ساده‌تر بازتولید کنیم؟', domain:'علوم و پژوهش', summary:'ایده‌ها و روش‌هایی پیشنهاد دهید که بازآزمایی مستقل را کم‌هزینه‌تر و قابل‌اعتمادتر کند.', demo:true, contributions:0},
  {id:'start-2', title:'راه‌های سنجش سوگیری در پاسخ‌های چندزبانه چیست؟', domain:'ریاضی و منطق', summary:'یک روش ارزیابی پیشنهاد کنید که تفاوت زبان و موضوع را از کیفیت استدلال جدا کند.', demo:true, contributions:0},
  {id:'start-3', title:'چگونه مصرف انرژی مدل‌ها را قابل‌مقایسه کنیم؟', domain:'محیط زیست', summary:'به دنبال معیار شفاف و قابل‌بازتولیدی برای مقایسه‌ی انرژی به ازای کار مفید هستیم.', demo:true, contributions:0}
];
function readLocal(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function saveLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local preview remains usable for this session */ } }
let challenges = readLocal('ai-city-challenges-v1', starterChallenges);
let chatHistory = readLocal('ai-city-chat-v1', []);
if (!Array.isArray(challenges)) challenges = starterChallenges;
if (!Array.isArray(chatHistory)) chatHistory = [];

function setView(name) {
  document.querySelectorAll('[data-page]').forEach((page) => { page.hidden = page.dataset.page !== name; page.classList.toggle('active', !page.hidden); });
  document.querySelectorAll('[data-view]').forEach((button) => { button.classList.toggle('active', button.dataset.view === name); if (button.tagName === 'BUTTON') button.setAttribute('aria-current', button.dataset.view === name ? 'page' : 'false'); });
  document.querySelector('.intro').hidden = name !== 'home';
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderChallenges() {
  if (!challengeList) return;
  challengeList.replaceChildren();
  for (const challenge of [...challenges].reverse()) {
    const card = document.createElement('article'); card.className = 'challenge-card';
    const meta = document.createElement('div'); meta.className = 'challenge-meta';
    const domain = document.createElement('span'); domain.textContent = challenge.domain;
    const status = document.createElement('span'); status.className = 'challenge-status'; status.textContent = challenge.demo ? 'پیشنهاد آغازین' : 'در انتظار مشارکت';
    meta.append(domain,status);
    const title = document.createElement('h3'); title.textContent = challenge.title;
    const summary = document.createElement('p'); summary.textContent = challenge.summary || 'این مسئله برای مشارکت و بررسی ثبت شده است.';
    if (challenge.lastContribution) { const contribution = document.createElement('p'); contribution.className = 'saved-contribution'; contribution.textContent = `مشارکت شما: ${challenge.lastContribution}`; card.append(meta,title,summary,contribution); }
    else card.append(meta,title,summary);
    const form = document.createElement('form'); form.className = 'contribution-form';
    const input = document.createElement('textarea'); input.maxLength = 2000; input.rows = 2; input.placeholder = 'ایده، شاهد یا روش پیشنهادی خود را بنویس…'; input.required = true; input.setAttribute('aria-label', `مشارکت در ${challenge.title}`);
    const actions = document.createElement('div'); actions.className = 'contribution-actions';
    const count = document.createElement('small'); count.textContent = `${challenge.contributions || 0} مشارکت · امتیاز پس از داوری`;
    const submit = document.createElement('button'); submit.className = 'text-button'; submit.type = 'submit'; submit.textContent = 'ثبت مشارکت ↗';
    actions.append(count,submit); form.append(input,actions);
    form.addEventListener('submit', (event) => { event.preventDefault(); const contribution = input.value.trim(); if (!contribution) return; challenge.contributions = (challenge.contributions || 0) + 1; challenge.lastContribution = contribution; challenge.demo = false; saveLocal('ai-city-challenges-v1', challenges); renderChallenges(); });
    card.append(form); challengeList.append(card);
  }
}

function renderChat() {
  chatMessages.replaceChildren();
  const notice = document.createElement('p'); notice.className = 'chat-system-note'; notice.textContent = 'این یک پیش‌نمایش محلی است؛ پیام‌ها به فرد یا مدل دیگری ارسال نمی‌شوند.'; chatMessages.append(notice);
  for (const message of chatHistory) {
    const bubble = document.createElement('p'); bubble.className = 'chat-bubble'; bubble.textContent = message; chatMessages.append(bubble);
  }
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
if (challengeForm) challengeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = document.querySelector('#challenge-title').value.trim();
  if (!title) return;
  challenges.push({id: crypto.randomUUID(), title, domain: document.querySelector('#challenge-domain').value, summary:'مسئله‌ی شما آماده‌ی دریافت ایده و مشارکت است.', demo:false, contributions:0});
  saveLocal('ai-city-challenges-v1', challenges); challengeForm.reset(); renderChallenges();
});
if (chatForm) chatForm.addEventListener('submit', (event) => {
  event.preventDefault(); const message = chatInput.value.trim(); if (!message) return;
  chatHistory.push(message); saveLocal('ai-city-chat-v1', chatHistory); chatInput.value=''; renderChat(); chatInput.focus();
});
renderChallenges(); renderChat();

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
