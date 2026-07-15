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

const room = document.getElementById('room');
const bookStage = document.getElementById('bookStage');
const book = document.getElementById('book');
const cover = document.getElementById('cover');
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
  Effects.init();

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
// ABRIR O LIVRO — pega e puxa a capa manualmente até "boof"
// =========================================================
const OPEN_DRAG_THRESHOLD_DEG = -60; // não puxou o suficiente? volta pro lugar

function wireBookOpening() {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let currentAngle = 0;

  cover.addEventListener('pointerdown', (e) => {
    if (AppState.isBookOpen) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    cover.classList.add('is-dragging');
    if (cover.setPointerCapture) {
      try { cover.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  });

  cover.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = book.getBoundingClientRect();
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    // arrastar pra esquerda (dx negativo) vai abrindo a capa
    const deg = Math.max(-178, Math.min(0, (dx / rect.width) * 180));
    currentAngle = deg;
    cover.style.transform = `rotateY(${deg}deg)`;
  });

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    cover.classList.remove('is-dragging');

    if (currentAngle <= OPEN_DRAG_THRESHOLD_DEG) {
      openBook();
    } else if (currentAngle < 0) {
      // não puxou o suficiente — capa volta pro lugar
      cover.style.transform = '';
    }
    currentAngle = 0;
  };

  cover.addEventListener('pointerup', finishDrag);
  cover.addEventListener('pointercancel', finishDrag);

  // clique simples (sem arrastar) também abre/fecha
  cover.addEventListener('click', () => {
    if (moved) return;
    if (AppState.isBookOpen) {
      closeBook();
    } else {
      openBook();
    }
  });
}

function openBook() {
  AppState.isBookOpen = true;
  cover.style.transform = '';
  cover.classList.add('is-open');
  room.classList.add('book-open');

  Effects.playBoof();
  Effects.burstParticles(6, 50, 30);
  Effects.shakeCamera(7, 480);

  setTimeout(() => {
    goToSpread(0);
    navControls.classList.add('is-visible');
  }, 480);
}

function closeBook() {
  AppState.isBookOpen = false;
  cover.style.transform = '';
  cover.classList.remove('is-open');
  room.classList.remove('book-open');
  navControls.classList.remove('is-visible');
  Effects.shakeCamera(4, 320);

  const spreads = Array.from(document.querySelectorAll('.spread'));
  spreads.forEach((s) => s.classList.remove('is-active', 'is-turned-back'));
  AppState.currentSpread = 0;
}

// =========================================================
// NAVEGAÇÃO ENTRE SPREADS
// =========================================================
function wireNav() {
  prevBtn.addEventListener('click', () => goToSpread(AppState.currentSpread - 1));
  nextBtn.addEventListener('click', () => goToSpread(AppState.currentSpread + 1));
  document.getElementById('closeBookBtn').addEventListener('click', () => closeBook());
  document.addEventListener('keydown', (e) => {
    if (!AppState.isBookOpen) return;
    if (e.key === 'ArrowRight') goToSpread(AppState.currentSpread + 1);
    if (e.key === 'ArrowLeft') goToSpread(AppState.currentSpread - 1);
    if (e.key === 'Escape') closeBook();
  });

  wirePageDragTurn();
}

// -------- pegar o canto da página e virar manualmente --------
const PAGE_TURN_THRESHOLD_DEG = -70;

function wirePageDragTurn() {
  let dragging = false;
  let activeSpread = null;
  let startX = 0;
  let currentAngle = 0;

  document.addEventListener('pointerdown', (e) => {
    if (!AppState.isBookOpen) return;
    const zone = e.target.closest('.page-turn-zone');
    if (!zone) return;
    const spread = document.querySelectorAll('.spread')[AppState.currentSpread];
    if (!spread) return;

    dragging = true;
    activeSpread = spread;
    startX = e.clientX;
    currentAngle = 0;
    spread.classList.add('is-dragging');
    if (zone.setPointerCapture) {
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    const onMove = (ev) => {
      if (!dragging || !activeSpread) return;
      const rect = book.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const deg = Math.max(-170, Math.min(0, (dx / rect.width) * 220));
      currentAngle = deg;
      activeSpread.style.transform = `rotateY(${deg}deg)`;
    };

    const onUp = () => {
      if (!dragging || !activeSpread) return;
      dragging = false;
      activeSpread.classList.remove('is-dragging');
      activeSpread.style.transform = '';

      const isLast = AppState.currentSpread >= document.querySelectorAll('.spread').length - 1;
      if (currentAngle <= PAGE_TURN_THRESHOLD_DEG && !isLast) {
        goToSpread(AppState.currentSpread + 1);
      }
      activeSpread = null;
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerup', onUp);
      zone.removeEventListener('pointercancel', onUp);
    };

    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerup', onUp);
    zone.addEventListener('pointercancel', onUp);
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
