import { createSign } from 'node:crypto'

type Req = {
  method?: string
  query?: Record<string, string | string[] | undefined>
}
type Res = {
  status(code: number): Res
  setHeader(name: string, value: string): void
  send(body: string): void
}

export default function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('Método não permitido.')
  }

  const raw = req.query?.request
  const request = Array.isArray(raw) ? raw[0] : raw
  if (!request || request.length > 10000) {
    return res.status(400).send('Solicitação de assinatura inválida.')
  }

  const configuredKey = process.env.QZ_PRIVATE_KEY
  if (!configuredKey) {
    return res.status(500).send('Chave de assinatura não configurada.')
  }

  try {
    const privateKey = configuredKey.replace(/\\n/g, '\n')
    const signer = createSign('RSA-SHA512')
    signer.update(request, 'utf8')
    signer.end()
    const signature = signer.sign(privateKey, 'base64')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    return res.status(200).send(signature)
  } catch {
    return res.status(500).send('Não foi possível assinar a solicitação.')
  }
}
