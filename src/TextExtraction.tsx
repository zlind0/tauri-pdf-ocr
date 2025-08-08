import { useState, useEffect, useRef } from 'react'
import { Settings } from './Settings'
import { OcrService } from './ocrService'

interface TextExtractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  isActive: boolean
  pageNumber?: number // 添加页码属性
  canvasRendered?: boolean // 添加canvas渲染状态
}

export function TextExtraction({ canvasRef, isActive, pageNumber, canvasRendered }: TextExtractionProps) {
  const [extractedText, setExtractedText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [autoOcrEnabled, setAutoOcrEnabled] = useState(true)

  const extractText = async () => {
    if (!canvasRef.current) return

    setLoading(true)
    setError(null)
    
    try {
      // Convert canvas to data URL
      const dataUrl = canvasRef.current.toDataURL('image/png')
      
      // Extract text using OCR
      const text = await OcrService.extractTextFromImage(dataUrl)
      setExtractedText(text)
    } catch (err: any) {
      setError(err.message || '文字提取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isActive && autoOcrEnabled && canvasRendered) {
      // triggerAutoOcr()
      console.log("ExtractText", canvasRendered, pageNumber, isActive, autoOcrEnabled)
      extractText()
    }
  }, [canvasRendered, pageNumber, isActive, autoOcrEnabled])

  if (!isActive) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '16px',
      backgroundColor: '#f8f9fa',
      borderLeft: '1px solid #ddd'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '8px',
        borderBottom: '1px solid #ddd'
      }}>
        <h3 style={{ margin: 0 }}>文字提取</h3>
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
          <button
            onClick={extractText}
            disabled={loading}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#007bff',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            {loading ? '提取中...' : '重新提取'}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: 'white',
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
          color: 'red',
          padding: '8px',
          marginBottom: '16px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <div style={{
        flex: 1,
        overflow: 'auto',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '16px',
        fontFamily: 'monospace',
        fontSize: '14px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#666' }}>
            正在提取文字...
          </div>
        ) : extractedText ? (
          extractedText
        ) : (
          <div style={{ textAlign: 'left', color: '#666' }}>
            {autoOcrEnabled ? '翻页时将自动提取文字' : '点击"重新提取"按钮开始文字提取'}
          </div>
        )}
      </div>

      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
