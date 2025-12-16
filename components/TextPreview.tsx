import React, { useState, useEffect, useRef } from 'react';
import { getWordAt } from '../utils/textUtils';

interface TextPreviewProps {
  text: string;
  onChange: (text: string) => void;
  fileName: string;
  isProcessing: boolean;
  // Highlighting props
  chunks: string[];
  currentChunkIndex: number;
  isPlaying: boolean;
  chunkProgressIndex: number; // 当前段落内的字符索引
}

const TextPreview: React.FC<TextPreviewProps> = ({ 
  text, 
  onChange, 
  fileName, 
  isProcessing,
  chunks,
  currentChunkIndex,
  isPlaying,
  chunkProgressIndex
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'read'>('edit');
  
  const activeChunkRef = useRef<HTMLDivElement>(null);
  
  // 自动滚屏：针对高亮词
  // 查找带有 .active-word-highlight 类的元素并居中滚动
  useEffect(() => {
     if (viewMode === 'read') {
        const highlightedEl = document.querySelector('.active-word-highlight');
        if (highlightedEl) {
            highlightedEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center', // 垂直居中
                inline: 'nearest'
            });
        }
     }
  }, [chunkProgressIndex, viewMode]);

  // 当播放状态改变时，自动切换视图
  useEffect(() => {
    if (isPlaying && chunks.length > 0) {
        setViewMode('read');
    }
  }, [isPlaying, chunks.length]);

  // 自动滚动逻辑 (段落级别)
  useEffect(() => {
    if (viewMode === 'read' && activeChunkRef.current) {
        // 如果没有具体的高亮词，至少滚动到段落
        if (!document.querySelector('.active-word-highlight')) {
            activeChunkRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center' 
            });
        }
    }
  }, [currentChunkIndex, viewMode]);

  const renderHighlightedChunk = (chunk: string, index: number) => {
     const isActive = index === currentChunkIndex;
     
     if (!isActive) {
         return chunk;
     }

     // 如果是当前段落，进行细粒度高亮
     if (chunkProgressIndex >= 0 && chunkProgressIndex < chunk.length) {
         const { start, end } = getWordAt(chunk, chunkProgressIndex);
         const before = chunk.slice(0, start);
         const highlighted = chunk.slice(start, end);
         const after = chunk.slice(end);

         return (
             <>
                <span className="text-slate-400 transition-colors duration-300">{before}</span>
                {/* 关键修改：去除 scale 和 inline-block 以防止错位，添加 class 用于自动滚屏 */}
                <span className="active-word-highlight bg-indigo-200 text-indigo-900 rounded font-semibold px-0.5 transition-colors duration-100 box-decoration-clone">
                    {highlighted}
                </span>
                <span className="text-slate-800 transition-colors duration-300">{after}</span>
             </>
         );
     }
     
     return <span className="text-slate-800">{chunk}</span>;
  };

  return (
    <div 
      className={`flex flex-col bg-white rounded-xl border overflow-hidden group transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[height] relative
        ${isFocused || viewMode === 'read'
          ? 'h-[85vh] shadow-xl border-indigo-400 ring-2 ring-indigo-50 z-20' 
          : 'h-[350px] md:h-[600px] shadow-sm border-slate-200 hover:shadow-md z-0'
        }`}
    >
      <div 
        className={`px-4 py-3 border-b flex justify-between items-center shrink-0 transition-colors duration-300
        ${(isFocused || viewMode === 'read') ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200'}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <h3 className={`font-medium flex items-center gap-2 transition-colors ${(isFocused || viewMode === 'read') ? 'text-indigo-700' : 'text-slate-700'}`}>
            {fileName === '手动输入文本.txt' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${(isFocused || viewMode === 'read') ? 'text-indigo-500' : 'text-slate-500'}`}>
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z" clipRule="evenodd" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${(isFocused || viewMode === 'read') ? 'text-indigo-500' : 'text-slate-500'}`}>
                  <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
                </svg>
            )}
            <span className="truncate max-w-[200px] text-sm">{fileName}</span>
          </h3>
          {isProcessing && (
            <div className="flex items-center gap-1.5 bg-indigo-100 px-2 py-0.5 rounded-full">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600"></div>
              <span className="text-xs text-indigo-700 font-medium whitespace-nowrap">解析中...</span>
            </div>
          )}
        </div>
        
        {/* 模式切换按钮 */}
        <div className="flex items-center gap-2">
            {chunks.length > 0 && (
                <button
                    onClick={() => setViewMode(prev => prev === 'edit' ? 'read' : 'edit')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1
                      ${viewMode === 'read' 
                        ? 'bg-indigo-100 text-indigo-700' 
                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                >
                    {viewMode === 'read' ? (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                           <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                           <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                         </svg>
                         阅读模式
                       </>
                    ) : (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                           <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                           <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                         </svg>
                         编辑模式
                       </>
                    )}
                </button>
            )}
            <span className={`text-xs transition-colors hidden sm:inline ${isFocused ? 'text-indigo-500 font-medium' : 'text-slate-400'}`}>
            {viewMode === 'read' ? '逐词高亮中' : (isFocused ? '点击外部收起' : '点击编辑内容')}
            </span>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
         {viewMode === 'read' && chunks.length > 0 ? (
            /* 阅读模式 (高亮视图) */
            <div className="w-full h-full p-5 overflow-y-auto scroll-smooth">
                <div className="text-xl leading-10 font-medium space-y-6 pb-60 max-w-3xl mx-auto">
                    {chunks.map((chunk, index) => {
                        const isActive = index === currentChunkIndex;
                        return (
                            <div 
                                key={index}
                                ref={isActive ? activeChunkRef : null}
                                // 关键修改：添加 whitespace-pre-wrap 确保换行符显示正确，防止高亮错位
                                className={`transition-all duration-500 rounded-xl px-4 py-3 border-l-4 whitespace-pre-wrap
                                    ${isActive 
                                        ? 'bg-indigo-50/50 border-indigo-500 shadow-sm' 
                                        : 'text-slate-400 border-transparent hover:bg-slate-50'
                                    }`}
                            >
                                {renderHighlightedChunk(chunk, index)}
                            </div>
                        );
                    })}
                </div>
            </div>
         ) : (
            /* 编辑模式 (Textarea) */
            <textarea 
                className="w-full h-full p-5 outline-none text-slate-700 text-lg leading-8 focus:bg-white transition-colors resize-none scroll-smooth font-medium"
                value={text}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="解析后的文本将显示在这里... 您可以随时编辑修正。"
                spellCheck={false}
            />
         )}
         
         {/* 底部遮罩，仅在阅读模式显示，增加沉浸感 */}
         {viewMode === 'read' && (
             <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
         )}
      </div>
    </div>
  );
};

export default TextPreview;