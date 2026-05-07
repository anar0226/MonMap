import React, { useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const SITE_KEY = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY ?? '';

type Props = {
  visible: boolean;
  onSolved: (token: string) => void;
  onCancel: () => void;
};

// Self-contained hCaptcha challenge in a WebView. Returns the solve token
// to the caller; cancellation closes without a token. We deliberately give
// the WebView its own document (no remote URL) so the JS bridge contract is
// fully under our control.
export default function HCaptchaModal({ visible, onSolved, onCancel }: Props) {
  const webRef = useRef<WebView>(null);

  const html = useMemo(() => buildChallengeHtml(SITE_KEY), []);

  function onMessage(e: WebViewMessageEvent) {
    const raw = e.nativeEvent.data;
    if (!raw) return;
    let parsed: { type?: string; token?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.type === 'token' && parsed.token) {
      onSolved(parsed.token);
    } else if (parsed.type === 'closed' || parsed.type === 'error') {
      onCancel();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Хүний баталгаажуулалт</Text>
            <Pressable onPress={onCancel} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSec} />
            </Pressable>
          </View>
          {SITE_KEY ? (
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html, baseUrl: 'https://hcaptcha.invalid' }}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              style={s.web}
            />
          ) : (
            <View style={s.errorBox}>
              <Text style={s.errorText}>
                EXPO_PUBLIC_HCAPTCHA_SITE_KEY тохируулаагүй байна.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function buildChallengeHtml(siteKey: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no" />
<style>
  html,body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100%;}
  body{font-family:-apple-system,Roboto,Helvetica,sans-serif;}
  #c{padding:8px;}
</style>
<script src="https://js.hcaptcha.com/1/api.js?render=explicit&onload=onLoad" async defer></script>
<script>
  var SITE_KEY = ${JSON.stringify(siteKey)};
  function send(payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (_) {}
  }
  function onLoad() {
    try {
      window.hcaptcha.render('c', {
        sitekey: SITE_KEY,
        size: 'normal',
        callback: function(token) { send({ type: 'token', token: token }); },
        'error-callback': function() { send({ type: 'error' }); },
        'close-callback': function() { send({ type: 'closed' }); },
      });
    } catch (e) {
      send({ type: 'error' });
    }
  }
</script>
</head><body><div id="c"></div></body></html>`;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 14, paddingBottom: 24,
    minHeight: 420,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 10,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  web: { flex: 1, backgroundColor: 'transparent' },
  errorBox: { padding: 24 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
