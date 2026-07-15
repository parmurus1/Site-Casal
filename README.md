# Nosso Diário 💙

Um diário de casal interativo: capa de tecido quadriculado azul, abre com
animação 3D, e por dentro dá pra montar as páginas livremente (tipo Canva) —
texto, foto, áudio e vídeo — com contador de tempo juntos.

## Estrutura do projeto

```
index.html          → página única do site
style.css            → toda a aparência (capa, papel, editor, modais)
config.js            → suas chaves do Supabase (você preenche)
js/supabaseClient.js → inicializa o Supabase
js/data.js           → toda leitura/escrita no banco
js/auth.js           → login/logout
js/editor.js         → renderização das páginas + arrastar/redimensionar
js/app.js            → liga tudo (livro, navegação, contador, modais)
supabase/schema.sql  → script pra criar as tabelas no Supabase
vercel.json          → configuração de deploy
```

Sem configurar nada, o site já abre e funciona em **modo de pré-visualização**
(com dados de exemplo, sem salvar). Pra ativar login, edição de verdade e
upload de mídia, siga os passos abaixo.

## 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto.
2. Vá em **SQL Editor → New query**, cole todo o conteúdo de
   `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas
   (`couple_info`, `pages`, `elements`), as permissões de acesso e o bucket
   de mídia (`diary-media`).
3. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**
4. Cole os dois valores em `config.js`:

```js
window.DIARY_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  FALLBACK_START_DATE: '2023-02-14',
};
```

## 2. Criar as contas de vocês dois

O site tem uma aba "criar conta" no modal de login — use ela uma vez pra cada
um dos dois e-mails de vocês. Depois disso, o ideal é ir em **Authentication →
Providers → Email** no Supabase e desativar cadastros públicos (ou apagar essa
aba do modal em `index.html`), pra ninguém mais conseguir criar login.

Por padrão o Supabase pede confirmação por e-mail — se quiser pular isso
(bom pra testar rápido), desative em **Authentication → Providers → Email →
"Confirm email"**.

## 3. Testar localmente

Como o site usa `fetch`/módulos, abra com um servidor local em vez de abrir o
arquivo direto:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

## 4. Deploy na Vercel

1. Suba esta pasta pra um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New Project** → importe o
   repositório.
3. Como é um site estático, não precisa configurar build command nem output
   directory — a Vercel detecta sozinha. Clique em **Deploy**.
4. Pronto — o link gerado já é o diário de vocês, editável de qualquer lugar.

**Importante:** `config.js` vai junto pro repositório com a `anon key`. Isso é
seguro *desde que* as políticas de RLS do `schema.sql` estejam ativas (elas
já deixam qualquer pessoa ler, mas só usuários logados conseguem editar) —
não use a `service_role key` no front-end, só a `anon public key`.

## Como usar o diário

- **Ver o diário:** mova o cursor pra borda direita da capa → aparece uma
  seta → clique pra abrir. Use as setas embaixo (ou ← →) pra virar página.
- **Editar:** clique em "entrar" no canto superior direito, faça login, e
  depois clique em "editar diário". Uma barra de ferramentas aparece no topo.
- **Adicionar conteúdo:** clique numa página (ela fica destacada), depois
  clique em "texto", "imagem", "áudio" ou "vídeo" na barra.
- **Mover/redimensionar:** arraste pela alcinha (⠿) acima de cada elemento;
  redimensione pelo pontinho dourado no canto. Tudo salva sozinho.
- **Apagar um elemento:** clique no × vermelho acima dele.
- **Adicionar mais páginas:** botão "+ páginas" na barra — cria um novo par
  de páginas em branco no final do diário.
- **Mudar a data de início:** botão "📅 data" na barra, só em modo de edição.

## Ideias pra evoluir depois

- Cápsula do tempo (página que só libera numa data futura)
- Mapa dos lugares que já foram juntos
- Busca por palavra-chave nas páginas
- Página "surpresa" aleatória
- Notificação de datas especiais
