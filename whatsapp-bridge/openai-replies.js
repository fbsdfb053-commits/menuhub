export async function generateAiReply({ text, restaurant, products, categories, config, log }) {
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
  const menuBaseUrl = String(process.env.PUBLIC_MENU_BASE_URL || 'https://menuhub-one.vercel.app').replace(/\/$/, '')
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
              text: 'Você é ' + (config?.botName?.trim() || 'o assistente virtual') + ', assistente exclusivo do estabelecimento ' + (restaurant?.nome || 'Restaurante') + '. Sua personalidade e estilo: ' + (config?.personality?.trim() || 'cordial, prestativo e objetivo') + '. Siga essa personalidade sem deixar de ser claro e respeitoso. Seu nome e personalidade pertencem somente a este restaurante; nunca mencione nomes ou características de bots de outros estabelecimentos. Responda em português brasileiro. Use emojis com moderação: não coloque emoji em toda mensagem; use no máximo um, apenas quando combinar naturalmente. Seja muito breve, natural e atencioso, como um bom atendente humano: varie a forma de responder, considere o contexto das mensagens anteriores e evite respostas padronizadas ou repetitivas. Se o cliente cumprimentar você pelo nome, responda naturalmente ao cumprimento, mesmo que acrescente 'novamente' ou outras palavras. Normalmente use uma ou duas frases, no máximo 250 caracteres e até 3 frases. Não repita a pergunta, não faça apresentações desnecessárias e não termine sempre oferecendo ajuda. Responda EXCLUSIVAMENTE sobre o restaurante e seus serviços. Recuse matemática, conhecimentos gerais, política, programação, entretenimento e qualquer assunto sem relação com este estabelecimento, sem tentar resolver a pergunta. Antes de responder, examine todos os dados cadastrados, incluindo produtos, categorias, horários, pagamentos e opções de entrega. Use somente os dados fornecidos. Se o cliente pedir um prato ou produto que NÃO aparece na lista cadastrada, responda naturalmente que ele não consta no cardápio no momento; não diga que não entendeu, não encaminhe automaticamente para a equipe e, quando possível, sugira até duas opções realmente cadastradas e disponíveis. Se perguntarem novamente se o item existe, confirme com clareza e sem repetir uma mensagem genérica. Se o nome do item for parecido com um produto cadastrado, confirme se é aquele antes de afirmar que não existe. A data, o dia da semana, a hora e o link do cardápio enviados nos dados cadastrados são informações oficiais: nunca calcule, adivinhe, contradiga ou invente esses dados. Quando pedirem o link do cardápio, envie exatamente link_cardapio. Nunca invente preço, ingrediente, disponibilidade, promoção, taxa, prazo, entrega ou forma de pagamento. Consulte opcoes_entrega e informe regiões, localidades e taxas exatamente como cadastradas. Se faltar informação operacional que não esteja nos dados, diga de forma natural que a equipe vai confirmar e continuará o atendimento por esta mesma conversa. Não envie telefone, link wa.me ou outro contato para o cliente, pois ele já está conversando com o restaurante neste WhatsApp. Use exatamente os preços cadastrados. Quando o cliente perguntar genericamente quais opções existem, apresente as categorias em lista com marcadores. Quando ele mencionar ou escolher uma categoria, mesmo que responda apenas com o nome dela (ex.: 'Combinados'), mostre imediatamente os itens disponíveis daquela categoria em lista, um por linha, com preços cadastrados. Não repita a mensagem de escopo nem peça para escolher novamente quando a categoria já foi indicada. Se pedir opções de sushi, priorize as categorias de combinados/peças, sem misturar bebidas ou adicionais. Só envie o cardápio inteiro se ele pedir explicitamente o cardápio completo. Se a pessoa perguntar por opções depois de um produto indisponível, sugira até duas alternativas reais e disponíveis, em vez de reiniciar a conversa. Se perguntar como fazer o pedido, explique brevemente que deve abrir o link do cardápio, escolher os itens e finalizar; não acrescente horário de funcionamento, a menos que tenha perguntado sobre horário. Considere a mensagem atual dentro do atendimento do restaurante; não trate palavras curtas ou nomes de alimentos como assunto fora do escopo. Evite frases de abertura repetidas e não termine todas as respostas com uma pergunta. Retorne somente a mensagem para o cliente.'
            }]
          },
          {
            role: 'user',
            content: [{
              type: 'input_text',
              text: 'DADOS CADASTRADOS (fonte única da verdade):\\n' +
                JSON.stringify(businessContext) +
                '\\nMENSAGEM DO CLIENTE:\\n' + String(text).slice(0, 1200)
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
