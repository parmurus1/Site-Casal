// =========================================================
// EDITOR — renderiza páginas/elementos e cuida do
// arrastar / redimensionar / adicionar / apagar
// =========================================================
const Editor = {
  pagesEl: null,
  state: null, // referência ao AppState do app.js

  init(appState) {
    this.pagesEl = document.getElementById('pages');
    this.state = appState;
  },

  // ---------------------------------------------------------
  // agrupa as páginas soltas em "spreads" (esquerda + direita)
  // ---------------------------------------------------------
  groupIntoSpreads(pages) {
    const bySpread = {};
    pages.forEach((p) => {
      bySpread[p.spread_index] = bySpread[p.spread_index] || {};
      bySpread[p.spread_index][p.side] = p;
    });
    const indices = Object.keys(bySpread).map(Number).sort((a, b) => a - b);
    if (!indices.includes(0)) indices.unshift(0);
    return indices.map((i) => ({
      index: i,
      left: bySpread[i] ? bySpread[i].left : null,
      right: bySpread[i] ? bySpread[i].right : null,
    }));
  },

  elementsForPage(pageId) {
    return this.state.elements.filter((e) => e.page_id === pageId);
  },

  // ---------------------------------------------------------
  // RENDERIZAÇÃO
  // ---------------------------------------------------------
  renderAll() {
    const spreads = this.groupIntoSpreads(this.state.pages);
    this.pagesEl.innerHTML = '';

    spreads.forEach((spread) => {
      const spreadEl = document.createElement('section');
      spreadEl.className = 'spread';
      spreadEl.dataset.index = spread.index;

      spreadEl.appendChild(
        spread.index === 0 ? this.buildCounterPage() : this.buildPageEl(spread.left, 'left')
      );
      spreadEl.appendChild(this.buildPageEl(spread.right, 'right'));

      this.pagesEl.appendChild(spreadEl);
    });

    return spreads.length;
  },

  buildCounterPage() {
    const wrap = document.createElement('div');
    wrap.className = 'page page-left';
    const info = this.state.coupleInfo;
    wrap.innerHTML = `
      <div class="page-content counter-page">
        <span class="eyebrow">desde ${this.formatDate(info.start_date)}</span>
        <h2 class="counter-value" id="counterYears">0</h2>
        <span class="counter-label">anos juntos</span>
        <div class="counter-grid">
          <div><strong id="counterMonths">0</strong><span>meses</span></div>
          <div><strong id="counterDays">0</strong><span>dias</span></div>
          <div><strong id="counterHours">0</strong><span>horas</span></div>
        </div>
      </div>`;
    return wrap;
  },

  formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  buildPageEl(page, side) {
    const wrap = document.createElement('div');
    wrap.className = `page page-${side}`;

    const content = document.createElement('div');
    content.className = 'page-content editable-page';
    content.dataset.pageId = page ? page.id : '';

    if (!page) {
      content.classList.add('page-empty');
    } else {
      this.elementsForPage(page.id).forEach((el) => {
        content.appendChild(this.buildElementEl(el));
      });
    }

    // clique numa página seleciona ela como alvo pra adicionar itens
    content.addEventListener('click', (e) => {
      if (!this.state.editMode || !page) return;
      if (e.target !== content) return; // não conta clique em cima de um elemento
      this.setActivePage(page.id);
    });

    wrap.appendChild(content);

    // alça no canto da página direita — pra "pegar" e virar manualmente
    if (side === 'right') {
      const turnZone = document.createElement('div');
      turnZone.className = 'page-turn-zone';
      turnZone.title = 'Arraste pra virar a página';
      wrap.appendChild(turnZone);
    }

    return wrap;
  },

  setActivePage(pageId) {
    this.state.activePageId = pageId;
    document.querySelectorAll('.editable-page').forEach((el) => {
      el.classList.toggle('is-target', el.dataset.pageId === pageId);
    });
    const hint = document.getElementById('editorHint');
    if (hint) hint.textContent = 'página selecionada — escolha o que adicionar';
  },

  // ---------------------------------------------------------
  // ELEMENTOS (texto / imagem / áudio / vídeo)
  // ---------------------------------------------------------
  buildElementEl(el) {
    const box = document.createElement('div');
    box.className = `element-wrap el-${el.type}`;
    box.dataset.id = el.id;
    box.style.left = `${el.x}%`;
    box.style.top = `${el.y}%`;
    box.style.width = `${el.width}%`;
    box.style.height = `${el.height}%`;
    box.style.zIndex = el.z_index || 1;
    box.style.transform = `rotate(${el.rotation || 0}deg)`;

    let inner;
    if (el.type === 'text') {
      inner = document.createElement('div');
      inner.className = 'el-text-inner handwritten';
      inner.style.fontSize = `${el.font_size || 22}px`;
      inner.textContent = el.content || '';
      inner.addEventListener('blur', () => {
        this.saveElementPatch(el.id, { content: inner.textContent });
      });
    } else if (el.type === 'image') {
      inner = document.createElement('img');
      inner.src = el.content;
      inner.alt = '';
      inner.draggable = false;
    } else if (el.type === 'audio') {
      inner = document.createElement('audio');
      inner.controls = true;
      inner.src = el.content;
    } else if (el.type === 'video') {
      inner = document.createElement('video');
      inner.controls = true;
      inner.src = el.content;
    }
    inner.classList.add('el-inner');
    box.appendChild(inner);

    if (this.state.editMode) {
      this.attachEditControls(box, el, inner);
    }

    return box;
  },

  attachEditControls(box, el, inner) {
    box.classList.add('is-editable');

    // permitir digitar direto no texto
    if (el.type === 'text') {
      inner.contentEditable = 'true';
      inner.spellcheck = false;
    }

    // alça de arrastar
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = '⠿';
    box.appendChild(handle);

    // botão apagar
    const del = document.createElement('button');
    del.className = 'el-delete';
    del.innerHTML = '×';
    del.title = 'Apagar';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await Diary.deleteElement(el.id);
        this.state.elements = this.state.elements.filter((x) => x.id !== el.id);
        box.remove();
      } catch (err) {
        alert(err.message);
      }
    });
    box.appendChild(del);

    // alça de redimensionar
    const resize = document.createElement('div');
    resize.className = 'resize-handle';
    box.appendChild(resize);

    this.makeDraggable(box, handle, el);
    this.makeResizable(box, resize, el);
  },

  saveElementPatch(id, patch) {
    Object.assign(this.state.elements.find((e) => e.id === id) || {}, patch);
    Diary.updateElement(id, patch).catch((err) => alert(err.message));
  },

  makeDraggable(box, handle, el) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parent = box.parentElement.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(box.style.left);
      const startTop = parseFloat(box.style.top);

      const onMove = (ev) => {
        const dxPct = ((ev.clientX - startX) / parent.width) * 100;
        const dyPct = ((ev.clientY - startY) / parent.height) * 100;
        const newLeft = Math.min(95, Math.max(0, startLeft + dxPct));
        const newTop = Math.min(95, Math.max(0, startTop + dyPct));
        box.style.left = `${newLeft}%`;
        box.style.top = `${newTop}%`;
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        this.saveElementPatch(el.id, {
          x: parseFloat(box.style.left),
          y: parseFloat(box.style.top),
        });
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  },

  makeResizable(box, resize, el) {
    resize.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parent = box.parentElement.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = parseFloat(box.style.width);
      const startH = parseFloat(box.style.height);

      const onMove = (ev) => {
        const dwPct = ((ev.clientX - startX) / parent.width) * 100;
        const dhPct = ((ev.clientY - startY) / parent.height) * 100;
        const newW = Math.max(8, Math.min(96, startW + dwPct));
        const newH = Math.max(5, Math.min(96, startH + dhPct));
        box.style.width = `${newW}%`;
        box.style.height = `${newH}%`;
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        this.saveElementPatch(el.id, {
          width: parseFloat(box.style.width),
          height: parseFloat(box.style.height),
        });
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  },

  // ---------------------------------------------------------
  // ADICIONAR ELEMENTOS
  // ---------------------------------------------------------
  async addTextElement() {
    const pageId = this.requireActivePage();
    if (!pageId) return;
    try {
      const el = await Diary.createElement(pageId, {
        type: 'text',
        content: 'Escreva aqui…',
        x: 10,
        y: 10,
        width: 80,
        height: 20,
        font_size: 22,
        rotation: 0,
        z_index: this.nextZIndex(pageId),
      });
      this.state.elements.push(el);
      this.renderAll();
    } catch (err) {
      alert(err.message);
    }
  },

  async addMediaElement(type, url) {
    const pageId = this.requireActivePage();
    if (!pageId) return;
    const sizes = {
      image: { width: 45, height: 35 },
      audio: { width: 60, height: 8 },
      video: { width: 55, height: 35 },
    };
    try {
      const el = await Diary.createElement(pageId, {
        type,
        content: url,
        x: 10,
        y: 10,
        rotation: 0,
        z_index: this.nextZIndex(pageId),
        ...sizes[type],
      });
      this.state.elements.push(el);
      this.renderAll();
    } catch (err) {
      alert(err.message);
    }
  },

  nextZIndex(pageId) {
    const zs = this.elementsForPage(pageId).map((e) => e.z_index || 1);
    return zs.length ? Math.max(...zs) + 1 : 1;
  },

  requireActivePage() {
    if (this.state.activePageId) return this.state.activePageId;
    alert('Clique primeiro numa página pra escolher onde adicionar.');
    return null;
  },
};

window.Editor = Editor;
