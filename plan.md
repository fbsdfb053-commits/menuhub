# FB3d2y Menu — plano inicial

## Objetivo

Criar um sistema próprio de cardápios e pedidos para microempresas próximas da região do usuário. O sistema começará com o delivery de sushi do usuário e poderá receber o restaurante da cunhada depois. O acesso será controlado para uso entre amigos e negócios convidados, sem transformar o projeto em um marketplace público.

## Primeira entrega: site funcional

A primeira versão terá duas áreas:

1. **Menu do restaurante**, acessado por um link individual e não indexado por buscadores. O cliente verá capa, nome, descrição, localização, horário/status, redes sociais, categorias, produtos com imagem, descrição e preço. Poderá adicionar produtos ao carrinho, informar dados do pedido e enviar a solicitação.
2. **Área de administração**, com acesso restrito por conta, para que cada amigo crie e gerencie seus próprios menus. O dono poderá criar restaurantes convidados, configurar identidade do menu, cadastrar categorias e produtos, ativar/desativar itens e acompanhar pedidos.

O visual usará o cardápio de referência fornecido pelo usuário apenas como inspiração de organização e fluxo. Não serão copiados identidade, textos, imagens ou marca de terceiros.

## Dados e segurança

O Supabase já criado pelo usuário será a fonte dos dados do sistema. A aplicação usará o Supabase no servidor quando houver dados sensíveis e manterá as chaves protegidas. Cada restaurante terá seus próprios registros, ligados por `empresa_id` ou equivalente. A segurança será feita com permissões por usuário/restaurante e políticas RLS antes de qualquer uso real com clientes.

Os menus de amigos serão acessados por links individuais e poderão ser protegidos por convite, código ou login. O gerenciamento exigirá conta. A criação de conta usará o Google pelo Supabase Auth, evitando que o sistema precise guardar senhas dos amigos. A primeira versão não terá SEO público, sitemap de cardápios privados nem descoberta aberta.

## Personalização

Cada restaurante poderá editar nome, descrição, capa, logo/foto de perfil, cor de destaque, localização, horário, Instagram, categorias, nome dos produtos, descrição, preço, disponibilidade e foto de cada item. A tipografia do produto será simples, padrão e de alta legibilidade, sem fontes decorativas no conteúdo.

## Bot de WhatsApp — etapa posterior do site

Depois que o menu e a área administrativa estiverem funcionando, adicionaremos um backend persistente para receber pedidos e integrar o bot do WhatsApp. O bot deverá avisar o restaurante sobre novos pedidos e separar os pedidos por restaurante. O método de conexão será escolhido quando chegarmos nessa etapa, considerando estabilidade, segurança e as regras do WhatsApp. O aplicativo móvel fica fora desta primeira fase.

## Estrutura planejada

- `src/`: interface do site, rotas do menu e administração.
- `src/components/`: cabeçalho, menu, categorias, produto, carrinho e pedidos.
- `src/lib/`: cliente Supabase, validações e regras de acesso.
- `server/`: endpoints protegidos e, futuramente, integração do bot.
- `public/`: manifesto de rotas, ícones e arquivos públicos.
- `plan.md`: decisões e escopo do projeto.
- `TODO.md`: resultados que ainda precisam ser entregues.

## Estilo escolhido

- **Cardápio artesanal moderno** — 0,07: visual acolhedor para pequenos negócios locais, com foco em fotos, leitura rápida e pedido pelo celular.
- **Painel operacional limpo** — 0,06: interface direta, com pouca decoração e ações fáceis de encontrar.
- **Vitrine premium minimalista** — 0,05: aparência mais refinada, com grandes áreas de imagem e bastante espaço em branco.

A combinação adotada será artesanal moderna para o menu do cliente e operacional limpa para a administração.

### Direção visual

**Movimento:** design de cardápio artesanal contemporâneo, próximo de uma vitrine local bem cuidada.

**Princípios:** legibilidade no celular; fotos e preços em primeiro plano; navegação por categorias sem confusão; sensação de proximidade e confiança.

**Cores:** fundo quente e claro, texto escuro e uma cor de destaque configurável por restaurante. Cada menu poderá trocar a cor de destaque sem quebrar a legibilidade.

**Layout:** cabeçalho com capa e identidade do restaurante, navegação horizontal de categorias, lista vertical de produtos e carrinho fixo no celular. A administração usará navegação lateral simples.

**Elementos de assinatura:** selo de status aberto/fechado; cartões de produto com imagem opcional; botão de carrinho sempre visível; etiqueta de restaurante convidado quando fizer sentido.

**Interação:** ações principais devem exigir poucos toques. O cliente poderá corrigir quantidades antes de enviar e receber confirmação clara do número do pedido.

**Animação:** transições curtas para abrir o carrinho, adicionar produto e confirmar pedido; nenhuma animação deverá atrasar o uso.

**Tipografia:** uma fonte sem serifa bem legível para textos e uma variação mais expressiva apenas em títulos, mantendo os preços fáceis de localizar.

**Essência da marca:** uma ferramenta simples e próxima para microempresas amigas venderem pelo próprio cardápio.

**Voz:** direta, acolhedora e local. Exemplos: “Seu cardápio, do seu jeito.” e “Pedido recebido. Já vamos cuidar dele.”

**Marca:** wordmark “FB3d2y Menu” com o “3d2y” tratado como detalhe visual próprio, sem depender de logotipo de terceiros.

**Cor de assinatura:** azul-petróleo configurável como padrão, transmitindo confiança sem parecer uma grande plataforma distante.

## Ordem de implementação

1. Criar a base do site e o manifesto de rotas.
2. Criar a tela de menu com dados de demonstração.
3. Conectar leitura de restaurantes, categorias e produtos do Supabase.
4. Criar carrinho e envio de pedido.
5. Criar fluxo real de conta e proteger a área administrativa.
6. Criar cadastro e personalização completa de menus para restaurantes convidados.
7. Configurar RLS e revisar segurança.
8. Preparar o backend para o bot do WhatsApp.
9. Só depois estudar o aplicativo móvel.
