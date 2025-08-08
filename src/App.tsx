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

  useEffect(() => {
    const render = async () => {
      if (!filePath || !canvasRef.current) return
      setLoading(true)
      try {
        const data = await readFile(filePath)
        const pdf = await getDocument({ data }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
      } catch (e: any) {
        setError(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    }
    render()
  }, [filePath])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleOpen}>打开 PDF</button>
        {filePath && <span style={{ opacity: 0.7 }}>已选择: {filePath}</span>}
      </div>
      {loading && <div>加载中...</div>}
      {error && <div style={{ color: 'red' }}>错误: {error}</div>}
      <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 1000, border: '1px solid #ddd' }} />
    </div>
  )
}

export default App
