// =========================================================
// CAMADA DE DADOS
// Se window.sb existir, fala com o Supabase de verdade.
// Se não, usa um pequeno conjunto de dados local (só leitura)
// pra dar pra pré-visualizar o site antes de configurar.
// =========================================================

const LOCAL_PAGE_RIGHT_0 = 'local-page-0-right';
const LOCAL_PAGE_LEFT_1 = 'local-page-1-left';
const LOCAL_PAGE_RIGHT_1 = 'local-page-1-right';

const LOCAL_DATA = {
  coupleInfo: {
    id: 'local',
    start_date: (window.DIARY_CONFIG && window.DIARY_CONFIG.FALLBACK_START_DATE) || '2023-02-14',
    name_a: 'Você',
    name_b: 'Seu Amor',
  },
  pages: [
    { id: LOCAL_PAGE_RIGHT_0, spread_index: 0, side: 'right' },
    { id: LOCAL_PAGE_LEFT_1, spread_index: 1, side: 'left' },
    { id: LOCAL_PAGE_RIGHT_1, spread_index: 1, side: 'right' },
  ],
  elements: [
    { id: 'l1', page_id: LOCAL_PAGE_RIGHT_0, type: 'text', content: 'Para nós dois,', x: 8, y: 8, width: 84, height: 14, font_size: 34, rotation: 0, z_index: 1 },
    { id: 'l2', page_id: LOCAL_PAGE_RIGHT_0, type: 'text', content: 'Cada página daqui é um pedacinho do nosso tempo juntos. Fotos, áudios, bilhetes bobos e coisas sérias — tudo cabe aqui. Vira a página e continua a nossa história.', x: 8, y: 26, width: 84, height: 50, font_size: 22, rotation: 0, z_index: 1 },
    { id: 'l3', page_id: LOCAL_PAGE_LEFT_1, type: 'text', content: '12 de julho', x: 8, y: 8, width: 84, height: 10, font_size: 14, rotation: 0, z_index: 1 },
    { id: 'l4', page_id: LOCAL_PAGE_LEFT_1, type: 'text', content: 'Aquele fim de semana', x: 8, y: 18, width: 84, height: 14, font_size: 30, rotation: 0, z_index: 1 },
    { id: 'l5', page_id: LOCAL_PAGE_LEFT_1, type: 'text', content: 'Configure o Supabase pra transformar este espaço num editor de verdade — dá pra arrastar fotos, gravar áudios e escrever à vontade.', x: 8, y: 36, width: 84, height: 40, font_size: 20, rotation: 0, z_index: 1 },
  ],
};

const Diary = {
  isLive() {
    return !!window.sb;
  },

  // ---------------- LEITURA ----------------
  async getCoupleInfo() {
    if (!this.isLive()) return { ...LOCAL_DATA.coupleInfo };
    const { data, error } = await window.sb.from('couple_info').select('*').limit(1).maybeSingle();
    if (error || !data) return { ...LOCAL_DATA.coupleInfo };
    return data;
  },

  async getPages() {
    if (!this.isLive()) return LOCAL_DATA.pages.map((p) => ({ ...p }));
    const { data, error } = await window.sb
      .from('pages')
      .select('*')
      .order('spread_index', { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return data || [];
  },

  async getElements() {
    if (!this.isLive()) return LOCAL_DATA.elements.map((e) => ({ ...e }));
    const { data, error } = await window.sb.from('elements').select('*').order('created_at');
    if (error) {
      console.error(error);
      return [];
    }
    return data || [];
  },

  // ---------------- ESCRITA (precisa estar logado + Supabase configurado) ----------------
  async updateCoupleInfo(patch) {
    if (!this.isLive()) throw new Error('Configure o Supabase pra salvar de verdade.');
    const info = await this.getCoupleInfo();
    const { data, error } = await window.sb
      .from('couple_info')
      .update(patch)
      .eq('id', info.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async createSpread() {
    if (!this.isLive()) throw new Error('Configure o Supabase pra salvar de verdade.');
    const pages = await this.getPages();
    const nextIndex = pages.length ? Math.max(...pages.map((p) => p.spread_index)) + 1 : 1;
    const { data, error } = await window.sb
      .from('pages')
      .insert([
        { spread_index: nextIndex, side: 'left' },
        { spread_index: nextIndex, side: 'right' },
      ])
      .select();
    if (error) throw error;
    return data;
  },

  async createElement(pageId, partial) {
    if (!this.isLive()) throw new Error('Configure o Supabase pra salvar de verdade.');
    const { data, error } = await window.sb
      .from('elements')
      .insert([{ page_id: pageId, ...partial }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateElement(id, patch) {
    if (!this.isLive()) throw new Error('Configure o Supabase pra salvar de verdade.');
    const { data, error } = await window.sb.from('elements').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteElement(id) {
    if (!this.isLive()) throw new Error('Configure o Supabase pra salvar de verdade.');
    const { error } = await window.sb.from('elements').delete().eq('id', id);
    if (error) throw error;
  },

  async uploadMedia(file) {
    if (!this.isLive()) throw new Error('Configure o Supabase pra fazer upload de verdade.');
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await window.sb.storage.from('diary-media').upload(path, file);
    if (error) throw error;
    const { data } = window.sb.storage.from('diary-media').getPublicUrl(path);
    return data.publicUrl;
  },
};

window.Diary = Diary;
