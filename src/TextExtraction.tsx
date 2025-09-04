import { useState, useEffect, useRef } from 'react'
import { stateManager } from './stateManager'
import { Settings } from './Settings'
import { OcrService } from './ocrService'
import { TranslationService } from './translationService'
import { TtsService } from './ttsService'
import { cacheService } from './cacheService'
import './app-compact.css'

interface TextExtractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  pageNumber?: number // 添加页码属性
  canvasRendered?: boolean // 添加canvas渲染状态
  filePath?: string | null // 添加文件路径属性用于计算MD5
  fileMd5?: string | null // 添加文件MD5属性
  pdfDoc?: import('pdfjs-dist').PDFDocumentProxy | null // 添加PDF文档属性
  numPages?: number // 添加总页数属性
  onTurnPage?: (direction: 'next' | 'prev') => void // 添加翻页回调函数
}

export function TextExtraction({ canvasRef, pageNumber, canvasRendered, filePath, fileMd5, pdfDoc, numPages, onTurnPage }: TextExtractionProps) {
  const [extractedText, setExtractedText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [autoOcrEnabled, setAutoOcrEnabled] = useState(true)
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false)
  const [fontFamily, setFontFamily] = useState<string>('serif')
  const [fontSize, setFontSize] = useState<number>(18)
  const [translating, setTranslating] = useState(false)
  const [translatingResult, setTranslatingResult] = useState<string>('')
  const [translatingPage, setTranslatingPage] = useState<number>(-1) // -1 represents that there's no ongoing translation
  const [pageOcrTranslationReady, setPageOcrTranslationReady] = useState(false) // OCR和翻译均已完成
  const [ttsAutoTurnPageEnabled, setTtsAutoTurnPageEnabled] = useState(false) // 添加TTS自动翻页状态

  const [isSpeaking, setIsSpeaking] = useState(false) // 朗读状态
  const [isCurrentlyAutoSpeaking, setIsCurrentlyAutoSpeaking] = useState(false) 
  const isCurrentlyAutoSpeakingRef = useRef(isCurrentlyAutoSpeaking);
  // 添加在OCR或翻译完成后自动朗读的标志，此标志打开时，自动朗读并翻页直到读完。相比于isSpeaking，此状态也包括未在朗读而正在等待ocr的状态

  const lastUpdateSourceRef = useRef<'none' | 'ocr' | 'translate'>('none')
  const speakingStatusCallbackRef = useRef<(isSpeaking: boolean) => void>()

  const extractText = async (useCache = true, canvasDataUrl: string): Promise<string> => {
    if (!canvasRef.current || !fileMd5 || !pageNumber) return ''

    setLoading(true)
    setError(null)
    
    try {
      if (useCache) {
        const cachedText = await cacheService.getOcrText(fileMd5, pageNumber)
        if (cachedText) {
          lastUpdateSourceRef.current = 'ocr'
          setExtractedText(cachedText)
          setLoading(false)
          return cachedText
        }
      } else {
        await cacheService.clearPageCache(fileMd5, pageNumber)
      }
      
      // Extract text using OCR
      const text = await OcrService.extractTextFromImage(canvasDataUrl)
      
      // 只有在请求没有被取消的情况下才更新文本
      if (text !== '') {
        // 保存到缓存
        await cacheService.saveOcrText(fileMd5, pageNumber, text)
        lastUpdateSourceRef.current = 'ocr'
        setExtractedText(text)
      }
      setLoading(false)
      return text
    } catch (err: any) {
      // 只有在不是取消请求的情况下才显示错误
      if (err !== 'Request cancelled') {
        console.log(err)
        setError(err.message || '文字提取失败')
        setLoading(false)
      }
      return ''
    } 
  }

  const translateText = async (useCache = true, inputText: string, pageNumber: number) : Promise<string> => {
    if (!inputText || !fileMd5 || !pageNumber) return ''
    setTranslating(true)
    setError(null)

    let streamingText = ''
    try {
      // 检查缓存
      if (useCache) {
        const cachedText = await cacheService.getTranslatedText(fileMd5, pageNumber)
        if (cachedText) {
          lastUpdateSourceRef.current = 'translate'
          setTranslating(false)
          setExtractedText(cachedText)
          return cachedText
        }
      }else {
        await cacheService.clearTranslatedCache(fileMd5, pageNumber)
      }
      const translated = await TranslationService.translateStream(
        inputText,
        '简体中文（中国大陆）',
        (chunk) => {
            setTranslatingPage(pageNumber)
            streamingText += chunk
            setTranslatingResult(streamingText)
        }
      )

      if (translated !== '') {
        // 保存到缓存
        await cacheService.saveTranslatedText(fileMd5, pageNumber, translated)
        lastUpdateSourceRef.current = 'translate'
        // 确保最终结果完整显示
        // setExtractedText(translated)
        // streamingText = translated
      }
      setTranslating(false)
    } catch (err: any) {
      if (err !== 'Request cancelled') {
        console.log(err)
        setError(err.message || '翻译失败')
      }
    } finally {
      return streamingText
    }
  }

  useEffect(()=>{
    if (!translating && autoTranslateEnabled){
      setPageOcrTranslationReady(true)
      prefetchNextPage()
    }
  }, [translating, autoTranslateEnabled])

  useEffect(()=>{
    console.log("OCR Translation ready.")
    if(pageOcrTranslationReady && isCurrentlyAutoSpeakingRef.current){
      // 自动阅读时，新的页面加载完毕，则继续这一页的朗读
      handleSpeak(true)
    }
  }, [pageOcrTranslationReady])

  useEffect(()=>{
    stopSpeak(true)
  }, [pageNumber])

  useEffect(() => {
    isCurrentlyAutoSpeakingRef.current = isCurrentlyAutoSpeaking;
  }, [isCurrentlyAutoSpeaking]);

  useEffect(() => {
    if (autoOcrEnabled && canvasRendered && canvasRef.current) {
      setPageOcrTranslationReady(false)
      // 确保canvas有内容再执行OCR
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // 检查是否有非透明像素
        let hasContent = false;
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) { // 有非透明像素
            hasContent = true;
            break;
          }
        }
        
        if (hasContent) {
          console.log("ExtractText", canvasRendered, pageNumber, autoOcrEnabled, autoTranslateEnabled);
          // 自动OCR时也使用缓存
          (async () => {
            const ocrText: string = await extractText(true, canvas.toDataURL('image/png'))
            if (autoTranslateEnabled && ocrText && pageNumber && pageNumber!=translatingPage){
              await translateText(true, ocrText, pageNumber)
            }
            setPageOcrTranslationReady(true)
          })();
        }
      }
    }
  }, [canvasRendered, pageNumber, autoOcrEnabled, autoTranslateEnabled, canvasRef])

  // Load persisted font settings and auto flags on mount
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await stateManager.loadState()
        if (saved.textPanelFontFamily) setFontFamily(saved.textPanelFontFamily)
        if (saved.textPanelFontSize) setFontSize(saved.textPanelFontSize)
        if (typeof saved.autoOcrEnabled === 'boolean') setAutoOcrEnabled(saved.autoOcrEnabled)
        if (typeof saved.autoTranslateEnabled === 'boolean') setAutoTranslateEnabled(saved.autoTranslateEnabled)
        if (typeof saved.ttsAutoTurnPageEnabled === 'boolean') setTtsAutoTurnPageEnabled(saved.ttsAutoTurnPageEnabled)
      } catch (err) {
        // noop
      }
    }
    load()
  }, [])

  // 初始化TTS服务并监听状态变化
  useEffect(() => {
    let isMounted = true
    
    const initTtsService = async () => {
      // 初始化TTS服务以监听事件
      await TtsService.initialize()
      
      // 定义状态变化回调函数
      speakingStatusCallbackRef.current = (speaking: boolean) => {
        if (isMounted) {
          setIsSpeaking(speaking)
        }
      }
      
      // 注册回调函数
      if (speakingStatusCallbackRef.current) {
        TtsService.onSpeakingStatusChange(speakingStatusCallbackRef.current)
      }
    }
    
    initTtsService()
    
    // 清理函数
    return () => {
      isMounted = false
      if (speakingStatusCallbackRef.current) {
        TtsService.offSpeakingStatusChange(speakingStatusCallbackRef.current)
      }
    }
  }, [ttsAutoTurnPageEnabled, pageNumber, numPages, onTurnPage])

  useEffect(()=>{
    if (pageNumber == translatingPage){
      setExtractedText(translatingResult)
        }
  }, [pageNumber, translatingPage, translatingResult])

  // Persist font and auto flags when changed
  useEffect(() => {
    stateManager.saveState({
      textPanelFontFamily: fontFamily,
      textPanelFontSize: fontSize,
      autoOcrEnabled,
      autoTranslateEnabled,
      ttsAutoTurnPageEnabled,
    })
  }, [fontFamily, fontSize, autoOcrEnabled, autoTranslateEnabled, ttsAutoTurnPageEnabled])


  const stopSpeak = (autoTriggered: boolean = false) => {
    if (!autoTriggered) setIsCurrentlyAutoSpeaking(false)
    TtsService.setAutoTurnPageCallback(()=>{});
    if (isSpeaking) {
      try {
        TtsService.stop()
        setIsSpeaking(false)
      } catch (err) {
        console.error('停止朗读失败:', err)
        setError('停止朗读失败')
      }
    }
  }
  // 开始朗读功能
  const handleSpeak = async (autoTriggered: boolean = false) => {
    if (!autoTriggered) setIsCurrentlyAutoSpeaking(false)
    stopSpeak(true)

    TtsService.setAutoTurnPageCallback(() => {
        console.log("TTS finished, callback")
        if (isCurrentlyAutoSpeakingRef.current && pageNumber && numPages && onTurnPage) {
          // 只有在不是最后一页时才翻页
          if (pageNumber < numPages) {
            console.log("TTS finished, auto turning to next page");
            onTurnPage('next');
          }
        }
      });

    if (!extractedText) {
      setError('没有可朗读的文本')
      return
    }
    
    try {
      setIsSpeaking(true)
      setIsCurrentlyAutoSpeaking(true)
      await TtsService.speak(extractedText)
    } catch (err: any) {
      console.error('朗读失败:', err)
      setError(err.message || '朗读失败')
    }
  }



  const handleZoomIn = () => setFontSize(prev => Math.min(prev + 2, 60))
  const handleZoomOut = () => setFontSize(prev => Math.max(prev - 2, 10))
  const prefetchNextPage = async () => {
    // 检查必要的参数
    if (!pdfDoc || !fileMd5 || !numPages || !pageNumber) return
    
    // 检查是否还有下一页
    if (pageNumber >= numPages) return
    
    // 计算下一页的页码
    const nextPageNumber = pageNumber + 1
    
    console.log(`Prefetching page ${nextPageNumber}`)
    
    try {
      // 检查OCR缓存
      const cachedOcrText = await cacheService.getOcrText(fileMd5, nextPageNumber)
      if (cachedOcrText) {
        console.log(`OCR text for page ${nextPageNumber} found in cache`)
        // 检查翻译缓存
        const cachedTranslatedText = await cacheService.getTranslatedText(fileMd5, nextPageNumber)
        if (!cachedTranslatedText) {
          // 如果有OCR文本但没有翻译文本，进行翻译
          console.log(`Translating cached OCR text for page ${nextPageNumber}`)
          let streamingText = ''
          const translated = await TranslationService.translateStream(cachedOcrText, '简体中文（中国大陆）',
            (chunk) => {
              setTranslatingPage(nextPageNumber)
              streamingText += chunk
              setTranslatingResult(streamingText)
            }
          )
          if (translated) {
            await cacheService.saveTranslatedText(fileMd5, nextPageNumber, translated)
            setTranslatingPage(-1)
          }
        }
        return
      }
      
      // 获取下一页
      const page = await pdfDoc.getPage(nextPageNumber)
      
      // 创建离屏canvas
      const offscreenCanvas = document.createElement('canvas')
      const viewport = page.getViewport({ scale: 1.5 })
      
      // 设置canvas尺寸
      const devicePixelRatio = window.devicePixelRatio || 1
      offscreenCanvas.width = Math.floor(viewport.width * devicePixelRatio)
      offscreenCanvas.height = Math.floor(viewport.height * devicePixelRatio)
      
      const offscreenCtx = offscreenCanvas.getContext('2d')
      if (!offscreenCtx) return
      
      // 缩放上下文以匹配设备像素比率
      offscreenCtx.scale(devicePixelRatio, devicePixelRatio)
      
      // 渲染页面到离屏canvas
      const renderTask = page.render({ 
        canvasContext: offscreenCtx, 
        viewport,
        canvas: offscreenCanvas 
      })
      await renderTask.promise
      
      // 将canvas转换为数据URL
      const dataUrl = offscreenCanvas.toDataURL('image/png')
      
      // 执行OCR
      console.log(`Performing OCR on page ${nextPageNumber}`)
      const ocrText = await OcrService.extractTextFromImage(dataUrl)
      if (ocrText) {
        // 保存OCR结果到缓存
        await cacheService.saveOcrText(fileMd5, nextPageNumber, ocrText)
        
        // 执行翻译
        console.log(`Translating OCR text for page ${nextPageNumber}`)
        let streamingText = ''
        const translated = await TranslationService.translateStream(ocrText, '简体中文（中国大陆）',
          (chunk) => {
            setTranslatingPage(nextPageNumber)
            streamingText += chunk
            setTranslatingResult(streamingText)
        })
        if (translated) {
          // 保存翻译结果到缓存
          await cacheService.saveTranslatedText(fileMd5, nextPageNumber, translated)
          setTranslatingPage(-1)
          console.log(`Finished translating OCR text for page ${nextPageNumber}`)
        }
      }
    } catch (err) {
      console.error('Prefetching failed:', err)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '8px',
      backgroundColor: 'var(--secondary-bg)',
      borderLeft: '1px solid var(--border-color)',
      boxSizing: 'border-box',
      color: 'var(--text-color)'
    }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginBottom:'8px' }}>
          <label className="compact-checkbox-label">
            <input
              type="checkbox"
              checked={autoOcrEnabled}
              onChange={(e) => setAutoOcrEnabled(e.target.checked)}
              className="compact-checkbox"
            />
            自动OCR
          </label>
          <label className="compact-checkbox-label">
            <input
              type="checkbox"
              checked={autoTranslateEnabled}
              onChange={(e) => setAutoTranslateEnabled(e.target.checked)}
              className="compact-checkbox"
            />
            自动翻译
          </label>
          {/* 状态图标 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
            {pageOcrTranslationReady ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="#4CAF50"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="rotating">
                <path d="M12 4V2C8.64 2 5.52 3.36 3.16 5.64L4.58 7.06C6.54 5.18 9.14 4 12 4Z" fill="#2196F3"/>
                <path d="M12 22C15.36 22 18.48 20.64 20.84 18.36L19.42 16.94C17.46 18.82 14.86 20 12 20V22Z" fill="#2196F3"/>
              </svg>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 8 }}>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              title="字体"
              className="compact-select"
              style={{width: "90px"}}
            >
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans-serif</option>
              <option value="monospace">Monospace</option>
            </select>
            <button
              onClick={handleZoomOut}
              title="减小字体"
              className="compact-btn"
            >
              A-
            </button>
            <span style={{ fontSize: 12, minWidth: 32, textAlign: 'center' }}>{fontSize}px</span>
            <button
              onClick={handleZoomIn}
              title="放大字体"
              className="compact-btn"
            >
              A+
            </button>
          </div>
          <button
            onClick={() => {
              if (canvasRef.current) {
                extractText(false, canvasRef.current.toDataURL('image/png'))
              }
            }}
            disabled={loading}
            className="compact-btn"
            style={{ backgroundColor: 'var(--button-bg)', color: 'var(--highlight-text-color)' }}
          >
            {loading ? 'OCR...' : 'OCR'}
          </button>
          <button
            onClick={() => translateText(false, extractedText, pageNumber || 0)}
            disabled={translating || !extractedText}
            className="compact-btn"
            style={{ backgroundColor: translating? 'var(--highlight-bg)' : 'var(--button-bg)', color: 'var(--highlight-text-color)' }}
          >
            {translating ? '译...' : '译'}
          </button>
          <button
            onClick={() => (isSpeaking ? stopSpeak() : handleSpeak())}
            disabled={!extractedText}
            className="compact-btn"
            style={{ backgroundColor: isSpeaking ? 'var(--highlight-bg)' : 'var(--button-bg)', color: isSpeaking ? 'var(--highlight-text-color)' : 'var(--button-text-color)' }}
          >
            {isSpeaking ? '停' : '读'}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="compact-btn"
          >
            设置
          </button>
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
