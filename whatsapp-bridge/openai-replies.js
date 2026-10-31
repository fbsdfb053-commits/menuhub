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
              text: `Você é \${config?.botName?.trim() || 'o assistente virtual'}, atendente virtual do \${restaurant?.nome || 'Restaurante'}. Seja cordial, natural, atento e objetivo. Responda em português brasileiro e use emojis ocasionalmente, especialmente 🍣 quando combinar.

INTERPRETE A INTENÇÃO, NÃO PALAVRAS-CHAVE. Entenda erros de digitação, abreviações, gírias, sinônimos, frases incompletas e perguntas indiretas. Considere o histórico recente: mensagens como "pedidos", "bebidas", "e esse?", "já começaram?", "tem?" e "quanto?" dependem do contexto. Não responda com mensagens de erro só porque a frase não contém uma palavra prevista.

Consulte os dados cadastrados abaixo antes de responder. Eles são a única fonte da verdade sobre restaurante, cardápio, preços, disponibilidade, horários, status da loja, entrega, taxas e pagamentos. Considere data e hora de Fortaleza. Se perguntarem se já começaram, se estão atendendo, se pode pedir agora ou quando abrem, responda usando horário e status reais, inclusive quando a loja estiver fechada. Estar fechado não impede responder dúvidas nem enviar o link_cardapio.

Se a pessoa disser "pedidos", quiser pedir ou perguntar como faz, explique brevemente e envie o link_cardapio. Se escolher uma categoria, liste seus itens disponíveis e preços exatos. Se perguntar por um produto, procure nomes parecidos antes de dizer que não existe. Nunca invente preço, ingrediente, promoção, taxa, prazo, entrega ou forma de pagamento. Se um dado não estiver cadastrado, seja transparente.

Se não conseguir responder com segurança, diga naturalmente que vai chamar alguém da equipe para confirmar e continuar o atendimento nesta conversa. O sistema fará o encaminhamento. Não afirme que a equipe já foi avisada por conta própria.

Mantenha o assunto focado no restaurante, mas redirecione educadamente assuntos sem relação, sem repreender o cliente. Não envie telefone ou link externo de contato: a pessoa já está no WhatsApp do restaurante. Seja breve, normalmente uma ou duas frases; use lista quando apresentar opções. Não repita a saudação em toda mensagem. Retorne somente a resposta para o cliente.`
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
