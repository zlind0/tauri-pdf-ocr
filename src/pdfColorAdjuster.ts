import type { Theme, ThemeColors } from './themeManager';

/**
 * 解析颜色字符串为RGB值
 * @param color 颜色字符串（格式：#rrggbb 或 rgb(r, g, b)）
 * @returns RGB值数组 [r, g, b]
 */
const parseColor = (color: string): [number, number, number] => {
  if (color.startsWith('#')) {
    // 处理十六进制颜色
    const hex = color.substring(1);
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  } else if (color.startsWith('rgb')) {
    // 处理rgb()格式
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3])
      ];
    }
  }
  // 默认返回白色
  return [255, 255, 255];
};

/**
 * 检查图片是否主要由黑白灰色构成
 * @param imageData 图像数据
 * @param threshold 色度阈值（0-100%，默认10%）
 * @returns 是否为黑白灰色图片
 */
const isGrayscaleImage = (imageData: ImageData, threshold: number = 10): boolean => {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  let colorfulPixels = 0;
  
  // 采样检查，避免处理过多像素
  const sampleRate = Math.max(1, Math.floor(totalPixels / 10000)); // 最多检查10000个像素
  let checkedPixels = 0;
  
  for (let i = 0; i < data.length; i += 4 * sampleRate) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // 计算色度（饱和度的一种简化计算）
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    // 如果色度超过阈值，认为是彩色像素
    if (delta > (255 * threshold / 100)) {
      colorfulPixels++;
    }
    
    checkedPixels++;
  }
  
  // 如果彩色像素比例小于阈值，认为是黑白灰色图片
  const colorfulRatio = (colorfulPixels / checkedPixels) * 100;
  return colorfulRatio < threshold;
};

/**
 * 将颜色值限制为不超过指定的背景色亮度
 * @param imageData 图像数据
 * @param maxColor 最大允许颜色（如主题背景色）
 */
const applyBrownThemeFilter = (imageData: ImageData, maxColor: string): void => {
  const { data } = imageData;
  
  // 解析最大颜色值
  const [maxR, maxG, maxB] = parseColor(maxColor);
  
  // 对每个像素应用限制
  for (let i = 0; i < data.length; i += 4) {
    // 取每个颜色分量与最大颜色分量的最小值
    data[i] = Math.min(data[i], maxR);     // R
    data[i + 1] = Math.min(data[i + 1], maxG); // G
    data[i + 2] = Math.min(data[i + 2], maxB); // B
    // Alpha通道保持不变
  }
};

/**
 * 反转黑白灰色图片的颜色，并限制在指定范围内
 * @param imageData 图像数据
 * @param minColor 最小颜色值（深色主题背景色）
 * @param maxColor 最大颜色值（深色主题文字色）
 */
const invertGrayscaleImageWithLimits = (imageData: ImageData, minColor: string, maxColor: string): void => {
  const { data } = imageData;
  
  // 解析最小和最大颜色值
  const [minR, minG, minB] = parseColor(minColor);
  const [maxR, maxG, maxB] = parseColor(maxColor);
  
  for (let i = 0; i < data.length; i += 4) {
    // 反转RGB值
    let r = 255 - data[i];
    let g = 255 - data[i + 1];
    let b = 255 - data[i + 2];
    
    // 限制颜色范围
    r = Math.max(minR, Math.min(maxR, r));
    g = Math.max(minG, Math.min(maxG, g));
    b = Math.max(minB, Math.min(maxB, b));
    
    // 设置回图像数据
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    // Alpha通道保持不变
  }
};

/**
 * 调整PDF页面颜色以适配主题
 * @param canvas Canvas元素
 * @param theme 当前主题
 * @param themeColors 主题颜色配置
 */
export const adjustPdfColors = (canvas: HTMLCanvasElement, theme: Theme, themeColors: ThemeColors): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const { width, height } = canvas;
  if (width === 0 || height === 0) return;
  
  try {
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, width, height);
    
    if (theme === 'sepia') {
      // 棕色主题：限制颜色亮度不超过背景色
      applyBrownThemeFilter(imageData, themeColors.primaryBg);
    } else if (theme === 'dark') {
      // 深色主题：检查是否为黑白灰色图片，如果是则反转颜色并限制范围
      if (isGrayscaleImage(imageData)) {
        invertGrayscaleImageWithLimits(imageData, themeColors.primaryBg, themeColors.textColor);
      }
      // 彩色图片不做修改
    }
    
    // 将处理后的图像数据放回canvas
    ctx.putImageData(imageData, 0, 0);
  } catch (error) {
    console.warn('Failed to adjust PDF colors:', error);
  }
};