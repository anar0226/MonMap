import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../context/SupabaseContext';
import { useTheme } from '../../context/ThemeContext';
import type { AppStackParamList } from '../../navigation';
import type { Palette } from '../../theme/palettes';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Profile'> };

// ── Category → icon / color ────────────────────────────────────
const CAT: Record<string, { icon: string; color: string }> = {
  restaurant: { icon: '🍽', color: '#d97757' },
  cafe: { icon: '☕', color: '#a16207' },
  beauty: { icon: '✂', color: '#c084fc' },
  salon: { icon: '✂', color: '#c084fc' },
  bar: { icon: '🍸', color: '#22d3ee' },
  sushi: { icon: '🍣', color: '#f43f5e' },
  gym: { icon: '💪', color: '#84cc16' },
  spa: { icon: '💆', color: '#fb923c' },
  default: { icon: '📍', color: '#6366f1' },
};

function catStyle(cat: string | null) {
  const k = (cat ?? '').toLowerCase();
  for (const [key, val] of Object.entries(CAT)) {
    if (k.includes(key)) return val;
  }
  return CAT.default;
}

// ── Types ──────────────────────────────────────────────────────
interface Booking {
  id: string;
  placeName: string;
  placeType: string;
  icon: string;
  color: string;
  dayLabel: string;
  fullDate: string;
  time: string;
  party: number;
  status: string;
  address: string | null;
  rawTime: string;
  depositAmount: number;
}

type S = ReturnType<typeof makeStyles>;

// ── Helpers ────────────────────────────────────────────────────
function fmtMnt(n: number) {
  return n.toLocaleString('en-US');
}

function parseBkDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const tom = new Date(now);
  tom.setDate(now.getDate() + 1);
  const dayLabel =
    d.toDateString() === now.toDateString() ? 'Өнөөдөр' :
      d.toDateString() === tom.toDateString() ? 'Маргааш' :
        d.toLocaleDateString('mn-MN', { weekday: 'short' });
  const fullDate = `${d.getMonth() + 1}-р сарын ${d.getDate()}`;
  const time = d.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' });
  return { dayLabel, fullDate, time };
}

// ── WalletHero ─────────────────────────────────────────────────
// Intentional branded gradient card — colors are hardcoded by design.
function WalletHero({
  balance, points, onWithdraw,
}: { balance: number; points: number; onWithdraw: () => void }) {
  return (
    <LinearGradient
      colors={['#2a4cc9', '#1f3eb0', '#18337a']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={wS.walletCard}
    >
      <View style={[wS.blob, { top: -30, right: -20, width: 140, height: 140, backgroundColor: 'rgba(120,160,255,0.18)' }]} />
      <View style={[wS.blob, { bottom: -40, left: -20, width: 110, height: 110, backgroundColor: 'rgba(80,140,255,0.12)' }]} />

      <View style={wS.walletTop}>
        <View>
          <Text style={wS.walletLabel}>Үлдэгдэл</Text>
          <Text style={wS.walletAmt}>
            {fmtMnt(balance)}{' '}
            <Text style={wS.walletCur}>₮</Text>
          </Text>
        </View>
        <View style={wS.ptsBadge}>
          <Text style={{ fontSize: 10 }}>⭐</Text>
          <Text style={wS.ptsVal}>{fmtMnt(points)}</Text>
          <Text style={wS.ptsLbl}>оноо</Text>
        </View>
      </View>

      <View style={wS.walletBtns}>
        <Pressable onPress={onWithdraw} style={wS.wBtnGlass}>
          <Text style={wS.wBtnGlassTxt}>↓ Суутгах</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const wS = StyleSheet.create({
  walletCard: { borderRadius: 22, padding: 18, overflow: 'hidden', shadowColor: '#284ec8', shadowOpacity: 0.45, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  blob: { position: 'absolute', borderRadius: 999 },
  walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  walletLabel: { fontSize: 11, fontWeight: '500', color: 'rgba(200,220,255,0.75)', letterSpacing: 0.5 },
  walletAmt: { fontSize: 30, fontWeight: '700', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  walletCur: { fontSize: 20, fontWeight: '500' },
  ptsBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  ptsVal: { fontSize: 12, color: '#fff', fontWeight: '600' },
  ptsLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  walletBtns: { flexDirection: 'row', gap: 8, marginTop: 16 },
  wBtnGlass: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  wBtnGlassTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

// ── BookingRow ─────────────────────────────────────────────────
function BookingRow({ b, onTap, past, s, colors }: { b: Booking; onTap: (b: Booking) => void; past?: boolean; s: S; colors: Palette }) {
  return (
    <Pressable onPress={() => onTap(b)} style={[s.bkRow, past && { opacity: 0.78 }]}>
      <View style={[s.bkRowIco, { backgroundColor: b.color + '22' }]}>
        <Text style={{ fontSize: 20 }}>{b.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.bkRowName} numberOfLines={1}>{b.placeName}</Text>
          {b.status === 'pending' && (
            <View style={s.pendingBadge}>
              <Text style={s.pendingTxt}>ХҮЛЭЭГДЭЖ</Text>
            </View>
          )}
        </View>
        <Text style={s.bkRowSub}>{b.fullDate} · {b.time} · {b.party} хүн</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}

// ── SectionLabel ───────────────────────────────────────────────
function SectionLabel({ label, action, onAction, s }: { label: string; action?: string; onAction?: () => void; s: S }) {
  return (
    <View style={s.secLblRow}>
      <Text style={s.secLblTxt}>{label}</Text>
      {action && (
        <Pressable onPress={onAction}>
          <Text style={s.secLblAct}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── BookingSheet ───────────────────────────────────────────────
function BookingSheet({
  booking, onClose, onCancel, onViewDetails, s, colors,
}: {
  booking: Booking | null;
  onClose: () => void;
  onCancel: (id: string) => void;
  onViewDetails: () => void;
  s: S;
  colors: Palette;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: booking ? 1 : 0,
      useNativeDriver: true,
      bounciness: 3,
    }).start();
  }, [booking, anim]);

  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 0.6] });
  const confirmed = booking?.status === 'confirmed';

  return (
    <>
      <Animated.View style={[s.sheetBg, { opacity }]} pointerEvents={booking ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, { transform: [{ translateY: ty }] }]} pointerEvents={booking ? 'auto' : 'none'}>
        <View style={s.sheetPill} />
        {booking && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[s.sheetIco, { backgroundColor: booking.color + '22' }]}>
                <Text style={{ fontSize: 26 }}>{booking.icon}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.sheetName}>{booking.placeName}</Text>
                <Text style={s.sheetType}>{booking.placeType}</Text>
              </View>
            </View>

            <View style={s.sheetDets}>
              <DRow label="Огноо" value={`${booking.fullDate} · ${booking.dayLabel}`} s={s} />
              <DRow label="Цаг" value={booking.time} s={s} />
              <DRow label="Хүний тоо" value={`${booking.party} хүн`} s={s} />
              {booking.address ? <DRow label="Хаяг" value={booking.address} s={s} /> : null}
              <DRow
                label="Төлөв"
                value={confirmed ? 'Баталгаажсан' : 'Хүлээгдэж буй'}
                valueColor={confirmed ? '#34c759' : '#ffb428'}
                last
                s={s}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable style={s.sheetActCancel} onPress={() => onCancel(booking.id)}>
                <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 14 }}>Цуцлах</Text>
              </Pressable>
              <Pressable style={s.sheetActDetail} onPress={onViewDetails}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Дэлгэрэнгүй</Text>
              </Pressable>
            </View>
          </>
        )}
      </Animated.View>
    </>
  );
}

function DRow({ label, value, valueColor, last, s }: {
  label: string; value: string; valueColor?: string; last?: boolean; s: S;
}) {
  return (
    <View style={[s.dRow, !last && s.dRowBorder]}>
      <Text style={s.dLabel}>{label}</Text>
      <Text style={[s.dValue, valueColor ? { color: valueColor, fontWeight: '600' } : {}]}>{value}</Text>
    </View>
  );
}

// ── MenuItem ───────────────────────────────────────────────────
function MenuItem({ icon, iconBg, title, sub, onTap, danger, s, colors }: {
  icon: string; iconBg: string; title: string; sub?: string;
  onTap: () => void; danger?: boolean; s: S; colors: Palette;
}) {
  return (
    <Pressable onPress={onTap} style={s.menuItem}>
      <View style={[s.menuIcoBox, { backgroundColor: iconBg }]}>
        <Text style={{ fontSize: 15 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[s.menuLbl, danger && { color: colors.danger }]}>{title}</Text>
        {sub && <Text style={s.menuSub}>{sub}</Text>}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}

// ── ProfileScreen ──────────────────────────────────────────────
export default function ProfileScreen({ navigation }: Props) {
  const { session } = useSupabase();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const user = session?.user;
  const userName = user?.user_metadata?.full_name ?? 'Хэрэглэгч';

  const [walletBalance, setWalletBalance] = useState(0);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [sheet, setSheet] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const nowMs = Date.now();

    const [{ data: walletData }, { data: bkData }] = await Promise.all([
      supabase
        .from('wallet_balances')
        .select('available_mnt, lifetime_earned_mnt')
        .eq('user_id', user.id)
        .maybeSingle(),
      // bookings stores booked_date (date) + time_slot (text "HH:MM") — there
      // is no `booking_time` column. The old query selected a non-existent
      // column and silently returned no rows, so the profile always showed
      // "no bookings" even when the bookings list page rendered them.
      supabase
        .from('bookings')
        .select('id, booked_date, time_slot, party_size, status, deposit_amount, places(name, primary_category, short_address)')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('booked_date', { ascending: false })
        .order('time_slot', { ascending: false })
        .limit(30),
    ]);

    if (walletData) {
      setWalletBalance(walletData.available_mnt ?? 0);
      setLoyaltyPoints(Math.floor((walletData.lifetime_earned_mnt ?? 0) / 100));
    }

    if (bkData) {
      const mapped: Booking[] = (bkData as any[]).map((row) => {
        const place = row.places as any;
        const { icon, color } = catStyle(place?.primary_category ?? null);
        // Combine date + slot into a local ISO timestamp so parseBkDate /
        // upcoming-vs-past comparison works the same as the old booking_time field.
        const rawTime = `${row.booked_date}T${row.time_slot}:00`;
        const { dayLabel, fullDate, time } = parseBkDate(rawTime);
        return {
          id: row.id,
          placeName: place?.name ?? 'Газар',
          placeType: place?.primary_category ?? '',
          icon, color, dayLabel, fullDate, time,
          party: row.party_size ?? 1,
          status: row.status ?? 'pending',
          address: place?.short_address ?? null,
          rawTime,
          depositAmount: row.deposit_amount ?? 0,
        };
      });
      setUpcoming(mapped.filter(b => new Date(b.rawTime).getTime() >= nowMs));
      setPast(mapped.filter(b => new Date(b.rawTime).getTime() < nowMs));
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const handleCancelBooking = useCallback((bookingId: string) => {
    setSheet(null);
    const booking = [...upcoming, ...past].find(b => b.id === bookingId);
    const hasDeposit = (booking?.depositAmount ?? 0) > 0;

    const refundNote = hasDeposit
      ? '\n\nБаталгааны төлбөр 2 цагийн өмнө цуцалсан тохиолдолд буцаагдана.'
      : '';

    Alert.alert(
      'Захиалга цуцлах',
      `Та энэ захиалгыг цуцлахдаа итгэлтэй байна уу?${refundNote}`,
      [
        { text: 'Буцах', style: 'cancel' },
        {
          text: 'Цуцлах', style: 'destructive',
          onPress: async () => {
            let failed = false;
            if (hasDeposit) {
              const { error } = await supabase.functions.invoke('cancel-booking', {
                body: { bookingId },
              });
              if (error) failed = true;
            } else {
              const { error } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', bookingId)
                .eq('user_id', user?.id ?? '');
              if (error) failed = true;
            }
            if (failed) {
              Alert.alert('Алдаа', 'Захиалгыг цуцлах боломжгүй байна. Дахин оролдоно уу.');
            } else {
              load();
            }
          },
        },
      ],
    );
  }, [load, user?.id, upcoming, past]);

  const tabList = activeTab === 'upcoming' ? upcoming : past;

  return (
    <View style={s.root}>
      {/* Blue glow */}
      <LinearGradient
        colors={['rgba(59,109,255,0.22)', 'rgba(10,17,36,0)']}
        style={s.glow}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top']} style={{ zIndex: 2 }}>
        <View style={s.topBar}>
          <Pressable style={s.glassBtn} onPress={() => navigation.navigate('Settings')}>
            <Text style={{ color: colors.text, fontSize: 15 }}>⚙</Text>
          </Pressable>
          <Pressable style={s.glassBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.text, fontSize: 14 }}>✕</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <LinearGradient
            colors={['#4a7dff', '#2855e5']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.avatar}
          >
            <Text style={s.avatarLetter}>{(userName[0] ?? 'U').toUpperCase()}</Text>
            <View style={s.onlineDot} />
          </LinearGradient>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.userName}>{userName}</Text>
            <View style={s.memberBadge}>
              <Text style={s.memberBadgeTxt}>✦ MonMap гишүүн</Text>
            </View>
          </View>
        </View>

        {/* Wallet */}
        <View style={{ marginTop: 18 }}>
          <WalletHero
            balance={walletBalance}
            points={loyaltyPoints}
            onWithdraw={() => navigation.navigate('Wallet')}
          />
        </View>

        {/* Bookings */}
        <View style={{ marginTop: 22 }}>
          <SectionLabel
            label="Захиалга"
            action="Бүгдийг харах →"
            onAction={() => navigation.navigate('Bookings')}
            s={s}
          />
          <View style={s.tabs}>
            {([['upcoming', 'Удахгүй', upcoming.length], ['past', 'Өнгөрсөн', past.length]] as const).map(
              ([id, label, count]) => (
                <Pressable
                  key={id}
                  onPress={() => setActiveTab(id)}
                  style={[s.tab, activeTab === id && s.tabActive]}
                >
                  <Text style={[s.tabTxt, activeTab === id && s.tabTxtActive]}>{label}</Text>
                  <View style={[s.tabCnt, activeTab === id && s.tabCntActive]}>
                    <Text style={[s.tabCntTxt, activeTab === id && s.tabCntTxtActive]}>{count}</Text>
                  </View>
                </Pressable>
              ),
            )}
          </View>
          <View style={{ gap: 8, marginTop: 2 }}>
            {tabList.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 12 }}>
                Захиалга байхгүй байна.
              </Text>
            ) : (
              tabList.map(b => (
                <BookingRow key={b.id} b={b} onTap={setSheet} past={activeTab === 'past'} s={s} colors={colors} />
              ))
            )}
          </View>
        </View>

        {/* My usage */}
        <View style={{ marginTop: 22 }}>
          <SectionLabel label="Миний хэрэглээ" s={s} />
          <View style={s.menuCard}>
            <MenuItem icon="🔖" iconBg="rgba(255,94,126,0.12)" title="Хадгалсан газрууд" sub="Хадгалсан байршлууд" onTap={() => navigation.navigate('SavedPlaces')} s={s} colors={colors} />
            <View style={s.menuDiv} />
            <MenuItem icon="⚙" iconBg="rgba(138,158,255,0.12)" title="Тохиргоо" sub="Апп тохиргоо" onTap={() => navigation.navigate('Settings')} s={s} colors={colors} />
          </View>
        </View>

        {/* Help */}
        <View style={{ marginTop: 22 }}>
          <SectionLabel label="Тусламж" s={s} />
          <View style={s.menuCard}>
            <MenuItem icon="🎧" iconBg="rgba(128,233,182,0.12)" title="Холбоо барих" sub="Бидэнтэй холбогдоорой" onTap={() => navigation.navigate('Contact')} s={s} colors={colors} />
            <View style={s.menuDiv} />
            <MenuItem icon="ℹ" iconBg="rgba(201,201,201,0.12)" title="Тухай" sub="MonMap v1.0.0" onTap={() => navigation.navigate('About')} s={s} colors={colors} />
          </View>
        </View>

        {/* Logout */}
        <Pressable onPress={handleSignOut} style={s.logoutBtn}>
          <Text style={{ color: colors.danger, fontSize: 16 }}>⏏</Text>
          <Text style={s.logoutTxt}>Гарах</Text>
        </Pressable>

        <Text style={s.version}>MonMap v1.0.0</Text>
      </ScrollView>

      <BookingSheet
        booking={sheet}
        onClose={() => setSheet(null)}
        onCancel={handleCancelBooking}
        onViewDetails={() => { setSheet(null); navigation.navigate('Bookings'); }}
        s={s}
        colors={colors}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
function makeStyles(c: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320, zIndex: 0 },
    scroll: { paddingHorizontal: 18, paddingBottom: 48 },
    topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 4, gap: 8 },
    glassBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: c.inputBg,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    avatar: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: '#fff', fontSize: 28, fontWeight: '700' },
    onlineDot: { position: 'absolute', bottom: 4, right: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#34c759', borderWidth: 2, borderColor: c.bg },
    userName: { color: c.text, fontSize: 22, fontWeight: '700' },
    memberBadge: { flexDirection: 'row', alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(59,109,255,0.16)', borderWidth: 1, borderColor: 'rgba(59,109,255,0.28)' },
    memberBadgeTxt: { fontSize: 11, fontWeight: '600', color: '#4d8df0' },

    // Tabs
    tabs: { flexDirection: 'row', backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 4, marginBottom: 10 },
    tab: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    tabActive: { backgroundColor: '#3b6dff' },
    tabTxt: { color: c.textSec, fontWeight: '600', fontSize: 13 },
    tabTxtActive: { color: '#fff' },
    tabCnt: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: c.border },
    tabCntActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
    tabCntTxt: { fontSize: 10, color: c.textSec },
    tabCntTxtActive: { color: '#fff' },

    // Booking row
    bkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 14, backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border, borderRadius: 14 },
    bkRowIco: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    bkRowName: { fontSize: 15, fontWeight: '600', color: c.text },
    bkRowSub: { fontSize: 12, color: c.textSec, marginTop: 2 },
    pendingBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,180,40,0.16)' },
    pendingTxt: { fontSize: 9, fontWeight: '600', color: '#ffb428', letterSpacing: 0.3 },

    // Section label
    secLblRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 10 },
    secLblTxt: { fontSize: 12, color: c.textSec, fontWeight: '500', letterSpacing: 0.3, textTransform: 'uppercase' },
    secLblAct: { fontSize: 12, color: c.textSec, fontWeight: '500' },

    // Menu
    menuCard: { backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border, borderRadius: 16, overflow: 'hidden' },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 14 },
    menuIcoBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    menuLbl: { fontSize: 15, fontWeight: '600', color: c.text },
    menuSub: { fontSize: 12, color: c.textSec, marginTop: 1 },
    menuDiv: { height: 1, backgroundColor: c.border, marginLeft: 62 },

    // Logout
    logoutBtn: { marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(170,40,40,0.18)', borderWidth: 1, borderColor: 'rgba(170,40,40,0.4)', borderRadius: 14, padding: 14, gap: 8 },
    logoutTxt: { color: c.danger, fontWeight: '600', fontSize: 15 },
    version: { color: c.textMuted, fontSize: 11, textAlign: 'center', marginTop: 14, marginBottom: 4 },

    // Booking sheet
    sheetBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 50 },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.cardBg, borderTopWidth: 1, borderTopColor: c.borderStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, zIndex: 51, padding: 18, paddingBottom: 32 },
    sheetPill: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginBottom: 16 },
    sheetIco: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    sheetName: { fontSize: 19, fontWeight: '700', color: c.text },
    sheetType: { fontSize: 13, color: c.textSec, marginTop: 2 },
    sheetDets: { marginTop: 16, backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14 },
    sheetActCancel: { flex: 1, backgroundColor: 'rgba(255,77,77,0.12)', borderWidth: 1, borderColor: 'rgba(255,77,77,0.25)', borderRadius: 12, padding: 13, alignItems: 'center', justifyContent: 'center' },
    sheetActDetail: { flex: 1.4, backgroundColor: '#3b6dff', borderRadius: 12, padding: 13, alignItems: 'center', justifyContent: 'center' },
    dRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
    dRowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
    dLabel: { fontSize: 13, color: c.textSec },
    dValue: { fontSize: 14, color: c.text, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 16 },
  });
}
