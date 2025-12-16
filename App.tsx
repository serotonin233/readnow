import React, { useState, useEffect, useRef } from 'react';
import FileSelect from './components/FileSelect';
import TextPreview from './components/TextPreview';
import AudioController from './components/AudioController';
import { extractTextFromDocument } from './services/documentParser';
import { generateSpeechFromText } from './services/geminiService';
import { decodeBase64, decodeAudioData } from './utils/audioUtils';
import { splitTextIntoChunks } from './utils/textUtils';
import { AppStatus } from './types';

const App: React.FC = () => {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [virtualFileName, setVirtualFileName] = useState<string>(''); 
  const [extractedText, setExtractedText] = useState<string>('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // OCR Settings
  const [ocrEngine, setOcrEngine] = useState<'gemini' | 'tesseract'>('tesseract');

  // TTS Settings
  const [ttsEngine, setTtsEngine] = useState<'gemini' | 'browser'>('gemini');
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Timer State
  const [timerDuration, setTimerDuration] = useState<number>(30); // Default 30 mins
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Chunking State
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  
  // Highlighting State
  const [chunkProgressIndex, setChunkProgressIndex] = useState<number>(-1);
  
  // Audio Refs (Gemini)
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCacheRef = useRef<Map<number, AudioBuffer>>(new Map());
  const fetchingSetRef = useRef<Set<number>>(new Set());
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0); 
  
  // Playback Control Refs
  const isPlayingRef = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Gemini Progress Loop Ref
  const animationFrameRef = useRef<number>(0);
  
  const sessionIdRef = useRef<number>(0);
  // Ref for auto-scrolling the playlist
  const activeChunkRef = useRef<HTMLDivElement>(null);

  // --- Browser TTS Initialization (iOS Optimized) ---
  
  const refreshBrowserVoices = (): number => {
      // 在 iOS 上，有时需要先 resume 才能获取 voices
      if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
      }

      const allVoices = window.speechSynthesis.getVoices();
      console.log(`[VoiceLoader] Found ${allVoices.length} raw voices.`);
      
      // 1. 强力过滤：保留所有中文相关语音
      const zhVoices = allVoices.filter(v => {
          const lang = v.lang.toLowerCase();
          const name = v.name.toLowerCase();
          return lang.includes('zh') || lang.includes('cmn') || lang.includes('yue') || name.includes('chinese');
      });
      
      // 2. 智能排序
      const sorted = zhVoices.sort((a, b) => {
         const getScore = (voice: SpeechSynthesisVoice) => {
            const name = voice.name.toLowerCase();
            const lang = voice.lang.toLowerCase();
            
            // Tier 1: iOS/Mac 顶级神仙语音
            if (name.includes('lili')) return 100;
            if (name.includes('yu-shu') || name.includes('yushu')) return 90;
            if (name.includes('sin-ji') || name.includes('sinji')) return 85;
            if (name.includes('mei-jia') || name.includes('meijia')) return 80;
            
            // Tier 2: 微软/谷歌
            if (name.includes('xiaoxiao') || name.includes('yunxi')) return 70;
            if (name.includes('google')) return 60;
            
            // Tier 3: 传统
            if (name.includes('ting-ting') || name.includes('tingting')) return 50;
            
            if (lang === 'zh-cn') return 40;
            return 30;
         };
         return getScore(b) - getScore(a);
      });

      setBrowserVoices(sorted);
      
      // 【关键修复】不要轻易重置用户的选择
      if (sorted.length > 0) {
          const currentSelectionIsGemini = selectedVoice === 'Kore' || GEMINI_VOICES_ID.includes(selectedVoice);
          if (!selectedVoice || currentSelectionIsGemini) {
              setSelectedVoice(sorted[0].name);
          }
      }
      
      return sorted.length;
  };

  // 辅助：判断是否是 Gemini 的 ID
  const GEMINI_VOICES_ID = ['Kore', 'Zephyr', 'Puck', 'Fenrir', 'Charon'];

  const wakeUpBrowserTTS = () => {
      // 必须先 cancel，防止队列卡死
      window.speechSynthesis.cancel();
      
      // 创建一个极短的静音发声
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0; 
      u.rate = 10;
      u.onend = () => {
          refreshBrowserVoices();
      };
      window.speechSynthesis.speak(u);
      refreshBrowserVoices();
  };

  useEffect(() => {
    // 1. 初始化尝试加载
    refreshBrowserVoices();
    
    // 2. 监听 voiceschanged (标准)
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => refreshBrowserVoices();
    }
    
    // 3. 【关键修复】监听 VisibilityChange
    const handleVisibilityChange = () => {
        if (!document.hidden) {
            console.log("[App] Page became visible, refreshing voices...");
            // 延迟一点点执行，给浏览器内核喘息时间
            setTimeout(() => {
                wakeUpBrowserTTS();
            }, 300);
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. 【关键修复】监听 Focus
    const handleFocus = () => {
         console.log("[App] Window focused, refreshing voices...");
         refreshBrowserVoices();
    };
    window.addEventListener('focus', handleFocus);

    // 5. 暴力轮询 (兜底)
    let retryCount = 0;
    const interval = setInterval(() => {
        const count = refreshBrowserVoices();
        const foundEnhanced = browserVoices.some(v => v.name.includes('LiLi') || v.name.includes('Yu-shu'));
        if ((foundEnhanced && count > 0) || retryCount > 5) {
            clearInterval(interval);
        }
        retryCount++;
    }, 1000);

    return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // --- Audio Context Lifecycle ---
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      window.speechSynthesis.cancel(); 
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // --- Watchers ---

  useEffect(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentChunkIndex]);

  useEffect(() => {
    let interval: number;
    if (isPlaying && timeLeft !== null && timeLeft > 0) {
      interval = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev !== null && prev <= 1) {
            handlePause(); 
            return 0;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, timeLeft]);

  // --- Logic ---

  // 【强力音频解锁】
  // 使用振荡器播放极短的声音，比播放空 Buffer 更能确切唤醒硬件
  const ensureAudioContextReady = () => {
    console.log("[Audio] Attempting to ensure AudioContext is ready...");
    
    // 1. 如果不存在，立即创建
    // 【关键修复】不传递 sampleRate 参数，让浏览器自动适配硬件采样率（iOS 上强制 24000 可能导致失败）
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = audioContextRef.current;

    // 2. 如果挂起，立即恢复
    if (ctx.state === 'suspended') {
       ctx.resume().then(() => console.log("[Audio] Context resumed."));
    }
    
    // 3. 播放微弱声音 (不可听见的高频或极低音量) 以抢占音频通道
    try {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, ctx.currentTime); // A4 音
        
        // 音量极低，人耳几乎听不见，但足以激活硬件
        gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.start();
        // 0.01秒后停止
        oscillator.stop(ctx.currentTime + 0.01);
        console.log("[Audio] Activation beep played.");
    } catch (e) {
        console.error("[Audio] Failed to play activation beep:", e);
    }
  };

  const resetAudioState = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setChunkProgressIndex(-1);

    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    
    window.speechSynthesis.cancel();
    
    audioCacheRef.current.clear();
    fetchingSetRef.current.clear();
    sessionIdRef.current += 1; 
    
    setCurrentChunkIndex(0);
    pausedTimeRef.current = 0;
    
    if (timerDuration > 0) {
        setTimeLeft(timerDuration * 60);
    } else {
        setTimeLeft(null);
    }
  };

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setVirtualFileName(selectedFile.name);
    setStatus(AppStatus.PARSING_PDF);
    setErrorMsg(null);
    resetAudioState();
    setExtractedText('');
    setChunks([]); 

    let estimatedChars = 0;
    if (timerDuration > 0) {
        estimatedChars = timerDuration * 500;
    } else {
        estimatedChars = 50000;
    }
    
    console.log(`Setting parsing limit to ${estimatedChars} chars. OCR Engine: ${ocrEngine}`);

    try {
      const text = await extractTextFromDocument(selectedFile, (newChunk) => {
         setExtractedText(prev => prev + newChunk);
      }, estimatedChars, ocrEngine); 
      
      if (!text || text.trim().length === 0) {
         setExtractedText(""); 
         throw new Error("未能从文档中提取到有效文字。请确认文档包含可读文字。");
      } else {
         setExtractedText(text);
      }
      
      setStatus(AppStatus.IDLE);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "文档解析失败");
      setStatus(AppStatus.ERROR);
      setFile(null);
    }
  };

  const handleTextSubmit = (text: string) => {
      resetAudioState();
      setFile(null);
      setVirtualFileName('手动输入文本.txt');
      setExtractedText(text);
      setStatus(AppStatus.IDLE);
      setErrorMsg(null);
  };

  const handleEngineChange = (engine: 'gemini' | 'browser') => {
      resetAudioState();
      setTtsEngine(engine);
      if (engine === 'gemini') {
          setSelectedVoice('Kore');
      } else {
          // 如果切换到本地语音时列表为空，尝试唤醒一次
          if (browserVoices.length === 0) {
              wakeUpBrowserTTS();
          }
          
          if (browserVoices.length > 0) {
              // 优先保留当前选择（如果有效），否则选第一个
              const currentExists = browserVoices.find(v => v.name === selectedVoice);
              if (!currentExists) {
                  setSelectedVoice(browserVoices[0].name);
              }
          }
      }
      setStatus(AppStatus.IDLE);
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    if (status === AppStatus.READY_TO_PLAY || status === AppStatus.PLAYING) {
      resetAudioState();
      setStatus(AppStatus.IDLE);
    }
  };

  // --- Gemini Specific Preload ---
  const preloadGeminiChunk = async (index: number, currentSessionId: number) => {
    if (timeLeft === 0 && timerDuration > 0) return;
    if (index >= chunks.length || index < 0) return;
    if (audioCacheRef.current.has(index)) return;
    if (fetchingSetRef.current.has(index)) return;

    fetchingSetRef.current.add(index);

    try {
      const text = chunks[index];
      const base64Audio = await generateSpeechFromText(text, selectedVoice);
      
      if (currentSessionId !== sessionIdRef.current) return;

      // 如果还没 Context，创建（主要用于非交互触发的预加载，尽管 handleStartProcess 会处理）
      // 【关键修复】不带参数创建
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioBytes = decodeBase64(base64Audio);
      // 解码时，指定原始采样率为 24000 (Gemini输出)，AudioContext 会自动重采样以匹配硬件
      const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000);

      audioCacheRef.current.set(index, audioBuffer);
    } catch (error) {
      console.error(`Error loading chunk ${index}`, error);
    } finally {
      fetchingSetRef.current.delete(index);
    }
  };

  const handleJumpToChunk = async (index: number) => {
    if (status === AppStatus.PARSING_PDF) return;
    
    // 【关键】用户交互瞬间解锁音频
    if (ttsEngine === 'gemini') ensureAudioContextReady();
    
    isPlayingRef.current = false;
    setIsPlaying(false);
    
    if (sourceNodeRef.current) { try { sourceNodeRef.current.stop(); } catch(e) {} sourceNodeRef.current = null; }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    window.speechSynthesis.cancel();
    
    sessionIdRef.current += 1;
    
    let currentChunks = chunks;
    if (chunks.length === 0 && extractedText.trim().length > 0) {
       const chunkSize = ttsEngine === 'gemini' ? 200 : 2500;
       currentChunks = splitTextIntoChunks(extractedText, chunkSize);
       setChunks(currentChunks);
    }
    
    if (currentChunks.length === 0) return;
    
    pausedTimeRef.current = 0;
    setChunkProgressIndex(-1);
    
    if (timeLeft === 0 && timerDuration > 0) {
        setTimeLeft(timerDuration * 60);
    }

    setStatus(AppStatus.READY_TO_PLAY); 
    playSequence(index, currentChunks);
  };

  const handleStartProcess = async () => {
    if (!extractedText) return;
    
    // 【关键】必须在第一个异步操作(await)之前调用，确保是在点击事件的“同步”上下文中执行
    if (ttsEngine === 'gemini') {
        ensureAudioContextReady();
    }
    
    resetAudioState();
    
    if (timerDuration > 0) {
      setTimeLeft(timerDuration * 60);
    } else {
      setTimeLeft(null);
    }
    
    const chunkSize = ttsEngine === 'gemini' ? 200 : 2500;
    const newChunks = splitTextIntoChunks(extractedText, chunkSize);
    setChunks(newChunks);

    if (newChunks.length === 0) return;

    if (ttsEngine === 'gemini') {
        setStatus(AppStatus.GENERATING_AUDIO); 
        const currentSessionId = sessionIdRef.current;
        await preloadGeminiChunk(0, currentSessionId);
        
        if (currentSessionId !== sessionIdRef.current) return;

        if (audioCacheRef.current.has(0)) {
            setStatus(AppStatus.READY_TO_PLAY);
            playSequence(0, newChunks); 
        } else {
            setErrorMsg("生成失败，请检查网络配置(API Key)或切换到“本地语音”模式。");
            setStatus(AppStatus.IDLE);
        }
    } else {
        setStatus(AppStatus.READY_TO_PLAY);
        playSequence(0, newChunks);
    }
  };

  const playSequence = async (index: number, currentChunks: string[] = chunks) => {
    const currentSessionId = sessionIdRef.current;
    
    if (timerDuration > 0 && timeLeft !== null && timeLeft <= 0) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setStatus(AppStatus.READY_TO_PLAY); 
        return;
    }

    if (index >= currentChunks.length) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setStatus(AppStatus.IDLE);
      setCurrentChunkIndex(0);
      pausedTimeRef.current = 0;
      setChunkProgressIndex(-1);
      return;
    }

    setCurrentChunkIndex(index);
    setIsPlaying(true);
    isPlayingRef.current = true;
    setStatus(AppStatus.PLAYING);
    setChunkProgressIndex(0);

    // === PATH A: BROWSER NATIVE TTS ===
    if (ttsEngine === 'browser') {
        const utterance = new SpeechSynthesisUtterance(currentChunks[index]);
        utterance.rate = playbackRate; 
        
        let voiceObj = browserVoices.find(v => v.name === selectedVoice);
        if (voiceObj) {
            utterance.voice = voiceObj;
        } else {
            utterance.lang = 'zh-CN';
        }
        
        utterance.onboundary = (event) => {
            if (event.name === 'word' || event.name === 'sentence') {
                setChunkProgressIndex(event.charIndex);
            }
        };

        utterance.onend = () => {
            if (isPlayingRef.current && sessionIdRef.current === currentSessionId) {
                setChunkProgressIndex(-1);
                playSequence(index + 1, currentChunks);
            }
        };

        utterance.onerror = (e) => {
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            console.error("Browser TTS Error:", e.error, e);
            setIsPlaying(false);
            isPlayingRef.current = false;
        };

        window.speechSynthesis.speak(utterance);
        return;
    }

    // === PATH B: GEMINI AI TTS ===
    if (!audioContextRef.current) {
        ensureAudioContextReady();
    }
    
    // 再次检查并 Resume
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        console.log("Resuming suspended context inside playSequence");
        await audioContextRef.current.resume();
      } catch (e) { console.error(e); }
    }

    let buffer = audioCacheRef.current.get(index);

    if (!buffer) {
      setStatus(AppStatus.GENERATING_AUDIO);
      await preloadGeminiChunk(index, currentSessionId);
      
      if (sessionIdRef.current !== currentSessionId) return;

      buffer = audioCacheRef.current.get(index);
      if (!buffer) {
        if (sessionIdRef.current === currentSessionId) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            setStatus(AppStatus.ERROR);
            setErrorMsg("缓冲超时，建议切换“本地语音”");
        }
        return;
      }
      setStatus(AppStatus.PLAYING);
    }

    preloadGeminiChunk(index + 1, currentSessionId);
    setTimeout(() => {
        if (isPlayingRef.current && sessionIdRef.current === currentSessionId) {
            preloadGeminiChunk(index + 2, currentSessionId);
        }
    }, 5000);

    if (!audioContextRef.current) return;
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(audioContextRef.current.destination);

    const offset = pausedTimeRef.current;
    
    // 播放前再次确认
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    
    source.start(0, offset);
    startTimeRef.current = audioContextRef.current.currentTime;
    sourceNodeRef.current = source;

    const bufferDuration = buffer.duration;
    const chunkTextLength = currentChunks[index].length;
    
    const animateProgress = () => {
        if (!isPlayingRef.current || sessionIdRef.current !== currentSessionId || !sourceNodeRef.current || !audioContextRef.current) {
            return;
        }

        const currentTime = audioContextRef.current.currentTime;
        const elapsedRealTime = currentTime - startTimeRef.current;
        const elapsedAudioTime = elapsedRealTime * playbackRate + offset;

        if (elapsedAudioTime >= bufferDuration) {
            setChunkProgressIndex(chunkTextLength);
        } else {
            const ratio = elapsedAudioTime / bufferDuration;
            const estimatedIndex = Math.floor(ratio * chunkTextLength);
            setChunkProgressIndex(estimatedIndex);
            
            animationFrameRef.current = requestAnimationFrame(animateProgress);
        }
    };
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animateProgress);


    source.onended = () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (isPlayingRef.current && sessionIdRef.current === currentSessionId) {
        pausedTimeRef.current = 0;
        setChunkProgressIndex(-1);
        playSequence(index + 1, currentChunks);
      }
    };
  };

  const handlePause = () => {
    isPlayingRef.current = false; 
    setIsPlaying(false);
    setStatus(AppStatus.READY_TO_PLAY);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    if (ttsEngine === 'browser') {
        window.speechSynthesis.cancel(); 
    } else {
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
            audioContextRef.current.suspend();
        }

        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.stop(); } catch(e) {}
            if (audioContextRef.current) {
                const elapsed = (audioContextRef.current.currentTime - startTimeRef.current) * playbackRate;
                pausedTimeRef.current = pausedTimeRef.current + elapsed;
            }
        }
    }
  };

  const handleResume = () => {
     if (timerDuration > 0 && timeLeft !== null && timeLeft <= 0) {
         if (window.confirm("定时已结束，是否重置时间继续播放？")) {
             setTimeLeft(timerDuration * 60);
         } else {
             return;
         }
     }
     
     if (ttsEngine === 'gemini') ensureAudioContextReady();
     playSequence(currentChunkIndex);
  };

  const handleReset = () => {
    resetAudioState();
    setFile(null);
    setVirtualFileName('');
    setExtractedText('');
    setChunks([]);
    setStatus(AppStatus.IDLE);
    setErrorMsg(null);
    if (timerDuration > 0) {
       setTimeLeft(timerDuration * 60);
    }
  };

  const handleTimerChange = (minutes: number) => {
    setTimerDuration(minutes);
    if (minutes > 0) {
        setTimeLeft(minutes * 60);
    } else {
        setTimeLeft(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800">智能文档朗读助手</h1>
        </div>
        <div className="text-sm text-slate-500 hidden sm:block">
           快速流式朗读 · Gemini & Native TTS
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl flex flex-col md:flex-row gap-6 h-auto items-start">
        
        {/* Left Panel: Input & Text */}
        <div className="flex-1 w-full min-w-0 flex flex-col gap-4 h-auto">
          {(!file && !extractedText) ? (
            <div className="flex-1 flex flex-col justify-center min-h-[500px]">
               <FileSelect 
                 onFileSelected={handleFileSelected} 
                 onTextSubmit={handleTextSubmit}
                 isLoading={status === AppStatus.PARSING_PDF} 
                 ocrEngine={ocrEngine}
                 onOcrEngineChange={setOcrEngine}
               />
               {errorMsg && (
                 <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 text-sm text-center animate-pulse">
                   {errorMsg}
                 </div>
               )}
            </div>
          ) : (
            <div className="w-full">
               <TextPreview 
                  text={extractedText} 
                  onChange={setExtractedText} 
                  fileName={file ? file.name : virtualFileName}
                  isProcessing={status === AppStatus.PARSING_PDF}
                  chunks={chunks}
                  currentChunkIndex={currentChunkIndex}
                  chunkProgressIndex={chunkProgressIndex}
                  isPlaying={isPlaying || status === AppStatus.PLAYING || status === AppStatus.READY_TO_PLAY}
               />
            </div>
          )}
        </div>

        {/* Right Panel: Controls & Visualization */}
        <div className="w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col gap-4 sticky top-24 self-start">
           
           <AudioController 
             status={status}
             onGenerate={handleStartProcess}
             onPlay={handleResume}
             onPause={handlePause}
             onReset={handleReset}
             textLength={extractedText.length}
             isPlaying={isPlaying}
             
             ttsEngine={ttsEngine}
             onEngineChange={handleEngineChange}
             selectedVoice={selectedVoice}
             onVoiceChange={handleVoiceChange}
             onRefreshVoices={wakeUpBrowserTTS} 
             browserVoices={browserVoices}
             
             playbackRate={playbackRate}
             onPlaybackRateChange={setPlaybackRate}
             timerDuration={timerDuration}
             onTimerChange={handleTimerChange}
             timeLeft={timeLeft}
           />

           {/* Playlist */}
           <div className="bg-white rounded-xl border border-slate-200 text-sm text-slate-600 flex-1 flex flex-col shadow-sm max-h-[500px] overflow-hidden">
             <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 flex justify-between items-center">
                  <span>
                    {chunks.length > 0 ? '播放列表' : '状态监控'}
                  </span>
                  {chunks.length > 0 && (
                     <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                       {currentChunkIndex + 1} / {chunks.length}
                     </span>
                  )}
                </h3>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 space-y-2 h-[300px]">
                {chunks.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs leading-relaxed">
                     {status === AppStatus.PARSING_PDF ? (
                       <div className="flex flex-col items-center gap-2">
                         <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400"></div>
                         <span>正在逐页解析文档...<br/>文字将实时显示</span>
                       </div>
                     ) : (
                        <>
                          <p className="mb-2">暂无分段数据。</p>
                          <p>点击“开始朗读”后，系统会将文章智能切分为短句并显示在此处。</p>
                        </>
                     )}
                  </div>
                ) : (
                  chunks.map((chunk, idx) => {
                    const isActive = idx === currentChunkIndex;
                    return (
                      <div 
                        key={idx}
                        ref={isActive ? activeChunkRef : null}
                        onClick={() => handleJumpToChunk(idx)}
                        className={`p-3 rounded-lg text-xs cursor-pointer transition-all border
                          ${isActive 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm ring-1 ring-indigo-200' 
                            : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200 text-slate-600'
                          }`}
                      >
                         <div className="flex gap-2">
                            <span className={`font-mono font-bold ${isActive ? 'text-indigo-500' : 'text-slate-300'}`}>
                              {(idx + 1).toString().padStart(2, '0')}
                            </span>
                            <p className="line-clamp-2">{chunk}</p>
                         </div>
                      </div>
                    );
                  })
                )}
             </div>
           </div>
        </div>

      </main>
    </div>
  );
};

export default App;
