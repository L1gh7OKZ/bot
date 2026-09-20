const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const input = $('#message-input');
const sendButton = $('#send-btn');
const welcomeView = $('#welcome-view');
const messagesView = $('#messages-view');
const composer = $('#composer');
const breadcrumbTitle = $('#breadcrumb-title');
const toast = $('#toast');
const toastMessage = $('#toast-message');
const modelMenu = $('#model-menu');
const modelSelect = $('#model-select');
const attachmentPreview = $('#attachment-preview');
let toastTimer;
let isGenerating = false;
let currentTitle = 'Nouvelle conversation';

function escapeHTML(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  sendButton.disabled = input.value.trim().length === 0 || isGenerating;
}

function updateTitle(title) {
  currentTitle = title;
  breadcrumbTitle.textContent = title;
  const active = $('.conversation-item.active');
  if (active) {
    const titleNode = $('.conversation-title', active);
    if (titleNode && title !== 'Nouvelle conversation') titleNode.textContent = title;
  }
}

function resetChat() {
  isGenerating = false;
  welcomeView.style.display = '';
  messagesView.classList.remove('visible');
  messagesView.innerHTML = '';
  input.value = '';
  input.style.height = 'auto';
  updateTitle('Nouvelle conversation');
  $$('.conversation-item').forEach((item) => item.classList.remove('active'));
  const firstConversation = $('.conversation-item');
  if (firstConversation) {
    firstConversation.classList.add('active');
    $('.conversation-title', firstConversation).textContent = 'Nouvelle conversation';
  }
  autoResize();
  closeSidebar();
  input.focus();
}

function renderUserMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message message-user';
  wrapper.innerHTML = `<div><div class="message-bubble">${escapeHTML(text).replace(/\n/g, '<br>')}</div><div class="message-meta">Vous · maintenant</div></div>`;
  messagesView.appendChild(wrapper);
}

function renderTyping() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message message-assistant';
  wrapper.id = 'typing-message';
  wrapper.innerHTML = '<div class="assistant-avatar">✦</div><div class="message-bubble"><div class="typing-indicator" aria-label="NOVA écrit"><i></i><i></i><i></i></div></div>';
  messagesView.appendChild(wrapper);
}

function responseFor(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('complex') || lower.includes('expliqu') || lower.includes('compren')) {
    return {
      intro: 'Bien sûr. Je vais rendre cette idée simple, sans l’appauvrir.',
      body: '<p><strong>La méthode en trois temps</strong></p><p>Commencez par définir le concept en une phrase, puis donnez une analogie du quotidien. Terminez avec un exemple concret : c’est ce qui transforme une information en compréhension.</p><p>Envoyez-moi le sujet qui vous intrigue et je l’expliquerai au niveau de détail qui vous convient.</p>'
    };
  }
  if (lower.includes('projet') || lower.includes('idée') || lower.includes('lanc')) {
    return {
      intro: 'Très bonne matière première. Une idée devient un projet quand elle rencontre une prochaine étape claire.',
      body: '<p><strong>Pour la rendre concrète :</strong></p><p>1. Formulons la promesse en une phrase.<br>2. Identifions la personne à qui elle change vraiment la vie.<br>3. Construisons une première version imparfaite cette semaine.<br>4. Mesurons ce qui mérite d’être amplifié.</p><p>Donnez-moi votre idée, même incomplète. On la construira ensemble, sans la brider.</p>'
    };
  }
  if (lower.includes('demain') || lower.includes('futur') || lower.includes('10 ans')) {
    return {
      intro: 'J’aime cette direction. Le futur commence souvent par une friction que personne n’a encore pris le temps de résoudre.',
      body: '<p><strong>Et si le produit de demain était une mémoire externe vivante ?</strong></p><p>Un espace discret qui comprend nos intentions, relie nos idées et nous restitue exactement le bon contexte au bon moment — sans nous demander de tout classer.</p><p>La vraie innovation ne ferait pas plus de bruit. Elle nous rendrait simplement plus présents, plus rapides et plus libres.</p>'
    };
  }
  return {
    intro: 'Je suis là. Prenons cette idée au sérieux et voyons jusqu’où elle peut nous emmener.',
    body: '<p>Je peux vous aider à réfléchir, écrire, apprendre, planifier ou créer. Posez-moi une question précise, partagez un brouillon ou dites simplement ce que vous cherchez à accomplir.</p><p>Je m’adapterai à votre façon de penser — et nous avancerons une étape à la fois.</p>'
  };
}

function renderAssistantMessage(prompt) {
  const typing = $('#typing-message');
  if (!typing) return;
  const response = responseFor(prompt);
  typing.removeAttribute('id');
  typing.querySelector('.message-bubble').innerHTML = `<p>${response.intro}</p>${response.body}<div class="message-actions"><button class="message-action copy-response"><span>⧉</span> Copier</button><button class="message-action"><span>↗</span> Partager</button></div>`;
  const copyButton = $('.copy-response', typing);
  copyButton?.addEventListener('click', () => {
    const text = `${response.intro}\n\n${typing.querySelector('.message-bubble').innerText}`;
    navigator.clipboard?.writeText(text);
    showToast('Réponse copiée');
  });
}

function scrollToLatest() {
  messagesView.scrollTo({ top: messagesView.scrollHeight, behavior: 'smooth' });
}

function sendMessage(value = input.value) {
  const text = value.trim();
  if (!text || isGenerating) return;
  isGenerating = true;
  welcomeView.style.display = 'none';
  messagesView.classList.add('visible');
  if (currentTitle === 'Nouvelle conversation') {
    const shortTitle = text.length > 28 ? `${text.slice(0, 28).trim()}…` : text;
    updateTitle(shortTitle);
  }
  renderUserMessage(text);
  input.value = '';
  autoResize();
  renderTyping();
  scrollToLatest();
  setTimeout(() => {
    renderAssistantMessage(text);
    isGenerating = false;
    autoResize();
    scrollToLatest();
  }, 850);
}

function positionModelMenu() {
  const rect = modelSelect.getBoundingClientRect();
  const menuWidth = 230;
  let left = rect.right - menuWidth;
  if (left < 10) left = 10;
  modelMenu.style.left = `${left}px`;
  modelMenu.style.top = `${rect.top - 7 - 172}px`;
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

$$('[data-action="new-chat"]').forEach((button) => button.addEventListener('click', resetChat));

$$('.conversation-item').forEach((item) => {
  item.addEventListener('click', () => {
    $$('.conversation-item').forEach((conversation) => conversation.classList.remove('active'));
    item.classList.add('active');
    const title = item.dataset.title || 'Nouvelle conversation';
    if (title === 'Nouvelle conversation') {
      resetChat();
    } else {
      updateTitle(title);
      closeSidebar();
      showToast('Conversation chargée');
    }
  });
});

modelSelect.addEventListener('click', (event) => {
  event.stopPropagation();
  if (modelMenu.classList.contains('open')) closeModelMenu();
  else {
    positionModelMenu();
    modelMenu.classList.add('open');
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
  localStorage.setItem('nova-theme', document.body.dataset.theme);
  showToast(isLight ? 'Mode sombre activé' : 'Mode clair activé');
});
const savedTheme = localStorage.getItem('nova-theme');
if (savedTheme) document.body.dataset.theme = savedTheme;

$('#attach-btn').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  attachmentPreview.classList.add('visible');
  attachmentPreview.innerHTML = `<span class="file-chip"><span>⌑</span> ${escapeHTML(file.name)} <button type="button" aria-label="Retirer le fichier">×</button></span>`;
  $('.file-chip button', attachmentPreview).addEventListener('click', () => {
    attachmentPreview.classList.remove('visible');
    attachmentPreview.innerHTML = '';
    $('#file-input').value = '';
  });
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
$('[data-action="upgrade"]').addEventListener('click', () => showToast('Votre accès Infinity arrive bientôt'));
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
