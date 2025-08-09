import { useCallback, useEffect, useRef } from 'react'

interface OutlineItemProps {
  item: any
  depth?: number
  onItemClick: (dest: any) => void
  currentPage: number
  pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null
}

const OutlineItem = ({ item, depth = 0, onItemClick, currentPage, pdfDoc }: OutlineItemProps) => {
  const hasChildren = item.items && item.items.length > 0
  const paddingLeft = `${depth * 20}px`
  
  // 获取目标页码
  const getPageNumber = useCallback(async (dest: any) => {
    if (!pdfDoc || !dest) return null
    
    try {
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
      return pageNum
    } catch (e) {
      console.error('Failed to get page number:', e)
      return null
    }
  }, [pdfDoc])

  // 解析页码
  const pageNumberRef = useRef<number | null>(null)
  
  useEffect(() => {
    if (item.dest) {
      getPageNumber(item.dest).then(pageNum => {
        pageNumberRef.current = pageNum
      })
    }
  }, [item.dest, getPageNumber])

  // 检查是否是当前页面
  const isCurrentPage = pageNumberRef.current === currentPage

  return (
    <div key={item.title}>
      <div 
        style={{ 
          padding: '6px 12px',
          paddingLeft,
          cursor: item.dest ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: item.dest ? (isCurrentPage ? '#e6f0ff' : 'transparent') : '#f5f5f5',
          color: item.dest ? (isCurrentPage ? '#0066cc' : '#333') : '#999',
          fontSize: '14px',
          borderLeft: depth > 0 ? '2px solid #eee' : 'none',
          fontWeight: isCurrentPage ? 'bold' : (item.bold ? 'bold' : 'normal')
        }}
        onClick={() => item.dest && onItemClick(item.dest)}
      >
        <span style={{ 
          fontStyle: item.italic ? 'italic' : 'normal',
          flex: 1
        }}>
          {item.title}
        </span>
        {item.dest && pageNumberRef.current && (
          <span style={{ 
            fontSize: '12px',
            color: isCurrentPage ? '#0066cc' : '#666',
            marginLeft: '8px'
          }}>
            {pageNumberRef.current}
          </span>
        )}
      </div>
      {hasChildren && (
        <div>
          {item.items.map((child: any) => (
            <OutlineItem 
              key={child.title} 
              item={child} 
              depth={depth + 1} 
              onItemClick={onItemClick} 
              currentPage={currentPage}
              pdfDoc={pdfDoc}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface OutlinePanelProps {
  outline: any[] | null
  onClose: () => void
  onItemClick: (dest: any) => void
  currentPage: number
  pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null
}

export const OutlinePanel = ({ outline, onClose, onItemClick, currentPage, pdfDoc }: OutlinePanelProps) => {
  const outlineRef = useRef<HTMLDivElement>(null)
  
  if (!outline || outline.length === 0) return null
  
  // 滚动到当前章节
  useEffect(() => {
    if (outlineRef.current) {
      // 查找当前页面对应的章节元素
      const currentElements = outlineRef.current.querySelectorAll('[style*="#e6f0ff"], [style*="#0066cc"]')
      if (currentElements.length > 0) {
        const firstCurrentElement = currentElements[0] as HTMLElement
        firstCurrentElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [currentPage])

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
          onClick={onClose}
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
      <div ref={outlineRef}>
        {outline.map(item => (
          <OutlineItem 
            key={item.title} 
            item={item} 
            onItemClick={onItemClick} 
            currentPage={currentPage}
            pdfDoc={pdfDoc}
          />
        ))}
      </div>
    </div>
  )
}