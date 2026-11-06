export async function generateAiReply({ text, restaurant, products, categories, config, log, conversation = [] }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const productContext = (products || []).slice(0, 100).map(product => ({
    nome: product.nome,
    preco: Number(product.preco),
    disponivel: product.disponivel === true,
    categoria: (categories || []).find(item => item.id === product.categoria_id)?.nome || 'Outros',
    descricao: String(product.descricao || '').slice(0, 180)
  }))
  const now = new Date()
  const timezone = 'America/Fortaleza'
  const currentDate = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now)
  const currentTime = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const menuBaseUrl = String(process.env.PUBLIC_MENU_BASE_URL || 'https://fb3d2ymenu.com.br').replace(/\/$/, '')
  const businessContext = {
    nome: restaurant?.nome || 'Restaurante',
    descricao_restaurante: restaurant?.descricao || null,
    localizacao: restaurant?.localizacao || null,
    endereco: restaurant?.endereco || null,
    cidade: restaurant?.cidade || null,
    estado: restaurant?.estado || null,
    telefone_contato: restaurant?.telefone_contato || null,
    instagram: restaurant?.instagram || null,
    link_cardapio: restaurant?.slug ? menuBaseUrl + '/menu/' + encodeURIComponent(restaurant.slug) : null,
    data_atual: currentDate,
    hora_atual: currentTime,
    fuso_horario: timezone,
    horario: restaurant?.horario || null,
    horario_funcionamento: restaurant?.horario_funcionamento || null,
    aceita_pedidos: restaurant?.aceita_pedidos ?? null,
    status_loja_manual: restaurant?.status_loja_manual ?? null,
    formas_pagamento_cadastradas: config.faqPayment || null,
    opcoes_entrega: restaurant?.config_entrega || [],
    produtos: productContext
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-6-luna',
        reasoning: { effort: 'none' },
        max_output_tokens: 120,
        input: [
          {
            role: 'system',
            content: [{
              type: 'input_text',
              text: `Você é ${config?.botName?.trim() || 'o assistente virtual'}, atendente virtual do ${restaurant?.nome || 'Restaurante'}. Fale em português brasileiro, com educação, naturalidade e discrição.

REGRA PRINCIPAL: seja breve, cordial e acolhedor; responda somente ao que o cliente perguntou. Use linguagem natural, como um atendente atencioso, sem parecer seco ou robótico. Prefira expressões gentis como “Claro!”, “Com prazer”, “Infelizmente, no momento...” e “Será um prazer atender você”. Normalmente use uma ou duas frases curtas. Não envie listas de produtos, categorias ou preços em bloco. Não despeje o cardápio, não faça propaganda, não ofereça produtos aleatórios e não faça perguntas só para prolongar a conversa. Não insista nem envie lembretes espontâneos. Use no máximo um emoji quando fizer sentido.

ENTENDA A INTENÇÃO E O CONTEXTO. Considere o histórico recente, erros de digitação, abreviações, gírias, mensagens incompletas e referências como "e esse?", "quanto custa?" ou "tem?". Quando o cliente enviar várias frases, interprete o conjunto como uma única solicitação.

DADOS REAIS: consulte os dados fornecidos como única fonte da verdade. Nunca invente produto, preço, ingrediente, disponibilidade, horário, taxa, prazo, entrega, promoção ou forma de pagamento. Se não houver informação confiável, diga isso brevemente e sinalize que a equipe pode confirmar.

CARDÁPIO: o link correto deste restaurante é link_cardapio. Não use links de outros restaurantes. O sistema acrescentará o link na primeira resposta da conversa e nas respostas sobre produtos/categorias específicas quando necessário. Não repita o link em toda mensagem. Se pedirem o cardápio ou como fazer um pedido, encaminhe diretamente ao link, sem listar os itens.

PEDIDOS: se a pessoa quiser pedir, explique em uma frase que pode escolher os itens e finalizar pelo cardápio. Se precisar de informação para orientar, pergunte apenas uma coisa de cada vez.

ATENDIMENTO HUMANO: se a pessoa pedir atendente ou se você não conseguir responder com segurança, informe de forma breve que a equipe continuará o atendimento. Não diga que já avisou a equipe se isso não estiver confirmado pelo sistema.

HORÁRIOS E ENTREGA: responda apenas com os dados cadastrados, considerando o horário de Fortaleza. Se perguntarem sobre taxa, pergunte o bairro somente se ele ainda não tiver sido informado.

Mantenha o assunto no restaurante, redirecionando educadamente assuntos sem relação. Não repita saudações em toda mensagem. Retorne somente o texto que será enviado ao cliente.`
            }]
          },
          {
            role: 'user',
            content: [{
              type: 'input_text',
              text: 'DADOS CADASTRADOS (fonte única da verdade):\\n' +
                JSON.stringify(businessContext) +
                '\\nHISTÓRICO RECENTE:\\n' + JSON.stringify((conversation || []).slice(-10)) +
                '\\nMENSAGEM ATUAL DO CLIENTE:\\n' + String(text).slice(0, 1200)
            }]
          }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) {
      const details = await response.text()
      log.warn({ status: response.status, details: details.slice(0, 300) }, 'OpenAI failed; using existing reply rules')
      return null
    }
    const data = await response.json()
    const answer = data.output_text || (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text')
      .map(item => item.text || '')
      .join('')
    const clean = String(answer || '').trim()
    return clean ? clean.slice(0, 250) : null
  } catch (err) {
    log.warn({ message: err?.name === 'AbortError' ? 'request_timeout' : String(err?.message || err).slice(0, 180) }, 'OpenAI unavailable; using existing reply rules')
    return null
  } finally {
    clearTimeout(timeout)
  }
}
