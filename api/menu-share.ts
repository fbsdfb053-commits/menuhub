type Req = { method?: string; query?: Record<string, string | string[] | undefined> }
type Res = { status(code:number): Res; setHeader(name:string,value:string): void; send(body:string): void; json(body:unknown): void }
const json=(res:Res,status:number,body:unknown)=>res.status(status).json(body)
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] as string))
export default async function handler(req:Req,res:Res){
  if(req.method!=='GET')return json(res,405,{error:'Método não permitido.'})
  const raw=req.query?.slug
  const slug=Array.isArray(raw)?raw[0]:raw
  const rawShare=req.query?.share
  const includeShareVersion=(Array.isArray(rawShare)?rawShare[0]:rawShare)==='3'
  const base=(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'')
  const anon=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY||''
  if(!slug||!/^[a-z0-9-]{1,80}$/i.test(slug))return res.status(400).send('Menu inválido.')
  if(!base||!anon)return res.status(500).send('Configuração indisponível.')
  try{
    const response=await fetch(base+'/rest/v1/rpc/obter_menu',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'},body:JSON.stringify({p_slug:slug})})
    if(!response.ok)return res.status(502).send('Não foi possível carregar o menu.')
    const data=await response.json() as {empresa?:{nome?:string;descricao?:string;logo_url?:string;capa_url?:string;slug?:string}}
    if(!data?.empresa)return res.status(404).send('Menu não encontrado.')
    const e=data.empresa
    const title=escapeHtml(e.nome||'Cardápio digital')
    const image=escapeHtml(e.logo_url||e.capa_url||'https://fb3d2ymenu.com.br/fb3d2y-mark.svg')
    const url='https://fb3d2ymenu.com.br/menu/'+encodeURIComponent(e.slug||slug)+(includeShareVersion?'?share=3':'')
    const safeUrl=escapeHtml(url)
    res.setHeader('Content-Type','text/html; charset=utf-8')
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600')
    return res.status(200).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="canonical" href="${safeUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="FB3d2y Menu"><meta property="og:title" content="${title}"><meta property="og:url" content="${safeUrl}"><meta property="og:image" content="${image}"><meta property="og:image:secure_url" content="${image}"><meta property="og:image:alt" content="Logo de ${title}"><meta property="og:image:width" content="600"><meta property="og:image:height" content="600"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${title}"><meta name="twitter:image" content="${image}"></head><body><a href="${safeUrl}">${title}</a></body></html>`)
  }catch{return res.status(500).send('Não foi possível preparar a prévia do menu.')}
}
