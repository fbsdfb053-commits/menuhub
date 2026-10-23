# FB3d2y Menu — entregas

## Site do cliente

- [ ] O site se chama “FB3d2y Menu” e funciona bem no celular e no computador.
- [ ] O cliente consegue abrir um menu individual de restaurante por um link próprio.
- [ ] O menu mostra capa, nome, descrição, localização, horário/status, redes sociais, categorias, produtos, imagens opcionais, descrições e preços.
- [ ] O cliente consegue adicionar produtos ao carrinho, ajustar quantidades e visualizar o total.
- [ ] O cliente consegue informar seus dados e enviar o pedido.
- [ ] O cliente recebe uma confirmação com o número do pedido.

## Administração para amigos

- [ ] Existe uma opção “Criar conta / entrar” usando o Google pelo Supabase Auth.
- [ ] A área de administração exige uma conta autenticada e não usa um usuário fictício em produção.
- [ ] O administrador consegue criar um restaurante convidado.
- [ ] Cada restaurante possui identidade e dados separados dos demais.
- [ ] O administrador consegue personalizar nome, capa, logo/foto de perfil, descrição, localização, horário, redes sociais e cor de destaque de cada menu.
- [ ] O administrador consegue criar categorias e cadastrar, editar, ativar ou desativar produtos.
- [ ] O administrador consegue alterar nome, descrição, preço, disponibilidade e foto de cada produto.
- [ ] O administrador consegue visualizar pedidos e seus dados básicos.
- [ ] Os menus são destinados a microempresas convidadas da região e não ficam abertos para descoberta pública por buscadores.
- [ ] A tipografia do conteúdo é padrão, profissional e fácil de ler.
- [ ] A foto de perfil usa um quadrado com cantos levemente arredondados, sem recorte em formato de gota ou puxadinho.

## Supabase e segurança

- [ ] O site usa o banco Supabase já criado pelo usuário.
- [ ] Os dados de cada restaurante ficam separados por empresa.
- [ ] As chaves sensíveis não ficam expostas desnecessariamente no navegador.
- [ ] As políticas RLS e as permissões são configuradas antes do uso real com clientes.

## Bot e etapas futuras

- [ ] Depois do site funcional, existe uma base de backend persistente para integrar o bot do WhatsApp.
- [ ] O bot consegue avisar o restaurante sobre novos pedidos e respeita a separação entre restaurantes.
- [ ] O aplicativo móvel fica para uma etapa posterior e não bloqueia a entrega do site.
