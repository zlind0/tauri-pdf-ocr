export type Theme = 'light' | 'sepia' | 'dark';

export interface ThemeColors {
  // 主要背景色
  primaryBg: string;
  // 次要背景色
  secondaryBg: string;
  // 文字颜色
  textColor: string;
  // 边框颜色
  borderColor: string;
  // 按钮背景色
  buttonBg: string;
  // 按钮悬停背景色
  buttonHoverBg: string;
  // 按钮文字颜色
  buttonTextColor: string;
  // 面板背景色
  panelBg: string;
  // 面板文字颜色
  panelTextColor: string;
  // 高亮背景色
  highlightBg: string;
  // 高亮文字颜色
  highlightTextColor: string;
}

export const themes: Record<Theme, ThemeColors> = {
  light: {
    primaryBg: '#ffffff',
    secondaryBg: '#f8f9fa',
    textColor: '#000000',
    borderColor: '#ddd',
    buttonBg: '#ffffff',
    buttonHoverBg: '#f0f0f0',
    buttonTextColor: '#000000',
    panelBg: '#ffffff',
    panelTextColor: '#000000',
    highlightBg: '#e6f0ff',
    highlightTextColor: '#0066cc'
  },
  sepia: {
    primaryBg: '#f4f0e1',
    secondaryBg: '#e8e2d1',
    textColor: '#5b4636',
    borderColor: '#d1c7b5',
    buttonBg: '#f4f0e1',
    buttonHoverBg: '#e8e2d1',
    buttonTextColor: '#5b4636',
    panelBg: '#f4f0e1',
    panelTextColor: '#5b4636',
    highlightBg: '#d9cfc0',
    highlightTextColor: '#4a3a2d'
  },
  dark: {
    primaryBg: '#1e1e1e',
    secondaryBg: '#2d2d2d',
    textColor: '#e0e0e0',
    borderColor: '#444',
    buttonBg: '#333',
    buttonHoverBg: '#444',
    buttonTextColor: '#e0e0e0',
    panelBg: '#252526',
    panelTextColor: '#e0e0e0',
    highlightBg: '#2a3f5f',
    highlightTextColor: '#ffffff'
  }
};

export const getCurrentTheme = (): Theme => {
  const savedTheme = localStorage.getItem('theme') as Theme | null;
  return savedTheme && themes[savedTheme] ? savedTheme : 'light';
};

export const setTheme = (theme: Theme): void => {
  localStorage.setItem('theme', theme);
  applyTheme(theme);
};

export const applyTheme = (theme: Theme): void => {
  const colors = themes[theme];
  const root = document.documentElement;
  
  root.style.setProperty('--primary-bg', colors.primaryBg);
  root.style.setProperty('--secondary-bg', colors.secondaryBg);
  root.style.setProperty('--text-color', colors.textColor);
  root.style.setProperty('--border-color', colors.borderColor);
  root.style.setProperty('--button-bg', colors.buttonBg);
  root.style.setProperty('--button-hover-bg', colors.buttonHoverBg);
  root.style.setProperty('--button-text-color', colors.buttonTextColor);
  root.style.setProperty('--panel-bg', colors.panelBg);
  root.style.setProperty('--panel-text-color', colors.panelTextColor);
  root.style.setProperty('--highlight-bg', colors.highlightBg);
  root.style.setProperty('--highlight-text-color', colors.highlightTextColor);
};