// =========================================================
// APP — junta tudo: livro 3D, navegação, auth, editor, contador
// =========================================================
const AppState = {
  pages: [],
  elements: [],
  coupleInfo: {},
  editMode: false,
  activePageId: null,
  currentSpread: 0,
  isBookOpen: false,
};

const room = document.querySelector('.room');
const book = document.getElementById('book');
const cover = document.getElementById('cover');
const openHint = document.getElementById('openHint');
const navControls = document.getElementById('navControls');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageIndicator = document.getElementById('pageIndicator');
const accountBtn = document.getElementById('accountBtn');
const editorToolbar = document.getElementById('editorToolbar');

// =========================================================
// BOOT
// =========================================================
async function boot() {
  await Auth.init();
  Editor.init(AppState);

  await loadData();
  Editor.renderAll();
  updateCounter();
  setInterval(updateCounter, 60 * 1000);

  wireBookOpening();
  wireNav();
  wireAccount();
  wireToolbar();
  wireModals();

  Auth.onChange(handleAuthChange);
  handleAuthChange(Auth.user);
}

async function loadData() {
  const [pages, elements, coupleInfo] = await Promise.all([
    Diary.getPages(),
    Diary.getElements(),
    Diary.getCoupleInfo(),
  ]);
  AppState.pages = pages;
  AppState.elements = elements;
  AppState.coupleInfo = coupleInfo;
}

// =========================================================
// ABRIR O LIVRO (capa) + dica de seta na borda
// =========================================================
function wireBookOpening() {
  book.addEventListener('mousemove', (e) => {
    if (AppState.isBookOpen) return;
    const rect = book.getBoundingClientRect();
    const distFromRight = rect.right - e.clientX;
    const nearEdge = distFromRight >= 0 && distFromRight < rect.width * 0.28;
    openHint.classList.toggle('is-visible', nearEdge);
  });
  book.addEventListener('mouseleave', () => openHint.classList.remove('is-visible'));

  cover.addEventListener('click', () => {
    if (AppState.isBookOpen) return;
    AppState.isBookOpen = true;
    cover.classList.add('is-open');
    room.classList.add('book-open');
    openHint.classList.remove('is-visible');
    setTimeout(() => {
      goToSpread(0);
      navControls.classList.add('is-visible');
    }, 550);
  });
}

// =========================================================
// NAVEGAÇÃO ENTRE SPREADS
// =========================================================
function wireNav() {
  prevBtn.addEventListener('click', () => goToSpread(AppState.currentSpread - 1));
  nextBtn.addEventListener('click', () => goToSpread(AppState.currentSpread + 1));
  document.addEventListener('keydown', (e) => {
    if (!AppState.isBookOpen) return;
    if (e.key === 'ArrowRight') goToSpread(AppState.currentSpread + 1);
    if (e.key === 'ArrowLeft') goToSpread(AppState.currentSpread - 1);
  });
}

function goToSpread(index) {
  const spreads = Array.from(document.querySelectorAll('.spread'));
  if (index < 0 || index >= spreads.length) return;
  spreads.forEach((s, i) => {
    s.classList.remove('is-active', 'is-turned-back');
    if (i < index) s.classList.add('is-turned-back');
    if (i === index) s.classList.add('is-active');
  });
  AppState.currentSpread = index;
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === spreads.length - 1;
  pageIndicator.textContent = `página ${index + 1} de ${spreads.length}`;
}

// =========================================================
// CONTADOR DE TEMPO JUNTOS
// =========================================================
function updateCounter() {
  const startDate = new Date(`${AppState.coupleInfo.start_date}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - startDate.getFullYear();
  let months = now.getMonth() - startDate.getMonth();
  let days = now.getDate() - startDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalHours = Math.floor((now - startDate) / (1000 * 60 * 60));

  const y = document.getElementById('counterYears');
  const m = document.getElementById('counterMonths');
  const d = document.getElementById('counterDays');
  const h = document.getElementById('counterHours');
  if (y) y.textContent = years;
  if (m) m.textContent = months;
  if (d) d.textContent = days;
  if (h) h.textContent = totalHours.toLocaleString('pt-BR');
}

// =========================================================
// CONTA (login/editar/sair)
// =========================================================
function wireAccount() {
  accountBtn.addEventListener('click', () => {
    if (!Auth.isLoggedIn()) {
      openModal('loginModal');
    } else {
      AppState.editMode = !AppState.editMode;
      applyEditModeUI();
      Editor.renderAll();
      if (AppState.isBookOpen) goToSpread(AppState.currentSpread);
    }
  });
}

function handleAuthChange(user) {
  if (user) {
    accountBtn.textContent = AppState.editMode ? 'sair da edição' : 'editar diário';
  } else {
    accountBtn.textContent = 'entrar';
    AppState.editMode = false;
    applyEditModeUI();
  }
}

function applyEditModeUI() {
  document.body.classList.toggle('edit-mode', AppState.editMode);
  editorToolbar.classList.toggle('is-visible', AppState.editMode);
  accountBtn.textContent = AppState.editMode ? 'sair da edição' : 'editar diário';
  if (!AppState.editMode) AppState.activePageId = null;
}

// =========================================================
// TOOLBAR DO EDITOR
// =========================================================
function wireToolbar() {
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.add;
      if (type === 'text') return Editor.addTextElement();
      document.getElementById(`fileInput${capitalize(type)}`).click();
    });
  });

  ['image', 'audio', 'video'].forEach((type) => {
    const input = document.getElementById(`fileInput${capitalize(type)}`);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const url = await Diary.uploadMedia(file);
        await Editor.addMediaElement(type, url);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.getElementById('addSpreadBtn').addEventListener('click', async () => {
    try {
      const newPages = await Diary.createSpread();
      AppState.pages.push(...newPages);
      const total = Editor.renderAll();
      goToSpread(total - 1);
    } catch (err) {
      alert(err.message);
    }
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =========================================================
// MODAIS (login + data de início)
// =========================================================
function openModal(id) {
  document.getElementById(id).hidden = false;
}
function closeModal(id) {
  document.getElementById(id).hidden = true;
}

function wireModals() {
  // ---- login ----
  document.getElementById('closeLoginModal').addEventListener('click', () => closeModal('loginModal'));

  let mode = 'signin';
  document.querySelectorAll('.tab-btn').forEach((tab) => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((t) => t.classList.toggle('is-active', t === tab));
      document.getElementById('loginSubmit').textContent = mode === 'signin' ? 'entrar' : 'criar conta';
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    try {
      if (mode === 'signin') {
        await Auth.signIn(email, password);
      } else {
        await Auth.signUp(email, password);
        errorEl.textContent = 'Conta criada! Verifique seu e-mail se a confirmação estiver ativada.';
      }
      closeModal('loginModal');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ---- data de início ----
  document.getElementById('editDateBtn').addEventListener('click', () => {
    document.getElementById('startDateInput').value = AppState.coupleInfo.start_date;
    openModal('dateModal');
  });
  document.getElementById('closeDateModal').addEventListener('click', () => closeModal('dateModal'));

  document.getElementById('dateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = document.getElementById('startDateInput').value;
    try {
      const updated = await Diary.updateCoupleInfo({ start_date: value });
      AppState.coupleInfo = updated;
      updateCounter();
      Editor.renderAll();
      if (AppState.isBookOpen) goToSpread(AppState.currentSpread);
      closeModal('dateModal');
    } catch (err) {
      alert(err.message);
    }
  });
}

boot();
