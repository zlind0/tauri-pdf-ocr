import { useEffect, useRef, useState } from 'react'
import './app-compact.css'

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
          backgroundColor: item.dest ? (isCurrentChapter ? 'var(--highlight-bg)' : 'transparent') : 'var(--secondary-bg)',
          color: item.dest ? (isCurrentChapter ? 'var(--highlight-text-color)' : 'var(--text-color)') : 'var(--text-color)',
          fontSize: '14px',
          borderLeft: depth > 0 ? '2px solid var(--border-color)' : 'none',
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
            color: isCurrentChapter ? 'var(--highlight-text-color)' : 'var(--text-color)',
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

interface ProgressBarPanelProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  onClose: () => void
}

const ProgressBarPanel = ({ currentPage, totalPages, onPageChange, onClose }: ProgressBarPanelProps) => {
  const [tempPage, setTempPage] = useState(currentPage.toString())
  const [isDragging, setIsDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查是否点击了目录按钮
      const target = event.target as HTMLElement
      const isOutlineButton = target instanceof HTMLElement && 
        target.tagName === 'BUTTON' && 
        (target.textContent === '目录' || target.getAttribute('title')?.includes('目录'))
      
      if (panelRef.current && 
          !panelRef.current.contains(event.target as Node) && 
          !isOutlineButton) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value)
    onPageChange(page)
  }
  
  const handleSliderMouseDown = () => {
    setIsDragging(true)
  }
  
  const handleSliderMouseUp = () => {
    setIsDragging(false)
  }
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempPage(e.target.value)
  }
  
  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const page = parseInt(tempPage)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page)
    } else {
      // 如果输入无效，重置为当前页码
      setTempPage(currentPage.toString())
    }
  }
  
  return (
    <div 
      ref={panelRef}
      style={{
        position: 'absolute',
        top: '40px',
        left: '16px',
        width: '400px',
        maxHeight: '80vh',
        backgroundColor: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        zIndex: 1000,
        textAlign: 'left',
        padding: '12px',
        color: 'var(--panel-text-color)'
      }}
    >
      <div style={{
        padding: '12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>页面导航</h3>
        <button 
          onClick={onClose}
          className="compact-btn"
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
      <div style={{ padding: '16px' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
            当前页面: {currentPage} / {totalPages}
          </label>
          <input
            type="range"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            onMouseUp={handleSliderMouseUp}
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              background: 'var(--border-color)',
              outline: 'none',
              WebkitAppearance: 'none',
              appearance: 'none'
            }}
          />
          {/* 自定义滑块样式 */}
          <style>{`
            input[type="range"]::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: var(--highlight-bg);
              cursor: pointer;
              border: 1px solid var(--border-color);
            }
            input[type="range"]::-moz-range-thumb {
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: var(--highlight-bg);
              cursor: pointer;
              border: 1px solid var(--border-color);
            }
          `}</style>
        </div>
        <form onSubmit={handleInputSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={tempPage}
            onChange={handleInputChange}
            style={{
              flex: 1,
              padding: '6px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--button-bg)',
              color: 'var(--text-color)',
              fontFamily: 'inherit',
              fontSize: 'inherit'
            }}
          />
          <button 
            type="submit"
            className="compact-btn"
            style={{ 
              padding: '6px 12px',
              whiteSpace: 'nowrap'
            }}
          >
            跳转
          </button>
        </form>
      </div>
    </div>
  )
}

interface OutlinePanelProps {
  outline: any[] | null
  onClose: () => void
  onItemClick: (dest: any) => void
  currentPage: number
  totalPages?: number
  onPageChange?: (page: number) => void
}

export const OutlinePanel = ({ outline, onClose, onItemClick, currentPage, totalPages = 0, onPageChange }: OutlinePanelProps) => {
  const outlineRef = useRef<HTMLDivElement>(null)
  
  // 保存和恢复滚动位置（仅适用于有目录的情况）
  useEffect(() => {
    if (!outline || outline.length === 0) return
    
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
  }, [outline])
  
  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查是否点击了目录按钮
      const target = event.target as HTMLElement
      const isOutlineButton = target instanceof HTMLElement && 
        target.tagName === 'BUTTON' && 
        (target.textContent === '目录' || target.getAttribute('title')?.includes('目录'))
      
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

  // 如果没有目录但有总页数，显示进度条面板
  if ((!outline || outline.length === 0) && totalPages > 0 && onPageChange) {
    return <ProgressBarPanel 
      currentPage={currentPage} 
      totalPages={totalPages} 
      onPageChange={onPageChange} 
      onClose={onClose} 
    />
  }
  
  // 如果没有目录也没有总页数或跳转函数，不显示任何内容
  if (!outline || outline.length === 0) return null
  
  return (
    <div 
      ref={outlineRef}
      style={{
        position: 'absolute',
        top: '40px',
        left: '16px',
        width: '400px',
        maxHeight: '80vh',
        backgroundColor: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        zIndex: 1000,
        overflowY: 'auto',
        textAlign: 'left',
        padding: '12px',
        color: 'var(--panel-text-color)'
      }}
    >
      <div style={{
        padding: '12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>目录</h3>
        <button 
          onClick={onClose}
          className="compact-btn"
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