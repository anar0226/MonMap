import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const TopoBG = ({ color }: { color: string }) => (
  <View style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 800">
      <G fill="none" stroke={color} strokeWidth="1">
        <Path d="M-50 200 Q100 140 200 180 T450 160" />
        <Path d="M-50 240 Q100 180 200 220 T450 200" />
        <Path d="M-50 280 Q100 220 200 260 T450 240" />
        <Path d="M-50 320 Q100 260 200 300 T450 280" />
        <Path d="M-50 360 Q100 300 200 340 T450 320" />
        <Path d="M-50 400 Q100 340 200 380 T450 360" />
        <Path d="M-50 440 Q100 380 200 420 T450 400" />
        <Path d="M-50 480 Q100 420 200 460 T450 440" />
        <Path d="M-50 520 Q100 460 200 500 T450 480" />
        <Path d="M-50 560 Q100 500 200 540 T450 520" />
        <Path d="M-50 600 Q100 540 200 580 T450 560" />
        <Path d="M-50 640 Q100 580 200 620 T450 600" />
      </G>
    </Svg>
  </View>
);

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

interface MarkProps {
  size?: number;
  color?: string;
  dot?: string;
  pinAnim: Animated.Value;
  dotAnim: Animated.Value;
}

const Mark = ({ size = 96, color = '#0053A3', dot = 'white', pinAnim, dotAnim }: MarkProps) => {
  const k = size / 72;
  const cx = 36 * k;
  const cy = 30 * k;
  const outerR = 22 * k;
  const innerR = 7 * k;
  const contourR = 14 * k;
  const tailY = 66 * k;
  const tailW = 6 * k;

  const pinTranslateY = pinAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [-24, 2, 0]
  });
  
  const pinScale = pinAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.85, 1, 1]
  });
  
  const pinOpacity = pinAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0, 1, 1]
  });

  const dotScale = dotAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.4, 1.15, 1]
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <AnimatedG 
        origin={`${cx}, ${cy}`} 
        opacity={pinOpacity as any}
        transform={[{ translateY: pinTranslateY }, { scale: pinScale }] as any}
      >
        <Circle cx={cx} cy={cy} r={outerR} fill={color} />
        <Path
          d={`M ${cx - tailW} ${cy + outerR * 0.6}
              Q ${cx - outerR * 0.8} ${cy + outerR * 1.4} ${cx} ${tailY}
              Q ${cx + outerR * 0.8} ${cy + outerR * 1.4} ${cx + tailW} ${cy + outerR * 0.6}
              A ${outerR} ${outerR} 0 0 0 ${cx - tailW} ${cy + outerR * 0.6} Z`}
          fill={color}
        />
        <Circle
          cx={cx} cy={cy} r={contourR}
          stroke="white" strokeWidth={1.6 * k}
          strokeOpacity="0.35"
          strokeDasharray={`${contourR * Math.PI * 1.4} ${contourR * Math.PI * 0.6}`}
          strokeDashoffset={`${-contourR * Math.PI * 0.15}`}
          strokeLinecap="round"
          fill="none"
        />
        <AnimatedCircle 
          cx={cx} cy={cy} r={innerR} fill={dot} 
          origin={`${cx}, ${cy}`} 
          opacity={dotAnim as any}
          transform={[{ scale: dotScale }] as any}
        />
      </AnimatedG>
    </Svg>
  );
};

const Rings = ({ color }: { color: string }) => {
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createLoop = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2400,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          })
        ])
      ).start();
    };

    createLoop(anim1, 0);
    createLoop(anim2, 600);
    createLoop(anim3, 1200);
  }, []);

  const renderRing = (anim: Animated.Value) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        borderWidth: 1.5,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.4] }) }],
      }}
    />
  );

  return (
    <>
      {renderRing(anim1)}
      {renderRing(anim2)}
      {renderRing(anim3)}
    </>
  );
};

export default function SplashScreen({ onFinish }: { onFinish?: () => void }) {
  const pinAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const wordAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(pinAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        useNativeDriver: true,
      }),
      Animated.timing(dotAnim, {
        toValue: 1,
        duration: 600,
        delay: 500,
        easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        useNativeDriver: true,
      }),
      Animated.timing(wordAnim, {
        toValue: 1,
        duration: 700,
        delay: 900,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 2400,
        delay: 400,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
        useNativeDriver: false,
      }),
    ]).start(() => {
      if (onFinish) {
        setTimeout(onFinish, 200);
      }
    });
  }, []);

  const wordTranslateY = wordAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0]
  });

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const markColor = '#0053A3';
  const dotColor = 'white';
  const ringColor = 'rgba(0,83,163,0.40)';
  const topoColor = 'rgba(255,255,255,0.04)';

  return (
    <View style={styles.container}>
      <TopoBG color={topoColor} />

      <View style={styles.centerStack}>
        <View style={styles.markContainer}>
          <Rings color={ringColor} />
          <Mark size={104} color={markColor} dot={dotColor} pinAnim={pinAnim} dotAnim={dotAnim} />
        </View>

        <Animated.View style={[styles.wordContainer, { opacity: wordAnim, transform: [{ translateY: wordTranslateY }] }]}>
          <Text style={styles.wordmark}>
            Mon<Text style={{ fontWeight: '300' }}>Map</Text>
          </Text>
          <Text style={styles.tagline}>УЛААНБААТАР</Text>
        </Animated.View>
      </View>

      <View style={styles.bottomStack}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
        <Text style={styles.loadingText}>Газрын зураг ачаалж байна…</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>V 1.0 · MONMAP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStack: {
    alignItems: 'center',
    transform: [{ translateY: -40 }],
  },
  markContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordContainer: {
    alignItems: 'center',
    marginTop: 28,
  },
  wordmark: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.76,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 44,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2.16,
    marginTop: 4,
  },
  bottomStack: {
    position: 'absolute',
    bottom: 80,
    left: 64,
    right: 64,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#1a6fc4',
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    width: '100%',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.4,
  },
});
