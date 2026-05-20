import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import type { PaymentIntentData } from '../hooks/useBooking';

function hapticPaymentResult(kind: 'success' | 'failed' | 'expired') {
  try {
    if (Platform.OS === 'web') return;
    if (kind === 'success')      Vibration.vibrate([0, 40, 80, 60]);
    else if (kind === 'failed')  Vibration.vibrate(180);
    else                         Vibration.vibrate(90);
  } catch {
    // no-op
  }
}

const C = {
  bg:       '#111520',
  surface:  '#0D1220',
  border:   'rgba(255,255,255,0.10)',
  borderSub:'rgba(255,255,255,0.06)',
  text:     'rgba(255,255,255,0.95)',
  textSec:  'rgba(255,255,255,0.50)',
  textMuted:'rgba(255,255,255,0.30)',
  amber:    '#FBB824',
  green:    '#10B981',
  red:      '#EF4444',
  primary:  '#0053A3',
};

interface Props {
  visible: boolean;
  paymentIntent: PaymentIntentData;
  onSuccess: (bookingId: string) => void;
  onExpired: () => void;
  onCancel: () => void;
}

type ScreenState = 'qr' | 'checking' | 'success' | 'failed' | 'expired';

export default function PaymentModal({ visible, paymentIntent, onSuccess, onExpired, onCancel }: Props) {
  const [screen, setScreen] = useState<ScreenState>('qr');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearIntervals = useCallback(() => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!visible) { clearIntervals(); return; }

    setScreen('qr');

    const updateCountdown = () => {
      const secs = Math.max(0, Math.floor((new Date(paymentIntent.holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(secs);
      if (secs <= 0) {
        clearIntervals();
        hapticPaymentResult('expired');
        setScreen('expired');
        onExpired();
      }
    };
    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-payment-status', {
          body: { paymentId: paymentIntent.paymentId },
        });
        if (error || !data) return;

        if (data.status === 'paid') {
          clearIntervals();
          hapticPaymentResult('success');
          setScreen('success');
          setTimeout(() => onSuccess(data.bookingId), 1500);
        } else if (data.status === 'failed') {
          clearIntervals();
          hapticPaymentResult('failed');
          setScreen('failed');
        } else if (data.status === 'hold_expired') {
          clearIntervals();
          hapticPaymentResult('expired');
          setScreen('expired');
          onExpired();
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return clearIntervals;
  }, [visible, paymentIntent.paymentId, paymentIntent.holdExpiresAt]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const depositAmount = paymentIntent.amount;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={s.root}>

        {/* ── QR / bank-picker screen ───────────────────────────── */}
        {screen === 'qr' && (
          <>
            {/* Header — always visible, not inside the scroll */}
            <View style={s.header}>
              <Text style={s.title}>QPay төлбөр</Text>
              <TouchableOpacity onPress={onCancel} hitSlop={12}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            {/* Scrollable body — shrinks to content, no empty dead zone */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Service chip — shows what was booked */}
              {paymentIntent.serviceName && (
                <View style={s.serviceChip}>
                  <Ionicons name="cut-outline" size={13} color={C.textSec} />
                  <Text style={s.serviceChipText}>{paymentIntent.serviceName}</Text>
                </View>
              )}

              {/* Amount — show booking fee only */}
              <View style={s.amountBlock}>
                <Text style={s.amountLabel}>Баталгааны төлбөр</Text>
                <Text style={s.amount}>₮{depositAmount.toLocaleString()}</Text>
              </View>

              {/* Countdown */}
              <View style={s.timerRow}>
                <Ionicons name="time-outline" size={16} color={secondsLeft < 60 ? C.red : C.amber} />
                <Text style={[s.timer, secondsLeft < 60 && { color: C.red }]}>
                  {mm}:{ss} дотор төлнө үү
                </Text>
              </View>

              {/* QR code */}
              {paymentIntent.qpayQrImage ? (
                <View style={s.qrWrap}>
                  <Image
                    source={{ uri: `data:image/png;base64,${paymentIntent.qpayQrImage}` }}
                    style={s.qrImage}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={s.qrWrap}>
                  <ActivityIndicator color={C.amber} />
                </View>
              )}

              <Text style={s.hint}>Банкны аппаа нээж QR уншуулна уу</Text>

              {/* Bank deep-links */}
              {paymentIntent.qpayUrls.length > 0 && (
                <>
                  <Text style={s.bankLabel}>Эсвэл банкаа сонгоно уу</Text>
                  <View style={s.bankGrid}>
                    {paymentIntent.qpayUrls.map((bank, i) => (
                      <TouchableOpacity
                        key={i}
                        style={s.bankBtn}
                        onPress={() => Linking.openURL(bank.link).catch(() => {})}
                      >
                        {bank.logo ? (
                          <Image source={{ uri: bank.logo }} style={s.bankLogo} resizeMode="contain" />
                        ) : (
                          <Ionicons name="card-outline" size={28} color={C.text} />
                        )}
                        <Text style={s.bankName} numberOfLines={2}>{bank.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            {/* Cancel — pinned at bottom, never scrolls away */}
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelText}>Цуцлах</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Other screens ─────────────────────────────────────── */}
        {screen === 'checking' && (
          <View style={s.centeredContent}>
            <ActivityIndicator size="large" color={C.amber} />
            <Text style={s.statusText}>Төлбөр шалгаж байна...</Text>
          </View>
        )}

        {screen === 'success' && (
          <View style={s.centeredContent}>
            <View style={s.successCircle}>
              <Ionicons name="checkmark" size={52} color="#fff" />
            </View>
            <Text style={s.statusText}>Төлбөр амжилттай!</Text>
            <Text style={s.statusSub}>Захиалга баталгаажлаа</Text>
          </View>
        )}

        {screen === 'failed' && (
          <View style={s.centeredContent}>
            <View style={s.failCircle}>
              <Ionicons name="close" size={52} color="#fff" />
            </View>
            <Text style={s.statusText}>Төлбөр амжилтгүй боллоо</Text>
            <Text style={s.statusSub}>Дахин оролдох эсвэл өөр банк сонгоно уу</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => setScreen('qr')}>
              <Text style={s.retryText}>Дахин оролдох</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'expired' && (
          <View style={s.centeredContent}>
            <View style={s.expiredCircle}>
              <Ionicons name="time-outline" size={52} color="#fff" />
            </View>
            <Text style={s.statusText}>Захиалгын цаг дууслаа</Text>
            <Text style={s.statusSub}>
              Слотны захиалгын хугацаа дууссан.{'\n'}Та дахин цаг сонгоно уу.
            </Text>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelText}>Буцах</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
  },

  // Scrollable area — no fixed height; shrinks to content
  scrollContent: {
    paddingBottom: 8,
    alignItems: 'center',
  },

  // Service name chip at top
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  serviceChipText: {
    fontSize: 13,
    color: C.textSec,
    fontWeight: '500',
  },

  // Amount block
  amountBlock: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  amountLabel: {
    fontSize: 13,
    color: C.textSec,
    marginBottom: 4,
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
    color: C.amber,
    letterSpacing: -0.5,
  },

  // Cost breakdown rows
  costBreakdown: {
    marginTop: 12,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.borderSub,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costKey: {
    fontSize: 12,
    color: C.textMuted,
  },
  costVal: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },

  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  timer: {
    fontSize: 14,
    fontWeight: '600',
    color: C.amber,
  },

  qrWrap: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    padding: 8,
  },
  qrImage: {
    width: 204,
    height: 204,
  },

  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: C.textSec,
    marginBottom: 20,
  },

  bankLabel: {
    fontSize: 13,
    color: C.textSec,
    marginBottom: 10,
    textAlign: 'center',
    alignSelf: 'flex-start',
    width: '100%',
  },

  // Grid replaces the horizontal ScrollView — all banks visible, no empty strip
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 10,
    width: '100%',
  },
  bankBtn: {
    alignItems: 'center',
    width: 76,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  bankLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  bankName: {
    fontSize: 10,
    color: C.text,
    textAlign: 'center',
    lineHeight: 13,
  },

  // Cancel pinned at the bottom of the screen
  cancelBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelText: {
    fontSize: 15,
    color: C.textSec,
  },

  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  statusSub: {
    fontSize: 14,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 20,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.green,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  failCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  expiredCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.amber,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: C.primary,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
