import { useEffect, useRef } from 'react'

interface OutlineItemProps {
  item: any
  depth?: number
  onItemClick: (dest: any) => void
  currentPage: number
}

const OutlineItem = ({ item, depth = 0, onItemClick, currentPage }: OutlineItemProps) => {
  const hasChildren = item.items && item.items.length > 0
  const paddingLeft = `${depth * 20}px`
  
  // 检查是否是当前页面
  const isCurrentPage = item.pageNumber === currentPage

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
        {item.dest && item.pageNumber && (
          <span style={{ 
            fontSize: '12px',
            color: isCurrentPage ? '#0066cc' : '#666',
            marginLeft: '8px'
          }}>
            {item.pageNumber}
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
}

export const OutlinePanel = ({ outline, onClose, onItemClick, currentPage }: OutlinePanelProps) => {
  const outlineRef = useRef<HTMLDivElement>(null)
  
  if (!outline || outline.length === 0) return null
  
  // 滚动到当前章节
  useEffect(() => {
    // 延迟执行以确保DOM已更新
    const timer = setTimeout(() => {
      if (outlineRef.current) {
        // 查找当前页面对应的章节元素
        const currentElements = outlineRef.current.querySelectorAll('[style*="#e6f0ff"], [style*="#0066cc"]')
        if (currentElements.length > 0) {
          const firstCurrentElement = currentElements[0] as HTMLElement
          firstCurrentElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
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
          />
        ))}
      </div>
    </div>
  )
}