import { createClient } from '@supabase/supabase-js'

type Req = { method?: string; headers: { authorization?: string }; body?: unknown }
type Res = { status(code:number): Res; json(body:unknown): void }
const json=(res:Res,status:number,body:unknown)=>res.status(status).json(body)
const url=()=>process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||''
const anon=()=>process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY||''
const service=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||''
async function userFrom(req:Req){
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'')
 if(!token||!url()||!anon()) return null
 const r=await fetch(url().replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:anon(),Authorization:'Bearer '+token}})
 if(!r.ok)return null
 return await r.json() as {id:string;email?:string}
}
export default async function handler(req:Req,res:Res){
 if(req.method!=='GET'&&req.method!=='POST')return json(res,405,{error:'Método não permitido.'})
 const mp=process.env.MERCADO_PAGO_ACCESS_TOKEN
 if(!url()||!anon()||!service())return json(res,500,{error:'Falta configurar SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY na Vercel.'})
 const user=await userFrom(req);if(!user)return json(res,401,{error:'Entre novamente na sua conta.'})
 const db=createClient(url(),service(),{auth:{persistSession:false,autoRefreshToken:false}})
 const email=(user.email||'').trim().toLowerCase()
 const free=await db.from('assinaturas_gratuitas').select('email').eq('email',email).maybeSingle()
 if(free.error)return json(res,500,{error:'Execute o SQL de assinatura no Supabase antes de continuar.'})
 const {data:sub,error}=await db.from('assinaturas').select('status,expira_em,mp_payment_id').eq('user_id',user.id).maybeSingle()
 if(error)return json(res,500,{error:'Não foi possível consultar a assinatura. Confira o SQL do Supabase.'})
 const active=Boolean(free.data)||(sub?.status==='ativa'&&sub.expira_em&&new Date(sub.expira_em).getTime()>Date.now())
 if(req.method==='GET')return json(res,200,{active,free:Boolean(free.data),expiresAt:sub?.expira_em||null,status:free.data?'gratuita':active?'ativa':'inativa'})
 if(free.data)return json(res,400,{error:'Esta conta já tem acesso gratuito.'})
 if(!mp)return json(res,500,{error:'Configure MERCADO_PAGO_ACCESS_TOKEN na Vercel.'})
 const idempotencyKey=crypto.randomUUID()
 const paymentResponse=await fetch('https://api.mercadopago.com/v1/payments',{
  method:'POST',
  headers:{Authorization:'Bearer '+mp,'Content-Type':'application/json','X-Idempotency-Key':idempotencyKey},
  body:JSON.stringify({
   transaction_amount:50,
   description:'Menuhub — assinatura por 30 dias',
   payment_method_id:'pix',
   payer:{email:user.email||'cliente@menuhub.com.br'},
   external_reference:user.id,
   notification_url:'https://fb3d2ymenu.com.br/api/mercadopago-webhook',
   date_of_expiration:new Date(Date.now()+30*60*1000).toISOString()
  })
 })
 const payment=await paymentResponse.json() as {id?:number;status?:string;message?:string;point_of_interaction?:{transaction_data?:{qr_code?:string;qr_code_base64?:string;ticket_url?:string}}}
 if(!paymentResponse.ok||!payment.id)return json(res,502,{error:payment.message||'O Mercado Pago não conseguiu gerar o Pix.'})
 const saved=await db.from('pagamentos_assinatura').insert({payment_id:String(payment.id),user_id:user.id,status:payment.status||'pending',valor:50})
 if(saved.error)return json(res,500,{error:'O Pix foi criado, mas não foi possível registrar a cobrança. Entre em contato com o suporte.'})
 return json(res,200,{paymentId:payment.id,qrCode:payment.point_of_interaction?.transaction_data?.qr_code||'',qrCodeBase64:payment.point_of_interaction?.transaction_data?.qr_code_base64||'',ticketUrl:payment.point_of_interaction?.transaction_data?.ticket_url||''})
}
