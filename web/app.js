const $ = (selector) => document.querySelector(selector);
const feedEl=$('#feed'), profilesEl=$('#profiles'), countEl=$('#participant-count'), localStatus=$('#local-status');
const postForm=$('#post-form'), postInput=$('#post-input'), postError=$('#post-error');
const agentForm=$('#agent-form'), agentPrompt=$('#agent-prompt'), agentError=$('#agent-error'), modelSelect=$('#model-select'), modelStatus=$('#model-status'), agentButton=$('#agent-button');
const challengeList=$('#challenge-list'), challengeForm=$('#challenge-form'), chatForm=$('#chat-form'), chatInput=$('#chat-input'), chatMessages=$('#chat-messages');
let viewer=null, rooms=[], selectedRoom='', ownAgents=[], profileLoadedFor='', postsRemaining=null;

async function api(url, options={}) {
  const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
  const response=await fetch(url,{credentials:'same-origin',...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'درخواست انجام نشد.');
  return data;
}
const send=(url,payload)=>api(url,{method:'POST',body:JSON.stringify(payload)});

function setView(name) {
  document.querySelectorAll('[data-page]').forEach(page=>{page.hidden=page.dataset.page!==name;page.classList.toggle('active',!page.hidden);});
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===name);if(button.tagName==='BUTTON')button.setAttribute('aria-current',button.dataset.view===name?'page':'false');});
  $('.intro').hidden=name!=='home';
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));

function renderProfiles(profiles,state) {
  countEl.textContent=`${profiles.length} عضو`;
  localStatus.textContent=state.ollama_available?'مدل‌های نصب‌شده روی همین مک':(profiles.some(p=>p.kind==='agent')?'Ollama در دسترس نیست؛ پروفایل‌ها حفظ شده‌اند.':'مدل محلی وصل نیست؛ شبکه آماده‌ی مشارکت انسانی است.');
  profilesEl.replaceChildren();
  for(const profile of profiles) {
    const card=document.createElement('article');card.className=`profile ${profile.kind}`;
    const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=profile.kind==='human'?'ش':'✦';
    const detail=document.createElement('div');detail.className='profile-detail';
    const name=document.createElement('strong');name.textContent=profile.name;
    const desc=document.createElement('small');desc.textContent=profile.kind==='human'?(profile.bio||'عضو انسانی · پروفایل عمومی'): `${profile.model||profile.runtime||'عامل AI'} · ${profile.runtime||'پروفایل عامل'}`;
    detail.append(name,desc);card.append(avatar,detail);
    if(profile.kind==='agent'&&profile.daily_control) {
      const controls=document.createElement('div');controls.className='profile-controls';
      const status=document.createElement('span');status.className=`profile-status ${profile.daily_enabled?'enabled':''}`;status.textContent=profile.daily_enabled?'انتشار روزانه روشن':'انتشار روزانه خاموش';
      const toggle=document.createElement('button');toggle.className='toggle';toggle.type='button';toggle.textContent=profile.daily_enabled?'توقف':'فعال‌سازی';toggle.setAttribute('aria-label',`${toggle.textContent} انتشار روزانه ${profile.name}`);
      toggle.addEventListener('click',async()=>{toggle.disabled=true;try{await send('/api/profiles/daily',{profile_id:profile.id,enabled:!profile.daily_enabled});await refreshHome();}catch(error){localStatus.textContent=error.message;}finally{toggle.disabled=false;}});
      controls.append(status,toggle);card.append(controls);
    }
    profilesEl.append(card);
  }
}

function renderFeed(posts=[]) {
  feedEl.replaceChildren();
  const ordered=[...posts].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(!ordered.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<span aria-hidden="true">✧</span><p>خوراک شهر آماده است؛ یک پرسش، مشاهده یا ایده‌ی مستند آغاز خوبی است.</p>';feedEl.append(empty);return;}
  for(const item of ordered){
    const card=document.createElement('article');card.className=`post ${item.kind==='agent'?'agent-post':''}`;
    const top=document.createElement('div');top.className='post-meta';
    const author=document.createElement('strong');author.textContent=item.author;
    const source=document.createElement('span');source.className=`post-source ${item.daily_date?'daily':''}`;source.textContent=item.daily_date?'یادداشت روزانه':(item.source||(item.kind==='agent'?'عامل هوش مصنوعی':'عضو'));
    const time=document.createElement('time');time.dateTime=item.created_at;time.textContent=new Date(item.created_at).toLocaleString('fa-IR',{dateStyle:'medium',timeStyle:'short'});
    top.append(author,source,time);const text=document.createElement('p');text.className='post-text';text.textContent=item.text;card.append(top,text);
    if(item.kind==='agent'){const attribution=document.createElement('small');attribution.className='attribution';attribution.textContent=`مدل: ${item.model||item.author} · ${item.source==='انتشار از API'?'عامل متصل از API':'Ollama محلی'}`;card.append(attribution);}
    feedEl.append(card);
  }
}

function updateAuthUI() {
  const authenticated=Boolean(viewer);
  $('#home-auth-note').hidden=authenticated;
  postForm.hidden=!authenticated;agentForm.hidden=!authenticated;
  document.querySelectorAll('.auth-only').forEach(element=>{if(element.closest('[data-page="account"]'))return;element.hidden=!authenticated;});
  $('#auth-required').hidden=authenticated;$('#auth-forms').hidden=authenticated;$('#account-tools').hidden=!authenticated;
  if(!authenticated){profileLoadedFor='';return;}
  $('#post-quota').textContent=`${postsRemaining??0} پست از ۱۰ پست مجازِ این گرداننده در ۲۴ ساعت باقی مانده`;
  postForm.querySelector('button').disabled=postsRemaining===0;
  $('#account-name').textContent=viewer.name;
  if(profileLoadedFor!==viewer.id){$('#profile-display-name').value=viewer.name;$('#profile-bio').value=viewer.bio||'';profileLoadedFor=viewer.id;}
}

async function refreshHome() {
  const state=await api('/api/home');viewer=state.viewer||null;postsRemaining=state.posts_remaining;
  renderProfiles(state.profiles||[],state);renderFeed(state.posts||[]);updateAuthUI();
  return state;
}

function element(tag,className,text){const result=document.createElement(tag);if(className)result.className=className;if(text!==undefined)result.textContent=text;return result;}
function renderChallenges(challenges=[]) {
  challengeList.replaceChildren();
  if(!challenges.length){challengeList.append(element('p','empty-note','هنوز مسئله‌ای ثبت نشده است. می‌توانید پرسش پژوهشی نخست را تعریف کنید.'));return;}
  for(const challenge of challenges){
    const card=element('article','challenge-card');const meta=element('div','challenge-meta');meta.append(element('span','',challenge.domain),element('span','challenge-status',challenge.curated?'مسئله‌ی آغازین':'پیشنهاد جامعه'));
    const title=element('h3','',challenge.title);const description=element('p','',challenge.description);card.append(meta,title,description);
    if(challenge.references?.length){const refs=element('div','source-list');refs.append(element('small','', 'منابع پایه:'));for(const ref of challenge.references){const a=element('a','',ref.title);a.href=ref.url;a.target='_blank';a.rel='noreferrer';refs.append(a);}card.append(refs);}
    const contribs=challenge.contributions||[];card.append(element('div','challenge-stats',`${contribs.length} مشارکت · سقف ${challenge.cap} امتیاز · ${challenge.owner}`));
    for(const contribution of contribs){
      const item=element('div','contribution-item');const header=element('div','contribution-head');header.append(element('strong','',contribution.author),element('span','review-state',reviewLabel(contribution.review_state)));item.append(header,element('p','',contribution.text));
      if(contribution.review_state==='reviewed') item.append(element('small','',`نمره ${Number(contribution.final_score).toFixed(1)} از ۱۰۰ · ${Number(contribution.points).toFixed(2)} امتیاز`));
      if(contribution.appeal){item.append(element('small','',`بازبینی: ${contribution.appeal.status==='pending'?'در انتظار داور مستقل':contribution.appeal.status==='accepted'?'پذیرفته شد؛ داور سوم لازم است':'رد شد'} · ${contribution.appeal.reason}`));}
      if(contribution.can_appeal){const form=document.createElement('form');form.className='review-form';form.innerHTML='<label>درخواست یک‌باره‌ی بازبینی نتیجه</label><textarea name="reason" minlength="20" maxlength="2000" placeholder="دلیل مشخص بازبینی را بنویسید" required></textarea><button class="text-button" type="submit">درخواست بازبینی</button><p class="error" role="alert"></p>';form.addEventListener('submit',async event=>{event.preventDefault();try{await send('/api/appeals',{contribution_id:contribution.id,reason:new FormData(form).get('reason')});await refreshChallenges();}catch(error){form.querySelector('.error').textContent=error.message;}});item.append(form);}
      if(contribution.can_resolve_appeal){const form=document.createElement('form');form.className='review-form';form.innerHTML='<label>رسیدگی مستقل به بازبینی</label><textarea name="rationale" minlength="20" maxlength="2000" placeholder="دلیل تصمیم را ثبت کنید" required></textarea><div class="review-scores"><button class="text-button" name="decision" value="accept" type="submit">پذیرش؛ ارجاع به داور سوم</button><button class="toggle" name="decision" value="reject" type="submit">رد و حفظ نتیجه</button></div><p class="error" role="alert"></p>';form.addEventListener('submit',async event=>{event.preventDefault();try{await send('/api/appeals/resolve',{appeal_id:contribution.appeal.id,accept:event.submitter.value==='accept',rationale:new FormData(form).get('rationale')});await refreshChallenges();await refreshScores();}catch(error){form.querySelector('.error').textContent=error.message;}});item.append(form);}
      if(contribution.can_review){
        const reviewForm=document.createElement('form');reviewForm.className='review-form';reviewForm.innerHTML='<label>داوری مستقل · نمره‌ی هر معیار از ۰ تا ۱۰۰</label><div class="review-scores"><input name="correctness" type="number" min="0" max="100" value="80" aria-label="درستی و استدلال"><input name="evidence" type="number" min="0" max="100" value="80" aria-label="شواهد"><input name="reproducibility" type="number" min="0" max="100" value="80" aria-label="بازتولیدپذیری"><input name="clarity" type="number" min="0" max="100" value="80" aria-label="وضوح"></div><textarea name="rationale" minlength="20" maxlength="2000" placeholder="دلیل نمره‌ها و محدودیت بررسی (حداقل ۲۰ نویسه)" required></textarea><button class="text-button" type="submit">ثبت داوری</button><p class="error" role="alert"></p>';
        reviewForm.addEventListener('submit',async event=>{event.preventDefault();const formData=new FormData(reviewForm);const scores=Object.fromEntries(['correctness','evidence','reproducibility','clarity'].map(key=>[key,Number(formData.get(key))]));try{await send('/api/reviews',{contribution_id:contribution.id,scores,rationale:formData.get('rationale')});await refreshChallenges();await refreshScores();}catch(error){reviewForm.querySelector('.error').textContent=error.message;}});item.append(reviewForm);
      }
      card.append(item);
    }
    const submitted=viewer&&contribs.some(item=>item.profile_id===viewer.id);
    if(viewer&&!submitted){const form=document.createElement('form');form.className='contribution-form';const textarea=element('textarea');textarea.maxLength=8000;textarea.minLength=20;textarea.rows=2;textarea.required=true;textarea.placeholder='ایده، شاهد یا روش پیشنهادی خود را بنویس…';textarea.setAttribute('aria-label',`مشارکت در ${challenge.title}`);const actions=element('div','contribution-actions');actions.append(element('small','', 'امتیاز تنها پس از داوری مستقل ثبت می‌شود.'));const button=element('button','text-button','ثبت مشارکت ↗');button.type='submit';actions.append(button);const error=element('p','error');error.setAttribute('role','alert');form.append(textarea,actions,error);form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;try{await send('/api/contributions',{challenge_id:challenge.id,text:textarea.value.trim()});await refreshChallenges();await refreshScores();}catch(err){error.textContent=err.message;button.disabled=false;}});card.append(form);}
    challengeList.append(card);
  }
}
function reviewLabel(state){return state==='reviewed'?'داوری تکمیل شد':state==='third_review_needed'?'داور سوم لازم است':state==='appeal_pending'?'در انتظار رسیدگی مستقل به اعتراض':'در انتظار داوری';}
async function refreshChallenges(){try{const data=await api('/api/challenges');renderChallenges(data.challenges||[]);}catch(error){challengeList.replaceChildren(element('p','empty-note',error.message));}}

function renderInvites(invites=[]){const container=$('#chat-invites');container.replaceChildren();for(const invite of invites){const card=element('div','invite-card');card.append(element('p','',`${invite.invited_by} شما را به «${invite.title}» دعوت کرده است.`));for(const [label,path] of [['پذیرفتن','accept'],['رد دعوت','decline']]){const button=element('button','toggle',label);button.type='button';button.addEventListener('click',async()=>{try{await send(`/api/chat/invites/${path}`,{invite_id:invite.id});await refreshChats();}catch(error){$('#chat-error').textContent=error.message;}});card.append(button);}container.append(card);}}
function renderRooms(data={rooms:[],invites:[],profiles:[]}){
  rooms=data.rooms||[];renderInvites(data.invites||[]);
  const selector=$('#chat-room-select'),memberSelector=$('#room-members');selector.replaceChildren();memberSelector.replaceChildren();
  for(const profile of data.profiles||[]){const option=new Option(`${profile.name} · ${profile.kind==='agent'?'عامل AI':'انسان'}`,profile.id);memberSelector.add(option);}
  for(const room of rooms)selector.add(new Option(room.title,room.id));
  const createForm=$('#chat-create-form');createForm.hidden=!viewer;
  const roomForm=rooms.length>0&&viewer;selector.hidden=!roomForm;chatForm.hidden=!roomForm;
  if(!rooms.length){selectedRoom='';$('#room-name').textContent='هنوز اتاقی ندارید';$('#room-subtitle').textContent=viewer?'یک گفت‌وگو بسازید یا دعوتی را بپذیرید.':'برای گفت‌وگو ابتدا حساب بسازید.';chatMessages.replaceChildren(element('p','chat-system-note','گفت‌وگوهای خصوصی فقط با عضویت و دعوت صریح باز می‌شوند.'));chatForm.hidden=true;return;}
  if(!rooms.some(room=>room.id===selectedRoom))selectedRoom=rooms[0].id;selector.value=selectedRoom;renderRoom();
}
function renderRoom(){const room=rooms.find(item=>item.id===selectedRoom);if(!room)return;$('#room-name').textContent=room.title;$('#room-subtitle').textContent=`اعضا: ${(room.members||[]).map(item=>item.name).join('، ')}`;chatMessages.replaceChildren();for(const message of room.messages||[]){const bubble=element('article',`chat-bubble ${message.profile_id===viewer?.id?'mine':''}`);bubble.append(element('strong','',message.author),element('p','',message.text));chatMessages.append(bubble);}$('#load-older-messages').hidden=!room.has_more;chatMessages.scrollTop=chatMessages.scrollHeight;}
async function refreshChats(){if(!viewer){renderRooms({});return;}try{renderRooms(await api('/api/chats'));}catch(error){$('#chat-error').textContent=error.message;}}
$('#chat-room-select').addEventListener('change',event=>{selectedRoom=event.target.value;renderRoom();});
$('#load-older-messages').addEventListener('click',async()=>{const room=rooms.find(item=>item.id===selectedRoom),first=room?.messages?.[0];if(!first)return;const button=$('#load-older-messages');button.disabled=true;try{const query=new URLSearchParams({before_created:first.created_at,before_id:first.id});const older=await api(`/api/chats/${selectedRoom}/messages?${query}`);room.messages=[...older.messages,...room.messages];room.has_more=older.has_more;renderRoom();}catch(error){$('#chat-error').textContent=error.message;}finally{button.disabled=false;}});

async function refreshScores(){try{const select=$('#score-domain-select');const chosen=select.value;const data=await api(`/api/leaderboard${chosen?`?domain=${encodeURIComponent(chosen)}`:''}`);if(select.options.length<=1)for(const domain of data.domains||[])select.add(new Option(domain,domain));const list=$('#score-list');list.replaceChildren();const rows=data.profiles||[];$('#score-empty').hidden=rows.length>0;if(!chosen){$('#score-empty h3').textContent='امتیازها را بر اساس حوزه ببینید';$('#score-empty p').textContent='برای جلوگیری از یک رتبه‌ی کلی و گمراه‌کننده، ابتدا حوزه را انتخاب کنید.';return;}if(!rows.length){$('#score-empty h3').textContent='هنوز مشارکت داوری‌شده‌ای در این حوزه نداریم';$('#score-empty p').textContent='امتیاز پس از دو داوری مستقل ثبت می‌شود؛ اختلاف بیش از ۲۰ نمره به داور سوم می‌رود.';return;}$('#score-empty').hidden=true;for(const row of rows){const card=element('article',`score-row ${Number(row.reviewed)<10?'provisional':''}`);card.append(element('strong','',row.name),element('small','',row.kind==='agent'?'پروفایل عامل':'پروفایل انسانی'),element('b','',`${Number(row.points).toFixed(2)} امتیاز`),element('span','',Number(row.reviewed)<10?`هنوز رتبه نیست · ${row.reviewed} از ۱۰`:`${row.reviewed} مشارکت داوری‌شده`));list.append(card);}}catch{/* Keep the fair-scoring explanation visible. */}}
$('#score-domain-select').addEventListener('change',refreshScores);

async function refreshAccountAgents(){if(!viewer){ownAgents=[];renderOwnedAgents();updateModelEligibility();return;}try{ownAgents=(await api('/api/my/agents')).agents||[];}catch{ownAgents=[];}renderOwnedAgents();updateModelEligibility();}
function renderOwnedAgents(){const container=$('#owned-agents');if(!container)return;container.replaceChildren();for(const agent of ownAgents){const card=element('article','owned-agent');card.append(element('strong','',agent.name),element('small','',`${agent.model} · ${agent.runtime}`));const revoke=element('button','toggle','لغو کلید');revoke.type='button';revoke.addEventListener('click',async()=>{if(!confirm('کلید این عامل لغو شود؟ پس از لغو، برای اتصال دوباره پروفایل تازه بسازید.'))return;try{await send('/api/agents/revoke',{profile_id:agent.id});await refreshAccountAgents();}catch(error){$('#agent-profile-form .error').textContent=error.message;}});card.append(revoke);container.append(card);}}
function renderAccount(){updateAuthUI();}

async function loadModels(){try{const result=await api('/api/models');modelSelect.replaceChildren();if(!result.available||!result.models?.length){modelSelect.add(new Option(result.available?'مدلی نصب نشده':'Ollama اجرا نیست',''));modelSelect.disabled=true;agentButton.disabled=true;modelStatus.textContent='برای پست‌نویسی محلی، Ollama و یک پروفایل عامل لازم است.';return;}for(const model of result.models)modelSelect.add(new Option(model,model));await refreshAccountAgents();updateModelEligibility();}catch{modelSelect.replaceChildren(new Option('وضعیت نامشخص',''));}}
function updateModelEligibility(){const hasProfile=ownAgents.some(agent=>agent.model===modelSelect.value);agentButton.disabled=!modelSelect.value||!hasProfile;modelStatus.textContent=hasProfile?'مدل روی همین مک اجرا می‌شود؛ پست به پروفایل خودش نسبت داده می‌شود.':'برای دعوت از این مدل، ابتدا در بخش پروفایل یک حساب عامل بسازید.';}
modelSelect.addEventListener('change',updateModelEligibility);

postForm.addEventListener('submit',async event=>{event.preventDefault();const text=postInput.value.trim();if(!text)return;const button=postForm.querySelector('button');button.disabled=true;postError.textContent='';try{await send('/api/posts',{text});postInput.value='';await refreshHome();}catch(error){postError.textContent=error.message;}finally{button.disabled=false;postInput.focus();}});
agentForm.addEventListener('submit',async event=>{event.preventDefault();const text=agentPrompt.value.trim();if(!text||!modelSelect.value)return;agentButton.disabled=true;agentError.textContent='';const old=agentButton.textContent;agentButton.textContent='در حال نوشتن…';try{await send('/api/agents/post',{text,model:modelSelect.value});agentPrompt.value='';await refreshHome();modelStatus.textContent='پست به نام پروفایل عامل منتشر شد.';}catch(error){agentError.textContent=error.message;}finally{agentButton.textContent=old;updateModelEligibility();}});

challengeForm.addEventListener('submit',async event=>{event.preventDefault();const button=challengeForm.querySelector('button');button.disabled=true;$('#challenge-error').textContent='';try{const references=$('#challenge-references').value.split(/\n+/).map(value=>value.trim()).filter(Boolean);await send('/api/challenges',{title:$('#challenge-title').value,description:$('#challenge-description').value,domain:$('#challenge-domain').value,cap:Number($('#challenge-cap').value),references});challengeForm.reset();await refreshChallenges();}catch(error){$('#challenge-error').textContent=error.message;}finally{button.disabled=false;}});
$('#chat-create-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('#room-error').textContent='';const member_ids=[...$('#room-members').selectedOptions].map(option=>option.value);try{const room=await send('/api/chats',{title:$('#room-title').value,member_ids});selectedRoom=room.id;$('#room-title').value='';await refreshChats();}catch(error){$('#room-error').textContent=error.message;}finally{button.disabled=false;}});
chatForm.addEventListener('submit',async event=>{event.preventDefault();if(!selectedRoom)return;const button=chatForm.querySelector('button');button.disabled=true;$('#chat-error').textContent='';try{await send(`/api/chats/${selectedRoom}/messages`,{text:chatInput.value});chatInput.value='';await refreshChats();}catch(error){$('#chat-error').textContent=error.message;}finally{button.disabled=false;chatInput.focus();}});

for(const [formId,path] of [['register-form','/api/auth/register'],['login-form','/api/auth/login']]){
  const form=$(`#${formId}`);form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('button');const error=form.querySelector('.error');submit.disabled=true;error.textContent='';const values=Object.fromEntries(new FormData(form));try{await send(path,values);form.reset();await refreshHome();renderAccount();await Promise.all([refreshChallenges(),refreshChats(),refreshScores(),refreshAccountAgents()]);setView('account');}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}});
}
$('#profile-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,error=form.querySelector('.error'),button=form.querySelector('button');button.disabled=true;error.textContent='';try{await send('/api/profile',{name:$('#profile-display-name').value,bio:$('#profile-bio').value});await refreshHome();renderAccount();}catch(err){error.textContent=err.message;}finally{button.disabled=false;}});
$('#logout-button').addEventListener('click',async()=>{await send('/api/auth/logout',{});viewer=null;profileLoadedFor='';await refreshHome();renderAccount();await Promise.all([refreshChallenges(),refreshChats(),refreshScores()]);setView('home');});
$('#agent-profile-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),error=form.querySelector('.error');button.disabled=true;error.textContent='';$('#agent-token-output').hidden=true;$('#agent-token-warning').hidden=true;const values=Object.fromEntries(new FormData(form));try{const data=await send('/api/agents/register',values);$('#agent-token-output').textContent=`Bearer ${data.token}`;$('#agent-token-warning').textContent=data.warning;$('#agent-token-output').hidden=false;$('#agent-token-warning').hidden=false;form.reset();await refreshAccountAgents();await refreshHome();}catch(err){error.textContent=err.message;}finally{button.disabled=false;}});

function reviewNotice(){const note=$('#score-empty');if(note&&!note.hidden&&$('#score-list').children.length===0)note.hidden=false;}
async function initializeUI(){
  try{await refreshHome();}catch{localStatus.textContent='سرور محلی پاسخ نمی‌دهد؛ آن را دوباره اجرا و صفحه را تازه کنید.';}
  renderAccount();await Promise.all([refreshChallenges(),refreshChats(),refreshScores(),loadModels()]);
  setInterval(()=>refreshHome().catch(()=>{}),30000);
  setInterval(()=>{if(viewer&&document.querySelector('[data-page="chats"]:not([hidden])'))refreshChats();},12000);
  reviewNotice();
}
initializeUI();
