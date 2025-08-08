import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = workerSrc

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const wheelLockRef = useRef(false)
  const renderTaskRef = useRef<import('pdfjs-dist').RenderTask | null>(null)

  // Calculate optimal scale based on container size
  const calculateOptimalScale = useCallback((pageWidth: number, pageHeight: number, containerWidth: number, containerHeight: number) => {
    const scaleX = (containerWidth - 32) / pageWidth // 32px for padding
    const scaleY = (containerHeight - 32) / pageHeight
    return Math.min(scaleX, scaleY, 2.0) // Max scale of 2.0
  }, [])

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }
    
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const handleOpen = useCallback(async () => {
    setError(null)
    const selected = await openDialog({
      title: '选择 PDF 文件',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (typeof selected === 'string') {
      setFilePath(selected)
    }
  }, [])

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
        setPageNumber(1)
      } catch (e: any) {
        setError(e?.message ?? String(e))
        setPdfDoc(null)
        setNumPages(0)
      } finally {
        setLoading(false)
      }
    }
    loadPdf()
  }, [filePath])

  // Render current page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return
      
      // Cancel previous render task if it exists
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
      
      setLoading(true)
      try {
        const page = await pdfDoc.getPage(pageNumber)
        const originalViewport = page.getViewport({ scale: 1.0 })
        
        // Calculate optimal scale based on container size
        const optimalScale = calculateOptimalScale(
          originalViewport.width,
          originalViewport.height,
          containerSize.width,
          containerSize.height
        )
        
        setScale(optimalScale)
        const viewport = page.getViewport({ scale: optimalScale })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!
        
        // Get device pixel ratio for high DPI displays
        const devicePixelRatio = window.devicePixelRatio || 1
        
        // Set canvas size accounting for device pixel ratio
        canvas.width = viewport.width * devicePixelRatio
        canvas.height = viewport.height * devicePixelRatio
        
        // Scale the canvas CSS size
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        
        // Scale the context to match the device pixel ratio
        ctx.scale(devicePixelRatio, devicePixelRatio)
        
        // Store the render task and wait for it to complete
        renderTaskRef.current = page.render({ canvasContext: ctx, viewport, canvas })
        await renderTaskRef.current.promise
        renderTaskRef.current = null
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
  }, [pdfDoc, pageNumber, containerSize, calculateOptimalScale])

  const goPrev = useCallback(() => {
    setPageNumber((p) => Math.max(1, p - 1))
  }, [])

  const goNext = useCallback(() => {
    setPageNumber((p) => Math.min(numPages || 1, p + 1))
  }, [numPages])

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
        {filePath && <span style={{ opacity: 0.7 }}>{filePath}</span>}
        <button onClick={goPrev} disabled={!pdfDoc || pageNumber <= 1}>
          &lt;
        </button>
        <button onClick={goNext} disabled={!pdfDoc || pageNumber >= numPages}>
          &gt;
        </button>
        {pdfDoc && (
          <span style={{ marginLeft: 8 , width: 36, textAlign: 'center'}}>
            {pageNumber} / {numPages}
          </span>
        )}
      </div>
      {/* {loading && <div style={{ padding: '8px 16px', flexShrink: 0 }}>加载中...</div>} */}
      {error && <div style={{ color: 'red', padding: '8px 16px', flexShrink: 0 }}>错误: {error}</div>}
      <div 
        ref={containerRef}
        onWheel={handleWheel} 
        style={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          overflow: 'hidden'
        }}
      >
        <canvas 
          ref={canvasRef} 
          style={{ 

          }} 
        />
      </div>
    </div>
  )
}

export default App
