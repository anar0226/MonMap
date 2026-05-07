import React, { useEffect, useState } from 'react';
import {
  Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../context/SupabaseContext';
import { colors, gradientCard, gradientPrimary } from '../../theme';
import type { AppStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Settings'> };

export default function SettingsScreen({ navigation }: Props) {
  const { session } = useSupabase();
  const user = session?.user;
  const userName = user?.user_metadata?.full_name ?? 'Хэрэглэгч';
  const userEmail = user?.email ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url ?? null;

  const [pushNotif, setPushNotif] = useState(true);
  const [promoNotif, setPromoNotif] = useState(true);
  const [orderNotif, setOrderNotif] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Load persisted toggle state
  useEffect(() => {
    AsyncStorage.getItem('monmap.notif_prefs').then(raw => {
      if (raw) {
        try {
          const prefs = JSON.parse(raw);
          if (typeof prefs.push === 'boolean') setPushNotif(prefs.push);
          if (typeof prefs.promo === 'boolean') setPromoNotif(prefs.promo);
          if (typeof prefs.order === 'boolean') setOrderNotif(prefs.order);
        } catch {}
      }
    });
  }, []);

  // Persist when any toggle changes
  function setAndPersist(key: 'push' | 'promo' | 'order', value: boolean) {
    const setters = { push: setPushNotif, promo: setPromoNotif, order: setOrderNotif };
    setters[key](value);
    AsyncStorage.getItem('monmap.notif_prefs').then(raw => {
      const prefs = raw ? JSON.parse(raw) : {};
      prefs[key] = value;
      AsyncStorage.setItem('monmap.notif_prefs', JSON.stringify(prefs));
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function performDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw error;
      // Auth user is gone server-side; sign out clears the local session.
      await supabase.auth.signOut();
    } catch (e: any) {
      setDeleting(false);
      Alert.alert(
        'Алдаа',
        e?.message ?? 'Данс устгахад алдаа гарлаа. Дахин оролдоно уу.',
      );
    }
  }

  function confirmDeleteAccount() {
    if (deleting) return;
    Alert.alert(
      'Данс устгах',
      'Та данснаа устгахдаа итгэлтэй байна уу? Энэ үйлдлийг буцааж болохгүй.',
      [
        { text: 'Болих', style: 'cancel' },
        { text: 'Устгах', style: 'destructive', onPress: performDeleteAccount },
      ],
    );
  }

  return (
    <View style={s.flex}>
      <LinearGradient colors={gradientCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerInner}>
            <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
              <Text style={s.backIcon}>←</Text>
            </Pressable>
            <Text style={s.headerTitle}>Тохиргоо</Text>
          </View>
          <View style={s.profileCard}>
            <LinearGradient colors={gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.profileAvatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.profileAvatarImg} />
              ) : (
                <Text style={s.profileAvatarInitial}>{userName[0]?.toUpperCase() ?? 'U'}</Text>
              )}
            </LinearGradient>
            <View style={s.profileInfo}>
              <Text style={s.profileName}>{userName}</Text>
              <Text style={s.profileEmail}>{userEmail || 'Нэвтрэх шаардлагатай'}</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={s.flex} contentContainerStyle={s.scroll}>
        <SectionLabel label="Мэдэгдэл" />
        <MenuCard>
          <MenuItem icon="🔔" iconColor={colors.primary} label="Push мэдэгдэл" onTap={() => {}} trailing={<Toggle value={pushNotif} onChanged={(v) => setAndPersist('push', v)} />} />
          <MenuItem icon="🏷" iconColor={colors.purple} label="Урамшуулал" onTap={() => {}} trailing={<Toggle value={promoNotif} onChanged={(v) => setAndPersist('promo', v)} />} />
          <MenuItem icon="📄" iconColor={colors.sky} label="Захиалгын мэдэгдэл" onTap={() => {}} trailing={<Toggle value={orderNotif} onChanged={(v) => setAndPersist('order', v)} />} isLast />
        </MenuCard>

        <SectionLabel label="Тусламж" />
        <MenuCard>
          <MenuItem icon="🎧" iconColor={colors.indigo} label="Тусламжийн төв" onTap={() => navigation.navigate('Help')} />
          <MenuItem icon="💬" iconColor={colors.success} label="Санал хүсэлт" onTap={() => navigation.navigate('Feedback')} isLast />
        </MenuCard>

        <SectionLabel label="Хууль зүйн" />
        <MenuCard>
          <MenuItem icon="📜" iconColor={colors.textSec} label="Үйлчилгээний нөхцөл" onTap={() => navigation.navigate('Legal', { kind: 'terms' })} />
          <MenuItem icon="🔒" iconColor={colors.textSec} label="Нууцлалын бодлого" onTap={() => navigation.navigate('Legal', { kind: 'privacy' })} isLast />
        </MenuCard>

        <MenuCard>
          <MenuItem icon="⏏" iconColor={colors.danger} label="Гарах" onTap={handleSignOut} isDanger />
          <MenuItem icon="🗑" iconColor={colors.danger} label={deleting ? 'Устгаж байна…' : 'Данс устгах'} subtitle="Энэ үйлдлийг буцааж болохгүй" onTap={confirmDeleteAccount} isDanger isLast />
        </MenuCard>

        <Text style={s.version}>MonMap v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function Toggle({ value, onChanged }: { value: boolean; onChanged: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChanged(!value)} style={[s.toggle, { backgroundColor: value ? colors.primary : 'rgba(255,255,255,0.12)' }]}>
      <Animated.View style={[s.toggleThumb, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

function MenuCard({ children }: { children: React.ReactNode }) {
  return <View style={s.menuCard}>{children}</View>;
}

function MenuItem({
  icon, iconColor, label, subtitle, onTap, isLast, isDanger, trailing,
}: {
  icon: string; iconColor: string; label: string; subtitle?: string;
  onTap: () => void; isLast?: boolean; isDanger?: boolean; trailing?: React.ReactNode;
}) {
  const effectiveColor = isDanger ? colors.danger : iconColor;
  return (
    <Pressable onPress={onTap} style={[s.menuItem, !isLast && s.menuItemBorder]}>
      <View style={[s.menuIconBox, { backgroundColor: `${effectiveColor}24` }]}>
        <Text style={s.menuIconText}>{icon}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[s.menuLabel, isDanger && { color: colors.danger }]}>{label}</Text>
        {subtitle && <Text style={s.menuSub}>{subtitle}</Text>}
      </View>
      {trailing ?? (!isDanger ? <Text style={s.chevron}>›</Text> : null)}
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  headerInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10 },
  backBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: colors.textSec, fontSize: 17 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  profileAvatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  profileAvatarImg: { width: 42, height: 42, borderRadius: 13 },
  profileAvatarInitial: { color: '#fff', fontSize: 17, fontWeight: '800' },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  profileEmail: { color: colors.textSec, fontSize: 11, marginTop: 1 },
  scroll: { paddingTop: 16, paddingBottom: 80 },
  sectionLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '600', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8, marginTop: 8 },
  menuCard: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  menuItemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  menuIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuIconText: { fontSize: 14 },
  menuLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  menuSub: { color: colors.textSec, fontSize: 11, marginTop: 1.5 },
  chevron: { color: colors.textMuted, fontSize: 20 },
  toggle: { width: 42, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  version: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
