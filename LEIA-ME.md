# FB3d2y Menu — como colocar para funcionar

## 1. Banco de dados (Supabase)
1. Abra seu projeto no Supabase > **SQL Editor** > **New query**.
2. Cole o conteúdo de `supabase/01_estrutura_e_seguranca.sql` e clique **Run**.
3. (Opcional, para testar) Cole `supabase/02_dados_de_exemplo.sql` e clique **Run**.

## 2. Chaves do Supabase
Supabase > **Project Settings > API**. Copie a **Project URL** e a chave **anon public**.
- No computador: copie `.env.example` para `.env` e preencha.
- Na Netlify/Vercel: em *Environment variables* crie `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

(Nunca use a chave `service_role` neste site.)

## 3. Rodar / publicar
- Local: `pnpm install` e depois `pnpm dev`. Abra `http://localhost:3000/menu/yamamoto-sushibar`.
- Publicar: Netlify ou Vercel, comando `pnpm build`, pasta `dist`.

## 4. Google (login do administrador)
Supabase > Authentication > Providers > Google (precisa de um Client ID do Google Cloud).
Em Authentication > URL Configuration, configure o endereço do site como Site URL e adicione `https://menuhub-one.vercel.app/**` às Redirect URLs. No Google Cloud, o URI de redirecionamento autorizado deve ser o callback exibido pelo Supabase.

## Endereço de cada menu
`seusite.com/menu/NOME-DO-RESTAURANTE` (o nome fica na coluna `slug` da tabela `empresas`).

## Painel administrativo

Acesse `/admin` e entre com Google. Cada usuário autenticado pode criar seus próprios restaurantes; o painel permite editar informações, categorias, produtos, disponibilidade e status dos pedidos. Para imagens, execute o script `supabase/03_imagens.sql`; o envio aceita JPG, PNG, WebP e GIF de até 5 MB. As imagens são públicas para que apareçam no cardápio, mas apenas o usuário dono do arquivo pode enviar, alterar ou excluir.
