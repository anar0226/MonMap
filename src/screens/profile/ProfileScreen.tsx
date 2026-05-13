import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../context/SupabaseContext';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import { colors, gradientCard, gradientPrimary } from '../../theme';
import type { AppStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Profile'> };

export default function ProfileScreen({ navigation }: Props) {
  const { session } = useSupabase();
  const user = session?.user;
  const userName = user?.user_metadata?.full_name ?? 'Хэрэглэгч';
  const userEmail = user?.email ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url ?? null;

  const [bookingCount, setBookingCount] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const { count: savedCount, reload: reloadSaved } = useSavedPlaces();

  // Reload saved count each time the screen gains focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { reloadSaved(); });
    return unsubscribe;
  }, [navigation, reloadSaved]);

  useEffect(() => {
    if (!user) return;
    // Booking count
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setBookingCount(count ?? 0));

    // Review count
    supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setReviewCount(count ?? 0));
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={s.flex}>
      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero banner */}
        <LinearGradient colors={gradientCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
          <View style={[s.circle, { width: 140, height: 140, top: -30, right: -20, backgroundColor: `${colors.primary}1F` }]} />
          <View style={[s.circle, { width: 60, height: 60, top: 20, right: 60, backgroundColor: `${colors.accent}14` }]} />
          <View style={[s.circle, { width: 80, height: 80, bottom: -10, left: 20, backgroundColor: `${colors.primary}11` }]} />

          <SafeAreaView edges={['top']}>
            <View style={s.bannerActions}>
              <Pressable style={s.glassBtn} onPress={() => navigation.navigate('Settings')}>
                <Text style={s.glassBtnIcon}>⚙</Text>
              </Pressable>
              <Pressable style={s.glassBtnBack} onPress={() => navigation.goBack()}>
                <Text style={s.glassBtnIcon}>✕</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </LinearGradient>

        {/* Avatar + name */}
        <View style={s.avatarRow}>
          <View style={s.avatarWrap}>
            <LinearGradient colors={gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatarGradient}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarInitial}>{userName[0]?.toUpperCase() ?? 'U'}</Text>
              )}
            </LinearGradient>
            <View style={s.onlineDot} />
          </View>
          <View style={s.nameCol}>
            <Text style={s.userName} numberOfLines={1}>{userName}</Text>
            <Text style={s.userEmail} numberOfLines={1}>{userEmail}</Text>
            <View style={s.badgeRow}>
              <View style={s.badgeBlue}>
                <Text style={s.badgeBlueText}>MonMap гишүүн</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats bar */}
        <View style={s.statsCard}>
          <StatItem value={bookingCount !== null ? String(bookingCount) : '—'} label="Захиалга" />
          <View style={s.statDivider} />
          <StatItem value={String(savedCount)} label="Хадгалсан" />
          <View style={s.statDivider} />
          <StatItem value={reviewCount !== null ? String(reviewCount) : '—'} label="Сэтгэгдэл" />
        </View>

        {/* Menu sections */}
        <View style={s.sections}>
          <SectionLabel label="Миний хэрэглээ" />
          <MenuCard items={[
            { icon: '📋', iconColor: colors.primary, label: 'Захиалгууд', subtitle: 'Идэвхтэй болон дууссан', onTap: () => navigation.navigate('Bookings') },
            { icon: '🔖', iconColor: colors.purple, label: 'Хадгалсан газрууд', subtitle: `${savedCount} газар хадгалсан`, onTap: () => navigation.navigate('SavedPlaces') },
            { icon: '⚙', iconColor: colors.sky, label: 'Тохиргоо', subtitle: 'Апп тохиргоо', onTap: () => navigation.navigate('Settings'), isLast: true },
          ]} />

          <SectionLabel label="Тусламж" />
          <MenuCard items={[
            { icon: '🎧', iconColor: colors.indigo, label: 'Холбоо барих', subtitle: 'Бидэнтэй холбогдоорой', onTap: () => navigation.navigate('Contact') },
            { icon: 'ℹ', iconColor: colors.textMuted, label: 'Тухай', subtitle: 'MonMap v1.0.0', onTap: () => navigation.navigate('About'), isLast: true },
          ]} />
        </View>

        {/* Sign out */}
        <Pressable onPress={handleSignOut} style={s.signOutBtn}>
          <Text style={s.signOutIcon}>⏏</Text>
          <Text style={s.signOutText}>Гарах</Text>
        </Pressable>

        <Text style={s.version}>MonMap v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.statItem}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

function MenuCard({ items }: { items: { icon: string; iconColor: string; label: string; subtitle?: string; onTap: () => void; isLast?: boolean }[] }) {
  return (
    <View style={s.menuCard}>
      {items.map((item, i) => (
        <Pressable key={i} onPress={item.onTap} style={[s.menuItem, !item.isLast && s.menuItemBorder]}>
          <View style={[s.menuIconBox, { backgroundColor: `${item.iconColor}26` }]}>
            <Text style={s.menuIconText}>{item.icon}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.menuLabel}>{item.label}</Text>
            {item.subtitle && <Text style={s.menuSub}>{item.subtitle}</Text>}
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  banner: { height: 180, position: 'relative' },
  circle: { position: 'absolute', borderRadius: 999 },
  bannerActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  glassBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  glassBtnBack: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  glassBtnIcon: { color: '#fff', fontSize: 14 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -36, paddingBottom: 0 },
  avatarWrap: { position: 'relative' },
  avatarGradient: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  avatarImg: { width: 66, height: 66, borderRadius: 19 },
  avatarInitial: { color: '#fff', fontSize: 26, fontWeight: '800' },
  onlineDot: { position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: colors.bg },
  nameCol: { flex: 1, marginLeft: 12, paddingBottom: 4 },
  userName: { color: colors.text, fontSize: 20, fontWeight: '800' },
  userEmail: { color: colors.textSec, fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badgeBlue: { backgroundColor: `${colors.primary}2E`, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeBlueText: { color: '#60A5FA', fontSize: 10, fontWeight: '600' },
  statsCard: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 24,
    backgroundColor: colors.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.textSec, fontSize: 11, marginTop: 3 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },
  sections: { paddingHorizontal: 16, marginTop: 24, gap: 8 },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 8 },
  menuCard: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  menuItemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  menuIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuIconText: { fontSize: 15 },
  menuLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  menuSub: { color: colors.textSec, fontSize: 11, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 20 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 20, height: 52,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    gap: 8,
  },
  signOutIcon: { fontSize: 16 },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  version: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
