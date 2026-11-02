import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform,
  Pressable, RefreshControl, StatusBar, StyleSheet, Linking, Share,
  Text, TextInput, View, ScrollView, Modal
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

// Chave publishable: própria para uso em aplicativos públicos. Nunca usar service_role aqui.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yfurhiyyknmikqeomfab.supabase.co';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Fl5ojNdUXqvYmreb6nVL5g_ZBRy93ky';
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' }
    })
  : null;

type OpeningDay = { closed: boolean; open: string; close: string };
type Restaurant = { id: number; nome: string; slug: string; aceita_pedidos: boolean; status_loja_manual: boolean | null; horario_funcionamento?: Record<string, OpeningDay> | null };
type OrderLine = { id: number; nome_produto: string | null; quantidade: number; preco_unitario: number };
type Product = { id:number; nome:string; descricao:string|null; preco:number; disponivel:boolean|null; categoria_id:number|null; imagem_url?:string|null };
type Category = { id:number; nome:string; ordem:number };
type ComplementGroup = { id:number; nome:string; descricao:string|null; ordem:number; ativo:boolean };
type ComplementOption = { id:number; grupo_id:number; nome:string; preco_adicional:number; ordem:number; ativo:boolean };
type Order = {
  id: number; cliente_nome: string; cliente_whatsapp?: string|null; endereco_entrega?:string|null; total: number; status: string | null;
  tipo_entrega: string; forma_pagamento: string; taxa_entrega: number;
  criado_em: string | null; observacoes: string | null; origem?:string|null; precisa_troco?:boolean|null; troco_para?:number|null; itens_pedido?: OrderLine[];
};

WebBrowser.maybeCompleteAuthSession();
const APP_VERSION = '1.2.2';
const UPDATED_AT = '02/11/2026';
function formatOrderCode(id:number,createdAt:string|null){const date=createdAt?new Date(createdAt):new Date();const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short'}).formatToParts(date);const day=parts.find(p=>p.type==='day')?.value??'01';const month=(parts.find(p=>p.type==='month')?.value??'jan').toLowerCase();let hash=(Number(id)^0x9e3779b9)>>>0;hash=Math.imul(hash^(hash>>>16),0x7feb352d);hash=Math.imul(hash^(hash>>>15),0x846ca68b);hash=(hash^(hash>>>16))>>>0;const suffix=(hash%46656).toString(36).toLowerCase().padStart(3,'0');return 'D'+day+month+'-'+suffix;}
const GOOGLE_REDIRECT = 'fb3d2ymenu://auth/callback';
const BRAND_LOGO = 'data:image/png;base64,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';
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

export default function App() { return <SafeAreaProvider><AppContent /></SafeAreaProvider>; }

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [groups,setGroups]=useState<ComplementGroup[]>([]);
  const [options,setOptions]=useState<ComplementOption[]>([]);
  const [categoryModal,setCategoryModal]=useState(false);
  const [categoryDraft,setCategoryDraft]=useState('');
  const [editingCategory,setEditingCategory]=useState<Category|null>(null);
  const [complementsModal,setComplementsModal]=useState(false);
  const [groupDraft,setGroupDraft]=useState('');
  const [optionDraft,setOptionDraft]=useState('');
  const [optionPriceDraft,setOptionPriceDraft]=useState('0');
  const [selectedGroup,setSelectedGroup]=useState<number|null>(null);
  const [tab,setTab]=useState<'inicio'|'pedidos'|'cardapio'|'relatorios'>('inicio');
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [darkMode,setDarkMode]=useState(false);
  const [detailOrder,setDetailOrder]=useState<Order|null>(null);
  const [restaurantEditOpen,setRestaurantEditOpen]=useState(false);
  const [counterOpen,setCounterOpen]=useState(false);
  const [counterName,setCounterName]=useState('');
  const [counterPhone,setCounterPhone]=useState('');
  const [counterType,setCounterType]=useState<'Retirada'|'Entrega'>('Retirada');
  const [counterAddress,setCounterAddress]=useState('');
  const [counterPayment,setCounterPayment]=useState('Dinheiro');
  const [counterQty,setCounterQty]=useState<Record<number,number>>({});
  const [counterBusy,setCounterBusy]=useState(false);
  const knownOrderIds=useRef<Set<number>|null>(null);
  const [restaurantNameDraft,setRestaurantNameDraft]=useState('');
  const [restaurantSlugDraft,setRestaurantSlugDraft]=useState('');
  const [previewOpen,setPreviewOpen]=useState(false);
  const [hoursOpen,setHoursOpen]=useState(false);
  const [printerOpen,setPrinterOpen]=useState(false);
  const [paperWidth,setPaperWidth]=useState<'58'|'80'>('58');
  const [hoursDraft,setHoursDraft]=useState<Record<string,OpeningDay>>({});
  const [reportPeriod,setReportPeriod]=useState<1|7|30|90>(30);
  const [keepAwake,setKeepAwake]=useState(false);
  const [editorOpen,setEditorOpen]=useState(false);
  const [editingProduct,setEditingProduct]=useState<Product|null>(null);
  const [productName,setProductName]=useState('');
  const [productPrice,setProductPrice]=useState('');
  const [productDescription,setProductDescription]=useState('');
  const [productCategory,setProductCategory]=useState<number|null>(null);
  const [productGroupIds,setProductGroupIds]=useState<number[]>([]);
  const [saving,setSaving]=useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);

  useEffect(() => { void AsyncStorage.getItem('fb3d2y-paper-width').then(v=>{if(v==='58'||v==='80')setPaperWidth(v);}); void AsyncStorage.getItem('fb3d2y-dark-mode').then(v=>setDarkMode(v==='1')); }, []);

  useEffect(() => { void AsyncStorage.getItem('fb3d2y-paper-width').then(v=>{if(v==='58'||v==='80')setPaperWidth(v);}); }, []);

  useEffect(() => {
    if (!supabase) { setBooting(false); setError('Configure as variáveis do Supabase no arquivo .env.'); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!supabase || !session?.user) return;
    setError('');
    const { data: companies, error: companyError } = await supabase
      .from('empresas')
      .select('id,nome,slug,aceita_pedidos,status_loja_manual,horario_funcionamento')
      .eq('dono_id', session.user.id)
      .order('id', { ascending: true });
    if (companyError) { setError(companyError.message); return; }
    const chosen = (companies ?? [])[0] as Restaurant | undefined;
    setRestaurant(chosen ?? null);
    if (!chosen) { setOrders([]); setProducts([]); setCategories([]); return; }
    const [{data:productRows,error:productError},{data:categoryRows,error:categoryError},{data:groupRows,error:groupError}] = await Promise.all([
      supabase.from('produtos').select('id,nome,descricao,preco,disponivel,categoria_id,imagem_url').eq('empresa_id',chosen.id).order('ordem'),
      supabase.from('categorias').select('id,nome,ordem').eq('empresa_id',chosen.id).order('ordem'),
      supabase.from('grupos_complementos').select('id,nome,descricao,ordem,ativo').eq('empresa_id',chosen.id).order('ordem')
    ]);
    if(productError) setError(productError.message); else setProducts((productRows??[]) as Product[]);
    if(categoryError) setError(categoryError.message); else setCategories((categoryRows??[]) as Category[]);
    if(groupError) setError(groupError.message); else {const gs=(groupRows??[]) as ComplementGroup[];setGroups(gs);if(gs.length){const {data:opts}=await supabase.from('opcoes_complementos').select('id,grupo_id,nome,preco_adicional,ordem,ativo').in('grupo_id',gs.map(g=>g.id)).order('ordem');setOptions((opts??[]) as ComplementOption[]);}else setOptions([]);}
    const { data, error: ordersError } = await supabase
      .from('pedidos')
      .select('id,cliente_nome,cliente_whatsapp,endereco_entrega,total,status,tipo_entrega,forma_pagamento,taxa_entrega,criado_em,observacoes,origem,precisa_troco,troco_para,itens_pedido(id,nome_produto,quantidade,preco_unitario)')
      .eq('empresa_id', chosen.id)
      .order('criado_em', { ascending: false })
      .limit(1000);
    if (ordersError) { setError(ordersError.message); return; }
    const incoming=(data??[]) as Order[];
    if(knownOrderIds.current===null){knownOrderIds.current=new Set(incoming.map(order=>order.id));}
    else {const fresh=incoming.filter(order=>!knownOrderIds.current!.has(order.id));fresh.forEach(order=>knownOrderIds.current!.add(order.id));if(fresh.length){void playOrderBeep();Speech.stop();Speech.speak((fresh.length===1?'Chegou um novo pedido':'Chegaram '+fresh.length+' novos pedidos')+' para '+(chosen.nome||'seu restaurante')+'.', {language:'pt-BR',rate:0.95});}}
    setOrders(incoming);
  }, [session]);

  useEffect(() => { if (session) void loadDashboard(); }, [session, loadDashboard]);

  useEffect(() => {
    if (!supabase || !restaurant) return;
    const channel = supabase.channel('mobile-orders-' + restaurant.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos', filter: 'empresa_id=eq.' + restaurant.id }, () => {
        void loadDashboard();
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [restaurant, loadDashboard]);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    setGoogleBusy(true);
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: GOOGLE_REDIRECT,
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'select_account' }
        }
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error('O Google não retornou o endereço de autenticação.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT);
      if (result.type !== 'success' || !result.url) return;
      const callbackUrl = new URL(result.url);
      const authError = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error');
      if (authError) throw new Error(decodeURIComponent(authError));
      const code = callbackUrl.searchParams.get('code');
      if (!code) throw new Error('O Google não retornou o código de acesso. Tente novamente.');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } catch (err) {
      Alert.alert('Falha no acesso com Google', err instanceof Error ? err.message : 'Não foi possível concluir o login.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const checkForUpdates = async () => {
    if (Platform.OS !== 'android') { Alert.alert('Atualização', 'A instalação pelo aplicativo está disponível no Android.'); return; }
    setUpdateBusy(true); setUpdateProgress(0);
    try {
      const response = await fetch('https://api.github.com/repos/fbsdfb053-commits/menuhub/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'Ainda não há uma versão publicada para atualização.' : 'Não foi possível consultar as atualizações. Tente novamente.');
      const release = await response.json();
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      const currentParts = APP_VERSION.split('.').map(Number);
      const latestParts = latest.split('.').map(Number);
      const newer = latestParts.some((n:number, i:number) => n > (currentParts[i] || 0) && latestParts.slice(0,i).every((v:number,j:number)=>v===(currentParts[j]||0)));
      if (!newer) { Alert.alert('Tudo atualizado', 'Você já está usando a versão mais recente do Fb3d2y Menu (v' + APP_VERSION + ').'); return; }
      const apk = (release.assets || []).find((asset:any) => String(asset.name).toLowerCase().endsWith('.apk'));
      if (!apk?.browser_download_url) throw new Error('A nova versão foi encontrada, mas o arquivo de instalação ainda não está disponível.');
      Alert.alert('Atualização disponível', 'Versão ' + latest + ' disponível. O app vai baixar o arquivo e abrir o instalador do Android.', [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Baixar e instalar', onPress: () => { void downloadAndInstallUpdate(apk.browser_download_url, latest); } }
      ]);
    } catch (err) {
      Alert.alert('Verificar atualizações', err instanceof Error ? err.message : 'Não foi possível verificar agora.');
    } finally { setUpdateBusy(false); }
  };
  const downloadAndInstallUpdate = async (url:string, version:string) => {
    setUpdateBusy(true); setUpdateProgress(0);
    try {
      const target = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + 'fb3d2y-menu-v' + version + '.apk';
      if (!target) throw new Error('Não foi possível acessar o armazenamento do aparelho.');
      const download = FileSystem.createDownloadResumable(url, target, {}, progress => {
        const total = progress.totalBytesExpectedToWrite || 0;
        if (total > 0) setUpdateProgress(Math.round(progress.totalBytesWritten / total * 100));
      });
      const result = await download.downloadAsync();
      if (!result?.uri) throw new Error('O download da atualização não foi concluído.');
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1
      });
    } catch (err) {
      Alert.alert('Não foi possível abrir o instalador', (err instanceof Error ? err.message : 'Tente novamente.') + '\\n\\nSe o Android solicitar, permita que o Fb3d2y Menu instale aplicativos desconhecidos nas configurações do aparelho.');
      try {
        await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', { data: 'package:com.fb3d2y.menu' });
      } catch { /* Alguns aparelhos não oferecem essa tela. */ }
    } finally { setUpdateBusy(false); }
  };

  const signOut = async () => { setSettingsOpen(false); await supabase?.auth.signOut(); setRestaurant(null); setOrders([]); setProducts([]); setCategories([]); };
  const toggleKeepAwake = async () => {
    try {
      if (keepAwake) { deactivateKeepAwake('fb3d2y-menu'); setKeepAwake(false); }
      else { await activateKeepAwakeAsync('fb3d2y-menu'); setKeepAwake(true); }
    } catch { Alert.alert('Não foi possível alterar', 'Tente novamente.'); }
  };
  const playOrderBeep=async()=>{try{Speech.speak('Bip bip',{language:'pt-BR',rate:1.25,pitch:1.8});}catch{}};
  const testAudio = () => {
    setSettingsOpen(false);
    Speech.stop();
    Speech.speak('Teste de áudio do Fb3d2y Menu. Tudo certo!', { language: 'pt-BR', rate: 0.95 });
  };
  const createCounterOrder=async()=>{if(!supabase||!restaurant)return;const chosen=products.filter(p=>(counterQty[p.id]??0)>0&&p.disponivel);if(!chosen.length){Alert.alert('Pedido vazio','Adicione pelo menos um produto.');return;}if(counterType==='Entrega'&&counterAddress.trim().length<5){Alert.alert('Endereço necessário','Informe o endereço para entrega.');return;}setCounterBusy(true);try{const payload=chosen.map(p=>({produto_id:p.id,quantidade:counterQty[p.id]}));const {data,error:e}=await supabase.rpc('criar_pedido_balcao',{p_empresa_id:restaurant.id,p_nome:counterName.trim()||'Cliente balcão',p_whatsapp:counterPhone.trim(),p_tipo_entrega:counterType,p_endereco:counterAddress.trim(),p_forma_pagamento:counterPayment,p_itens:payload});if(e)throw e;setCounterOpen(false);setCounterName('');setCounterPhone('');setCounterAddress('');setCounterType('Retirada');setCounterPayment('Dinheiro');setCounterQty({});await loadDashboard();Alert.alert('Pedido registrado','Pedido '+formatOrderCode(Number(data),new Date().toISOString())+' registrado com sucesso.');setTab('pedidos');}catch(e){Alert.alert('Não foi possível registrar',e instanceof Error?e.message:'Tente novamente.');}finally{setCounterBusy(false);}};
  const menuUrl = restaurant ? 'https://fb3d2ymenu.com.br/menu/' + encodeURIComponent(restaurant.slug) : 'https://fb3d2ymenu.com.br';
  const shareMenu = async () => {
    try { await Share.share({ title: restaurant?.nome ?? 'Cardápio', message: menuUrl, url: menuUrl }); }
    catch { Alert.alert('Compartilhar cardápio', menuUrl); }
  };
  const openMenuPreview = async () => { try { await Linking.openURL(menuUrl); } catch { Alert.alert('Não foi possível abrir o menu',menuUrl); } };
  const weekDays=[{id:'1',label:'Segunda-feira'},{id:'2',label:'Terça-feira'},{id:'3',label:'Quarta-feira'},{id:'4',label:'Quinta-feira'},{id:'5',label:'Sexta-feira'},{id:'6',label:'Sábado'},{id:'0',label:'Domingo'}];
  const openHoursEditor=()=>{const d:Record<string,OpeningDay>={};for(let i=0;i<7;i++)d[String(i)]={closed:i===0,open:'18:00',close:'22:00'};setHoursDraft({...d,...(restaurant?.horario_funcionamento??{})});setSettingsOpen(false);setHoursOpen(true);};
  const saveOpeningHours=async()=>{if(!supabase||!restaurant)return;for(const h of Object.values(hoursDraft)){if(!h.closed&&(!h.open||!h.close||h.close<=h.open)){Alert.alert('Horário inválido','O fechamento deve ser depois da abertura.');return;}}const {error:e}=await supabase.from('empresas').update({horario_funcionamento:hoursDraft,status_loja_manual:null,aceita_pedidos:true}).eq('id',restaurant.id);if(e){Alert.alert('Não foi possível salvar',e.message);return;}setRestaurant({...restaurant,horario_funcionamento:hoursDraft,status_loja_manual:null,aceita_pedidos:true});setHoursOpen(false);Alert.alert('Horários salvos','A loja seguirá a programação automaticamente.');};
  const exportOrderPdf=async(order:Order)=>{try{const rows=(order.itens_pedido??[]).map(i=>'<tr><td>'+i.quantidade+'x '+(i.nome_produto??'Produto')+'</td><td>'+money(Number(i.preco_unitario)*Number(i.quantidade))+'</td></tr>').join('');const html='<html><head><style>body{font-family:Arial;color:#222;padding:18px;font-size:12px}h1{font-size:19px;color:#d66f3c}table{width:100%;border-collapse:collapse}td{padding:8px 2px;border-bottom:1px solid #ddd}td:last-child{text-align:right}</style></head><body><h1>'+(restaurant?.nome??'Fb3d2y Menu')+'</h1><p>COMANDA - PEDIDO '+formatOrderCode(order.id,order.criado_em)+'</p><p>'+dateTime(order.criado_em)+'</p><h2>'+order.cliente_nome+'</h2><p>'+order.tipo_entrega+' - '+order.forma_pagamento+'</p><table>'+rows+'</table><p>Taxa de entrega: '+money(Number(order.taxa_entrega||0))+'</p><h2>Total: '+money(Number(order.total))+'</h2><p>'+(order.observacoes??'')+'</p></body></html>';const pdf=await Print.printToFileAsync({html,width:paperWidth==='58'?220:302});const safeName=('Pedido - '+(order.cliente_nome||'Cliente')).replace(/[\\/:*?\"<>|]/g,'-').trim();const namedUri=(FileSystem.documentDirectory||'')+safeName+'.pdf';if(namedUri){await FileSystem.copyAsync({from:pdf.uri,to:namedUri});if(await Sharing.isAvailableAsync())await Sharing.shareAsync(namedUri,{mimeType:'application/pdf',dialogTitle:'Pedido: '+(order.cliente_nome||'Cliente')});else Alert.alert('PDF criado',namedUri);}else if(await Sharing.isAvailableAsync())await Sharing.shareAsync(pdf.uri,{mimeType:'application/pdf',dialogTitle:'Pedido: '+(order.cliente_nome||'Cliente')});}catch(e){Alert.alert('Erro ao gerar PDF',e instanceof Error?e.message:'Tente novamente.');}};


  const openProductEditor=async(product:Product|null)=>{setEditingProduct(product);setProductName(product?.nome??'');setProductPrice(product?String(product.preco).replace('.',','):'');setProductDescription(product?.descricao??'');setProductCategory(product?.categoria_id??null);if(product&&supabase){const {data}=await supabase.from('produto_grupos_complementos').select('grupo_id').eq('produto_id',product.id);setProductGroupIds((data??[]).map((x:any)=>Number(x.grupo_id)));}else setProductGroupIds([]);setEditorOpen(true);};
  const saveProduct=async()=>{if(!supabase||!restaurant||!productName.trim()||!productPrice.trim())return;const price=Number(productPrice.replace(',','.'));if(!Number.isFinite(price)||price<0){Alert.alert('Preço inválido','Informe um preço válido.');return;}setSaving(true);const payload={empresa_id:restaurant.id,nome:productName.trim(),preco:price,descricao:productDescription.trim()||null,categoria_id:productCategory,disponivel:editingProduct?.disponivel??true};const q=editingProduct?supabase.from('produtos').update(payload).eq('id',editingProduct.id):supabase.from('produtos').insert(payload);const {error:e}=await q;if(e)Alert.alert('Não foi possível salvar',e.message);else{const savedId=editingProduct?.id??(await supabase.from('produtos').select('id').eq('empresa_id',restaurant.id).eq('nome',productName.trim()).order('id',{ascending:false}).limit(1).maybeSingle()).data?.id;if(savedId){const {error:linkError}=await supabase.rpc('definir_complementos_produto',{p_produto_id:savedId,p_grupo_ids:productGroupIds});if(linkError)Alert.alert('Produto salvo, mas os complementos não foram vinculados',linkError.message);}setEditorOpen(false);await loadDashboard();}setSaving(false);};
  const toggleProduct=async(p:Product)=>{if(!supabase)return;const {error:e}=await supabase.from('produtos').update({disponivel:!(p.disponivel??true)}).eq('id',p.id);if(e)Alert.alert('Erro',e.message);else setProducts(list=>list.map(x=>x.id===p.id?{...x,disponivel:!(p.disponivel??true)}:x));};
  const openCategory=(category:Category|null)=>{setEditingCategory(category);setCategoryDraft(category?.nome??'');setCategoryModal(true);};
  const saveCategory=async()=>{if(!supabase||!restaurant||!categoryDraft.trim())return;const query=editingCategory?supabase.from('categorias').update({nome:categoryDraft.trim()}).eq('id',editingCategory.id):supabase.from('categorias').insert({empresa_id:restaurant.id,nome:categoryDraft.trim(),ordem:categories.length});const {error:e}=await query;if(e){Alert.alert('Não foi possível salvar',e.message);return;}setCategoryModal(false);await loadDashboard();};
  const deleteCategory=(category:Category)=>Alert.alert('Excluir categoria?','Os produtos ficarão sem categoria.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:async()=>{const {error:e}=await supabase!.from('categorias').delete().eq('id',category.id);if(e)Alert.alert('Erro',e.message);else{setCategoryModal(false);await loadDashboard();}}}]);
  const saveGroup=async()=>{if(!supabase||!restaurant||!groupDraft.trim())return;const {error:e}=await supabase.from('grupos_complementos').insert({empresa_id:restaurant.id,nome:groupDraft.trim(),ordem:groups.length});if(e)Alert.alert('Erro ao salvar grupo',e.message);else{setGroupDraft('');await loadDashboard();}};
  const saveOption=async()=>{if(!supabase||!selectedGroup||!optionDraft.trim())return;const price=Number(optionPriceDraft.replace(',','.'));if(!Number.isFinite(price)||price<0){Alert.alert('Preço inválido','Informe um adicional válido.');return;}const {error:e}=await supabase.from('opcoes_complementos').insert({grupo_id:selectedGroup,nome:optionDraft.trim(),preco_adicional:price,ordem:options.filter(o=>o.grupo_id===selectedGroup).length});if(e)Alert.alert('Erro ao salvar opção',e.message);else{setOptionDraft('');setOptionPriceDraft('0');await loadDashboard();}};
  const deleteGroup=(g:ComplementGroup)=>Alert.alert('Excluir grupo?','Excluir '+g.nome+' e suas opções?',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:async()=>{const {error:e}=await supabase!.from('grupos_complementos').delete().eq('id',g.id);if(e)Alert.alert('Erro',e.message);else{if(selectedGroup===g.id)setSelectedGroup(null);await loadDashboard();}}}]);
  const deleteOption=(o:ComplementOption)=>Alert.alert('Excluir opção?',o.nome,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:async()=>{const {error:e}=await supabase!.from('opcoes_complementos').delete().eq('id',o.id);if(e)Alert.alert('Erro',e.message);else await loadDashboard();}}]);

  const changeOrderStatus = async (order: Order, nextStatus: string) => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from('pedidos').update({ status: nextStatus }).eq('id', order.id);
    if (updateError) { Alert.alert('Não foi possível atualizar', updateError.message); return; }
    setOrders(current => current.map(item => item.id === order.id ? { ...item, status: nextStatus } : item));
  };

  const nextStatusFor = (order: Order): string | null => {
    const status = (order.status ?? '').toLocaleLowerCase('pt-BR');
    if (status === 'novo' || status === 'recebido') return 'Preparando';
    if (status === 'preparando') return 'Pronto';
    if (status === 'pronto') return order.tipo_entrega === 'Entrega' ? 'Em entrega' : 'Retirada disponível';
    if (status === 'em entrega' || status === 'retirada disponível') return 'Concluído';
    return null;
  };

  const refresh = async () => { setRefreshing(true); await loadDashboard(); setRefreshing(false); };

  const pending = useMemo(() => orders.filter(o => ['novo', 'recebido', 'pendente'].includes((o.status ?? '').toLocaleLowerCase('pt-BR'))).length, [orders]);
  const reportOrders = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0,0,0,0);
    start.setDate(start.getDate() - (reportPeriod - 1));
    return orders.filter(o => {
      if (!o.criado_em) return false;
      const date = new Date(o.criado_em);
      return date >= start && date <= now;
    });
  }, [orders, reportPeriod]);
  const reportTotal = useMemo(() => reportOrders.reduce((sum,o)=>sum+Number(o.total||0),0),[reportOrders]);
  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => o.criado_em && new Date(o.criado_em).toDateString() === today)
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [orders]);

  if (booting) return <Splash />;
  if (!session) return (
    <SafeAreaView style={[styles.safe,darkMode&&{backgroundColor:'#1B222C'}]} edges={['top','bottom']}>
      <StatusBar barStyle={darkMode?'light-content':'dark-content'} backgroundColor={darkMode?'#111A20':'#FFFFFF'} />
      <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Image source={{ uri: BRAND_LOGO }} style={styles.brandLogo} resizeMode="contain" />
        <Text style={styles.brand}>Fb3d2y <Text style={styles.brandAccent}>Menu</Text></Text>
        <Text style={styles.subtitle}>Seu restaurante na palma da mão.</Text>
        <View style={styles.loginCard}>
          <Text style={styles.cardTitle}>Acesse sua conta</Text>
          <Text style={styles.loginDescription}>Entre com a mesma conta Google que você usa no Fb3d2y Menu.</Text>
          <Pressable style={[styles.googleButton, googleBusy && styles.disabled]} onPress={signInWithGoogle} disabled={googleBusy}>
            {googleBusy ? <ActivityIndicator color="#26343C" /> : <><Text style={styles.googleG}>G</Text><Text style={styles.googleButtonText}>Continuar com Google</Text></>}
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
        <Text style={styles.footer}>GESTÃO SIMPLES. PEDIDOS ORGANIZADOS.</Text>\n        <Text style={styles.version}>Ver. {APP_VERSION}  ·  Atualizado em {UPDATED_AT}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.safe,darkMode&&{backgroundColor:'#1B222C'}]}>
      <StatusBar barStyle={darkMode?"light-content":"dark-content"} backgroundColor={darkMode?"#15191D":"#F7F8FA"} translucent={false} />
      <View style={[styles.header,darkMode&&styles.darkHeader]}>
        <View><Text style={styles.eyebrow}>PAINEL DO RESTAURANTE</Text><Text style={[styles.headerTitle,darkMode&&styles.darkText]}>{tab==='inicio'?'Visão geral':tab==='pedidos'?'Pedidos':tab==='cardapio'?'Cardápio':'Relatórios'}</Text></View>
        <Pressable onPress={()=>setSettingsOpen(true)} style={styles.avatar} accessibilityLabel="Abrir configurações"><Text style={styles.avatarText}>☰</Text></Pressable>
      </View>
      {restaurant ? (
        <View style={{flex:1}}>
        {tab==='cardapio' ? <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.sectionHead}><Text style={[styles.sectionTitle,darkMode&&styles.darkText]}>Cardápio</Text><Pressable style={styles.addButton} onPress={()=>openProductEditor(null)}><Text style={styles.addButtonText}>+ Produto</Text></Pressable></View>
          <Text style={[styles.sectionHint,darkMode&&styles.darkMuted]}>Toque em um produto para editar. Use o botão para pausar ou reativar.</Text>
          {categories.map(c=><Pressable key={c.id} onPress={()=>openCategory(c)}><Text style={styles.categoryTitle}>{c.nome}  ✎</Text></Pressable>)}
          {products.map(p=><Pressable key={p.id} style={styles.productCard} onPress={()=>openProductEditor(p)}><View style={{flex:1}}><Text style={[styles.customer,darkMode&&styles.darkText]}>{p.nome}</Text><Text style={[styles.orderMeta,darkMode&&styles.darkMuted]}>{p.descricao||'Sem descrição'} · {money(Number(p.preco))}</Text></View><Pressable style={[styles.statusPill,{backgroundColor:p.disponivel?'#E8F7EF':'#FCE9E6'}]} onPress={()=>toggleProduct(p)}><Text style={[styles.statusText,{color:p.disponivel?'#247A4B':'#B42318'}]}>{p.disponivel?'Disponível':'Pausado'}</Text></Pressable></Pressable>)}
          {!products.length&&<Text style={styles.emptyText}>Nenhum produto encontrado.</Text>}
          <View style={{flexDirection:'row',gap:8}}><Pressable style={[styles.secondaryButton,{flex:1}]} onPress={()=>openCategory(null)}><Text style={styles.secondaryButtonText}>+ Categoria</Text></Pressable><Pressable style={[styles.secondaryButton,{flex:1}]} onPress={()=>setComplementsModal(true)}><Text style={styles.secondaryButtonText}>Complementos</Text></Pressable></View>
        </ScrollView> : tab==='relatorios' ? <ScrollView contentContainerStyle={styles.listContent}><Text style={styles.sectionTitle}>Relatórios</Text><View style={styles.periodRow}>{([1,7,30,90] as const).map(value=><Pressable key={value} onPress={()=>setReportPeriod(value)} style={[styles.periodChip,reportPeriod===value&&styles.periodChipActive]}><Text style={[styles.periodChipText,reportPeriod===value&&styles.periodChipTextActive]}>{value===1?'Hoje':value+' dias'}</Text></Pressable>)}</View><View style={[styles.revenueCard,darkMode&&styles.darkRevenue]}><Text style={[styles.revenueLabel,darkMode&&styles.darkMuted]}>VENDAS · {reportPeriod===1?'HOJE':`ÚLTIMOS ${reportPeriod} DIAS`}</Text><Text style={[styles.revenueValue,darkMode&&styles.darkText]}>{money(reportTotal)}</Text></View><View style={styles.statsRow}><View style={[styles.statCard,darkMode&&styles.darkCard]}><Text style={[styles.statLabel,darkMode&&styles.darkMuted]}>PEDIDOS NO PERÍODO</Text><Text style={[styles.statValue,darkMode&&styles.darkText]}>{reportOrders.length}</Text></View><View style={styles.statCard}><Text style={styles.statLabel}>TICKET MÉDIO</Text><Text style={styles.statValue}>{money(reportOrders.length?reportTotal/reportOrders.length:0)}</Text></View></View><Text style={styles.orderMeta}>Valores calculados com os pedidos registrados no período selecionado.</Text></ScrollView> : <FlatList
          data={tab==='pedidos'?orders:[]}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#E67E45" />}
          ListHeaderComponent={
            <View>
              <View style={[styles.restaurantCard,styles.restaurantCardCompact,darkMode&&styles.darkCard]}>
                <View style={styles.restaurantTop}><View style={styles.liveDot} /><Text style={styles.restaurantLabel}>{restaurant.aceita_pedidos ? 'RESTAURANTE CONECTADO' : 'PEDIDOS PAUSADOS'}</Text></View>
                <Text style={[styles.restaurantName,darkMode&&styles.darkText]}>{restaurant.nome}</Text>
                <Text style={[styles.restaurantSlug,darkMode&&styles.darkMuted]}>/{restaurant.slug}</Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statCard}><Text style={styles.statLabel}>PEDIDOS RECENTES</Text><Text style={styles.statValue}>{orders.length}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>AGUARDANDO</Text><Text style={[styles.statValue, { color: '#D97742' }]}>{pending}</Text></View>
              </View>
              <View style={styles.revenueCard}><Text style={styles.revenueLabel}>VENDAS DE HOJE</Text><Text style={styles.revenueValue}>{money(todayTotal)}</Text></View>
              {tab==='inicio' ? <View style={styles.quickActions}>
                <Pressable style={styles.quickAction} onPress={openMenuPreview}><Text style={styles.quickActionIcon}>◉</Text><Text style={styles.quickActionText}>Ver menu</Text></Pressable>
                <Pressable style={styles.quickAction} onPress={()=>void shareMenu()}><Text style={styles.quickActionIcon}>↗</Text><Text style={styles.quickActionText}>Compartilhar</Text></Pressable>
                <Pressable style={styles.quickAction} onPress={()=>setTab('cardapio')}><Text style={styles.quickActionIcon}>⌁</Text><Text style={styles.quickActionText}>Editar</Text></Pressable>
              </View> : <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Todos os pedidos</Text><Text style={styles.sectionHint}>Atualiza em tempo real</Text></View>}
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          ListEmptyComponent={<View style={styles.empty}>{tab!=='inicio'&&<Text style={[styles.emptyTitle,darkMode&&styles.darkText]}>Nenhum pedido encontrado</Text>}<Text style={[styles.emptyText,tab==='inicio'&&styles.emptyTextHome,darkMode&&styles.darkMuted]}>{tab==='inicio'?'Acesse a área de pedidos para gerenciar seus clientes.':'Quando chegar um pedido, ele aparecerá aqui.'}</Text></View>}
          renderItem={({ item }) => (
            <Pressable style={[styles.orderCard,darkMode&&styles.darkCard]} onPress={()=>setDetailOrder(item)}>
              <View style={styles.orderTop}><Text style={[styles.orderId,darkMode&&styles.darkText]}>PEDIDO: {formatOrderCode(item.id,item.criado_em)}</Text><Text style={[styles.orderDate,darkMode&&styles.darkMuted]}>{dateTime(item.criado_em)}</Text></View>
              <Text style={styles.customer}>{item.cliente_nome}</Text>
              {!!item.itens_pedido?.length && <View style={styles.orderItems}>{item.itens_pedido.map(line => <Text key={line.id} style={styles.orderItemText}>{line.quantidade}× {line.nome_produto ?? 'Produto'}</Text>)}</View>}
              <View style={styles.orderBottom}><Text style={styles.orderMeta}>{item.tipo_entrega} · {item.forma_pagamento}{Number(item.taxa_entrega) > 0 ? ' · Entrega ' + money(Number(item.taxa_entrega)) : ''}</Text><Text style={styles.orderTotal}>{money(Number(item.total))}</Text></View>
              <View style={styles.statusPill}><Text style={styles.statusText}>{item.status ?? 'Sem status'}</Text></View>
              <Pressable style={styles.pdfButton} onPress={()=>void exportOrderPdf(item)}><Text style={styles.pdfButtonText}>↓ Exportar comanda em PDF</Text></Pressable>
              {!!item.observacoes && <Text style={styles.notes}>Obs.: {item.observacoes}</Text>}
              {nextStatusFor(item) && (
                <Pressable style={styles.advanceButton} onPress={() => void changeOrderStatus(item, nextStatusFor(item)!)}>
                  <Text style={styles.advanceButtonText}>{nextStatusFor(item) === 'Preparando' ? 'Aceitar e preparar' : nextStatusFor(item) === 'Pronto' ? 'Marcar como pronto' : nextStatusFor(item) === 'Em entrega' ? 'Saiu para entrega' : nextStatusFor(item) === 'Retirada disponível' ? 'Liberar para retirada' : 'Finalizar pedido'}</Text>
                </Pressable>
              )}
              {!['Concluído','Cancelado'].includes(item.status ?? '') && (
                <Pressable style={styles.cancelButton} onPress={() => Alert.alert('Cancelar pedido?', 'Essa alteração será registrada no sistema.', [{ text: 'Voltar', style: 'cancel' }, { text: 'Cancelar pedido', style: 'destructive', onPress: () => void changeOrderStatus(item, 'Cancelado') }])}>
                  <Text style={styles.cancelButtonText}>Cancelar pedido</Text>
                </Pressable>
              )}
            </Pressable>
          )}
        />}
        <View style={[styles.bottomNav,darkMode&&styles.darkPanel]}>{([['inicio','Início','⌂'],['pedidos','Pedidos','▤'],['balcao','Balcão','＋'],['cardapio','Cardápio','☷'],['relatorios','Relatórios','▥']] as const).map(([key,label,icon])=><Pressable key={key} style={styles.navItem} onPress={()=>key==='balcao'?setCounterOpen(true):setTab(key as 'inicio'|'pedidos'|'cardapio'|'relatorios')}><Text style={[styles.navIcon,{color:key==='balcao'?'#E58A50':tab===key?'#D66F3C':'#89949B'}]}>{icon}</Text><Text style={[styles.navLabel,{color:key==='balcao'?'#E58A50':tab===key?'#D66F3C':'#89949B'}]}>{label}</Text></Pressable>)}</View>
        <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={()=>setSettingsOpen(false)}>
          <Pressable style={styles.settingsShade} onPress={()=>setSettingsOpen(false)}>
            <Pressable style={[styles.settingsPanel,darkMode&&styles.darkPanel]} onPress={e=>e.stopPropagation()}>
              <View style={styles.settingsHead}>
                <View><Text style={[styles.settingsTitle,darkMode&&styles.darkText]}>Configurações</Text><Text style={[styles.settingsEmail,darkMode&&styles.darkMuted]}>{session.user.email}</Text></View>
                <Pressable onPress={()=>setSettingsOpen(false)}><Text style={styles.settingsClose}>✕</Text></Pressable>
              </View>
              <Text style={[styles.settingsGroup,darkMode&&styles.darkMuted]}>APLICATIVO</Text>
              <Pressable style={styles.settingsRow} onPress={()=>void checkForUpdates()} disabled={updateBusy}>
                <Text style={styles.settingsIcon}>⟳</Text>
                <View style={styles.settingsCopy}>
                  <Text style={[styles.settingsLabel,darkMode&&styles.darkText]}>{updateBusy ? 'Verificando / baixando...' : 'Verificar atualizações'}</Text>
                  <Text style={[styles.settingsHint,darkMode&&styles.darkMuted]}>{updateBusy && updateProgress>0 ? 'Download: '+updateProgress+'%' : 'Versão instalada: '+APP_VERSION}</Text>
                </View>
                {updateBusy ? <ActivityIndicator color="#D66F3C"/> : <Text style={styles.settingsArrow}>›</Text>}
              </Pressable>
              <Text style={[styles.settingsGroup,darkMode&&styles.darkMuted]}>RECURSOS RÁPIDOS</Text>
              <Pressable style={styles.settingsRow} onPress={testAudio}><Text style={styles.settingsIcon}>◖</Text><View style={styles.settingsCopy}><Text style={[styles.settingsLabel,darkMode&&styles.darkText]}>Testar áudio</Text><Text style={[styles.settingsHint,darkMode&&styles.darkMuted]}>Reproduzir uma mensagem de teste</Text></View><Text style={styles.settingsArrow}>›</Text></Pressable>
              <Pressable style={styles.settingsRow} onPress={()=>void toggleKeepAwake()}><Text style={styles.settingsIcon}>◐</Text><View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Manter tela ligada</Text><Text style={styles.settingsHint}>Evita que a tela apague durante o uso</Text></View><Text style={[styles.settingsSwitch,keepAwake&&styles.settingsSwitchOn]}>{keepAwake?'Ligado':'Desligado'}</Text></Pressable>
              <Text style={styles.settingsGroup}>RESTAURANTE</Text>
              <Pressable style={styles.settingsRow} onPress={openHoursEditor}><Text style={styles.settingsIcon}>◷</Text><View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Horário de funcionamento</Text><Text style={styles.settingsHint}>Dias e horários de atendimento</Text></View><Text style={styles.settingsArrow}>›</Text></Pressable>
              <Pressable style={styles.settingsRow} onPress={()=>{setSettingsOpen(false);setPrinterOpen(true);}}><Text style={styles.settingsIcon}>▤</Text><View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Impressora</Text><Text style={styles.settingsHint}>Exportar comandas e relatórios em PDF</Text></View><Text style={styles.settingsArrow}>›</Text></Pressable>
              <Pressable style={styles.settingsRow} onPress={()=>{setRestaurantNameDraft(restaurant?.nome??'');setRestaurantSlugDraft(restaurant?.slug??'');setSettingsOpen(false);setRestaurantEditOpen(true);}}><Text style={styles.settingsIcon}>▣</Text><View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Dados do restaurante</Text><Text style={styles.settingsHint}>Informações e preferências da loja</Text></View><Text style={styles.settingsArrow}>›</Text></Pressable>
              <Text style={styles.settingsGroup}>APARÊNCIA</Text>
              <Pressable style={styles.settingsRow} onPress={()=>{const next=!darkMode;setDarkMode(next);void AsyncStorage.setItem('fb3d2y-dark-mode',next?'1':'0');}}><Text style={styles.settingsIcon}>◐</Text><View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Modo noturno</Text><Text style={styles.settingsHint}>Alternar entre tema claro e escuro</Text></View><Text style={[styles.settingsSwitch,darkMode&&styles.settingsSwitchOn]}>{darkMode?'ATIVO':'DESATIVADO'}</Text></Pressable>
              <Text style={styles.settingsGroup}>CONTA</Text>
              <Pressable style={styles.settingsRow} onPress={()=>{setSettingsOpen(false);void Linking.openURL('https://fb3d2ymenu.com.br/admin');}}><Text style={styles.settingsIcon}>○</Text><View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Gerenciamento da conta</Text><Text style={styles.settingsHint}>Acesso, assinatura e dados da conta</Text></View><Text style={styles.settingsArrow}>›</Text></Pressable>
              <Pressable style={[styles.settingsRow,styles.signOutRow]} onPress={()=>void signOut()}><Text style={styles.settingsIcon}>↪</Text><View style={styles.settingsCopy}><Text style={[styles.settingsLabel,{color:'#B42318'}]}>Sair da conta</Text></View></Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={categoryModal} transparent animationType="slide" onRequestClose={()=>setCategoryModal(false)}><View style={styles.modalShade}><View style={[styles.modalCard,darkMode&&styles.darkPanel]}><Text style={styles.sectionTitle}>{editingCategory?'Editar categoria':'Nova categoria'}</Text><TextInput style={styles.input} value={categoryDraft} onChangeText={setCategoryDraft} placeholder="Nome da categoria"/><Pressable style={styles.advanceButton} onPress={()=>void saveCategory()}><Text style={styles.advanceButtonText}>Salvar categoria</Text></Pressable>{editingCategory&&<Pressable style={styles.cancelButton} onPress={()=>deleteCategory(editingCategory)}><Text style={styles.cancelButtonText}>Excluir categoria</Text></Pressable>}<Pressable style={styles.cancelButton} onPress={()=>setCategoryModal(false)}><Text style={styles.cancelButtonText}>Fechar</Text></Pressable></View></View></Modal>
        <Modal visible={complementsModal} transparent animationType="slide" onRequestClose={()=>setComplementsModal(false)}><View style={styles.modalShade}><View style={[styles.modalCard,{maxHeight:'90%'},darkMode&&styles.darkPanel]}><Text style={styles.sectionTitle}>Complementos do cardápio</Text><Text style={styles.orderMeta}>Crie grupos e opções com preço adicional. Selecione um grupo para administrar as opções.</Text><TextInput style={styles.input} value={groupDraft} onChangeText={setGroupDraft} placeholder="Novo grupo (ex.: Escolha o molho)"/><Pressable style={styles.advanceButton} onPress={()=>void saveGroup()}><Text style={styles.advanceButtonText}>Criar grupo</Text></Pressable><ScrollView>{groups.map(g=><View key={g.id} style={{paddingVertical:9,borderBottomWidth:1,borderColor:'#E6E9EC'}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Pressable style={{flex:1}} onPress={()=>setSelectedGroup(g.id)}><Text style={[styles.customer,darkMode&&styles.darkText]}>{selectedGroup===g.id?'▾':'▸'} {g.nome}</Text></Pressable><Pressable onPress={()=>deleteGroup(g)}><Text style={styles.cancelButtonText}>Excluir</Text></Pressable></View>{selectedGroup===g.id&&<View style={{gap:8,marginTop:8}}>{options.filter(o=>o.grupo_id===g.id).map(o=><View key={o.id} style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={[styles.orderMeta,darkMode&&styles.darkMuted]}>{o.nome} · +{money(Number(o.preco_adicional))}</Text><Pressable onPress={()=>deleteOption(o)}><Text style={styles.cancelButtonText}>Remover</Text></Pressable></View>)}<TextInput style={styles.input} value={optionDraft} onChangeText={setOptionDraft} placeholder="Nome da opção"/><TextInput style={styles.input} value={optionPriceDraft} onChangeText={setOptionPriceDraft} keyboardType="decimal-pad" placeholder="Preço adicional"/><Pressable style={styles.secondaryButton} onPress={()=>void saveOption()}><Text style={styles.secondaryButtonText}>Adicionar opção</Text></Pressable></View>}</View>)}</ScrollView><Pressable style={styles.cancelButton} onPress={()=>setComplementsModal(false)}><Text style={styles.cancelButtonText}>Fechar</Text></Pressable></View></View></Modal>
        <Modal visible={counterOpen} transparent animationType="slide" onRequestClose={()=>setCounterOpen(false)}><View style={styles.modalShade}><View style={[styles.modalCard,{maxHeight:'94%'},darkMode&&styles.darkPanel]}><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.sectionTitle}>Novo pedido de balcão</Text><Text style={styles.orderMeta}>Registre uma venda presencial sem depender do cardápio público.</Text><TextInput style={styles.input} value={counterName} onChangeText={setCounterName} placeholder="Nome do cliente (opcional)"/><TextInput style={styles.input} value={counterPhone} onChangeText={setCounterPhone} placeholder="Telefone (opcional)" keyboardType="phone-pad"/><Text style={styles.settingsGroup}>TIPO DE PEDIDO</Text><View style={{flexDirection:'row',gap:8}}>{(['Retirada','Entrega'] as const).map(v=><Pressable key={v} style={[styles.choiceChip,counterType===v&&styles.choiceChipActive]} onPress={()=>setCounterType(v)}><Text style={[styles.choiceChipText,counterType===v&&styles.choiceChipTextActive]}>{v}</Text></Pressable>)}</View>{counterType==='Entrega'&&<TextInput style={styles.input} value={counterAddress} onChangeText={setCounterAddress} placeholder="Endereço completo"/>}<Text style={styles.settingsGroup}>PAGAMENTO</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{['Dinheiro','Pix','Cartão de débito','Cartão de crédito','A combinar'].map(v=><Pressable key={v} style={[styles.choiceChip,counterPayment===v&&styles.choiceChipActive]} onPress={()=>setCounterPayment(v)}><Text style={[styles.choiceChipText,counterPayment===v&&styles.choiceChipActive&&styles.choiceChipTextActive]}>{v}</Text></Pressable>)}</View><Text style={styles.settingsGroup}>PRODUTOS</Text>{products.filter(p=>p.disponivel).map(p=><View key={p.id} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:9,borderBottomWidth:1,borderBottomColor:darkMode?'#3A4146':'#EDF0F2'}}><View style={{flex:1}}><Text style={[styles.settingsLabel,darkMode&&styles.darkText]}>{p.nome}</Text><Text style={styles.orderMeta}>{money(Number(p.preco))}</Text></View><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Pressable onPress={()=>setCounterQty(q=>({...q,[p.id]:Math.max(0,(q[p.id]??0)-1)}))}><Text style={styles.orderTotal}>−</Text></Pressable><Text style={[styles.settingsLabel,darkMode&&styles.darkText]}>{counterQty[p.id]??0}</Text><Pressable onPress={()=>setCounterQty(q=>({...q,[p.id]:(q[p.id]??0)+1}))}><Text style={styles.orderTotal}>＋</Text></Pressable></View></View>)}<View style={styles.orderBottom}><Text style={styles.sectionTitle}>TOTAL</Text><Text style={styles.orderTotal}>{money(products.reduce((sum,p)=>sum+Number(p.preco)*(counterQty[p.id]??0),0))}</Text></View><Pressable style={[styles.advanceButton,counterBusy&&{opacity:.6}]} disabled={counterBusy} onPress={()=>void createCounterOrder()}><Text style={styles.advanceButtonText}>{counterBusy?'Registrando...':'Registrar pedido'}</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>setCounterOpen(false)}><Text style={styles.cancelButtonText}>Fechar</Text></Pressable></ScrollView></View></View></Modal>
        <Modal visible={restaurantEditOpen} transparent animationType="slide" onRequestClose={()=>setRestaurantEditOpen(false)}><View style={styles.modalShade}><View style={[styles.modalCard,darkMode&&styles.darkPanel]}><Text style={styles.sectionTitle}>Dados do restaurante</Text><Text style={styles.orderMeta}>Atualize o nome e o endereço do seu cardápio.</Text><TextInput style={styles.input} value={restaurantNameDraft} onChangeText={setRestaurantNameDraft} placeholder="Nome do restaurante"/><TextInput style={styles.input} value={restaurantSlugDraft} onChangeText={setRestaurantSlugDraft} autoCapitalize="none" placeholder="endereco-do-menu"/><Pressable style={styles.advanceButton} onPress={async()=>{if(!supabase||!restaurant)return;const nome=restaurantNameDraft.trim();const slug=restaurantSlugDraft.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');if(!nome||!slug){Alert.alert('Confira os dados','Informe o nome e um endereço válido.');return;}const {error:e}=await supabase.from('empresas').update({nome,slug}).eq('id',restaurant.id);if(e){Alert.alert('Não foi possível salvar',e.message);return;}setRestaurant({...restaurant,nome,slug});setRestaurantEditOpen(false);Alert.alert('Salvo','Os dados do restaurante foram atualizados.');}}><Text style={styles.advanceButtonText}>Salvar alterações</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>setRestaurantEditOpen(false)}><Text style={styles.cancelButtonText}>Cancelar</Text></Pressable></View></View></Modal>
        <Modal visible={detailOrder!==null} transparent animationType="slide" onRequestClose={()=>setDetailOrder(null)}><View style={styles.modalShade}><View style={[styles.modalCard,{maxHeight:'88%'},darkMode&&styles.darkPanel]}><ScrollView><Text style={styles.sectionTitle}>PEDIDO: {detailOrder?formatOrderCode(detailOrder.id,detailOrder.criado_em):''}</Text><Text style={styles.orderMeta}>{detailOrder?dateTime(detailOrder.criado_em):''}</Text><Text style={styles.customer}>{detailOrder?.cliente_nome}</Text><Text style={styles.settingsGroup}>ITENS DO PEDIDO</Text>{(detailOrder?.itens_pedido??[]).map(line=><View key={line.id} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#EDF0F2'}}><Text style={[styles.orderItemText,darkMode&&styles.darkMuted]}>{line.quantidade} × {line.nome_produto??'Produto'}</Text><Text style={styles.orderMeta}>{money(Number(line.preco_unitario)*Number(line.quantidade))}</Text></View>)}<View style={{marginTop:15,gap:8}}><Text style={styles.orderMeta}>Tipo: {detailOrder?.tipo_entrega}</Text><Text style={styles.orderMeta}>Pagamento: {detailOrder?.forma_pagamento}</Text><Text style={styles.orderMeta}>Taxa de entrega: {money(Number(detailOrder?.taxa_entrega??0))}</Text>{!!detailOrder?.observacoes&&<Text style={styles.orderMeta}>Observações: {detailOrder.observacoes}</Text>}</View><View style={styles.orderBottom}><Text style={styles.sectionTitle}>TOTAL</Text><Text style={styles.orderTotal}>{money(Number(detailOrder?.total??0))}</Text></View><Pressable style={styles.advanceButton} onPress={()=>setDetailOrder(null)}><Text style={styles.advanceButtonText}>Fechar detalhes</Text></Pressable></ScrollView></View></View></Modal>
        <Modal visible={hoursOpen} transparent animationType="slide" onRequestClose={()=>setHoursOpen(false)}><View style={styles.modalShade}><View style={[styles.modalCard,{maxHeight:'90%'}]}><Text style={styles.sectionTitle}>Horário de funcionamento</Text><Text style={styles.orderMeta}>Configure os dias e horários de atendimento.</Text><ScrollView>{weekDays.map(day=>{const h=hoursDraft[day.id]??{closed:true,open:'18:00',close:'22:00'};return <View key={day.id} style={styles.hoursDay}><View style={styles.hoursDayTop}><Text style={styles.hoursDayName}>{day.label}</Text><Pressable style={[styles.choiceChip,!h.closed&&styles.choiceChipActive]} onPress={()=>setHoursDraft(v=>({...v,[day.id]:{...h,closed:!h.closed}}))}><Text style={[styles.choiceChipText,!h.closed&&styles.choiceChipTextActive]}>{h.closed?'Fechado':'Aberto'}</Text></Pressable></View>{!h.closed&&<View style={styles.hoursControls}><Text style={styles.orderMeta}>Abre</Text><TextInput value={h.open} onChangeText={v=>setHoursDraft(old=>({...old,[day.id]:{...h,open:v}}))} placeholder="18:00" style={styles.timeInput}/><Text style={styles.orderMeta}>Fecha</Text><TextInput value={h.close} onChangeText={v=>setHoursDraft(old=>({...old,[day.id]:{...h,close:v}}))} placeholder="22:00" style={styles.timeInput}/></View>}</View>})}</ScrollView><Pressable style={styles.advanceButton} onPress={()=>void saveOpeningHours()}><Text style={styles.advanceButtonText}>Salvar horários</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>setHoursOpen(false)}><Text style={styles.cancelButtonText}>Cancelar</Text></Pressable></View></View></Modal>
        <Modal visible={printerOpen} transparent animationType="slide" onRequestClose={()=>setPrinterOpen(false)}><View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.sectionTitle}>Impressão em PDF</Text><Text style={styles.orderMeta}>Gere comandas em PDF para salvar, compartilhar ou imprimir em qualquer impressora conectada ao celular.</Text><Text style={styles.settingsGroup}>FORMATO DA COMANDA</Text><View style={{flexDirection:'row',gap:9}}>{(['58','80'] as const).map(v=><Pressable key={v} style={[styles.choiceChip,paperWidth===v&&styles.choiceChipActive]} onPress={()=>setPaperWidth(v)}><Text style={[styles.choiceChipText,paperWidth===v&&styles.choiceChipTextActive]}>{v} mm</Text></Pressable>)}</View><Pressable style={styles.advanceButton} onPress={async()=>{await AsyncStorage.setItem('fb3d2y-paper-width',paperWidth);setPrinterOpen(false);Alert.alert('Preferência salva','Comandas configuradas para '+paperWidth+' mm.');}}><Text style={styles.advanceButtonText}>Salvar preferência</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>setPrinterOpen(false)}><Text style={styles.cancelButtonText}>Fechar</Text></Pressable></View></View></Modal>
        <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={()=>setPreviewOpen(false)}><View style={styles.modalShade}><View style={[styles.modalCard,{maxHeight:'85%'}]}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={styles.sectionTitle}>Cardápio · {restaurant.nome}</Text><Pressable onPress={()=>setPreviewOpen(false)}><Text style={styles.settingsClose}>✕</Text></Pressable></View><ScrollView>{categories.map(c=><View key={c.id}><Text style={styles.categoryTitle}>{c.nome}</Text>{products.filter(p=>p.categoria_id===c.id&&(p.disponivel??true)).map(p=><View key={p.id} style={styles.productCard}>{!!p.imagem_url&&<Image source={{uri:p.imagem_url}} style={{width:66,height:66,borderRadius:10}} resizeMode="cover"/>}<View style={{flex:1}}><Text style={styles.customer}>{p.nome}</Text><Text style={styles.orderMeta}>{p.descricao||''}</Text></View><Text style={styles.orderTotal}>{money(Number(p.preco))}</Text></View>)}</View>)}{products.filter(p=>!p.categoria_id&&(p.disponivel??true)).map(p=><View key={p.id} style={styles.productCard}>{!!p.imagem_url&&<Image source={{uri:p.imagem_url}} style={{width:66,height:66,borderRadius:10}} resizeMode="cover"/>}<View style={{flex:1}}><Text style={styles.customer}>{p.nome}</Text><Text style={styles.orderMeta}>{p.descricao||''}</Text></View><Text style={styles.orderTotal}>{money(Number(p.preco))}</Text></View>)}</ScrollView><Pressable style={styles.advanceButton} onPress={()=>{setPreviewOpen(false);setTab('cardapio')}}><Text style={styles.advanceButtonText}>Editar cardápio</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>void shareMenu()}><Text style={styles.cancelButtonText}>Compartilhar link do menu</Text></Pressable></View></View></Modal>
        <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={()=>setEditorOpen(false)}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.sectionTitle}>{editingProduct?'Editar produto':'Novo produto'}</Text><TextInput value={productName} onChangeText={setProductName} placeholder="Nome do produto" style={styles.input}/><TextInput value={productPrice} onChangeText={setProductPrice} placeholder="Preço (ex.: 15,00)" keyboardType="decimal-pad" style={styles.input}/><TextInput value={productDescription} onChangeText={setProductDescription} placeholder="Descrição (opcional)" multiline style={[styles.input,{height:80}]}/><Text style={styles.orderMeta}>Categoria</Text><ScrollView horizontal>{categories.map(c=><Pressable key={c.id} onPress={()=>setProductCategory(c.id)} style={[styles.categoryChip,productCategory===c.id&&styles.categoryChipActive]}><Text style={{color:productCategory===c.id?'#fff':'#52616B'}}>{c.nome}</Text></Pressable>)}</ScrollView><Text style={styles.orderMeta}>Grupos de complementos</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{groups.map(g=><Pressable key={g.id} onPress={()=>setProductGroupIds(ids=>ids.includes(g.id)?ids.filter(id=>id!==g.id):[...ids,g.id])} style={[styles.categoryChip,productGroupIds.includes(g.id)&&styles.categoryChipActive]}><Text style={{color:productGroupIds.includes(g.id)?'#fff':'#52616B'}}>{g.nome}</Text></Pressable>)}</View><Pressable style={styles.advanceButton} onPress={()=>void saveProduct()} disabled={saving}><Text style={styles.advanceButtonText}>{saving?'Salvando...':'Salvar produto'}</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>setEditorOpen(false)}><Text style={styles.cancelButtonText}>Fechar</Text></Pressable></View></KeyboardAvoidingView></Modal>
        </View>
      ) : (
        <View style={styles.empty}><Text style={styles.emptyIcon}>▣</Text><Text style={styles.emptyTitle}>Nenhum restaurante vinculado</Text><Text style={styles.emptyText}>Esta conta ainda não possui um restaurante cadastrado.</Text><Pressable style={styles.secondaryButton} onPress={refresh}><Text style={styles.secondaryButtonText}>Tentar novamente</Text></Pressable></View>
      )}
    </SafeAreaView>
  );
}

function Splash() {
  return <View style={styles.splash}><ActivityIndicator size="large" color="#E67E45" /><Text style={styles.splashText}>Fb3d2y Menu</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  splash: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 14 },
  splashText: { color: '#52616B', fontSize: 15, fontWeight: '700' },
  loginWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
  brandLogo: { width: 112, height: 112, alignSelf: 'center', marginBottom: 18 },
  googleButton: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: '#DCE2E6', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 11 },
  googleG: { color: '#4285F4', fontSize: 19, fontWeight: '900' },
  googleButtonText: { color: '#26343C', fontSize: 14, fontWeight: '800' },
  version: { textAlign: 'center', color: '#A2ABB1', fontSize: 10, marginTop: 10, fontWeight: '600' },
  brandMarkText: { color: '#fff', fontSize: 31, fontWeight: '900' },
  brand: { color: '#18252D', fontSize: 31, fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: '#E67E45' },
  subtitle: { color: '#7A8790', fontSize: 15, marginTop: 7, marginBottom: 34 },
  loginCard: { backgroundColor: '#fff', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#E9EDF0' },
  cardTitle: { fontSize: 19, fontWeight: '800', color: '#202D35', marginBottom: 10 },
  loginDescription: { color: '#7A8790', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  disabled: { opacity: 0.65 },
  footer: { textAlign: 'center', color: '#A2ABB1', fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 34 },
  error: { color: '#B42318', fontSize: 12, marginTop: 12 },
  header: { paddingHorizontal: 22, paddingTop: 15, paddingBottom: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#9AA4AA', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  headerTitle: { color: '#1D2930', fontSize: 27, fontWeight: '900', marginTop: 4 },
  avatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#FCE9DE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#C96332', fontWeight: '900', fontSize: 19 },
  settingsShade:{flex:1,backgroundColor:'rgba(15,25,30,.38)',alignItems:'flex-end',paddingTop:54,paddingRight:14},
  settingsPanel:{width:'92%',maxWidth:390,backgroundColor:'#fff',borderRadius:22,padding:18,elevation:12,shadowColor:'#000',shadowOpacity:.18,shadowRadius:18,shadowOffset:{width:0,height:8}},
  settingsHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingBottom:14,borderBottomWidth:1,borderBottomColor:'#EDF0F2'},
  settingsTitle:{fontSize:19,fontWeight:'900',color:'#20313A'},settingsEmail:{fontSize:11,color:'#89949B',marginTop:3},settingsClose:{fontSize:19,color:'#89949B',padding:6},
  settingsGroup:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#A1AAB0',marginTop:17,marginBottom:5},
  settingsRow:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#F0F2F4',gap:11},
  settingsIcon:{fontSize:19,width:27,textAlign:'center'},settingsCopy:{flex:1},settingsLabel:{fontSize:13,fontWeight:'800',color:'#263740'},settingsHint:{fontSize:10,color:'#929DA4',marginTop:3},settingsArrow:{fontSize:23,color:'#B0B8BD'},
  settingsSwitch:{fontSize:10,fontWeight:'800',color:'#7C878D',backgroundColor:'#F0F2F4',paddingHorizontal:9,paddingVertical:6,borderRadius:9},
  settingsSwitchOn:{color:'#247A4B',backgroundColor:'#E8F7EF'},signOutRow:{borderBottomWidth:0,marginTop:5},
  listContent: { paddingHorizontal: 18, paddingBottom: 30 },
  restaurantCard: { backgroundColor: '#fff', borderRadius: 15, padding: 12, marginBottom: 10, borderWidth:1, borderColor:'#F3D5C4' },
  restaurantCardCompact:{padding:12,borderRadius:15,marginBottom:10},
  restaurantTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#63D6A1' },
  restaurantLabel: { color: '#C76535', fontSize: 8, letterSpacing: 1, fontWeight: '900' },
  restaurantName: { color: '#26343C', fontSize: 19, fontWeight: '900', marginTop: 7 },
  restaurantSlug: { color: '#89949B', fontSize: 10, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  quickActions:{flexDirection:'row',gap:9,marginBottom:22},
  quickAction:{flex:1,backgroundColor:'#fff',borderRadius:15,paddingVertical:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#E9EDF0'},
  quickActionIcon:{fontSize:19,marginBottom:6,color:'#D66F3C'},quickActionText:{fontSize:11,fontWeight:'800',color:'#263740'},
  periodRow:{flexDirection:'row',gap:8,marginTop:16,marginBottom:14},
  periodChip:{paddingHorizontal:16,paddingVertical:9,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E7EA'},
  periodChipActive:{backgroundColor:'#D66F3C',borderColor:'#D66F3C'},
  periodChipText:{fontSize:11,fontWeight:'800',color:'#65727A'},periodChipTextActive:{color:'#fff'},
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E9EDF0' },
  statLabel: { color: '#929DA4', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  statValue: { color: '#24343C', fontSize: 27, fontWeight: '900', marginTop: 7 },
  revenueCard: { backgroundColor: '#FFF1E8', borderRadius: 18, padding: 17, marginBottom: 24 },
  revenueLabel: { color: '#B96A43', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  revenueValue: { color: '#9D4D2B', fontSize: 25, fontWeight: '900', marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#1F2D35', fontSize: 18, fontWeight: '900' },
  sectionHint: { color: '#9AA4AA', fontSize: 10, fontWeight: '700' },
  orderCard: { backgroundColor: '#fff', borderRadius: 17, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E9EDF0' },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { color: '#263740', fontWeight: '900', fontSize: 13 },
  orderDate: { color: '#9AA4AA', fontSize: 10, fontWeight: '700' },
  customer: { color: '#26343C', fontSize: 17, fontWeight: '800', marginTop: 10 },
  orderItems: { marginTop: 9, gap: 4 },
  orderItemText: { color: '#66747C', fontSize: 12, lineHeight: 17 },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11 },
  orderMeta: { color: '#89949B', fontSize: 11, flex: 1 },
  orderTotal: { color: '#C76535', fontSize: 16, fontWeight: '900' },
  statusPill: { alignSelf: 'flex-start', backgroundColor: '#FFF1E8', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, marginTop: 11 },
  statusText: { color: '#B65B31', fontSize: 10, fontWeight: '900' },
  advanceButton: { backgroundColor: '#D66F3C', borderRadius: 12, minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  advanceButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  cancelButton: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 9, marginTop: 2 },
  cancelButtonText: { color: '#A65A50', fontSize: 10, fontWeight: '800' },
  notes: { color: '#7C878D', fontSize: 11, marginTop: 9 },
  bottomNav:{flexDirection:'row',backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#E9EDF0',paddingTop:7,paddingBottom:Platform.OS==='android'?12:18},navItem:{flex:1,alignItems:'center',gap:3},navIcon:{fontSize:19,fontWeight:'800'},navLabel:{fontSize:9,fontWeight:'800'},addButton:{backgroundColor:'#E67E45',paddingHorizontal:13,paddingVertical:9,borderRadius:10},addButtonText:{color:'#fff',fontWeight:'800',fontSize:12},productCard:{backgroundColor:'#fff',borderRadius:15,padding:14,marginBottom:8,borderWidth:1,borderColor:'#E9EDF0',flexDirection:'row',alignItems:'center',gap:10},categoryTitle:{fontSize:14,fontWeight:'900',color:'#26343C',marginTop:16,marginBottom:8},modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'flex-end'},modalCard:{backgroundColor:'#fff',padding:22,borderTopLeftRadius:24,borderTopRightRadius:24,gap:12},input:{borderWidth:1,borderColor:'#DCE2E6',borderRadius:11,padding:12,color:'#26343C'},categoryChip:{padding:9,borderRadius:10,backgroundColor:'#F0F2F4',marginRight:7},categoryChipActive:{backgroundColor:'#D66F3C'},
  hoursDay:{backgroundColor:'#FFF8F4',borderRadius:12,padding:11,marginBottom:8,borderWidth:1,borderColor:'#F4DED2'},hoursDayTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},hoursDayName:{fontSize:12,fontWeight:'800',color:'#26343C'},hoursControls:{flexDirection:'row',alignItems:'center',gap:7},timeInput:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E8CFC1',borderRadius:9,padding:8,width:72,textAlign:'center',color:'#26343C'},choiceChip:{paddingHorizontal:13,paddingVertical:9,borderRadius:10,borderWidth:1,borderColor:'#E8CFC1',backgroundColor:'#fff'},choiceChipActive:{backgroundColor:'#D66F3C',borderColor:'#D66F3C'},choiceChipText:{fontSize:12,fontWeight:'800',color:'#65727A'},choiceChipTextActive:{color:'#fff'},pdfButton:{backgroundColor:'#FFF1E8',borderRadius:10,paddingHorizontal:12,paddingVertical:9,marginTop:10,alignSelf:'flex-start'},pdfButtonText:{fontSize:11,fontWeight:'800',color:'#B65B31'},
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 38, marginBottom: 13 },
  emptyTitle: { color: '#26343C', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#8B969D', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 7 },
  emptyTextHome:{fontSize:17,lineHeight:25,fontWeight:'700',color:'#66747C',marginTop:0},
  darkPanel:{backgroundColor:'#252D38',borderColor:'#394554'},darkText:{color:'#EEF2F6'},darkMuted:{color:'#B3BFCC'},darkHeader:{backgroundColor:'#1B222C'},darkCard:{backgroundColor:'#252D38',borderColor:'#394554'},darkRevenue:{backgroundColor:'#3A302C'},
  secondaryButton: { backgroundColor: '#E67E45', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 18 },
  secondaryButtonText: { color: '#fff', fontWeight: '800' }
});