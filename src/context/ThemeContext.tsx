// src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeType = 'light' | 'dark';

export const COLORS = {
  dark: {
    background: '#0C0D12',
    cardBg: '#181C25',
    sectionBg: 'rgba(255,255,255,0.03)',
    text: '#FFFFFF',
    textDim: 'rgba(255,255,255,0.4)',
    border: 'rgba(255,255,255,0.08)',
    accent: '#3B6FD4',
    accentDim: 'rgba(59,111,212,0.10)',
    danger: '#FF5252',
    dangerDim: 'rgba(255,82,82,0.10)',
    success: '#34C78A',
  },
  light: {
    background: '#F5F7FA',
    cardBg: '#FFFFFF',
    sectionBg: '#FFFFFF',
    text: '#111827',
    textDim: '#6B7280',
    border: '#E5E7EB',
    accent: '#3B6FD4',
    accentDim: 'rgba(59,111,212,0.15)',
    danger: '#EF4444',
    dangerDim: 'rgba(239,68,68,0.15)',
    success: '#10B981',
  }
};

type ThemeContextType = {
  theme: ThemeType;
  toggleTheme: () => void;
  colors: typeof COLORS.dark;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useColorScheme() as ThemeType;
  const [theme, setTheme] = useState<ThemeType>('dark'); 

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('@studia_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme);
      } else if (systemTheme) {
        setTheme(systemTheme);
      }
    };
    loadTheme();
  }, [systemTheme]);

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    await AsyncStorage.setItem('@studia_theme', newTheme);
  };

  const colors = COLORS[theme];

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};