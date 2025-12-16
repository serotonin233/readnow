import React, { useState, useMemo, useEffect } from 'react';
import { AppStatus } from '../types';

interface AudioControllerProps {
  status: AppStatus;
  onGenerate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  textLength: number;
  isPlaying: boolean;
  
  // Voice & Engine Props
  ttsEngine: 'gemini' | 'browser';
  onEngineChange: (engine: 'gemini' | 'browser') => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  onRefreshVoices: () => void; // 新增回调
  browserVoices: SpeechSynthesisVoice[];
  
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  
  timerDuration: number; // 分钟
  onTimerChange: (minutes: number) => void;
  timeLeft: number | null; // 秒
}

const GEMINI_VOICES = [
  { id: 'Kore', name: 'Gemini - Kore (平衡)' },
  { id: 'Zephyr', name: 'Gemini - Zephyr (温柔)' },
  { id: 'Puck', name: 'Gemini - Puck (低沉)' },
  { id: 'Fenrir', name: 'Gemini - Fenrir (激昂)' },
  { id: 'Charon', name: 'Gemini - Charon (深沉)' },
];

const SPEED_OPTIONS = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const TIMER_OPTIONS = [
  { value: 0, label: '不限时长' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟 (推荐)' },
  { value: 45, label: '45 分钟' },
  { value: 60, label: '60 分钟' },
];

// 辅助函数：格式化显示名称
const formatVoiceLabel = (v: SpeechSynthesisVoice) => {
   // 去除系统前缀
   let label = v.name.replace(/^(Apple|Microsoft|Google)\s+/, '');
   
   // 标记高质量声音
   if (label.includes('LiLi') || label.includes('Yu-shu')) label = '✨ ' + label;
   else if (label.includes('Sin-ji')) label = '✨ ' + label;
   
   // 如果名字不包含区域信息，补充一下
   if (!label.match(/[\(（]/)) {
       if (v.lang.toLowerCase().includes('cn')) label += ' (大陆)';
       else if (v.lang.toLowerCase().includes('hk')) label += ' (香港)';
       else if (v.lang.toLowerCase().includes('tw')) label += ' (台湾)';
   }
   return label;
};

const AudioController: React.FC<AudioControllerProps> = ({ 
  status, 
  onGenerate, 
  onPlay, 
  onPause, 
  onReset,
  textLength,
  isPlaying,
  ttsEngine,
  onEngineChange,
  selectedVoice,
  onVoiceChange,
  onRefreshVoices,
  browserVoices,
  playbackRate,
  onPlaybackRateChange,
  timerDuration,
  onTimerChange,
  timeLeft
}) => {
  const isGenerating = status === AppStatus.GENERATING_AUDIO;
  const isBuffering = status === AppStatus.GENERATING_AUDIO;

  // --- Favorite Voices Logic ---
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('voice_favorites');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch (e) {
      return new Set();
    }
  });

  const toggleFavorite = (voiceId: string) => {
    if (!voiceId) return;
    const newFavs = new Set(favorites);
    if (newFavs.has(voiceId)) {
      newFavs.delete(voiceId);
    } else {
      newFavs.add(voiceId);
    }
    setFavorites(newFavs);
    localStorage.setItem('voice_favorites', JSON.stringify(Array.from(newFavs)));
  };

  const isCurrentFavorite = favorites.has(selectedVoice);

  // Combine and Sort Voices
  const sortedVoices = useMemo(() => {
    let list: { id: string, name: string }[] = [];
    
    if (ttsEngine === 'gemini') {
      list = GEMINI_VOICES.map(v => ({ id: v.id, name: v.name }));
    } else {
      if (browserVoices.length > 0) {
        list = browserVoices.map(v => ({ 
            id: v.name, 
            name: formatVoiceLabel(v)
        }));
      } else {
        list = [{ id: '', name: '默认本地语音 (iOS/系统)' }];
      }
    }

    return list.sort((a, b) => {
      const aFav = favorites.has(a.id);
      const bFav = favorites.has(b.id);
      // Favorites first
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0; // 保持原有顺序（已在 App.tsx 优化过）
    });
  }, [ttsEngine, browserVoices, favorites]);


  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onVoiceChange(e.target.value);
  };

  const defaultIndex = 4; 
  const currentIndex = SPEED_OPTIONS.findIndex(r => r === playbackRate) !== -1 
    ? SPEED_OPTIONS.findIndex(r => r === playbackRate) 
    : defaultIndex;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10);
    onPlaybackRateChange(SPEED_OPTIONS[index]);
  };

  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-col space-y-6">
        
        {/* Header / Status */}
        <div className="text-center pb-2 border-b border-slate-100 min-h-[40px] flex items-center justify-center">
           {isBuffering && ttsEngine === 'gemini' ? (
             <div className="flex items-center justify-center space-x-2 text-indigo-600">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
                <span className="font-medium text-sm">
                  {isPlaying ? '正在缓冲下一段...' : '正在生成语音...'}
                </span>
             </div>
           ) : isPlaying ? (
              <div className="flex flex-col items-center justify-center text-emerald-600">
                <div className="flex items-center space-x-2">
                   <span className="relative flex h-3 w-3">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="font-medium text-sm">正在朗读 ({ttsEngine === 'gemini' ? 'Gemini' : '本地语音'})</span>
                </div>
                {timeLeft !== null && (
                  <span className="text-xs font-mono mt-1 text-emerald-500">
                    剩余时间: {formatTimeLeft(timeLeft)}
                  </span>
                )}
              </div>
           ) : status === AppStatus.READY_TO_PLAY ? (
               <div className="flex items-center justify-center space-x-2 text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
                </svg>
                <span className="font-medium text-sm">已暂停</span>
              </div>
           ) : (
             <span className="text-slate-500 text-sm font-medium">
                {textLength > 0 ? `已准备 (${textLength} 字)` : '等待文档...'}
             </span>
           )}
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 gap-4">
          
          {/* 1. 引擎选择 */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
             <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">朗读引擎</label>
             <div className="flex gap-2">
                <button 
                  onClick={() => onEngineChange('gemini')}
                  disabled={isPlaying}
                  className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors border
                    ${ttsEngine === 'gemini' 
                      ? 'bg-white border-indigo-500 text-indigo-700 shadow-sm' 
                      : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}`}
                >
                  Gemini AI<br/>(高音质·有限额)
                </button>
                <button 
                  onClick={() => onEngineChange('browser')}
                  disabled={isPlaying}
                  className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors border
                    ${ttsEngine === 'browser' 
                      ? 'bg-white border-emerald-500 text-emerald-700 shadow-sm' 
                      : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}`}
                >
                  本地语音<br/>(免费·无限量)
                </button>
             </div>
          </div>

          {/* 2. 声音选择 */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">选择声音</label>
                <div className="flex gap-1 items-center">
                    <span className="text-[10px] text-slate-400">
                        {isCurrentFavorite ? '★ 已收藏' : ''}
                    </span>
                    {ttsEngine === 'browser' && (
                        <button 
                            onClick={onRefreshVoices}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                            title="刷新语音列表"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            刷新
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex gap-2">
                <select 
                  value={selectedVoice} 
                  onChange={handleVoiceChange}
                  className="flex-1 min-w-0 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  {sortedVoices.map(v => (
                    <option key={v.id} value={v.id}>
                      {favorites.has(v.id) ? '★ ' : ''}{v.name}
                    </option>
                  ))}
                </select>
                
                <button
                    onClick={() => toggleFavorite(selectedVoice)}
                    disabled={!selectedVoice}
                    className={`p-2.5 rounded-lg border transition-all flex-shrink-0
                        ${isCurrentFavorite 
                            ? 'bg-amber-50 border-amber-200 text-amber-500 hover:bg-amber-100' 
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                        }`}
                    title={isCurrentFavorite ? "取消收藏" : "收藏此声音"}
                >
                    {isCurrentFavorite ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                          <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006Z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.563.045.797.777.362 1.13l-4.203 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.203-3.602a.563.563 0 0 1 .362-1.13l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                        </svg>
                    )}
                </button>
            </div>

             {/* iOS 增强语音教程 */}
            {ttsEngine === 'browser' && (
                <div className="mt-2 p-3 bg-indigo-50 rounded-lg text-xs text-indigo-800 leading-relaxed border border-indigo-100">
                   <p className="font-bold mb-1">📢 如何在 iPhone 上获得更好听的声音？</p>
                   <p>iOS 系统内置了高质量的 AI 语音（如 <strong>LiLi</strong>, <strong>Yu-shu</strong>），但默认可能未下载。</p>
                   <ol className="list-decimal list-inside mt-1 space-y-0.5 text-indigo-700/80">
                      <li>打开 <strong>设置 &gt; 辅助功能 &gt; 朗读内容</strong></li>
                      <li>点击 <strong>声音 &gt; 中文</strong></li>
                      <li>找到 <strong>LiLi</strong> 或 <strong>Yu-shu</strong>，点击下载并选择 <strong>“增强版”</strong></li>
                      <li>回到本网页，点击上方列表旁的 <strong>“刷新”</strong> 按钮。</li>
                   </ol>
                </div>
            )}
          </div>
          
           {/* 3. 定时设定 */}
          <div className="space-y-1">
             <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
               定时关闭
             </label>
             <select
               value={timerDuration}
               onChange={(e) => onTimerChange(parseInt(e.target.value))}
               disabled={isPlaying || status === AppStatus.PARSING_PDF}
               className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60"
             >
                {TIMER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
             </select>
          </div>

          {/* 4. 速度 */}
          <div className="space-y-1 pt-1">
             <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">播放速度</label>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded transition-all">{playbackRate}x</span>
             </div>
             <div className="relative w-full h-8 flex items-center">
               <input 
                 type="range" 
                 min="0" 
                 max={SPEED_OPTIONS.length - 1}
                 step="1"
                 value={currentIndex}
                 onChange={handleSliderChange}
                 className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer z-10 focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-full"
               />
               <div className="absolute w-full flex justify-between px-1 pointer-events-none">
                 {SPEED_OPTIONS.map((opt, idx) => (
                    <div 
                      key={opt} 
                      className={`w-1 h-1 rounded-full ${opt === 1.0 ? 'bg-indigo-400 scale-150' : 'bg-slate-300'} ${idx === 0 ? 'ml-0.5' : ''} ${idx === SPEED_OPTIONS.length -1 ? 'mr-0.5' : ''}`}
                    ></div>
                 ))}
               </div>
             </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2">
          {status === AppStatus.IDLE ? (
            <button
              onClick={onGenerate}
              disabled={textLength === 0}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white transition-all shadow-sm active:scale-95
                ${textLength > 0 
                  ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md' 
                  : 'bg-slate-300 cursor-not-allowed'}`}
            >
              开始朗读
              {textLength > 0 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11V15.89a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84Z" />
                </svg>
              )}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={isPlaying ? onPause : onPlay}
                disabled={isBuffering && !isPlaying && ttsEngine === 'gemini'} 
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white transition-all shadow-md active:scale-95
                  ${isPlaying 
                    ? 'bg-amber-500 hover:bg-amber-600' 
                    : (isBuffering && ttsEngine === 'gemini')
                      ? 'bg-slate-400 cursor-wait'
                      : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {isPlaying ? (
                   <>
                     <span>暂停</span>
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                       <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                     </svg>
                   </>
                ) : (
                  <>
                    <span>{(isBuffering && ttsEngine === 'gemini') ? '缓冲中...' : '继续播放'}</span>
                    {!(isBuffering && ttsEngine === 'gemini') && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </>
                )}
              </button>
              
              <button 
                onClick={onReset}
                className="px-4 py-3 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors active:scale-95"
                title="重新开始"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioController;
