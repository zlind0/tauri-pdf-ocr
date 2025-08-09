import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
// Configure PDF.js worker with a Vite-friendly approach and a fallback
import { SplitPane } from './SplitPane'
import { TextExtraction } from './TextExtraction'
import { stateManager } from './stateManager'
import type { AppState } from './stateManager'

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
        const data = await readFile(filePath)
        const loaded = await getDocument({ data }).promise
        setPdfDoc(loaded)
        setNumPages(loaded.numPages)
        // 获取PDF目录
        const outlineData = await loaded.getOutline()
        setOutline(outlineData || null)
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
  }, [pdfDoc, pageNumber, scale])

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

  // 渲染目录项
  const renderOutlineItem = (item: any, depth = 0) => {
    const hasChildren = item.items && item.items.length > 0
    const paddingLeft = `${depth * 20}px`
    
    return (
      <div key={item.title}>
        <div 
          style={{ 
            padding: '6px 12px',
            paddingLeft,
            cursor: item.dest ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: item.dest ? 'transparent' : '#f5f5f5',
            color: item.dest ? '#333' : '#999',
            fontSize: '14px',
            borderLeft: depth > 0 ? '2px solid #eee' : 'none'
          }}
          onClick={() => item.dest && handleOutlineItemClick(item.dest)}
        >
          <span style={{ 
            fontWeight: item.bold ? 'bold' : 'normal',
            fontStyle: item.italic ? 'italic' : 'normal',
            flex: 1
          }}>
            {item.title}
          </span>
          {item.dest && (
            <span style={{ 
              fontSize: '12px',
              color: '#666',
              marginLeft: '8px'
            }}>
              {/* 这里可以显示页码，但需要额外的处理来获取准确的页码 */}
            </span>
          )}
        </div>
        {hasChildren && (
          <div>
            {item.items.map((child: any) => renderOutlineItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // 渲染目录面板
  const renderOutlinePanel = () => {
    if (!outline || outline.length === 0) return null
    
    return (
      <div style={{
        position: 'absolute',
        top: '40px',
        left: '16px',
        width: '400px',
        maxHeight: '80vh',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        zIndex: 1000,
        overflowY: 'auto',
        textAlign: 'left',
        padding: '12px'
      }}>
        <div style={{
          padding: '12px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>目录</h3>
          <button 
            onClick={() => setShowOutline(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>
        <div>
          {outline.map(item => renderOutlineItem(item))}
        </div>
      </div>
    )
  }

  const renderContent = () => {
      return (
        <>
          {showOutline && renderOutlinePanel()}
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
        borderBottom: '1px solid #ddd',
        flexShrink: 0
      }}>
        <button onClick={handleOpen}>打开</button>
        {filePath && outline && outline.length > 0 && (
          <button 
            onClick={() => setShowOutline(!showOutline)}
            style={{
              backgroundColor: showOutline ? '#007bff' : 'white',
              color: showOutline ? 'white' : 'black'
            }}
          >
            目录
          </button>
        )}
        {filePath && <span style={{ opacity: 0.7 }}>{filePath}</span>}
        <button onClick={goPrev} disabled={!pdfDoc || pageNumber <= 1}>
          &lt;
        </button>
        <button onClick={goNext} disabled={!pdfDoc || pageNumber >= numPages}>
          &gt;
        </button>
        {pdfDoc && (
          <span style={{ marginLeft: 8 , width: '70px', textAlign: 'center'}}>
            {pageNumber} / {numPages}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
         
        </div>
      </div>
      {renderContent()}
    </div>
  )
}

export default App
