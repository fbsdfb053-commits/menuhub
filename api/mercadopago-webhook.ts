import { createClient } from '@supabase/supabase-js'
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:any}
type Res={status(code:number):Res;json(body:unknown):void}
export default async function handler(req:Req,res:Res){
 if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'Método não permitido.'})
 const token=process.env.MERCADO_PAGO_ACCESS_TOKEN
 const supabaseUrl=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!token||!supabaseUrl||!service)return res.status(500).json({error:'Configuração de servidor incompleta.'})
 const body=req.body||{}
 const id=String(body?.data?.id||body?.id||req.query?.['data.id']||req.query?.id||'')
 const topic=String(body?.type||body?.topic||req.query?.type||req.query?.topic||'')
 if(!id||(!['payment','payments'].includes(topic)&&req.method==='POST'))return res.status(200).json({received:true})
 const paymentResponse=await fetch('https://api.mercadopago.com/v1/payments/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token}})
 if(!paymentResponse.ok)return res.status(502).json({error:'Não foi possível consultar o pagamento.'})
 const payment=await paymentResponse.json() as {id:number;status:string;external_reference?:string;transaction_amount?:number}
 if(payment.status!=='approved'||!payment.external_reference||Number(payment.transaction_amount)!==20)return res.status(200).json({received:true})
 const db=createClient(supabaseUrl,service,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data:registered,error:checkError}=await db.from('pagamentos_assinatura').select('payment_id,processado').eq('payment_id',String(payment.id)).maybeSingle()
 if(checkError)return res.status(500).json({error:'Falha ao verificar o pagamento no banco.'})
 if(!registered)return res.status(200).json({received:true,ignored:true})
 if(registered.processado)return res.status(200).json({received:true,alreadyProcessed:true})
 const {data:old}=await db.from('assinaturas').select('expira_em').eq('user_id',payment.external_reference).maybeSingle()
 const now=Date.now()
 const base=old?.expira_em&&new Date(old.expira_em).getTime()>now?new Date(old.expira_em).getTime():now
 const expiration=new Date(base+30*24*60*60*1000).toISOString()
 const {error:upsertError}=await db.from('assinaturas').upsert({user_id:payment.external_reference,status:'ativa',inicio_em:new Date(now).toISOString(),expira_em:expiration,mp_payment_id:String(payment.id),atualizado_em:new Date().toISOString()},{onConflict:'user_id'})
 if(upsertError)return res.status(500).json({error:'Não foi possível liberar a assinatura.'})
 const {error:markError}=await db.from('pagamentos_assinatura').update({status:'approved',processado:true,processado_em:new Date().toISOString()}).eq('payment_id',String(payment.id))
 if(markError)return res.status(500).json({error:'Assinatura atualizada, mas não foi possível marcar a cobrança.'})
 return res.status(200).json({received:true,activated:true})
}
