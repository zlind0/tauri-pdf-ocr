import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { GlobalWorkerOptions } from 'pdfjs-dist'
// Configure PDF.js worker with a Vite-friendly approach and a fallback
import { SplitPane } from './SplitPane'
import { TextExtraction } from './TextExtraction'
import { OutlinePanel } from './OutlinePanel'
import { stateManager } from './stateManager'
import type { AppState } from './stateManager'
import { loadPdfDocument, processPdfOutline } from './pdfUtils'
import type { Theme } from './themeManager'
import { getCurrentTheme, setTheme, applyTheme, themes } from './themeManager'
// Import icons
import { FiFolder, FiChevronLeft, FiChevronRight, FiMenu, FiX, FiSun, FiMoon } from 'react-icons/fi'
// Import color adjuster
import { adjustPdfColors } from './pdfColorAdjuster'

try {
  // Preferred: let Vite load worker as module URL
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - query suffix handled by Vite
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
} catch (_) {
  // Fallback to explicit URL import if bundler does not resolve above
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // @vite-ignore
  GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [_, setLoading] = useState(false)
  const [__, setError] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale] = useState(1.5)
  const wheelLockRef = useRef(false)
  const renderTaskRef = useRef<import('pdfjs-dist').RenderTask | null>(null)
  const [splitPosition, setSplitPosition] = useState(50)
  const [canvasRendered, setCanvasRendered] = useState(false)
  const initialPageRef = useRef<number | null>(null)
  // 目录相关状态
  const [outline, setOutline] = useState<any[] | null>(null)
  const [showOutline, setShowOutline] = useState(false)
  // 主题状态
  const [theme, setThemeState] = useState<Theme>(getCurrentTheme())

  // Load saved state on app start
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const savedState = await stateManager.loadState()
        if (savedState.filePath) {
          setFilePath(savedState.filePath)
        }
        if (savedState.pageNumber) {
          setPageNumber(savedState.pageNumber)
          initialPageRef.current = savedState.pageNumber
        }
        if (savedState.splitPosition) {
          setSplitPosition(savedState.splitPosition)
        }
      } catch (error) {
        console.error('Failed to load saved state:', error)
      }
    }
    loadSavedState()
  }, [])

  // 应用主题
  useEffect(() => {
    applyTheme(theme)
  }, [theme, pdfDoc])

  // Save state when it changes
  const saveState = useCallback(async (updates: Partial<AppState>) => {
    try {
      await stateManager.saveState(updates)
    } catch (error) {
      console.error('Failed to save state:', error)
    }
  }, [])

  const handleOpen = useCallback(async () => {
    setError(null)
    const selected = await openDialog({
      title: '选择 PDF 文件',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (typeof selected === 'string') {
      // For newly opened files, start from page 1
      initialPageRef.current = 1
      setFilePath(selected)
      saveState({ filePath: selected, pageNumber: 1 })
    }
  }, [saveState])

  // Load PDF when file path changes
  useEffect(() => {
    const loadPdf = async () => {
      if (!filePath) return
      setLoading(true)
      setError(null)
      try {
        const loaded = await loadPdfDocument(filePath)
        setPdfDoc(loaded)
        setNumPages(loaded.numPages)
        // 获取并处理PDF目录
        const processedOutline = await processPdfOutline(loaded)
        setOutline(processedOutline)
        
        // Decide initial page based on context (restore vs new open)
        const pending = initialPageRef.current ?? 1
        const clamped = Math.min(Math.max(pending, 1), loaded.numPages)
        setPageNumber(clamped)
        initialPageRef.current = null
      } catch (e: any) {
        setError(e?.message ?? String(e))
        setPdfDoc(null)
        setNumPages(0)
        setOutline(null)
      } finally {
        setLoading(false)
      }
    }
    loadPdf()
  }, [filePath])

  // Render current page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return
      
      // Cancel previous render task if it exists
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
      
      setLoading(true)
      try {
        const page = await pdfDoc.getPage(pageNumber)
        
        // Use a fixed scale for consistent rendering
        const viewport = page.getViewport({ scale: scale })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!
        
        // Get device pixel ratio for high DPI displays
        const devicePixelRatio = window.devicePixelRatio || 1
        
        // Set canvas size accounting for device pixel ratio
        canvas.width = viewport.width * devicePixelRatio
        canvas.height = viewport.height * devicePixelRatio
        
        // Let CSS handle the display size
        canvas.style.width = '100%'
        canvas.style.height = '100vh'
        
        // Scale the context to match the device pixel ratio
        ctx.scale(devicePixelRatio, devicePixelRatio)
        
        // Store the render task and wait for it to complete
        renderTaskRef.current = page.render({ canvasContext: ctx, viewport, canvas })
        await renderTaskRef.current.promise
        renderTaskRef.current = null
        
        // 调整PDF颜色以适配当前主题
        adjustPdfColors(canvas, theme, themes[theme])
        
        // Mark canvas as rendered
        setCanvasRendered(true)
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelled') {
          setError(e?.message ?? String(e))
        }
      } finally {
        setLoading(false)
      }
    }
    renderPage()
    
    // Cleanup function to cancel render task when component unmounts or dependencies change
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
    }
  }, [pdfDoc, pageNumber, scale, theme])

  const goPrev = useCallback(() => {
    setCanvasRendered(false)
    const newPageNumber = Math.max(1, pageNumber - 1)
    setPageNumber(newPageNumber)
    saveState({ pageNumber: newPageNumber })
  }, [pageNumber, saveState])

  const goNext = useCallback(() => {
    setCanvasRendered(false)
    const newPageNumber = Math.min(numPages || 1, pageNumber + 1)
    setPageNumber(newPageNumber)
    saveState({ pageNumber: newPageNumber })
  }, [numPages, pageNumber, saveState])

  // Handle keyboard events for page navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle events when PDF is loaded
      if (!pdfDoc) return

      // Prevent default behavior for arrow keys to avoid page scrolling
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
      }

      // Navigate pages with arrow keys
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          goPrev()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          goNext()
          break
        default:
          break
      }
    }

    // Add event listener
    window.addEventListener('keydown', handleKeyDown)

    // Clean up event listener
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pdfDoc, goPrev, goNext])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!pdfDoc) return
      e.preventDefault()
      if (wheelLockRef.current) return
      wheelLockRef.current = true
      if (e.deltaY > 0) {
        goNext()
      } else if (e.deltaY < 0) {
        goPrev()
      }
      window.setTimeout(() => {
        wheelLockRef.current = false
      }, 200)
    },
    [pdfDoc, goNext, goPrev],
  )

  const handleSplitChange = useCallback((newPosition: number) => {
    setSplitPosition(newPosition)
    saveState({ splitPosition: newPosition })
  }, [saveState])

  // 处理目录项点击跳转
  const handleOutlineItemClick = useCallback(async (dest: any) => {
    if (!pdfDoc || !dest) return
    
    try {
      // 解析目标位置信息
      let pageNum = 1
      if (typeof dest === 'string') {
        // 如果dest是字符串，获取目标信息
        const destInfo = await pdfDoc.getDestination(dest)
        if (destInfo && destInfo[0]) {
          const ref = destInfo[0]
          const page = await pdfDoc.getPageIndex(ref)
          pageNum = page + 1
        }
      } else if (Array.isArray(dest) && dest[0]) {
        // 如果dest是数组，直接获取页面索引
        const ref = dest[0]
        const page = await pdfDoc.getPageIndex(ref)
        pageNum = page + 1
      }
      
      // 跳转到指定页面
      const clampedPage = Math.min(Math.max(pageNum, 1), numPages)
      setPageNumber(clampedPage)
      saveState({ pageNumber: clampedPage })
      setShowOutline(false) // 关闭目录面板
    } catch (e) {
      console.error('Failed to navigate to outline destination:', e)
    }
  }, [pdfDoc, numPages, saveState])

  const renderPdfViewer = () => (
    <div 
      onWheel={handleWheel} 
      className="pdf-container"
    >
      <canvas 
        ref={canvasRef} 
        className="pdf-canvas"
      />
    </div>
  )

  

  const renderContent = () => {
      return (
        <>
          {showOutline && (
            <OutlinePanel 
              outline={outline} 
              onClose={() => setShowOutline(false)} 
              onItemClick={handleOutlineItemClick} 
              currentPage={pageNumber}
            />
          )}
          <SplitPane
            split="vertical"
            size={splitPosition}
            onChange={handleSplitChange}
            style={{ height: '100%' }}
          >
            {renderPdfViewer()}
            <TextExtraction 
              canvasRef={canvasRef}
              pageNumber={pageNumber}
              canvasRendered={canvasRendered}
              filePath={filePath}
            />
          </SplitPane>
        </>
      )
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      width: '100vw',
      overflow: 'hidden'
    }}>
      <div style={{ 
        display: 'flex', 
        gap: 6, 
        alignContent: 'center',
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
        backgroundColor: 'var(--primary-bg)',
        color: 'var(--text-color)'
      }}>
        <button onClick={handleOpen} title="打开文件" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '6px 12px',
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-text-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          <FiFolder size={20} />
        </button>
        {filePath && outline && outline.length > 0 && (
          <button 
            onClick={() => setShowOutline(!showOutline)}
            style={{
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '6px 12px',
              backgroundColor: showOutline ? 'var(--highlight-bg)' : 'var(--button-bg)',
              color: showOutline ? 'var(--highlight-text-color)' : 'var(--button-text-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title={showOutline ? "关闭目录" : "打开目录"}
          >
            {showOutline ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
        )}
        
        <button onClick={goPrev} disabled={!pdfDoc || pageNumber <= 1} title="上一页" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '6px 12px',
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-text-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          cursor: (!pdfDoc || pageNumber <= 1) ? 'not-allowed' : 'pointer',
          opacity: (!pdfDoc || pageNumber <= 1) ? 0.5 : 1
        }}>
          <FiChevronLeft size={20} />
        </button>
        <button onClick={goNext} disabled={!pdfDoc || pageNumber >= numPages} title="下一页" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '6px 12px',
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-text-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          cursor: (!pdfDoc || pageNumber >= numPages) ? 'not-allowed' : 'pointer',
          opacity: (!pdfDoc || pageNumber >= numPages) ? 0.5 : 1
        }}>
          <FiChevronRight size={20} />
        </button>
        {pdfDoc && (
          <span style={{ marginLeft: 8 , minWidth: '70px', textAlign: 'center', color: 'var(--text-color)'}}>
            {pageNumber} / {numPages}
          </span>
        )}
        {filePath && <span style={{ opacity: 0.7, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filePath}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => {
              const nextTheme = theme === 'light' ? 'sepia' : theme === 'sepia' ? 'dark' : 'light';
              setThemeState(nextTheme);
              setTheme(nextTheme);
            }}
            title={`切换到${theme === 'light' ? '棕色' : theme === 'sepia' ? '夜间' : '白色'}模式`}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '6px 12px',
              backgroundColor: 'var(--button-bg)',
              color: 'var(--button-text-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {theme === 'light' ? <FiSun size={20} /> : theme === 'sepia' ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  )
}

export default App
