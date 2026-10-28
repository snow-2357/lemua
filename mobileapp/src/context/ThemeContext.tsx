import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Alert } from 'react-native';
import { loadDarkTheme, saveDarkTheme } from '../services/themeStorage';
import { darkColors, lightColors, type AppTheme } from '../styles/theme';

type ThemeContextValue = AppTheme & {
  isThemeLoaded: boolean;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [isDark, setIsDark] = useState(false);
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void loadDarkTheme()
      .then((savedValue) => {
        if (isMounted) setIsDark(savedValue);
      })
      .catch((error: unknown) => {
        Alert.alert(
          'Could not load appearance',
          error instanceof Error ? error.message : 'The saved theme could not be restored.',
        );
      })
      .finally(() => {
        if (isMounted) setIsThemeLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleTheme = useCallback(async () => {
    if (!isThemeLoaded) return;
    const nextValue = !isDark;
    try {
      await saveDarkTheme(nextValue);
      setIsDark(nextValue);
    } catch (error) {
      Alert.alert(
        'Could not save appearance',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [isDark, isThemeLoaded]);

  const value = useMemo(
    () => ({
      isDark,
      isThemeLoaded,
      colors: isDark ? darkColors : lightColors,
      toggleTheme,
    }),
    [isDark, isThemeLoaded, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useAppTheme must be used within a ThemeProvider.');
  }

  return theme;
}
