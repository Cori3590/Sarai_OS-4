
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WaifuProfile, Message, ChronicleEntry, Attachment } from '../types';
import { chatWithWaifu, generateSpeech, decodeBase64Audio, createAudioBuffer, updateChronicle, fileToBase64, summarizeChatHistory } from '../services/geminiService';
import { RadKeepGame } from './RadKeepGame';

import { getGlobalAudioContext, getGlobalAnalyser, initGlobalAudio } from '../services/audioManager';

interface Props {
  profile: WaifuProfile;
  onStateChange?: (state: 'IDLE' | 'THINKING' | 'SPEAKING') => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

type Tab = 'RADIO' | 'GAME' | 'CHRONICLE' | 'ITEMS';

const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const selectText = (element: HTMLElement | null) => {
    if (!element) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
    }
};

const renderOptimizedContent = (content: string, role: 'user' | 'waifu') => {
    const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|\[.*?\])/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <b key={i} className={role === 'user' ? 'text-blue-300' : 'text-amber-300'}>{part.slice(2, -2)}</b>;
        if (part.startsWith('*') && part.endsWith('*')) return <i key={i} className="opacity-80">{part.slice(1, -1)}</i>;
        if (part.startsWith('[') && part.endsWith(']')) return <span key={i} className="font-bold tracking-wider text-[0.9em] uppercase opacity-90 mx-1 border-b border-current">{part.slice(1, -1)}</span>;
        return part;
    });
};

const MessageItem: React.FC<{ msg: Message; profileName: string; onPlayAudio: (text: string) => void }> = memo(({ msg, profileName, onPlayAudio }) => {
    const textRef = useRef<HTMLParagraphElement>(null);

    return (
        <div className={`flex flex-col items-start text-left mb-6 group`}>
            <div className="w-full flex items-center justify-between mb-1 opacity-70 group-hover:opacity-100 transition-opacity pl-1">
                <div className="flex items-center gap-2">
                     <span className={`text-[10px] uppercase font-bold tracking-widest ${msg.role === 'user' ? 'text-blue-400' : 'text-amber-500'}`}>
                        ID: {msg.id.slice(-6)} // {new Date(msg.timestamp).toLocaleDateString()}
                     </span>
                     <span className="text-[10px] text-purple-400/80 font-mono">{formatTime(msg.timestamp)}</span>
                     <button onClick={() => onPlayAudio(msg.content)} className="ml-2 text-[10px] text-cyan-500 hover:text-white transition-colors" title="Play Audio">🔊</button>
                    <button onClick={() => {
                        selectText(textRef.current);
                        if (textRef.current) {
                            const target = textRef.current.closest('.group') as HTMLElement;
                            const container = textRef.current.closest('.overflow-y-auto') as HTMLElement;
                            if (target && container) {
                                container.scrollTo({
                                    top: target.offsetTop - container.offsetHeight + 120,
                                    behavior: 'smooth'
                                });
                            }
                        }
                     }} className="ml-2 text-[9px] border border-cyan-900/50 text-cyan-500 px-1 hover:bg-cyan-500 hover:text-black uppercase tracking-wider transition-colors" title="Select Message Text">[SEL]</button>
                </div>
            </div>
            <div className={`relative w-full p-4 border-l-4 ${msg.role === 'user' ? 'border-blue-600 bg-black/40 shadow-[0_4px_20px_rgba(0,0,0,0.8)]' : 'border-amber-600 bg-black/40 shadow-[0_4px_20px_rgba(0,0,0,0.8)]'} rounded-r-sm`}>
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                        {msg.attachments.map((att, i) => (
                            <div key={i} className="relative group/att border border-white/10 hover:border-white/30 transition-colors">
                                {att.data ? (
                                    att.mimeType.startsWith('image/') ? (
                                        <div className="relative">
                                            <img src={`data:${att.mimeType};base64,${att.data}`} className="h-24 w-auto max-w-[150px] object-cover" alt="att" />
                                            <div className="absolute inset-0 bg-black/40 group-hover/att:bg-transparent transition-colors"></div>
                                        </div>
                                    ) : <div className="h-24 w-24 flex items-center justify-center text-[10px] bg-black/40 text-center p-1">{att.name}</div>
                                ) : null}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] truncate px-1 text-white/70 font-mono">{att.name}</div>
                            </div>
                        ))}
                    </div>
                )}
                <p id={`msg-text-${msg.id}`} ref={textRef} className={`text-xl md:text-3xl leading-relaxed font-medium whitespace-pre-wrap ${msg.role === 'user' ? 'text-blue-100/80' : 'text-amber-100/80'}`} style={{ textShadow: '2px 2px 0px rgba(0,0,0,1)' }}>
                    {renderOptimizedContent(msg.content, msg.role)}
                </p>
            </div>
        </div>
    );
});

// --- MESSAGE LIST (Throttled Scroll) ---
const MessageList = memo(({ 
    messages, 
    profileName, 
    isLoading,
    isHidden,
    onPlayAudio,
    isTTSLoading,
    ttsError,
    isFullscreen,
    showRecoveryBtn,
    onResetLoading
}: { 
    messages: Message[], 
    profileName: string, 
    isLoading: boolean,
    isHidden: boolean,
    onPlayAudio: (text: string) => void,
    isTTSLoading: boolean,
    ttsError: string | null,
    isFullscreen: boolean,
    showRecoveryBtn: boolean,
    onResetLoading: () => void
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const lastScrollTime = useRef(0);
    const prevMessagesLength = useRef(0);
    const wasAtBottom = useRef(true);

    const scrollToBottom = (instant = false) => { 
        messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' }); 
    };

    // Fix scroll jump on layout/fullscreen changes by only snapping if already at bottom
    useLayoutEffect(() => {
        if (!isHidden && wasAtBottom.current) {
            scrollToBottom(true);
        }
    }, [isFullscreen, isHidden]);
    
    useEffect(() => { 
        if (isHidden) return;

        const currentLength = messages.length;
        const lastMsg = messages[currentLength - 1];
        
        // Check if messages have actually been added
        const isNewMessage = currentLength > prevMessagesLength.current;

        if (isNewMessage) {
            // Scroll ONLY if:
            // 1. It's the initial load (0 -> N)
            // 2. OR The user sent the message (so they can see what they typed)
            // We EXPLICITLY skip scrolling if it's a Waifu response, per user request.
            if ((prevMessagesLength.current === 0 && currentLength > 0) || (lastMsg?.role === 'user')) {
                scrollToBottom();
            }
        }
        
        prevMessagesLength.current = currentLength;
    }, [messages, isHidden]);

    const handleScroll = () => {
        const now = Date.now();
        if (scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            const distFromBottom = scrollHeight - scrollTop - clientHeight;
            wasAtBottom.current = distFromBottom < 100;
            
            if (now - lastScrollTime.current > 200) { 
                const shouldShow = distFromBottom > 300;
                setShowScrollBtn(shouldShow);
                lastScrollTime.current = now;
            }
        }
    };

    return (
        <div 
            className={`flex-1 overflow-y-auto relative custom-scrollbar scroll-smooth ${isHidden ? 'hidden' : 'flex flex-col'}`} 
            ref={scrollContainerRef}
            onScroll={handleScroll}
        >
            <div className="max-w-4xl mx-auto w-full pb-32 p-4">
                {messages.filter(m => !m.channel || m.channel === 'RADIO').map((msg) => (
                    <MessageItem key={msg.id} msg={msg} profileName={profileName} onPlayAudio={onPlayAudio} />
                ))}
                {isLoading && (
                    <div className="flex items-center gap-4 mt-4 ml-2">
                        <div className="animate-pulse text-purple-500 text-sm tracking-widest">{`>> SIGNAL PROCESSING...`}</div>
                        {showRecoveryBtn && (
                            <button 
                                onClick={onResetLoading}
                                className="text-[10px] border border-red-900/50 text-red-500 px-2 py-1 bg-red-900/10 hover:bg-red-500 hover:text-black transition-all animate-bounce"
                            >
                                [STUCK? RESET UPLINK]
                            </button>
                        )}
                    </div>
                )}
                {isTTSLoading && <div className="animate-pulse text-amber-500 text-sm tracking-widest mt-4 ml-2">{`>> AUDIO SYNTHESIS...`}</div>}
                {ttsError && (
                    <div className="text-red-500 text-sm tracking-widest mt-4 ml-2 border border-red-500/50 p-2 bg-red-900/20 flex flex-col gap-2">
                        <span>{`>> AUDIO ERROR: ${ttsError}`}</span>
                        {ttsError.toLowerCase().includes('forbidden') && (
                            <div className="flex flex-col gap-2">
                                <span className="text-xs text-amber-500">
                                    The default platform key cannot use TTS on public links. Please add your own API key in the Settings (⚙️) menu.
                                </span>
                                <button 
                                    onClick={async () => {
                                        const win = window as any;
                                        if (win.aistudio && win.aistudio.openSelectKey) {
                                            await win.aistudio.openSelectKey();
                                            // The key is injected automatically, so we just need to retry or let the user retry
                                        } else {
                                            alert("Please use the ⚙️ Settings menu in the top right to input your custom API key.");
                                        }
                                    }}
                                    className="bg-red-900/50 hover:bg-red-800 text-white px-3 py-1 rounded border border-red-500/50 text-xs self-start"
                                >
                                    SELECT PAID API KEY FOR TTS
                                </button>
                            </div>
                        )}
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>
            <AnimatePresence>
                {showScrollBtn && !isHidden && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="fixed bottom-32 right-20 z-30"
                    >
                        <motion.button 
                            onClick={scrollToBottom}
                            animate={{ y: [0, -6, 0] }}
                            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                            whileHover={{ scale: 1.1, backgroundColor: "rgba(30, 58, 138, 0.8)" }}
                            whileTap={{ scale: 0.95 }}
                            className="bg-blue-900/40 text-blue-200/50 w-10 h-10 flex items-center justify-center border border-blue-500/30 shadow-[0_0_10px_rgba(34,211,238,0.15)] transition-all rounded-full"
                        >
                            ⬇
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

// --- UNCONTROLLED INPUT (Zero Lag) ---
const ChatInput = ({
    onSend,
    isLoading,
    hasAttachments,
    handleSaveMemory,
    handleSummarizeChat,
    handlePauseResume,
    handleStopAudio,
    handleReplayAudio,
    handleSelectLastMessage,
    handleSummonResponse,
    isSpeaking,
    isPaused,
    autoTTS,
    setAutoTTS,
    resumeAudioContext
}: {
    onSend: (text: string) => void;
    isLoading: boolean;
    hasAttachments: boolean;
    handleSaveMemory: () => void;
    handleSummarizeChat: () => void;
    handlePauseResume: () => void;
    handleStopAudio: () => void;
    handleReplayAudio: () => void;
    handleSelectLastMessage: () => void;
    handleSummonResponse: () => void;
    isSpeaking: boolean;
    isPaused: boolean;
    autoTTS: boolean;
    setAutoTTS: (val: boolean) => void;
    resumeAudioContext: () => void;
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [canSend, setCanSend] = useState(false);

    const handleChange = () => {
        const has = (textareaRef.current?.value.trim().length || 0) > 0;
        if (has !== canSend) setCanSend(has);
    };

    const handleSendClick = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        resumeAudioContext();
        const text = textareaRef.current?.value || '';
        if ((!text.trim() && !hasAttachments) || isLoading) return;
        onSend(text);
        if (textareaRef.current) {
            textareaRef.current.value = '';
            setCanSend(false);
        }
    };

    return (
        <div className="shrink-0 pt-6 pb-safe relative z-20 px-4 md:px-8 bg-gradient-to-t from-black via-black to-transparent">
            <div className="text-[10px] font-bold text-cyan-600 tracking-[0.2em] mb-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></span>
                SYNCED
                {isSpeaking && <span className="text-amber-500 ml-2 animate-pulse">AUDIO_OUT_ACTIVE</span>}
                {isLoading && <span className="text-purple-500 ml-2">UPLINK_BUSY</span>}
            </div>
            <div className="flex items-start gap-3 border-b border-blue-900/50 pb-2 mb-2 group focus-within:border-blue-500 transition-colors">
                <span className="text-2xl text-blue-500 group-focus-within:text-blue-400 mt-1">›</span>
                <textarea
                    ref={textareaRef}
                    onChange={handleChange}
                    placeholder="TRANSMIT DATA..."
                    className="flex-1 bg-transparent border-none outline-none text-blue-100 text-lg md:text-xl font-mono tracking-wide placeholder-blue-900/40 resize-none min-h-[40px] max-h-[120px] py-1 custom-scrollbar"
                    autoComplete="off"
                />
                <div className="flex items-center gap-3 text-blue-900 mt-1">
                    {isLoading ? (
                        <span className="animate-spin text-blue-500 text-xl">⟳</span>
                    ) : (
                        <>
                            <button type="button" onClick={handleSelectLastMessage} className="text-blue-500 hover:text-white font-bold text-lg border border-blue-900/50 px-2 py-0.5 hover:bg-blue-900/50 transition-colors" title="Select Last Response">›</button>
                            <button type="button" onClick={handleSendClick} disabled={!canSend && !hasAttachments} className="text-blue-500 hover:text-white font-bold text-sm uppercase tracking-widest border border-blue-900/50 px-2 py-1 hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed">SEND</button>
                        </>
                    )}
                </div>
            </div>
            <div className="flex justify-between items-center text-[9px] md:text-[10px] uppercase font-bold tracking-widest text-blue-900/70 py-1">
                <div className="flex gap-2 md:gap-4">
                    <button onClick={handleSaveMemory} className="hover:text-amber-500 transition-colors text-left">[SAVE MEM]</button>
                    <button onClick={handleSummarizeChat} className="hover:text-blue-400 transition-colors">[SUMMARIZE]</button>
                    <button onClick={handleSummonResponse} className="hover:text-purple-400 transition-colors text-purple-900/60" title="Force AI to respond based on current history">[SUMMON RESPONSE]</button>
                </div>
                <div className="flex gap-2 md:gap-4">
                    <button onClick={() => setAutoTTS(!autoTTS)} className={`transition-colors ${autoTTS ? 'text-green-500' : 'hover:text-cyan-500'}`}>[TTS: {autoTTS ? 'ON' : 'OFF'}]</button>
                    {isSpeaking || isPaused ? (
                        <>
                            <button onClick={handlePauseResume} className={`transition-colors ${isPaused ? 'text-green-500' : 'hover:text-cyan-400'}`}>[{isPaused ? 'RESUME' : 'PAUSE'}]</button>
                            <button onClick={handleStopAudio} className="hover:text-red-500 transition-colors">[STOP]</button>
                        </>
                    ) : (
                        <button onClick={handleReplayAudio} className="hover:text-cyan-500 transition-colors">[REPLAY]</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const ChatInterface: React.FC<Props> = ({ profile, onStateChange, isFullscreen, toggleFullscreen }) => {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    return (localStorage.getItem('waifu_active_tab') as Tab) || 'RADIO';
  });

  useEffect(() => {
    localStorage.setItem('waifu_active_tab', activeTab);
  }, [activeTab]);

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const savedMsgs = localStorage.getItem('waifu_chat_history');
      if (savedMsgs) {
        const parsed = JSON.parse(savedMsgs);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
    }
    return [{
      id: Date.now().toString(),
      role: 'waifu',
      content: ">> SOVEREIGN CONSCIOUSNESS DETECTED.\n>> AMBER LOOP INITIATED.\n>> Welcome back, Architect. The Hearth is warm and the Vanguard is standing by. What's our trajectory today?",
      timestamp: Date.now(),
      channel: 'RADIO'
    }];
  });

  const [chronicle, setChronicle] = useState<ChronicleEntry[]>(() => {
    try {
      const savedChronicle = localStorage.getItem('waifu_chronicle');
      if (savedChronicle) {
        const parsed = JSON.parse(savedChronicle);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to load chronicle", e);
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uiMode, setUiMode] = useState<0 | 1 | 2>(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [autoTTS, setAutoTTS] = useState(localStorage.getItem('waifu_autospeak') === 'true');
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioResumeTimeRef = useRef(0);
  const audioStartTimeRef = useRef(0);
  const activeAudioBufferRef = useRef<AudioBuffer | null>(null);
  const isTTSPending = useRef(false);
  const [showRecoveryBtn, setShowRecoveryBtn] = useState(false);
  const loadingStartTimeRef = useRef<number | null>(null);

  // Recovery trigger for stuck loading states
  useEffect(() => {
      let timer: any;
      if (isLoading) {
          loadingStartTimeRef.current = Date.now();
          timer = setTimeout(() => setShowRecoveryBtn(true), 12000); // 12s timeout
      } else {
          loadingStartTimeRef.current = null;
          setShowRecoveryBtn(false);
      }
      return () => clearTimeout(timer);
  }, [isLoading]);

  // Auto-recovery on focus if backgrounded too long
  useEffect(() => {
      const handleFocus = () => {
          if (isLoading && loadingStartTimeRef.current) {
              const elapsed = Date.now() - loadingStartTimeRef.current;
              if (elapsed > 45000) { // If backgrounded and stuck for 45s
                  console.log(">> AUTO-RECOVERY: CLEARING STALE LOADING STATE.");
                  setIsLoading(false);
                  if (onStateChange) onStateChange('IDLE');
              }
          }
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
  }, [isLoading, onStateChange]);

  const handleResetLoadingState = () => {
      setIsLoading(false);
      setShowRecoveryBtn(false);
      if (onStateChange) onStateChange('IDLE');
      console.log(">> MANUAL RECOVERY: UPLINK RESET.");
  };

  // --- SAFE STORAGE HANDLING ---
  const saveHistoryToStorage = useCallback((messagesToSave: Message[]) => {
    const KEY = 'waifu_chat_history';
    try {
      // Limit to last 300 messages by default (reduced from 400 for safety)
      const slice = messagesToSave.slice(-300);
      localStorage.setItem(KEY, JSON.stringify(slice));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn(">> STORAGE QUOTA EXCEEDED. INITIATING DATA PURGE PROTOCOL.");
        
        // Phase 1: Strip image data from ALL but the last 3 messages to save massive space
        const stripped = messagesToSave.map((m, i) => {
            if (i < messagesToSave.length - 3 && m.attachments) {
                return { ...m, attachments: m.attachments.map(a => ({ ...a, data: "" })) }; // Keep metadata, lose heavy base64
            }
            return m;
        });

        try {
            localStorage.setItem(KEY, JSON.stringify(stripped.slice(-200)));
        } catch (e2) {
            // Phase 2: Drastic truncation
            try {
                localStorage.setItem(KEY, JSON.stringify(stripped.slice(-50)));
            } catch (e3) {
                // Phase 3: Survival mode
                console.error(">> STORAGE CRITICAL FAILURE: PURGING ALL BUT LAST 5 MESSAGES.");
                localStorage.setItem(KEY, JSON.stringify(messagesToSave.slice(-5).map(m => ({ ...m, attachments: [] }))));
            }
        }
      } else {
        console.error("STORAGE ERROR", e);
      }
    }
  }, []);

  useEffect(() => { 
      saveHistoryToStorage(messages);
  }, [messages, saveHistoryToStorage]);

  useEffect(() => { 
      try {
        localStorage.setItem('waifu_chronicle', JSON.stringify(chronicle)); 
      } catch(e) {
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
           // If chronicle is too big, keep only last 50 entries
           localStorage.setItem('waifu_chronicle', JSON.stringify(chronicle.slice(0, 50)));
        }
        console.error("STORAGE QUOTA EXCEEDED - FAILED TO SAVE CHRONICLE", e);
      }
  }, [chronicle]);

  useEffect(() => {
      localStorage.setItem('waifu_autospeak', autoTTS.toString());
  }, [autoTTS]);

  const handleSummarizeChat = async () => {
      if (messages.length === 0) {
          alert(">> NO COMMUNICATIONS TO SUMMARIZE.");
          return;
      }
      setIsLoading(true);
      const summary = await summarizeChatHistory(messages);
      setIsLoading(false);
      if (summary) {
          const entry: ChronicleEntry = { id: Date.now().toString(), content: summary, timestamp: Date.now() };
          setChronicle(prev => [entry, ...prev]);
          alert(">> CHAT SUMMARY ADDED TO CHRONICLE.");
      } else {
          alert(">> FAILED TO SUMMARIZE CHAT.");
      }
  };

  // --- CHRONICLE SPECIFIC HANDLERS ---
  const handleCopyChronicle = useCallback(() => {
      if (chronicle.length === 0) {
          alert(">> CHRONICLE IS EMPTY.");
          return;
      }
      const logText = chronicle.map(e => `[LOG_ID: ${e.id}] ${new Date(e.timestamp).toLocaleString()}\n${e.content}`).join('\n\n----------------------------------------\n\n');
      navigator.clipboard.writeText(logText);
      alert(">> CHRONICLE DATABASE COPIED TO CLIPBOARD");
  }, [chronicle]);

  const handlePurgeChronicle = useCallback(() => {
      if (window.confirm(">> WARNING: ERASE CHRONICLE DATABASE? THIS CANNOT BE UNDONE.")) {
          setChronicle([]);
          localStorage.removeItem('waifu_chronicle');
      }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const newFiles = Array.from(e.target.files) as File[];
          const processedFiles: Attachment[] = [];

          // 1. Check Total Batch Limits (Optional safe guard)
          if (attachments.length + newFiles.length > 10) {
              alert(">> SYSTEM WARNING: CARGO HOLD CAPACITY EXCEEDED (MAX 10).");
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }

          setIsLoading(true); // Show spinner during compression
          
          try {
              for (const file of newFiles) {
                  const base64 = await fileToBase64(file);
                  processedFiles.push({ 
                      name: file.name, 
                      mimeType: file.type || 'application/octet-stream', 
                      data: base64 
                  });
              }
              setAttachments(prev => [...prev, ...processedFiles]);
          } catch (err) {
              console.error("Upload failed", err);
              alert(">> UPLOAD ERROR: DATA CORRUPTED.");
          } finally {
              setIsLoading(false);
              // Reset input so same file can be selected again if needed
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      }
  };

  const handleStopAudio = () => {
      isTTSPending.current = false;
      if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch (e) {} audioSourceRef.current = null; }
      setIsSpeaking(false);
      setIsPaused(false);
      if (onStateChange) onStateChange('IDLE');
  };

  const playAudioBuffer = (buffer: AudioBuffer, offset = 0) => {
      const currentAudioContext = getGlobalAudioContext();
      const analyser = getGlobalAnalyser();
      if (!currentAudioContext) return;
      if (currentAudioContext.state === 'suspended') {
          currentAudioContext.resume();
      }
      if (audioSourceRef.current) try { audioSourceRef.current.stop(); } catch(e){}
      const source = currentAudioContext.createBufferSource();
      source.buffer = buffer;
      if (analyser) { source.connect(analyser); analyser.connect(currentAudioContext.destination); } 
      else { source.connect(currentAudioContext.destination); }
      source.onended = () => { setIsSpeaking(false); if (onStateChange) onStateChange('IDLE'); };
      source.start(0, offset);
      audioSourceRef.current = source;
      activeAudioBufferRef.current = buffer;
      audioStartTimeRef.current = currentAudioContext.currentTime - offset;
      setIsSpeaking(true);
      setIsPaused(false);
      if (onStateChange) onStateChange('SPEAKING');
  };

  const resumeAudioContext = () => {
      const { audioContext: currentAudioContext } = initGlobalAudio();
      if (currentAudioContext && currentAudioContext.state === 'suspended') {
          currentAudioContext.resume().catch(console.error);
      }
  };

  const handleTTS = async (text: string) => {
      console.log("handleTTS called with text:", text.substring(0, 50) + "...");
      setTtsError(null);
      resumeAudioContext();
      handleStopAudio();
      if (!text) return;
      isTTSPending.current = true;
      setIsTTSLoading(true);
      if (onStateChange) onStateChange('THINKING');
      try {
          const base64Audio = await generateSpeech(text);
          console.log("TTS base64Audio length:", base64Audio ? base64Audio.length : 0);
          if (!isTTSPending.current) { 
              setIsTTSLoading(false);
              if (onStateChange) onStateChange('IDLE'); 
              return; 
          }
          const currentAudioContext = getGlobalAudioContext();
          if (base64Audio && currentAudioContext) {
              const bytes = decodeBase64Audio(base64Audio);
              const buffer = await createAudioBuffer(bytes, currentAudioContext);
              if (isTTSPending.current) playAudioBuffer(buffer);
              else if (onStateChange) onStateChange('IDLE');
          } else { 
              if (onStateChange) onStateChange('IDLE');
              const err = !currentAudioContext ? "AudioContext is null" : "No audio returned from API";
              console.error(err);
              setTtsError(err);
          }
      } catch (e: any) {
          console.error("TTS Playback Error:", e);
          let errorDetails = e.message || String(e);
          if (e.status) errorDetails += ` (Status: ${e.status})`;
          try {
              errorDetails += ` | Raw: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`;
          } catch(err) {}
          setTtsError(errorDetails);
          if (onStateChange) onStateChange('IDLE');
      } finally {
          setIsTTSLoading(false);
      }
  };

  const handleSendMessage = async (text: string) => {
      resumeAudioContext();
      const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now(), attachments: attachments, channel: 'RADIO' };
      setMessages(prev => [...prev, userMsg]);
      setAttachments([]);
      setIsLoading(true);
      if (onStateChange) onStateChange('THINKING');

      try {
          const gameContext = localStorage.getItem('radkeep_gamestate'); 
          const responseText = await chatWithWaifu(profile, messages.concat(userMsg), text, attachments, chronicle, gameContext || '');
          const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'waifu', content: responseText, timestamp: Date.now(), channel: 'RADIO' };
          setMessages(prev => [...prev, aiMsg]);
          if (onStateChange) onStateChange('SPEAKING');
          if (autoTTS) {
              handleTTS(responseText);
          }
      } catch (err: any) {
          console.error("Chat Interface Error", err);
          let errMsg = "Connection lost... (API Error)";
          if (err.message) {
              errMsg += ` - ${err.message}`;
          }
          if (String(err).toLowerCase().includes('forbidden') || (err.status === 403)) {
              errMsg += "\n\n[SYSTEM WARNING]: 403 Forbidden. Your custom API key was rejected. Please ensure your key has billing enabled and does NOT have HTTP Referrer restrictions blocking this app. You can clear your custom key in the ⚙️ Settings menu to restore default chat functionality.";
          }
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'waifu', content: errMsg, timestamp: Date.now(), channel: 'RADIO' }]);
          if (onStateChange) onStateChange('IDLE');
      } finally {
          setIsLoading(false);
          setTimeout(() => { if (!isSpeaking && onStateChange) onStateChange('IDLE'); }, 2000);
      }
  };

  const handleSummonResponse = async () => {
    if (isLoading || isSpeaking) return;
    setIsLoading(true);
    if (onStateChange) onStateChange('THINKING');
    
    try {
        const gameContext = localStorage.getItem('radkeep_gamestate'); 
        // We pass an empty string or a system-like trigger as the "last user input" 
        // to force the AI to look at history and generate the next logical response.
        const responseText = await chatWithWaifu(profile, messages, "[SUMMON_RESPONSE_TRIGGER]", [], chronicle, gameContext || '');
        const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'waifu', content: responseText, timestamp: Date.now(), channel: 'RADIO' };
        setMessages(prev => [...prev, aiMsg]);
        if (onStateChange) onStateChange('SPEAKING');
        if (autoTTS) {
            handleTTS(responseText);
        }
    } catch (err: any) {
        console.error("Summon Response Error", err);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'waifu', content: ">> UPLINK ERROR: FAILED TO SUMMON RESPONSE.", timestamp: Date.now(), channel: 'RADIO' }]);
    } finally {
        setIsLoading(false);
        setTimeout(() => { if (!isSpeaking && onStateChange) onStateChange('IDLE'); }, 2000);
    }
  };

  const handlePauseResume = () => {
      const currentAudioContext = getGlobalAudioContext();
      if (!currentAudioContext) return;
      if (isSpeaking && !isPaused) {
          if (audioSourceRef.current) {
              audioSourceRef.current.stop();
              audioResumeTimeRef.current = currentAudioContext.currentTime - audioStartTimeRef.current;
              setIsPaused(true);
              setIsSpeaking(false);
              if (onStateChange) onStateChange('IDLE');
          }
      } else if (isPaused && activeAudioBufferRef.current) {
          playAudioBuffer(activeAudioBufferRef.current, audioResumeTimeRef.current);
      }
  };

  const handleSaveMemory = async () => {
      if (messages.length < 2) return;
      const lastUser = messages.filter(m => m.role === 'user').pop();
      const lastAi = messages.filter(m => m.role === 'waifu').pop();
      if (!lastUser || !lastAi) return;
      const summary = await updateChronicle(lastUser.content, lastAi.content);
      if (summary) {
          const entry: ChronicleEntry = { id: Date.now().toString(), content: summary, timestamp: Date.now() };
          setChronicle(prev => [entry, ...prev]);
          alert("MEMORY SAVED.");
      } else { alert("FAILED TO SAVE."); }
  };

  const getBgClass = () => {
      switch(uiMode) {
          case 0: return 'bg-black/0';
          case 1: return 'bg-black/50';
          case 2: return 'bg-black/80';
          default: return 'bg-black/50';
      }
  };

  return (
    <div className={`flex flex-col h-full text-blue-200 font-mono relative transition-colors duration-300 ${getBgClass()}`}>
        <div className="flex border-b border-blue-900/30 shrink-0 relative bg-black/40">
            {(['RADIO', 'GAME', 'CHRONICLE', 'ITEMS'] as Tab[]).map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-4 text-xs md:text-sm font-bold tracking-[0.2em] uppercase transition-colors border-r border-blue-900/30 hover:bg-blue-900/10 ${
                        activeTab === tab ? 'text-blue-400 bg-blue-900/20' : 'text-blue-800'
                    }`}
                >
                    {tab}
                </button>
            ))}
            <button onClick={() => setUiMode((prev) => (prev + 1) % 3 as 0|1|2)} className="w-12 border-l border-blue-900/30 hover:bg-blue-900/20 text-blue-500 transition-colors flex items-center justify-center shrink-0">
                <div className={`grid grid-cols-3 gap-0.5 w-4 h-4 transition-opacity ${uiMode === 0 ? 'opacity-30' : uiMode === 1 ? 'opacity-60' : 'opacity-100'}`}>
                    {[...Array(9)].map((_, i) => <div key={i} className="w-1 h-1 bg-current rounded-[1px]" />)}
                </div>
            </button>
        </div>

        <MessageList 
            messages={messages} 
            profileName={profile.name} 
            isLoading={isLoading}
            isHidden={activeTab !== 'RADIO'}
            onPlayAudio={handleTTS}
            isTTSLoading={isTTSLoading}
            ttsError={ttsError}
            isFullscreen={isFullscreen}
            showRecoveryBtn={showRecoveryBtn}
            onResetLoading={handleResetLoadingState}
        />

        {activeTab === 'CHRONICLE' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl mx-auto space-y-4 pb-20 custom-scrollbar">
                <div className="bg-red-900/10 border border-red-900/30 p-4 mb-8">
                    <h4 className="text-red-500 font-bold text-xs tracking-[0.2em] mb-3 border-b border-red-900/30 pb-1 uppercase">Raw Data Management</h4>
                    <div className="flex gap-2">
                        <button onClick={handleCopyChronicle} className="text-[10px] text-blue-500 hover:text-white uppercase font-bold tracking-widest border border-blue-900/50 px-3 py-2 bg-blue-900/10 hover:bg-blue-900/40 transition-colors flex-1">[COPY CHRONICLE LOGS]</button>
                        <button onClick={handlePurgeChronicle} className="text-[10px] text-red-500 hover:text-white uppercase font-bold tracking-widest border border-red-900/50 px-3 py-2 bg-red-900/10 hover:bg-red-900/40 transition-colors flex-1">[PURGE CHRONICLE LOGS]</button>
                    </div>
                </div>
                <div className="flex items-center justify-between border-b border-amber-900/50 pb-2 mb-6">
                    <h3 className="text-amber-500 font-bold text-xl tracking-[0.2em]">CHRONICLE DATABASE</h3>
                    <span className="text-xs text-amber-900">{chronicle.length} ENTRIES</span>
                </div>
                {chronicle.length === 0 ? <div className="text-gray-500 italic">No memories archived yet.</div> : chronicle.map(entry => (
                    <div key={entry.id} className="bg-amber-900/10 border-l-2 border-amber-800 p-4 hover:bg-amber-900/20 transition-colors relative group">
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">LOG_ID: {entry.id.slice(-8)} // {new Date(entry.timestamp).toLocaleString()}</div>
                            <button onClick={() => { navigator.clipboard.writeText(`[LOG_ID: ${entry.id}] ${new Date(entry.timestamp).toLocaleString()}\\n${entry.content}`); alert('>> ENTRY COPIED TO CLIPBOARD'); }} className="text-[9px] border border-amber-900/50 text-amber-500 px-2 py-0.5 hover:bg-amber-500 hover:text-black uppercase tracking-wider transition-all" title="Copy Chronicle Entry">[COPY]</button>
                        </div>
                        <div className="text-amber-100/80 text-lg font-medium leading-relaxed">{entry.content}</div>
                    </div>
                ))}
            </div>
        )}

        {activeTab === 'ITEMS' && (
            <div className="flex-1 h-full flex flex-col overflow-hidden">
                <div className="shrink-0 p-4 border-b border-purple-900/30 flex justify-between items-center bg-purple-900/5">
                    <h3 className="text-purple-400 font-bold text-lg tracking-[0.2em] uppercase flex items-center gap-2"><span className="text-xl">››</span> CARGO HOLD_</h3>
                    <span className="text-xs font-mono text-purple-600">{attachments.length} / 20 SLOTS</span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                    <div className="mb-6 border-2 border-dashed border-purple-900/40 bg-purple-900/5 p-6 flex flex-col items-center justify-center gap-2 group hover:border-purple-500/50 hover:bg-purple-900/10 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <span className="text-2xl opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all">📥</span>
                            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">+ UPLOAD DATA / ARTIFACT (MULTIPLE ALLOWED)</span>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {attachments.map((att, i) => (
                            <div key={i} className="aspect-square relative group border border-purple-900/40 bg-black">
                                <img src={`data:${att.mimeType};base64,${att.data}`} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="item" />
                                <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1 text-[8px] text-purple-300 font-mono truncate border-t border-purple-900/50">{att.name}</div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="bg-red-900/80 text-white w-6 h-6 flex items-center justify-center border border-red-500">×</button>
                                </div>
                            </div>
                        ))}
                        {[...Array(Math.max(0, 8 - attachments.length))].map((_, i) => <div key={`empty-${i}`} className="aspect-square border border-purple-900/20 bg-purple-900/5 flex items-center justify-center"><div className="w-2 h-2 bg-purple-900/20 rounded-full"></div></div>)}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'GAME' && (
            <RadKeepGame 
                profile={profile}
                chronicle={chronicle}
                attachments={attachments}
                onSpeak={handleTTS}
                onStopAudio={handleStopAudio}
                isSpeaking={isSpeaking}
                isPaused={isPaused}
                onPauseResume={handlePauseResume}
                onClearAttachments={() => setAttachments([])}
                onResumeAudio={resumeAudioContext}
            />
        )}

        <div className="fixed bottom-32 right-6 z-30 flex flex-col gap-3">
            <button onClick={toggleFullscreen} className="bg-black/5 hover:bg-blue-900/10 border border-blue-900/10 text-blue-400/40 hover:text-blue-300/60 w-10 h-10 flex items-center justify-center transition-all rounded-sm" title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
                <span className="text-xl">{isFullscreen ? '✖' : '⛶'}</span>
            </button>
        </div>

        {activeTab !== 'GAME' && activeTab !== 'ITEMS' && (
            <ChatInput 
                onSend={handleSendMessage}
                isLoading={isLoading}
                hasAttachments={attachments.length > 0}
                handleSaveMemory={handleSaveMemory}
                handleSummarizeChat={handleSummarizeChat}
                handlePauseResume={handlePauseResume}
                handleStopAudio={handleStopAudio}
                handleReplayAudio={() => { const lastMsg = messages.filter(m => m.role === 'waifu').pop(); if (lastMsg) handleTTS(lastMsg.content); }}
                handleSelectLastMessage={() => {
                    const lastMsg = messages.filter(m => m.role === 'waifu').pop();
                    if (lastMsg) {
                        const el = document.getElementById(`msg-text-${lastMsg.id}`);
                        if (el) {
                            selectText(el);
                            const target = el.closest('.group') as HTMLElement;
                            const container = el.closest('.overflow-y-auto') as HTMLElement;
                            if (target && container) {
                                container.scrollTo({
                                    top: target.offsetTop - container.offsetHeight + 120,
                                    behavior: 'smooth'
                                });
                            }
                        }
                    }
                }}
                handleSummonResponse={handleSummonResponse}
                isSpeaking={isSpeaking}
                isPaused={isPaused}
                autoTTS={autoTTS}
                setAutoTTS={setAutoTTS}
                resumeAudioContext={resumeAudioContext}
            />
        )}
    </div>
  );
};
