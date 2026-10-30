import { createPrivateKey, createSign, verify, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Res = {
  status(code: number): Res
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

export default function handler(req: { method?: string }, res: Res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false })
  }

  const raw = process.env.QZ_PRIVATE_KEY
  if (!raw) {
    return res.status(200).json({
      keyPresent: false,
      keyValid: false,
      matchesCertificate: false
    })
  }

  let privateKey
  try {
    privateKey = createPrivateKey(raw.replace(/\\n/g, '\n'))
  } catch {
    return res.status(200).json({
      keyPresent: true,
      keyValid: false,
      matchesCertificate: false
    })
  }

  try {
    const certificate = new X509Certificate(
      readFileSync(join(process.cwd(), 'public/qz/digital-certificate.txt'))
    )
    const message = 'fb3d2y-qz-key-check'
    const signer = createSign('RSA-SHA512')
    signer.update(message)
    signer.end()
    const signature = signer.sign(privateKey)
    const matchesCertificate = verify(
      'RSA-SHA512',
      Buffer.from(message),
      certificate.publicKey,
      signature
    )

    return res.status(200).json({
      keyPresent: true,
      keyValid: true,
      matchesCertificate
    })
  } catch {
    return res.status(200).json({
      keyPresent: true,
      keyValid: true,
      matchesCertificate: false
    })
  }
}
