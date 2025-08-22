import type { Theme, ThemeColors } from './themeManager';

// WebGL着色器源码
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  
  uniform sampler2D u_image;
  uniform int u_theme;
  uniform vec3 u_minColor;
  uniform vec3 u_maxColor;
  uniform float u_threshold;
  varying vec2 v_texCoord;
  
  // 检查是否为灰度图像
  bool isGrayscale(vec4 color) {
    float maxVal = max(max(color.r, color.g), color.b);
    float minVal = min(min(color.r, color.g), color.b);
    float delta = maxVal - minVal;
    return delta < (u_threshold / 100.0);
  }
  
  // 棕色主题过滤器
  vec4 applyBrownThemeFilter(vec4 color) {
    return vec4(
      min(color.r, u_maxColor.r),
      min(color.g, u_maxColor.g),
      min(color.b, u_maxColor.b),
      color.a
    );
  }
  
  // 深色主题反转过滤器
  vec4 invertGrayscaleImageWithLimits(vec4 color) {
    vec3 inverted = vec3(1.0) - color.rgb;
    vec3 limited = clamp(inverted, u_minColor, u_maxColor);
    return vec4(limited, color.a);
  }
  
  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    
    if (u_theme == 1) { // 棕色主题
      gl_FragColor = applyBrownThemeFilter(color);
    } else if (u_theme == 2) { // 深色主题
      if (isGrayscale(color)) {
        gl_FragColor = invertGrayscaleImageWithLimits(color);
      } else {
        gl_FragColor = color;
      }
    } else { // 默认/白色主题
      gl_FragColor = color;
    }
  }
`;

// 编译着色器
function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compilation error: ${gl.getShaderInfoLog(shader)}`);
  }
  
  return shader;
}

// 创建着色器程序
function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program linking error: ${gl.getProgramInfoLog(program)}`);
  }
  
  return program;
}

// 解析颜色字符串为RGB值 (0-1范围)
const parseColor = (color: string): [number, number, number] => {
  if (color.startsWith('#')) {
    // 处理十六进制颜色
    const hex = color.substring(1);
    return [
      parseInt(hex.substring(0, 2), 16) / 255,
      parseInt(hex.substring(2, 4), 16) / 255,
      parseInt(hex.substring(4, 6), 16) / 255
    ];
  } else if (color.startsWith('rgb')) {
    // 处理rgb()格式
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return [
        parseInt(match[1]) / 255,
        parseInt(match[2]) / 255,
        parseInt(match[3]) / 255
      ];
    }
  }
  // 默认返回白色
  return [1.0, 1.0, 1.0];
};

// 主题映射到数字
const themeMap: Record<Theme, number> = {
  'light': 0,
  'sepia': 1,
  'dark': 2
};

// 全局WebGL资源
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let texCoordBuffer: WebGLBuffer | null = null;
let texture: WebGLTexture | null = null;
let tempCanvas: HTMLCanvasElement | null = null;
let framebuffer: WebGLFramebuffer | null = null;
let renderbuffer: WebGLRenderbuffer | null = null;

// 初始化WebGL上下文和程序
function initWebGL(canvasWidth: number, canvasHeight: number): boolean {
  try {
    // 创建临时canvas用于WebGL操作
    tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    
    const tempGl = tempCanvas.getContext('webgl') || tempCanvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (!tempGl) {
      return false;
    }
    gl = tempGl;
    
    // 创建帧缓冲区
    framebuffer = gl.createFramebuffer();
    
    // 创建渲染缓冲区
    renderbuffer = gl.createRenderbuffer();
    
    // 创建着色器
    const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
    
    // 创建程序
    program = createProgram(gl, vertexShader, fragmentShader);
    
    // 创建位置缓冲区
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    // 创建纹理坐标缓冲区（修复镜像问题）
    texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    const texCoords = [
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      1.0, 1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    
    // 创建纹理
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize WebGL:', error);
    return false;
  }
}

/**
 * 使用WebGL调整PDF页面颜色以适配主题
 * @param canvas Canvas元素
 * @param theme 当前主题
 * @param themeColors 主题颜色配置
 */
export const adjustPdfColorsWebGL = (canvas: HTMLCanvasElement, theme: Theme, themeColors: ThemeColors): void => {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return;
  
  // 如果WebGL未初始化或canvas尺寸发生变化，则重新初始化
  if (!gl || (tempCanvas && (tempCanvas.width !== width || tempCanvas.height !== height))) {
    if (!initWebGL(width, height)) {
      console.warn('WebGL not supported, falling back to CPU-based color adjustment');
      // 这里可以回退到原来的CPU实现
      return;
    }
  }
  
  if (!gl || !program) return;
  
  try {
    // 绑定帧缓冲区
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    
    // 绑定渲染缓冲区
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);
    
    // 绑定纹理到帧缓冲区
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    // 检查帧缓冲区是否完整
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer not complete');
    }
    
    // 设置视口
    gl.viewport(0, 0, width, height);
    
    // 清除画布
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // 使用着色器程序
    gl.useProgram(program);
    
    // 设置顶点位置
    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // 设置纹理坐标
    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    
    // 上传图像数据到纹理
    const imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    
    // 设置统一变量
    const imageLocation = gl.getUniformLocation(program, "u_image");
    gl.uniform1i(imageLocation, 0);
    
    const themeLocation = gl.getUniformLocation(program, "u_theme");
    gl.uniform1i(themeLocation, themeMap[theme]);
    
    const minColorLocation = gl.getUniformLocation(program, "u_minColor");
    const minColor = parseColor(themeColors.primaryBg);
    gl.uniform3fv(minColorLocation, minColor);
    
    const maxColorLocation = gl.getUniformLocation(program, "u_maxColor");
    const maxColor = theme === 'dark' ? parseColor(themeColors.textColor) : parseColor(themeColors.primaryBg);
    gl.uniform3fv(maxColorLocation, maxColor);
    
    const thresholdLocation = gl.getUniformLocation(program, "u_threshold");
    gl.uniform1f(thresholdLocation, 10.0); // 10%阈值
    
    // 绘制到帧缓冲区
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // 将结果复制回原始canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 从帧缓冲区读取像素数据
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      
      // 创建ImageData并绘制到canvas
      const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
      ctx.putImageData(imageData, 0, 0);
    }
  } catch (error) {
    console.warn('Failed to adjust PDF colors with WebGL:', error);
  }
};