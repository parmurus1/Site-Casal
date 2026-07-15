// =========================================================
// AUTENTICAÇÃO
// =========================================================
const Auth = {
  user: null,
  listeners: [],

  onChange(fn) {
    this.listeners.push(fn);
  },

  _notify() {
    this.listeners.forEach((fn) => fn(this.user));
  },

  async init() {
    if (!window.sb) return;
    const { data } = await window.sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    this._notify();

    window.sb.auth.onAuthStateChange((_event, session) => {
      this.user = session ? session.user : null;
      this._notify();
    });
  },

  async signIn(email, password) {
    if (!window.sb) throw new Error('Configure o Supabase primeiro (veja README.md).');
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signUp(email, password) {
    if (!window.sb) throw new Error('Configure o Supabase primeiro (veja README.md).');
    const { data, error } = await window.sb.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    if (!window.sb) return;
    await window.sb.auth.signOut();
  },

  isLoggedIn() {
    return !!this.user;
  },
};

window.Auth = Auth;
