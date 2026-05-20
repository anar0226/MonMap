import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { SkeletonBookingCard } from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../context/SupabaseContext';
import type { AppStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Bookings'> };

interface Booking {
  id: string;
  place_id: string;
  booked_date: string;
  time_slot: string;
  party_size: number;
  guest_name: string;
  status: string;
  cancelled_by: 'customer' | 'business' | 'system' | null;
  created_at: string;
  deposit_amount: number | null;
  payment_id: string | null;
  place_name?: string;
}

export default function BookingsScreen({ navigation }: Props) {
  const { session } = useSupabase();
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const handleCancel = (b: Booking) => {
    const hasDeposit = b.deposit_amount != null && b.payment_id != null;
    const refundNote = hasDeposit
      ? '\n\nЗахиалга цуцлагдвал баталгааны төлбөр 2 цагийн өмнө буцаагдана.'
      : '';

    Alert.alert(
      'Захиалга цуцлах',
      `"${b.place_name ?? b.place_id}" захиалгыг цуцлах уу?${refundNote}`,
      [
        { text: 'Болих', style: 'cancel' },
        {
          text: 'Цуцлах',
          style: 'destructive',
          onPress: async () => {
            setCancelling(prev => new Set(prev).add(b.id));
            let failed = false;

            if (hasDeposit) {
              // Use edge function — it handles the QPay refund based on timing policy
              const { error } = await supabase.functions.invoke('cancel-booking', {
                body: { bookingId: b.id, cancelledBy: 'customer' },
              });
              if (error) failed = true;
            } else {
              // Standard free booking — direct DB update
              const { error } = await supabase
                .from('bookings')
                .update({ status: 'cancelled', cancelled_by: 'customer' })
                .eq('id', b.id);
              if (error) {
                failed = true;
              } else {
                supabase.functions.invoke('notify-booking', { body: { bookingId: b.id } }).catch(console.warn);
              }
            }

            if (failed) {
              Alert.alert('Алдаа', 'Цуцлах боломжгүй байна. Дахин оролдоно уу.');
            } else {
              setBookings(prev =>
                prev.map(x => x.id === b.id ? { ...x, status: 'cancelled' } : x),
              );
            }
            setCancelling(prev => { const s = new Set(prev); s.delete(b.id); return s; });
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, place_id, booked_date, time_slot, party_size, guest_name, status, cancelled_by, created_at, deposit_amount, payment_id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (error) throw error;

        const rows = (data ?? []) as Booking[];

        // Resolve place names. A failure here only loses the names — the
        // bookings themselves are still useful, so don't fail the whole screen.
        const placeIds = [...new Set(rows.map(b => b.place_id))];
        if (placeIds.length > 0) {
          const { data: places, error: placesErr } = await supabase
            .from('places')
            .select('place_id, name')
            .in('place_id', placeIds);
          if (placesErr) {
            console.warn('BookingsScreen: failed to resolve place names', placesErr);
          }
          const nameMap = new Map((places ?? []).map((p: any) => [p.place_id, p.name]));
          for (const b of rows) b.place_name = nameMap.get(b.place_id) ?? 'Тодорхойгүй';
        }

        if (!cancelled) setBookings(rows);
      } catch (e: any) {
        if (cancelled) return;
        console.warn('BookingsScreen: failed to load bookings', e);
        setLoadError('Захиалгуудыг ачаалж чадсангүй. Дахин оролдоно уу.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user, reloadTick]);

  return (
    <View style={s.flex}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          </Pressable>
          <Text style={s.title}>Захиалгууд</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        // Skeleton cards match the actual card layout below so the transition
        // to real data is layout-shift-free. Four rows ≈ a full mobile viewport.
        <ScrollView contentContainerStyle={s.list}>
          <SkeletonBookingCard />
          <SkeletonBookingCard />
          <SkeletonBookingCard />
          <SkeletonBookingCard />
        </ScrollView>
      ) : loadError ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={s.emptyTitle}>Алдаа гарлаа</Text>
          <Text style={s.emptyDesc}>{loadError}</Text>
          <Pressable
            onPress={() => setReloadTick(t => t + 1)}
            style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.retryBtnText}>Дахин оролдох</Text>
          </Pressable>
        </View>
      ) : bookings.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={s.emptyTitle}>Захиалга байхгүй</Text>
          <Text style={s.emptyDesc}>
            Газрын хуудаснаас захиалга хийж эхлээрэй.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {bookings.map(b => (
            <View key={b.id} style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.iconWrap}>
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName} numberOfLines={1}>{b.place_name ?? b.place_id}</Text>
                  <Text style={s.cardDate}>{b.booked_date} · {b.time_slot}</Text>
                </View>
                <StatusBadge status={b.status} cancelledBy={b.cancelled_by} />
              </View>
              <View style={s.cardDetails}>
                <Text style={s.detailText}>👤 {b.guest_name}</Text>
                <Text style={s.detailText}>👥 {b.party_size} хүн</Text>
              </View>
              {(b.status === 'pending' || b.status === 'confirmed') && (
                <Pressable
                  onPress={() => handleCancel(b)}
                  disabled={cancelling.has(b.id)}
                  style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.6 }]}
                >
                  {cancelling.has(b.id)
                    ? <ActivityIndicator size="small" color={colors.danger} />
                    : <Text style={s.cancelBtnText}>Цуцлах</Text>}
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function StatusBadge({ status, cancelledBy }: { status: string; cancelledBy?: string | null }) {
  const { colors } = useTheme();
  const isConfirmed = status === 'confirmed';
  const isCancelled = status === 'cancelled';
  const isPending   = status === 'pending';
  const isExpired   = status === 'expired';

  // Status colors are deliberately constant across themes — semantic meaning
  // doesn't change with the palette. The translucent backgrounds work on
  // both light and dark since they're keyed off the brand color, not a token.
  const bg = isConfirmed ? 'rgba(16,185,129,0.12)'
    : isCancelled ? 'rgba(239,68,68,0.12)'
    : isPending   ? 'rgba(251,184,36,0.12)'
    : isExpired   ? 'rgba(148,163,184,0.14)'
    : colors.inputBg;

  const fg = isConfirmed ? '#10B981'
    : isCancelled ? colors.danger
    : isPending   ? '#D97706'
    : isExpired   ? '#94A3B8'
    : colors.textSec;

  const label = isConfirmed ? 'Баталгаажсан'
    : isCancelled ? (cancelledBy === 'customer' ? 'Цуцлагдсан (хэрэглэгч)' : 'Цуцлагдсан')
    : isPending   ? 'Хүлээгдэж байна'
    : isExpired   ? 'Хариу ирээгүй'
    : status;

  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: bg }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: fg }}>{label}</Text>
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  // Translucent overlays adapt to theme via inputBg/border tokens — the dark
  // theme's rgba(255,255,255,0.08) becomes inputBg='rgba(15,23,42,0.04)' in
  // light, which renders correctly on a white card.
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    safeTop: { backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12,
    },
    backBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: {
      width: 64, height: 64, borderRadius: 20,
      backgroundColor: colors.inputBg,
      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
    emptyDesc: { color: colors.textSec, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80, gap: 10 },
    card: {
      backgroundColor: colors.cardBg, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border, padding: 14,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: `${colors.primary}1A`,
      alignItems: 'center', justifyContent: 'center',
    },
    cardName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    cardDate: { color: colors.textSec, fontSize: 12, marginTop: 2 },
    cardDetails: {
      flexDirection: 'row', gap: 16,
      marginTop: 10, paddingTop: 10,
      borderTopWidth: 0.5, borderTopColor: colors.border,
    },
    detailText: { color: colors.textSec, fontSize: 12 },
    cancelBtn: {
      marginTop: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.danger}44`,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.danger}0D`,
      minHeight: 34,
    },
    cancelBtnText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
    retryBtn: {
      marginTop: 16,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    retryBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  });
}
