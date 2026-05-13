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

// Fire a short haptic burst on terminal payment states.
// We use the built-in Vibration API (no extra dependency) — `expo-haptics`
// would give finer-grained taptic patterns on iOS, but Vibration covers the
// 95% case across both platforms and avoids touching package.json.
//   pattern:
//     success → double-tap (40ms, gap 80ms, 60ms) — "ding-ding" celebration
//     failure → single longer pulse (180ms)        — "uh-oh"
//     expired → single short pulse (90ms)          — neutral notification
// iOS only vibrates the full pattern when the device's Ring/Silent switch is
// set to Ring; Vibration is a no-op otherwise — that's a platform limitation,
// not a bug. Web (react-native-web) returns immediately, also a no-op.
function hapticPaymentResult(kind: 'success' | 'failed' | 'expired') {
  try {
    if (Platform.OS === 'web') return;
    if (kind === 'success')      Vibration.vibrate([0, 40, 80, 60]);
    else if (kind === 'failed')  Vibration.vibrate(180);
    else                         Vibration.vibrate(90);
  } catch {
    // Vibration permission denied or unsupported — silent no-op.
  }
}

const C = {
  bg:       '#111520',
  surface:  '#0D1220',
  border:   'rgba(255,255,255,0.10)',
  text:     'rgba(255,255,255,0.95)',
  textSec:  'rgba(255,255,255,0.50)',
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

    // Countdown timer
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

    // Poll payment status every 3 seconds
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
        // Network error — keep polling
      }
    }, 3000);

    return clearIntervals;
  }, [visible, paymentIntent.paymentId, paymentIntent.holdExpiresAt]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={s.root}>
        {screen === 'qr' && (
          <>
            <View style={s.header}>
              <Text style={s.title}>QPay төлбөр</Text>
              <TouchableOpacity onPress={onCancel} hitSlop={12}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            <View style={s.amountRow}>
              <Text style={s.amountLabel}>Баталгааны төлбөр</Text>
              <Text style={s.amount}>₮{paymentIntent.amount.toLocaleString()}</Text>
            </View>

            <View style={s.timerRow}>
              <Ionicons name="time-outline" size={16} color={secondsLeft < 60 ? C.red : C.amber} />
              <Text style={[s.timer, secondsLeft < 60 && { color: C.red }]}>
                {mm}:{ss} дотор төлнө үү
              </Text>
            </View>

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

            {paymentIntent.qpayUrls.length > 0 && (
              <>
                <Text style={s.bankLabel}>Эсвэл банкаа сонгоно уу</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.bankScroll}
                >
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
                </ScrollView>
              </>
            )}

            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelText}>Цуцлах</Text>
            </TouchableOpacity>
          </>
        )}

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
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
  },
  amountRow: {
    alignItems: 'center',
    marginBottom: 12,
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
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 24,
  },
  timer: {
    fontSize: 14,
    fontWeight: '600',
    color: C.amber,
  },
  qrWrap: {
    alignSelf: 'center',
    width: 224,
    height: 224,
    borderRadius: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    padding: 8,
  },
  qrImage: {
    width: 208,
    height: 208,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: C.textSec,
    marginBottom: 24,
  },
  bankLabel: {
    fontSize: 13,
    color: C.textSec,
    marginBottom: 12,
    textAlign: 'center',
  },
  bankScroll: {
    paddingHorizontal: 4,
    gap: 12,
    paddingBottom: 4,
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
  cancelBtn: {
    marginTop: 24,
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
