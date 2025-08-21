import { useState, useEffect, useRef } from 'react'
import { stateManager } from './stateManager'
import { Settings } from './Settings'
import { OcrService } from './ocrService'
import { TranslationService } from './translationService'
import { cacheService } from './cacheService'
import md5 from 'crypto-js/md5'
import { readFile } from '@tauri-apps/plugin-fs'

interface TextExtractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  pageNumber?: number // 添加页码属性
  canvasRendered?: boolean // 添加canvas渲染状态
  filePath?: string | null // 添加文件路径属性用于计算MD5
}

export function TextExtraction({ canvasRef, pageNumber, canvasRendered, filePath }: TextExtractionProps) {
  const [extractedText, setExtractedText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [autoOcrEnabled, setAutoOcrEnabled] = useState(true)
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false)
  const [fontFamily, setFontFamily] = useState<string>('serif')
  const [fontSize, setFontSize] = useState<number>(18)
  const [translating, setTranslating] = useState(false)
  const [fileMd5, setFileMd5] = useState<string | null>(null) // 存储文件MD5值
  const lastUpdateSourceRef = useRef<'none' | 'ocr' | 'translate'>('none')

  const extractText = async (useCache = true) => {
    if (!canvasRef.current || !fileMd5 || !pageNumber) return

    setLoading(true)
    setError(null)
    
    try {
      // 检查缓存
      if (useCache) {
        const cachedText = await cacheService.getOcrText(fileMd5, pageNumber)
        if (cachedText) {
          lastUpdateSourceRef.current = 'ocr'
          setExtractedText(cachedText)
          setLoading(false)
          return
        }
      }

      // Convert canvas to data URL
      const dataUrl = canvasRef.current.toDataURL('image/png')
      
      // Extract text using OCR
      const text = await OcrService.extractTextFromImage(dataUrl)
      
      // 只有在请求没有被取消的情况下才更新文本
      if (text !== '') {
        // 保存到缓存
        await cacheService.saveOcrText(fileMd5, pageNumber, text)
        lastUpdateSourceRef.current = 'ocr'
        setExtractedText(text)
      }
      setLoading(false)
    } catch (err: any) {
      // 只有在不是取消请求的情况下才显示错误
      if (err !== 'Request canceled') {
        console.log(err)
        setError(err.message || '文字提取失败')
        setLoading(false)
      }
    } 
  }

  useEffect(() => {
    if (autoOcrEnabled && canvasRendered) {
      // triggerAutoOcr()
      console.log("ExtractText", canvasRendered, pageNumber, autoOcrEnabled)
      // 自动OCR时也使用缓存
      extractText(true)
    }
  }, [canvasRendered, pageNumber, autoOcrEnabled])

  // 当 OCR 结果更新且开启自动翻译时，自动进行翻译
  useEffect(() => {
    if (!autoTranslateEnabled) return
    if (lastUpdateSourceRef.current !== 'ocr') return
    if (!extractedText) return
    // 自动翻译时也使用缓存
    translateText(true)
  }, [extractedText, autoTranslateEnabled])

  // 计算文件MD5值
  useEffect(() => {
    const calculateFileMd5 = async () => {
      if (!filePath) {
        setFileMd5(null)
        return
      }

      try {
        // 读取文件二进制数据
        const fileData = await readFile(filePath)
        // 将Uint8Array转换为十六进制字符串
        const hexString = Array.from(fileData)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('')
        // 计算MD5值
        const hash = md5(hexString)
        setFileMd5(hash.toString())
      } catch (err) {
        console.error('Failed to calculate file MD5:', err)
        setFileMd5(null)
      }
    }

    calculateFileMd5()
  }, [filePath])

  // Load persisted font settings and auto flags on mount
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await stateManager.loadState()
        if (saved.textPanelFontFamily) setFontFamily(saved.textPanelFontFamily)
        if (saved.textPanelFontSize) setFontSize(saved.textPanelFontSize)
        if (typeof saved.autoOcrEnabled === 'boolean') setAutoOcrEnabled(saved.autoOcrEnabled)
        if (typeof saved.autoTranslateEnabled === 'boolean') setAutoTranslateEnabled(saved.autoTranslateEnabled)
      } catch (err) {
        // noop
      }
    }
    load()
  }, [])

  // Persist font and auto flags when changed
  useEffect(() => {
    stateManager.saveState({
      textPanelFontFamily: fontFamily,
      textPanelFontSize: fontSize,
      autoOcrEnabled,
      autoTranslateEnabled,
    })
  }, [fontFamily, fontSize, autoOcrEnabled, autoTranslateEnabled])

  const handleZoomIn = () => setFontSize(prev => Math.min(prev + 2, 60))
  const handleZoomOut = () => setFontSize(prev => Math.max(prev - 2, 10))

  const translateText = async (useCache = true) => {
    if (!extractedText || translating || !fileMd5 || !pageNumber) return
    setTranslating(true)
    setError(null)

    let streamingText = ''
    try {
      // 检查缓存
      if (useCache) {
        const cachedText = await cacheService.getTranslatedText(fileMd5, pageNumber)
        if (cachedText) {
          lastUpdateSourceRef.current = 'translate'
          setExtractedText(cachedText)
          setTranslating(false)
          return
        }
      }

      const translated = await TranslationService.translateStream(
        extractedText,
        '简体中文（中国大陆）',
        (chunk) => {
          // 流式更新文本
          streamingText += chunk
          setExtractedText(streamingText)
        }
      )

      if (translated !== '') {
        // 保存到缓存
        await cacheService.saveTranslatedText(fileMd5, pageNumber, translated)
        lastUpdateSourceRef.current = 'translate'
        // 确保最终结果完整显示
        setExtractedText(translated)
      }
    } catch (err: any) {
      if (err !== 'Request canceled') {
        console.log(err)
        setError(err.message || '翻译失败')
      }
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '16px',
      backgroundColor: 'var(--secondary-bg)',
      borderLeft: '1px solid var(--border-color)',
      boxSizing: 'border-box',
      color: 'var(--text-color)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '8px',
      }}>
        <h3 style={{ margin: 0 }}>OCR和翻译</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={autoOcrEnabled}
              onChange={(e) => setAutoOcrEnabled(e.target.checked)}
              style={{ margin: 0 }}
            />
            自动OCR
          </label>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={autoTranslateEnabled}
              onChange={(e) => setAutoTranslateEnabled(e.target.checked)}
              style={{ margin: 0 }}
            />
            自动翻译
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 8 }}>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              title="字体"
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--button-bg)',
                color: 'var(--text-color)',
                fontSize: '12px'
              }}
            >
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans-serif</option>
              <option value="monospace">Monospace</option>
            </select>
            <button
              onClick={handleZoomOut}
              title="减小字体"
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--button-bg)',
                color: 'var(--text-color)',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              A-
            </button>
            <span style={{ fontSize: 12, minWidth: 32, textAlign: 'center' }}>{fontSize}px</span>
            <button
              onClick={handleZoomIn}
              title="放大字体"
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--button-bg)',
                color: 'var(--text-color)',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              A+
            </button>
          </div>
          <button
            onClick={() => extractText(false)}
            disabled={loading}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--highlight-bg)',
              color: 'var(--highlight-text-color)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            {loading ? 'OCR中...' : 'OCR'}
          </button>
          <button
            onClick={() => translateText(false)}
            disabled={translating || !extractedText}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--highlight-bg)',
              color: 'var(--highlight-text-color)',
              cursor: translating || !extractedText ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            {translating ? '翻译中...' : '翻译'}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--button-bg)',
              color: 'var(--text-color)',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            设置
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          color: 'var(--text-color)',
          padding: '8px',
          marginBottom: '16px',
          backgroundColor: 'var(--secondary-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <div style={{
        flex: 1,
        overflow: 'auto',
        backgroundColor: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '16px',
        fontFamily: fontFamily,
        fontSize: `${fontSize}px`,
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        textAlign: 'left',
        color: 'var(--panel-text-color)'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-color)' }}>
            正在提取文字...
          </div>
        ) : extractedText ? (
          extractedText
        ) : (
          <div style={{ textAlign: 'left', color: 'var(--text-color)' }}>
            {autoOcrEnabled ? '翻页时将自动提取文字' : '点击"OCR"按钮开始文字提取'}
          </div>
        )}
      </div>

      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} fileMd5={fileMd5} />
    </div>
  )
}
