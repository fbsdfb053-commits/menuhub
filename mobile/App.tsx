import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform,
  Pressable, RefreshControl, StatusBar, StyleSheet,
  Text, TextInput, View, ScrollView, Modal
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

// Chave publishable: própria para uso em aplicativos públicos. Nunca usar service_role aqui.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yfurhiyyknmikqeomfab.supabase.co';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Fl5ojNdUXqvYmreb6nVL5g_ZBRy93ky';
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' }
    })
  : null;

type Restaurant = { id: number; nome: string; slug: string; aceita_pedidos: boolean; status_loja_manual: boolean | null };
type OrderLine = { id: number; nome_produto: string | null; quantidade: number; preco_unitario: number };
type Product = { id:number; nome:string; descricao:string|null; preco:number; disponivel:boolean|null; categoria_id:number|null };
type Category = { id:number; nome:string; ordem:number };
type Order = {
  id: number; cliente_nome: string; total: number; status: string | null;
  tipo_entrega: string; forma_pagamento: string; taxa_entrega: number;
  criado_em: string | null; observacoes: string | null; itens_pedido?: OrderLine[];
};

WebBrowser.maybeCompleteAuthSession();
const APP_VERSION = '1.1.0';
const UPDATED_AT = '02/11/2026';
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
  const [tab,setTab]=useState<'inicio'|'pedidos'|'cardapio'|'relatorios'|'ajustes'>('inicio');
  const [editorOpen,setEditorOpen]=useState(false);
  const [editingProduct,setEditingProduct]=useState<Product|null>(null);
  const [productName,setProductName]=useState('');
  const [productPrice,setProductPrice]=useState('');
  const [productDescription,setProductDescription]=useState('');
  const [productCategory,setProductCategory]=useState<number|null>(null);
  const [saving,setSaving]=useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
      .select('id,nome,slug,aceita_pedidos,status_loja_manual')
      .eq('dono_id', session.user.id)
      .order('id', { ascending: true });
    if (companyError) { setError(companyError.message); return; }
    const chosen = (companies ?? [])[0] as Restaurant | undefined;
    setRestaurant(chosen ?? null);
    if (!chosen) { setOrders([]); setProducts([]); setCategories([]); return; }
    const [{data:productRows,error:productError},{data:categoryRows,error:categoryError}] = await Promise.all([
      supabase.from('produtos').select('id,nome,descricao,preco,disponivel,categoria_id').eq('empresa_id',chosen.id).order('ordem'),
      supabase.from('categorias').select('id,nome,ordem').eq('empresa_id',chosen.id).order('ordem')
    ]);
    if(productError) setError(productError.message); else setProducts((productRows??[]) as Product[]);
    if(categoryError) setError(categoryError.message); else setCategories((categoryRows??[]) as Category[]);
    const { data, error: ordersError } = await supabase
      .from('pedidos')
      .select('id,cliente_nome,total,status,tipo_entrega,forma_pagamento,taxa_entrega,criado_em,observacoes,itens_pedido(id,nome_produto,quantidade,preco_unitario)')
      .eq('empresa_id', chosen.id)
      .order('criado_em', { ascending: false })
      .limit(30);
    if (ordersError) { setError(ordersError.message); return; }
    setOrders((data ?? []) as Order[]);
  }, [session]);

  useEffect(() => { if (session) void loadDashboard(); }, [session, loadDashboard]);

  useEffect(() => {
    if (!supabase || !restaurant) return;
    const channel = supabase.channel('mobile-orders-' + restaurant.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: 'empresa_id=eq.' + restaurant.id }, () => {
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

  const signOut = async () => { await supabase?.auth.signOut(); setRestaurant(null); setOrders([]); setProducts([]); setCategories([]); };

  const openProductEditor=(product:Product|null)=>{setEditingProduct(product);setProductName(product?.nome??'');setProductPrice(product?String(product.preco).replace('.',','):'');setProductDescription(product?.descricao??'');setProductCategory(product?.categoria_id??null);setEditorOpen(true);};
  const saveProduct=async()=>{if(!supabase||!restaurant||!productName.trim()||!productPrice.trim())return;const price=Number(productPrice.replace(',','.'));if(!Number.isFinite(price)||price<0){Alert.alert('Preço inválido','Informe um preço válido.');return;}setSaving(true);const payload={empresa_id:restaurant.id,nome:productName.trim(),preco:price,descricao:productDescription.trim()||null,categoria_id:productCategory,disponivel:editingProduct?.disponivel??true};const q=editingProduct?supabase.from('produtos').update(payload).eq('id',editingProduct.id):supabase.from('produtos').insert(payload);const {error:e}=await q;if(e)Alert.alert('Não foi possível salvar',e.message);else{setEditorOpen(false);await loadDashboard();}setSaving(false);};
  const toggleProduct=async(p:Product)=>{if(!supabase)return;const {error:e}=await supabase.from('produtos').update({disponivel:!(p.disponivel??true)}).eq('id',p.id);if(e)Alert.alert('Erro',e.message);else setProducts(list=>list.map(x=>x.id===p.id?{...x,disponivel:!(p.disponivel??true)}:x));};
  const addCategory=()=>Alert.alert('Nova categoria','Para evitar cadastrar com nome errado, a criação de categorias ficará disponível no próximo ajuste.');

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
  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => o.criado_em && new Date(o.criado_em).toDateString() === today)
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [orders]);

  if (booting) return <Splash />;
  if (!session) return (
    <SafeAreaView style={styles.safe} edges={['top','bottom']}>
      <StatusBar barStyle="dark-content" />
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
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8FA" translucent={false} />
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>PAINEL DO RESTAURANTE</Text><Text style={styles.headerTitle}>Olá! 👋</Text></View>
        <Pressable onPress={signOut} style={styles.avatar}><Text style={styles.avatarText}>{session.user.email?.[0]?.toUpperCase() ?? 'U'}</Text></Pressable>
      </View>
      {restaurant ? (
        <View style={{flex:1}}>
        {tab==='cardapio' ? <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Cardápio</Text><Pressable style={styles.addButton} onPress={()=>openProductEditor(null)}><Text style={styles.addButtonText}>+ Produto</Text></Pressable></View>
          <Text style={styles.sectionHint}>Toque em um produto para editar. Use o botão para pausar ou reativar.</Text>
          {categories.map(c=><Text key={c.id} style={styles.categoryTitle}>{c.nome}</Text>)}
          {products.map(p=><Pressable key={p.id} style={styles.productCard} onPress={()=>openProductEditor(p)}><View style={{flex:1}}><Text style={styles.customer}>{p.nome}</Text><Text style={styles.orderMeta}>{p.descricao||'Sem descrição'} · {money(Number(p.preco))}</Text></View><Pressable style={[styles.statusPill,{backgroundColor:p.disponivel?'#E8F7EF':'#FCE9E6'}]} onPress={()=>toggleProduct(p)}><Text style={[styles.statusText,{color:p.disponivel?'#247A4B':'#B42318'}]}>{p.disponivel?'Disponível':'Pausado'}</Text></Pressable></Pressable>)}
          {!products.length&&<Text style={styles.emptyText}>Nenhum produto encontrado.</Text>}
          <Pressable style={styles.secondaryButton} onPress={addCategory}><Text style={styles.secondaryButtonText}>Gerenciar categorias</Text></Pressable>
        </ScrollView> : tab==='relatorios' ? <ScrollView contentContainerStyle={styles.listContent}><Text style={styles.sectionTitle}>Relatórios</Text><View style={styles.revenueCard}><Text style={styles.revenueLabel}>VENDAS NOS ÚLTIMOS 30 DIAS</Text><Text style={styles.revenueValue}>{money(orders.filter(o=>o.criado_em&&Date.now()-new Date(o.criado_em).getTime()<=30*86400000).reduce((a,o)=>a+Number(o.total||0),0))}</Text></View><Text style={styles.orderMeta}>{orders.length} pedidos carregados. Para consultar períodos maiores, use o painel web.</Text></ScrollView> : tab==='ajustes' ? <ScrollView contentContainerStyle={styles.listContent}><Text style={styles.sectionTitle}>Ajustes</Text><View style={styles.restaurantCard}><Text style={styles.restaurantName}>{restaurant.nome}</Text><Text style={styles.restaurantSlug}>/{restaurant.slug}</Text></View><Text style={styles.orderMeta}>Conta: {session.user.email}</Text><Pressable style={styles.secondaryButton} onPress={signOut}><Text style={styles.secondaryButtonText}>Sair da conta</Text></Pressable></ScrollView> : <FlatList
          data={tab==='pedidos'?orders:orders.slice(0,8)}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#E67E45" />}
          ListHeaderComponent={
            <View>
              <View style={styles.restaurantCard}>
                <View style={styles.restaurantTop}><View style={styles.liveDot} /><Text style={styles.restaurantLabel}>{restaurant.aceita_pedidos ? 'RESTAURANTE CONECTADO' : 'PEDIDOS PAUSADOS'}</Text></View>
                <Text style={styles.restaurantName}>{restaurant.nome}</Text>
                <Text style={styles.restaurantSlug}>/{restaurant.slug}</Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statCard}><Text style={styles.statLabel}>PEDIDOS RECENTES</Text><Text style={styles.statValue}>{orders.length}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>AGUARDANDO</Text><Text style={[styles.statValue, { color: '#D97742' }]}>{pending}</Text></View>
              </View>
              <View style={styles.revenueCard}><Text style={styles.revenueLabel}>VENDAS DE HOJE · PEDIDOS CARREGADOS</Text><Text style={styles.revenueValue}>{money(todayTotal)}</Text></View>
              <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{tab==='pedidos'?'Todos os pedidos':'Pedidos recentes'}</Text><Text style={styles.sectionHint}>Atualiza em tempo real</Text></View>
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>🧾</Text><Text style={styles.emptyTitle}>Nenhum pedido encontrado</Text><Text style={styles.emptyText}>Quando chegar um pedido, ele aparecerá aqui.</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.orderCard}>
              <View style={styles.orderTop}><Text style={styles.orderId}>Pedido #{item.id}</Text><Text style={styles.orderDate}>{dateTime(item.criado_em)}</Text></View>
              <Text style={styles.customer}>{item.cliente_nome}</Text>
              {!!item.itens_pedido?.length && <View style={styles.orderItems}>{item.itens_pedido.map(line => <Text key={line.id} style={styles.orderItemText}>{line.quantidade}× {line.nome_produto ?? 'Produto'}</Text>)}</View>}
              <View style={styles.orderBottom}><Text style={styles.orderMeta}>{item.tipo_entrega} · {item.forma_pagamento}{Number(item.taxa_entrega) > 0 ? ' · Entrega ' + money(Number(item.taxa_entrega)) : ''}</Text><Text style={styles.orderTotal}>{money(Number(item.total))}</Text></View>
              <View style={styles.statusPill}><Text style={styles.statusText}>{item.status ?? 'Sem status'}</Text></View>
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
            </View>
          )}
        />}
        <View style={styles.bottomNav}>{([['inicio','Início','⌂'],['pedidos','Pedidos','▤'],['cardapio','Cardápio','☷'],['relatorios','Relatórios','▥'],['ajustes','Ajustes','⚙']] as const).map(([key,label,icon])=><Pressable key={key} style={styles.navItem} onPress={()=>setTab(key)}><Text style={[styles.navIcon,{color:tab===key?'#D66F3C':'#89949B'}]}>{icon}</Text><Text style={[styles.navLabel,{color:tab===key?'#D66F3C':'#89949B'}]}>{label}</Text></Pressable>)}</View>
        <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={()=>setEditorOpen(false)}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.sectionTitle}>{editingProduct?'Editar produto':'Novo produto'}</Text><TextInput value={productName} onChangeText={setProductName} placeholder="Nome do produto" style={styles.input}/><TextInput value={productPrice} onChangeText={setProductPrice} placeholder="Preço (ex.: 15,00)" keyboardType="decimal-pad" style={styles.input}/><TextInput value={productDescription} onChangeText={setProductDescription} placeholder="Descrição (opcional)" multiline style={[styles.input,{height:80}]}/><Text style={styles.orderMeta}>Categoria</Text><ScrollView horizontal>{categories.map(c=><Pressable key={c.id} onPress={()=>setProductCategory(c.id)} style={[styles.categoryChip,productCategory===c.id&&styles.categoryChipActive]}><Text style={{color:productCategory===c.id?'#fff':'#52616B'}}>{c.nome}</Text></Pressable>)}</ScrollView><Pressable style={styles.advanceButton} onPress={()=>void saveProduct()} disabled={saving}><Text style={styles.advanceButtonText}>{saving?'Salvando...':'Salvar produto'}</Text></Pressable><Pressable style={styles.cancelButton} onPress={()=>setEditorOpen(false)}><Text style={styles.cancelButtonText}>Fechar</Text></Pressable></View></KeyboardAvoidingView></Modal>
        </View>
      ) : (
        <View style={styles.empty}><Text style={styles.emptyIcon}>🏪</Text><Text style={styles.emptyTitle}>Nenhum restaurante vinculado</Text><Text style={styles.emptyText}>Esta conta ainda não possui um restaurante cadastrado.</Text><Pressable style={styles.secondaryButton} onPress={refresh}><Text style={styles.secondaryButtonText}>Tentar novamente</Text></Pressable></View>
      )}
    </SafeAreaView>
  );
}

function Splash() {
  return <View style={styles.splash}><ActivityIndicator size="large" color="#E67E45" /><Text style={styles.splashText}>Fb3d2y Menu</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FA' },
  splash: { flex: 1, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center', gap: 14 },
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
  avatarText: { color: '#C96332', fontWeight: '900', fontSize: 17 },
  listContent: { paddingHorizontal: 18, paddingBottom: 30 },
  restaurantCard: { backgroundColor: '#20333B', borderRadius: 22, padding: 20, marginBottom: 13 },
  restaurantTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#63D6A1' },
  restaurantLabel: { color: '#B9C8CD', fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  restaurantName: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 15 },
  restaurantSlug: { color: '#A9BCC2', fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
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
  advanceButton: { backgroundColor: '#20333B', borderRadius: 12, minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  advanceButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  cancelButton: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 9, marginTop: 2 },
  cancelButtonText: { color: '#A65A50', fontSize: 10, fontWeight: '800' },
  notes: { color: '#7C878D', fontSize: 11, marginTop: 9 },
  bottomNav:{flexDirection:'row',backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#E9EDF0',paddingTop:7,paddingBottom:Platform.OS==='android'?12:18},navItem:{flex:1,alignItems:'center',gap:3},navIcon:{fontSize:19,fontWeight:'800'},navLabel:{fontSize:9,fontWeight:'800'},addButton:{backgroundColor:'#E67E45',paddingHorizontal:13,paddingVertical:9,borderRadius:10},addButtonText:{color:'#fff',fontWeight:'800',fontSize:12},productCard:{backgroundColor:'#fff',borderRadius:15,padding:14,marginBottom:8,borderWidth:1,borderColor:'#E9EDF0',flexDirection:'row',alignItems:'center',gap:10},categoryTitle:{fontSize:14,fontWeight:'900',color:'#26343C',marginTop:16,marginBottom:8},modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'flex-end'},modalCard:{backgroundColor:'#fff',padding:22,borderTopLeftRadius:24,borderTopRightRadius:24,gap:12},input:{borderWidth:1,borderColor:'#DCE2E6',borderRadius:11,padding:12,color:'#26343C'},categoryChip:{padding:9,borderRadius:10,backgroundColor:'#F0F2F4',marginRight:7},categoryChipActive:{backgroundColor:'#D66F3C'},
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 38, marginBottom: 13 },
  emptyTitle: { color: '#26343C', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#8B969D', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 7 },
  secondaryButton: { backgroundColor: '#E67E45', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 18 },
  secondaryButtonText: { color: '#fff', fontWeight: '800' }
});