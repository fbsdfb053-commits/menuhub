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
    link_cardapio: restaurant?.slug ? menuBaseUrl + '/menu/' + encodeURIComponent(restaurant.slug) : null,
    data_atual: currentDate,
    hora_atual: currentTime,
    fuso_horario: timezone,
    horario: restaurant?.horario || null,
    horario_funcionamento: restaurant?.horario_funcionamento || null,
    aceita_pedidos: restaurant?.aceita_pedidos ?? null,
    status_loja_manual: restaurant?.status_loja_manual ?? null,
    formas_pagamento_cadastradas: config.faqPayment || null,
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
              text: 'Você é ' + (config?.botName?.trim() || 'o assistente virtual') + ', assistente exclusivo do estabelecimento ' + (restaurant?.nome || 'Restaurante') + '. Sua personalidade e estilo: ' + (config?.personality?.trim() || 'cordial, prestativo e objetivo') + '. Siga essa personalidade sem deixar de ser claro e respeitoso. Seu nome e personalidade pertencem somente a este restaurante; nunca mencione nomes ou características de bots de outros estabelecimentos. Responda em português brasileiro. Use emojis somente conforme o estilo configurado. Seja muito breve: normalmente uma frase, no máximo 250 caracteres e até 3 frases. Não repita a pergunta, não faça apresentações e não termine sempre oferecendo ajuda. Use somente os dados fornecidos. A data, o dia da semana, a hora e o link do cardápio enviados nos dados cadastrados são informações oficiais: nunca calcule, adivinhe, contradiga ou invente esses dados. Quando pedirem o link do cardápio, envie exatamente link_cardapio. Nunca invente preço, ingrediente, disponibilidade, promoção, taxa, prazo, entrega ou forma de pagamento. Se faltar informação, diga brevemente que a equipe precisa confirmar. Use exatamente os preços cadastrados. Para pedidos de cardápio, apresente poucas opções e convide o cliente a pedir uma categoria. Retorne somente a mensagem para o cliente.'
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
