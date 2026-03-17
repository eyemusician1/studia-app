import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export type ToastType = 'success' | 'error' | 'info';

type AppToastProps = {
  visible: boolean;
  type: ToastType;
  title: string;
  message: string;
  onHide: () => void;
  duration?: number;
};

const typeConfig: Record<ToastType, { icon: keyof typeof Feather.glyphMap; border: string }> = {
  success: { icon: 'check-circle', border: '#34C78A' },
  error: { icon: 'alert-triangle', border: '#EF4444' },
  info: { icon: 'info', border: '#3B6FD4' },
};

export default function AppToast({ visible, type, title, message, onHide, duration = 3200 }: AppToastProps) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const translateY = useRef(new Animated.Value(-24)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          tension: 110,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      timeout = setTimeout(() => {
        onHide();
      }, duration);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -24,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [visible, duration, onHide, opacity, translateY]);

  const accentColor = type === 'success' ? colors.success : type === 'error' ? colors.danger : colors.accent;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.toast,
          {
            backgroundColor: colors.cardBg,
            borderColor: isDark ? typeConfig[type].border + '66' : typeConfig[type].border + '44',
            shadowColor: isDark ? '#000000' : '#0F172A',
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: accentColor + (isDark ? '1F' : '14') }]}>
          <Feather name={typeConfig[type].icon} size={16} color={accentColor} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textDim }]} numberOfLines={3}>{message}</Text>
        </View>
        <TouchableOpacity onPress={onHide} style={styles.closeBtn}>
          <Feather name="x" size={15} color={colors.textDim} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    left: 16,
    right: 16,
    zIndex: 999,
  },
  toast: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
