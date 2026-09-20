const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const input = $('#message-input');
const sendButton = $('#send-btn');
const welcomeView = $('#welcome-view');
const messagesView = $('#messages-view');
const breadcrumbTitle = $('#breadcrumb-title');
const toast = $('#toast');
const toastMessage = $('#toast-message');
const modelMenu = $('#model-menu');
const modelSelect = $('#model-select');
const attachmentPreview = $('#attachment-preview');
const fileInput = $('#file-input');

let toastTimer;
let isGenerating = false;
let directMode = false;
let activeConversationId = 'new';
let pendingGenerationTimer = null;
let generationToken = 0;
const sessions = new Map();

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* stockage non disponible */ }
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  sendButton.disabled = input.value.trim().length === 0 || isGenerating;
}

function responseFor(prompt, isDirect = directMode) {
  const lower = prompt.toLowerCase();
  const prefix = isDirect ? 'Réponse directe : ' : '';

  if (lower.includes('complex') || lower.includes('expliqu') || lower.includes('compren')) {
    return {
      intro: `${prefix}Bien sûr. Je vais rendre cette idée simple, sans l’appauvrir.`,
      body: '<p><strong>La méthode en trois temps</strong></p><p>Commencez par définir le concept en une phrase, puis donnez une analogie du quotidien. Terminez avec un exemple concret : c’est ce qui transforme une information en compréhension.</p><p>Envoyez-moi le sujet qui vous intrigue et je l’expliquerai au niveau de détail qui vous convient.</p>'
    };
  }
  if (lower.includes('projet') || lower.includes('idée') || lower.includes('lanc')) {
    return {
      intro: `${prefix}Très bonne matière première. Une idée devient un projet quand elle rencontre une prochaine étape claire.`,
      body: '<p><strong>Pour la rendre concrète :</strong></p><p>1. Formulons la promesse en une phrase.<br>2. Identifions la personne à qui elle change vraiment la vie.<br>3. Construisons une première version imparfaite cette semaine.<br>4. Mesurons ce qui mérite d’être amplifié.</p><p>Donnez-moi votre idée, même incomplète. On la construira ensemble, sans la brider.</p>'
    };
  }
  if (lower.includes('demain') || lower.includes('futur') || lower.includes('10 ans')) {
    return {
      intro: `${prefix}J’aime cette direction. Le futur commence souvent par une friction que personne n’a encore pris le temps de résoudre.`,
      body: '<p><strong>Et si le produit de demain était une mémoire externe vivante ?</strong></p><p>Un espace discret qui comprend nos intentions, relie nos idées et nous restitue exactement le bon contexte au bon moment — sans nous demander de tout classer.</p><p>La vraie innovation ne ferait pas plus de bruit. Elle nous rendrait simplement plus présents, plus rapides et plus libres.</p>'
    };
  }
  return {
    intro: `${prefix}Je suis là. Prenons cette idée au sérieux et voyons jusqu’où elle peut nous emmener.`,
    body: '<p>Je peux vous aider à réfléchir, écrire, apprendre, planifier ou créer. Posez-moi une question précise, partagez un brouillon ou dites simplement ce que vous cherchez à accomplir.</p><p>Je m’adapterai à votre façon de penser — et nous avancerons une étape à la fois.</p>'
  };
}

function createInitialSessions() {
  const seedPrompts = {
    ideas: 'Comment trouver des idées qui changent vraiment quelque chose ?',
    launch: 'Aide-moi à transformer une idée en projet concret',
    future: 'Imagine le futur du travail dans 10 ans'
  };

  $$('.conversation-item').forEach((item, index) => {
    const id = item.dataset.conversationId || ['new', 'ideas', 'launch', 'future'][index] || `conversation-${index}`;
    const title = item.dataset.title || 'Nouvelle conversation';
    item.dataset.conversationId = id;
    const messages = id === 'new' ? [] : [
      { role: 'user', text: seedPrompts[id] || `Parlons de ${title.toLowerCase()}.` },
      { role: 'assistant', response: responseFor(seedPrompts[id] || title, false) }
    ];
    sessions.set(id, { id, title, messages });
  });
}

function setActiveItem(id) {
  $$('.conversation-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.conversationId === id);
  });
}

function updateTitle(title) {
  breadcrumbTitle.textContent = title;
  const session = sessions.get(activeConversationId);
  if (session) session.title = title;
  const active = $('.conversation-item.active');
  const titleNode = active && $('.conversation-title', active);
  if (titleNode) titleNode.textContent = title;
}

function clearAttachment() {
  attachmentPreview.classList.remove('visible');
  attachmentPreview.innerHTML = '';
  fileInput.value = '';
}

function cancelPendingGeneration() {
  if (pendingGenerationTimer) {
    clearTimeout(pendingGenerationTimer);
    pendingGenerationTimer = null;
  }
  generationToken += 1;
  isGenerating = false;
  $('#typing-message')?.remove();
}

function renderUserMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message message-user';
  wrapper.innerHTML = `<div><div class="message-bubble">${escapeHTML(text).replace(/\n/g, '<br>')}</div><div class="message-meta">Vous · maintenant</div></div>`;
  messagesView.appendChild(wrapper);
}

function assistantMarkup(response) {
  return `<p>${escapeHTML(response.intro)}</p>${response.body}<div class="message-actions"><button class="message-action copy-response" type="button"><span>⧉</span> Copier</button><button class="message-action share-response" type="button"><span>↗</span> Partager</button></div>`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    showToast('Réponse copiée');
  } catch {
    showToast('Copie indisponible dans ce navigateur');
  }
}

function bindAssistantActions(wrapper, response) {
  $('.copy-response', wrapper)?.addEventListener('click', () => {
    const plainText = `${response.intro}\n\n${$('.message-bubble', wrapper).innerText.replace(/\n?⧉ Copier\n?↗ Partager/, '')}`;
    copyText(plainText);
  });
  $('.share-response', wrapper)?.addEventListener('click', async () => {
    const shareText = response.intro;
    try {
      if (navigator.share) await navigator.share({ title: 'NOVA', text: shareText });
      else await copyText(shareText);
    } catch {
      // L'utilisateur a fermé la feuille de partage : aucune notification nécessaire.
    }
  });
}

function appendAssistantMessage(response) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message message-assistant';
  wrapper.innerHTML = `<div class="assistant-avatar">✦</div><div class="message-bubble">${assistantMarkup(response)}</div>`;
  messagesView.appendChild(wrapper);
  bindAssistantActions(wrapper, response);
  return wrapper;
}

function renderTyping() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message message-assistant';
  wrapper.id = 'typing-message';
  wrapper.innerHTML = '<div class="assistant-avatar">✦</div><div class="message-bubble"><div class="typing-indicator" aria-label="NOVA écrit"><i></i><i></i><i></i></div></div>';
  messagesView.appendChild(wrapper);
}

function replaceTypingWithAssistant(response) {
  const typing = $('#typing-message');
  if (!typing) return;
  typing.removeAttribute('id');
  typing.querySelector('.message-bubble').innerHTML = assistantMarkup(response);
  bindAssistantActions(typing, response);
}

function renderSession(session) {
  breadcrumbTitle.textContent = session.title;
  messagesView.innerHTML = '';
  input.value = '';
  clearAttachment();
  autoResize();

  if (session.messages.length === 0) {
    welcomeView.style.display = '';
    messagesView.classList.remove('visible');
    return;
  }

  welcomeView.style.display = 'none';
  messagesView.classList.add('visible');
  session.messages.forEach((message) => {
    if (message.role === 'user') renderUserMessage(message.text);
    if (message.role === 'assistant') appendAssistantMessage(message.response);
  });
  requestAnimationFrame(() => {
    messagesView.scrollTop = messagesView.scrollHeight;
  });
}

function scrollToLatest() {
  messagesView.scrollTo({ top: messagesView.scrollHeight, behavior: 'smooth' });
}

function resetChat() {
  cancelPendingGeneration();
  const freshSession = sessions.get('new');
  freshSession.title = 'Nouvelle conversation';
  freshSession.messages = [];
  activeConversationId = 'new';
  setActiveItem('new');
  renderSession(freshSession);
  closeSidebar();
  input.focus();
}

function selectConversation(id) {
  cancelPendingGeneration();
  const session = sessions.get(id);
  if (!session) return;
  activeConversationId = id;
  setActiveItem(id);
  renderSession(session);
  closeSidebar();
  if (id !== 'new') showToast('Conversation chargée');
}

function sendMessage(value = input.value) {
  const text = value.trim();
  if (!text || isGenerating) return;
  const session = sessions.get(activeConversationId);
  if (!session) return;

  isGenerating = true;
  welcomeView.style.display = 'none';
  messagesView.classList.add('visible');
  if (session.title === 'Nouvelle conversation') {
    const shortTitle = text.length > 28 ? `${text.slice(0, 28).trim()}…` : text;
    updateTitle(shortTitle);
  }

  session.messages.push({ role: 'user', text });
  renderUserMessage(text);
  input.value = '';
  autoResize();
  renderTyping();
  scrollToLatest();

  const requestToken = ++generationToken;
  const conversationIdAtSend = activeConversationId;
  const modeAtSend = directMode;
  pendingGenerationTimer = setTimeout(() => {
    pendingGenerationTimer = null;
    if (requestToken !== generationToken || conversationIdAtSend !== activeConversationId || !isGenerating) return;
    const response = responseFor(text, modeAtSend);
    session.messages.push({ role: 'assistant', response });
    replaceTypingWithAssistant(response);
    isGenerating = false;
    autoResize();
    scrollToLatest();
  }, 850);
}

function positionModelMenu() {
  const rect = modelSelect.getBoundingClientRect();
  const menuWidth = 230;
  const menuHeight = modelMenu.offsetHeight || 172;
  let left = Math.min(Math.max(10, rect.right - menuWidth), window.innerWidth - menuWidth - 10);
  let top = rect.top - menuHeight - 8;
  if (top < 8) top = rect.bottom + 8;
  if (top + menuHeight > window.innerHeight - 8) top = Math.max(8, window.innerHeight - menuHeight - 8);
  modelMenu.style.left = `${left}px`;
  modelMenu.style.top = `${top}px`;
}

function closeModelMenu() {
  modelMenu.classList.remove('open');
  modelSelect.setAttribute('aria-expanded', 'false');
}

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#mobile-overlay').classList.add('visible');
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#mobile-overlay').classList.remove('visible');
}

createInitialSessions();
setActiveItem('new');
renderSession(sessions.get('new'));

input.addEventListener('input', autoResize);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
sendButton.addEventListener('click', () => sendMessage());

$$('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.prompt;
    autoResize();
    sendMessage();
  });
});

$$('[data-action="new-chat"]').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  resetChat();
}));

$$('.conversation-item').forEach((item) => {
  item.addEventListener('click', () => selectConversation(item.dataset.conversationId));
});

modelSelect.addEventListener('click', (event) => {
  event.stopPropagation();
  if (modelMenu.classList.contains('open')) {
    closeModelMenu();
  } else {
    modelMenu.classList.add('open');
    positionModelMenu();
    modelSelect.setAttribute('aria-expanded', 'true');
  }
});

$$('.model-option').forEach((option) => {
  option.addEventListener('click', () => {
    $$('.model-option').forEach((item) => item.classList.remove('selected'));
    option.classList.add('selected');
    $('#selected-model').textContent = option.dataset.model;
    const orb = modelSelect.querySelector('.model-orb');
    orb.className = `model-orb ${option.dataset.model.includes('Reason') ? 'reason' : option.dataset.model.includes('Create') ? 'create' : ''}`;
    closeModelMenu();
    showToast(`${option.dataset.model} sélectionné`);
  });
});

document.addEventListener('click', (event) => {
  if (!modelMenu.contains(event.target) && !modelSelect.contains(event.target)) closeModelMenu();
});
window.addEventListener('resize', () => {
  if (modelMenu.classList.contains('open')) positionModelMenu();
});

$('#theme-toggle').addEventListener('click', () => {
  const isLight = document.body.dataset.theme === 'light';
  document.body.dataset.theme = isLight ? 'dark' : 'light';
  safeStorageSet('nova-theme', document.body.dataset.theme);
  showToast(isLight ? 'Mode sombre activé' : 'Mode clair activé');
});
const savedTheme = safeStorageGet('nova-theme');
if (savedTheme === 'light' || savedTheme === 'dark') document.body.dataset.theme = savedTheme;

$('#direct-mode-btn').addEventListener('click', () => {
  directMode = !directMode;
  const button = $('#direct-mode-btn');
  button.setAttribute('aria-pressed', String(directMode));
  button.setAttribute('aria-label', directMode ? 'Désactiver le mode direct' : 'Activer le mode direct');
  showToast(directMode ? 'Mode direct activé : réponses plus franches' : 'Mode direct désactivé');
});

$('#attach-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  attachmentPreview.classList.add('visible');
  attachmentPreview.innerHTML = `<span class="file-chip"><span>⌑</span> ${escapeHTML(file.name)} <button type="button" aria-label="Retirer le fichier">×</button></span>`;
  $('.file-chip button', attachmentPreview).addEventListener('click', clearAttachment);
  showToast('Fichier ajouté à la conversation');
});

$('#voice-btn').addEventListener('click', () => showToast('Le mode vocal arrive bientôt'));
$('#open-sidebar').addEventListener('click', openSidebar);
$('#close-sidebar').addEventListener('click', closeSidebar);
$('#mobile-overlay').addEventListener('click', closeSidebar);

$$('[data-coming-soon]').forEach((item) => item.addEventListener('click', (event) => {
  event.preventDefault();
  showToast('Cette section arrive bientôt');
}));
$('[data-action="privacy"]').addEventListener('click', () => showToast('Mode local : aucune donnée de conversation n’est enregistrée'));
$('[data-action="settings"]').addEventListener('click', () => showToast('Paramètres — bientôt disponibles'));

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    resetChat();
  }
  if (event.key === 'Escape') {
    closeModelMenu();
    closeSidebar();
  }
});

autoResize();
