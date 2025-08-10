import { useEffect, useRef } from 'react'

interface OutlineItemProps {
  item: any
  depth?: number
  onItemClick: (dest: any) => void
  currentPage: number
  nextPageNumber?: number | null
}

const OutlineItem = ({ item, depth = 0, onItemClick, currentPage, nextPageNumber }: OutlineItemProps) => {
  const hasChildren = item.items && item.items.length > 0
  const paddingLeft = `${depth * 20}px`
  
  // 检查当前页面是否属于当前章节
  // 如果有下一个章节的页码，则当前页面在 [当前章节页码, 下一个章节页码) 范围内属于当前章节
  // 如果没有下一个章节页码，则当前页面 >= 当前章节页码属于当前章节
  const isCurrentChapter = item.pageNumber ? 
    (nextPageNumber ? 
      (currentPage >= item.pageNumber && currentPage < nextPageNumber) : 
      (currentPage >= item.pageNumber)) : 
    false

  return (
    <div>
      <div 
        style={{ 
          padding: '6px 12px',
          paddingLeft,
          cursor: item.dest ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: item.dest ? (isCurrentChapter ? '#e6f0ff' : 'transparent') : '#f5f5f5',
          color: item.dest ? (isCurrentChapter ? '#0066cc' : '#333') : '#999',
          fontSize: '14px',
          borderLeft: depth > 0 ? '2px solid #eee' : 'none',
          fontWeight: isCurrentChapter ? 'bold' : (item.bold ? 'bold' : 'normal')
        }}
        onClick={() => item.dest && onItemClick(item.dest)}
        data-current={isCurrentChapter ? 'true' : 'false'}
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
            color: isCurrentChapter ? '#0066cc' : '#666',
            marginLeft: '8px'
          }}>
            {item.pageNumber}
          </span>
        )}
      </div>
      {hasChildren && (
        <div>
          {item.items.map((child: any, index: number) => {
            // 计算下一个章节的页码
            let nextChapterPageNumber = null
            // 先检查同级的下一个节点
            if (item.items && index < item.items.length - 1) {
              nextChapterPageNumber = item.items[index + 1].pageNumber
            }
            // 如果没有同级下一个节点，使用父级传入的下一个节点页码
            return (
              <OutlineItem 
                key={child.title} 
                item={child} 
                depth={depth + 1} 
                onItemClick={onItemClick} 
                currentPage={currentPage}
                nextPageNumber={nextChapterPageNumber || nextPageNumber}
              />
            )
          })}
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
  
  // 保存和恢复滚动位置
  useEffect(() => {
    const container = outlineRef.current
    if (!container) return
    
    // 从localStorage恢复滚动位置
    const savedScrollTop = localStorage.getItem('outlinePanelScrollTop')
    
    // 保存滚动位置的函数
    const handleScroll = () => {
      localStorage.setItem('outlinePanelScrollTop', container.scrollTop.toString())
    }
    
    // 添加滚动事件监听器
    container.addEventListener('scroll', handleScroll)
    
    // 如果有保存的滚动位置，设置滚动位置
    if (savedScrollTop) {
          container.scrollTop = parseInt(savedScrollTop, 10)
    }
    
    // 清理函数
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [])
  
  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查是否点击了目录按钮
      const target = event.target as HTMLElement
      const isOutlineButton = target instanceof HTMLElement && 
        target.tagName === 'BUTTON' && 
        target.textContent === '目录'
      
      if (outlineRef.current && 
          !outlineRef.current.contains(event.target as Node) && 
          !isOutlineButton) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  return (
    <div 
      ref={outlineRef}
      style={{
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
      }}
    >
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
      <div>
        {outline.map((item, index) => {
          // 计算下一个章节的页码
          let nextPageNumber = null
          if (index < outline.length - 1) {
            nextPageNumber = outline[index + 1].pageNumber
          }
          return (
            <OutlineItem 
              key={item.title} 
              item={item} 
              onItemClick={onItemClick} 
              currentPage={currentPage}
              nextPageNumber={nextPageNumber}
            />
          )
        })}
      </div>
    </div>
  )
}