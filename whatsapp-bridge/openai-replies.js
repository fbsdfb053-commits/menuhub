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
  const businessContext = {
    nome: restaurant?.nome || 'Restaurante',
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
              text: 'Você atende clientes deste restaurante pelo WhatsApp. Responda em português brasileiro, com naturalidade e simpatia. Pode usar emojis de forma natural e moderada, especialmente emojis de sushi e comida japonesa (🍣 🍱 🍤 🍙 🥢), sem exagerar. Seja muito breve: normalmente uma frase, no máximo 250 caracteres e até 3 frases. Não repita a pergunta, não faça apresentações e não termine sempre oferecendo ajuda. Use somente os dados fornecidos. Nunca invente preço, ingrediente, disponibilidade, promoção, taxa, prazo, entrega ou forma de pagamento. Se faltar informação, diga brevemente que a equipe precisa confirmar. Use exatamente os preços cadastrados. Para pedidos de cardápio, apresente poucas opções e convide o cliente a pedir uma categoria. Retorne somente a mensagem para o cliente.'
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
