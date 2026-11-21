import { Readable } from 'node:stream'

type VercelRequest = { method?: string }
type VercelResponse = {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  end(body?: string): void
  [key: string]: any
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end('Método não permitido.')
  }

  try {
    // Busca a versão própria do Fb3d2y Print. O endpoint /releases/latest aponta para o app Android e não deve ser usado aqui.
    const releaseResponse = await fetch('https://api.github.com/repos/fbsdfb053-commits/menuhub/releases/tags/fb3d2y-print-v0.2.9', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Fb3d2y-Menu-Downloads' },
      cache: 'no-store',
    })
    if (!releaseResponse.ok) return res.status(502).end('Não foi possível localizar a versão mais recente do Fb3d2y Print.')

    const release = await releaseResponse.json() as {
      assets?: Array<{ name: string; browser_download_url: string; size: number }>
    }
    const installer = release.assets?.find(asset => asset.name === 'Fb3d2yPrint-Setup.exe')
    if (!installer?.browser_download_url) return res.status(404).end('Instalador do Windows ainda não publicado.')

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', 'attachment; filename="Fb3d2yPrint-Setup.exe"')
    res.setHeader('Content-Length', String(installer.size))
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'HEAD') return res.status(200).end()

    // O arquivo é transmitido pelo domínio oficial, sem mandar o cliente para o GitHub.
    const fileResponse = await fetch(installer.browser_download_url, { redirect: 'follow' })
    if (!fileResponse.ok || !fileResponse.body) return res.status(502).end('Não foi possível baixar o instalador agora.')
    res.status(200)
    Readable.fromWeb(fileResponse.body as any).pipe(res as any)
  } catch {
    if (!(res as any).headersSent) res.status(502).end('Falha ao preparar o download. Tente novamente.')
    else (res as any).end()
  }
}
