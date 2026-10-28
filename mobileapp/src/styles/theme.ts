export type AppTheme = {
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    elevated: string;
    text: string;
    secondaryText: string;
    mutedText: string;
    border: string;
    accent: string;
    accentText: string;
    avatar: string;
    iconSurface: string;
    waveform: string;
  };
};

export const lightColors: AppTheme['colors'] = {
  background: '#f8f6f1',
  surface: '#f0ece4',
  elevated: '#fffefa',
  text: '#2d2a24',
  secondaryText: '#777168',
  mutedText: '#898277',
  border: '#e9e5dd',
  accent: '#3e4a40',
  accentText: '#fffefa',
  avatar: '#e9e2d5',
  iconSurface: '#e4ddd0',
  waveform: '#b6ad9e',
};

export const darkColors: AppTheme['colors'] = {
  background: '#11151b',
  surface: '#1c222b',
  elevated: '#242b35',
  text: '#f2f0eb',
  secondaryText: '#c0bdb5',
  mutedText: '#9a9da3',
  border: '#343b46',
  accent: '#c5ad83',
  accentText: '#17191d',
  avatar: '#343b43',
  iconSurface: '#303741',
  waveform: '#596371',
};
