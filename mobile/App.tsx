import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  Pressable, RefreshControl, SafeAreaView, StatusBar, StyleSheet,
  Text, TextInput, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    })
  : null;

type Restaurant = { id: number; nome: string; slug: string; aceita_pedidos: boolean; status_loja_manual: boolean | null };
type OrderLine = { id: number; nome_produto: string | null; quantidade: number; preco_unitario: number };
type Order = {
  id: number; cliente_nome: string; total: number; status: string | null;
  tipo_entrega: string; forma_pagamento: string; taxa_entrega: number;
  criado_em: string | null; observacoes: string | null; itens_pedido?: OrderLine[];
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
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
      .order('id', { ascending: true });
    if (companyError) { setError(companyError.message); return; }
    const chosen = (companies ?? [])[0] as Restaurant | undefined;
    setRestaurant(chosen ?? null);
    if (!chosen) { setOrders([]); return; }
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

  const signIn = async () => {
    if (!supabase) return;
    if (!email.trim() || !password) { Alert.alert('Atenção', 'Informe seu e-mail e sua senha.'); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) Alert.alert('Não foi possível entrar', authError.message);
  };

  const signOut = async () => { await supabase?.auth.signOut(); setRestaurant(null); setOrders([]); };

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

  const refresh = async () => {
    setRefreshing(true); await loadDashboard(); setRefreshing(false);
  };

  const pending = useMemo(() => orders.filter(o => ['novo', 'recebido', 'pendente'].includes((o.status ?? '').toLocaleLowerCase('pt-BR'))).length, [orders]);
  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => o.criado_em && new Date(o.criado_em).toDateString() === today)
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [orders]);

  if (booting) return <Splash />;
  if (!session) return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
        <Text style={styles.brand}>Fb3d2y <Text style={styles.brandAccent}>Menu</Text></Text>
        <Text style={styles.subtitle}>Seu restaurante na palma da mão.</Text>
        <View style={styles.loginCard}>
          <Text style={styles.cardTitle}>Acessar sua conta</Text>
          <Text style={styles.label}>E-mail</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" style={styles.input} />
          <Text style={styles.label}>Senha</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Sua senha" style={styles.input} onSubmitEditing={signIn} />
          <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={signIn} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Entrar</Text>}
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
        <Text style={styles.footer}>GESTÃO SIMPLES. PEDIDOS ORGANIZADOS.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8FA" />
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>PAINEL DO RESTAURANTE</Text><Text style={styles.headerTitle}>Olá! 👋</Text></View>
        <Pressable onPress={signOut} style={styles.avatar}><Text style={styles.avatarText}>{session.user.email?.[0]?.toUpperCase() ?? 'U'}</Text></Pressable>
      </View>
      {restaurant ? (
        <FlatList
          data={orders}
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
              <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Pedidos recentes</Text><Text style={styles.sectionHint}>Atualiza em tempo real</Text></View>
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
        />
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
  brandMark: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#E67E45', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  brandMarkText: { color: '#fff', fontSize: 31, fontWeight: '900' },
  brand: { color: '#18252D', fontSize: 31, fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: '#E67E45' },
  subtitle: { color: '#7A8790', fontSize: 15, marginTop: 7, marginBottom: 34 },
  loginCard: { backgroundColor: '#fff', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#E9EDF0' },
  cardTitle: { fontSize: 19, fontWeight: '800', color: '#202D35', marginBottom: 22 },
  label: { fontSize: 12, fontWeight: '800', color: '#596872', marginBottom: 8, marginTop: 5 },
  input: { height: 51, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8EC', paddingHorizontal: 14, fontSize: 15, color: '#1D2930', marginBottom: 13, backgroundColor: '#FBFCFD' },
  primaryButton: { height: 52, backgroundColor: '#E67E45', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 38, marginBottom: 13 },
  emptyTitle: { color: '#26343C', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#8B969D', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 7 },
  secondaryButton: { backgroundColor: '#E67E45', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 18 },
  secondaryButtonText: { color: '#fff', fontWeight: '800' }
});