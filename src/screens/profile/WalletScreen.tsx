import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useSupabase, supabase } from '../../context/SupabaseContext';
import type { Palette } from '../../theme/palettes';
import type { AppStackParamList } from '../../navigation';

const WITHDRAW_THRESHOLD_MNT = 50_000;
const DAILY_CAP_MNT          = 2_000;

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Wallet'> };

interface Balance {
  available_mnt: number;
  pending_mnt: number;
  lifetime_earned_mnt: number;
  kyc_verified: boolean;
}

interface LedgerRow {
  id: string;
  delta_mnt: number;
  kind: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const KIND_LABELS_MN: Record<string, string> = {
  traffic_earning: 'Замын түгжрэлийн орлого',
  referral_bonus:  'Урилгын урамшуулал',
  spend_booking:   'Захиалгад зарцуулсан',
  payout:          'Банк руу шилжүүлсэн',
  reversal:        'Буцаалт',
};

function formatMnt(n: number): string {
  return `₮${n.toLocaleString('en-US')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' });
}

export default function WalletScreen({ navigation }: Props) {
  const { session } = useSupabase();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [balance,  setBalance]  = useState<Balance | null>(null);
  const [ledger,   setLedger]   = useState<LedgerRow[]>([]);
  const [todayMnt, setTodayMnt] = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: bal }, { data: rows }, { data: counter }] = await Promise.all([
      supabase.from('wallet_balances')
        .select('available_mnt, pending_mnt, lifetime_earned_mnt, kyc_verified')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase.from('wallet_ledger')
        .select('id, delta_mnt, kind, created_at, metadata')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('daily_earning_counters')
        .select('earned_mnt')
        .eq('user_id', session.user.id)
        .eq('ymd', today)
        .maybeSingle(),
    ]);
    setBalance(bal ?? { available_mnt: 0, pending_mnt: 0, lifetime_earned_mnt: 0, kyc_verified: false });
    setLedger(rows ?? []);
    setTodayMnt(counter?.earned_mnt ?? 0);
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleWithdraw = useCallback(() => {
    const avail = balance?.available_mnt ?? 0;
    if (avail < WITHDRAW_THRESHOLD_MNT) {
      Alert.alert(
        'Хүсэлт гаргах боломжгүй',
        `Танд ${formatMnt(WITHDRAW_THRESHOLD_MNT - avail)} дутуу байна. ${formatMnt(WITHDRAW_THRESHOLD_MNT)} нэгж цуглуулмагц банк руу шилжүүлэх хүсэлт гаргах боломжтой.`,
      );
      return;
    }
    if (!balance?.kyc_verified) {
      Alert.alert(
        'KYC шаардлагатай',
        'Банк руу шилжүүлэхийн тулд иргэний үнэмлэх баталгаажуулна уу. Энэ функц удахгүй нэмэгдэнэ.',
      );
      return;
    }
    Alert.alert('Удахгүй', 'Шилжүүлгийн дэлгэц удахгүй нэмэгдэнэ.');
  }, [balance]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const avail    = balance?.available_mnt ?? 0;
  const progress = Math.min(1, avail / WITHDRAW_THRESHOLD_MNT);
  const todayPct = Math.min(1, todayMnt / DAILY_CAP_MNT);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Хэтэвч</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Боломжтой үлдэгдэл</Text>
          <Text style={s.balanceAmount}>{formatMnt(avail)}</Text>
          <Text style={s.lifetimeText}>
            Нийт олсон: {formatMnt(balance?.lifetime_earned_mnt ?? 0)}
          </Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Өнөөдөр</Text>
            <Text style={s.statValue}>{formatMnt(todayMnt)} / {formatMnt(DAILY_CAP_MNT)}</Text>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${todayPct * 100}%`, backgroundColor: colors.success }]} />
            </View>
          </View>

          <View style={s.statCard}>
            <Text style={s.statLabel}>Шилжүүлэг хүртэл</Text>
            <Text style={s.statValue}>{formatMnt(Math.max(0, WITHDRAW_THRESHOLD_MNT - avail))}</Text>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleWithdraw}
          style={({ pressed }) => [
            s.withdrawBtn,
            { opacity: pressed ? 0.85 : 1, backgroundColor: avail >= WITHDRAW_THRESHOLD_MNT ? colors.primary : colors.borderStrong },
          ]}
        >
          <Ionicons name="cash-outline" size={18} color={colors.textInverse} />
          <Text style={s.withdrawText}>
            {avail >= WITHDRAW_THRESHOLD_MNT ? 'Шилжүүлэх хүсэлт' : `${formatMnt(WITHDRAW_THRESHOLD_MNT)}-аас шилжүүлэх боломжтой`}
          </Text>
        </Pressable>

        <Text style={s.sectionTitle}>Гүйлгээний түүх</Text>
        {ledger.length === 0 ? (
          <Text style={s.emptyText}>Гүйлгээ алга байна.</Text>
        ) : (
          ledger.map(row => (
            <View key={row.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowKind}>{KIND_LABELS_MN[row.kind] ?? row.kind}</Text>
                <Text style={s.rowDate}>{formatDate(row.created_at)}</Text>
              </View>
              <Text
                style={[s.rowAmount, { color: row.delta_mnt >= 0 ? colors.success : colors.danger }]}
              >
                {row.delta_mnt >= 0 ? '+' : ''}{formatMnt(row.delta_mnt)}
              </Text>
            </View>
          ))
        )}

        <Text style={s.legalNote}>
          Замын түгжрэлийн орлого: минут тутамд ₮20, өдөрт хамгийн ихдээ ₮{DAILY_CAP_MNT.toLocaleString()}. ₮{WITHDRAW_THRESHOLD_MNT.toLocaleString()}-аас банк руу шилжүүлэх боломжтой.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    content: { padding: 16, paddingBottom: 64 },

    balanceCard: {
      backgroundColor: c.cardBg,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    balanceLabel: { color: c.textSec, fontSize: 13 },
    balanceAmount: { color: c.text, fontSize: 36, fontWeight: '700', marginTop: 4 },
    lifetimeText: { color: c.textMuted, fontSize: 12, marginTop: 8 },

    statsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    statCard: {
      flex: 1,
      backgroundColor: c.cardBg,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    statLabel: { color: c.textSec, fontSize: 12 },
    statValue: { color: c.text, fontSize: 14, fontWeight: '600', marginTop: 4 },
    progressBar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginTop: 10,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 2 },

    withdrawBtn: {
      marginTop: 16,
      paddingVertical: 14,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    withdrawText: { color: c.textInverse, fontWeight: '600', fontSize: 14 },

    sectionTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 24,
      marginBottom: 8,
    },
    emptyText: { color: c.textMuted, fontSize: 13, paddingVertical: 12 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowKind: { color: c.text, fontSize: 14 },
    rowDate: { color: c.textMuted, fontSize: 11, marginTop: 2 },
    rowAmount: { fontSize: 14, fontWeight: '600' },

    legalNote: { color: c.textMuted, fontSize: 11, marginTop: 24, lineHeight: 16 },
  });
}
