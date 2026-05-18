import React, { useState, useEffect, useRef } from 'react';
import { WaifuProfile, ChronicleEntry, Attachment } from '../types';
import { generateAdventureTurn, generateSceneImage } from '../services/geminiService';

interface Props {
  profile: WaifuProfile;
  chronicle: ChronicleEntry[];
  attachments: Attachment[];
  onSpeak: (text: string) => void;
  onStopAudio: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onClearAttachments: () => void;
  onResumeAudio: () => void;
}

interface GameNode {
    text: string;
    speaker?: string;
    bg?: string;
    choices?: { text: string; reqStat?: string; reqVal?: number }[];
    combatUpdate?: {
        status: 'START' | 'WIN' | 'LOSE' | 'FLEE' | 'ONGOING';
        playerHpChange?: number;
        enemy?: { name: string; hp: number };
    };
    inventoryUpdate?: {
        add?: string[];
        remove?: string[];
    };
}

interface GameStats {
    STR: number;
    CHA: number;
    INT: number;
    HP: number;
    MORALE: number;
}

const INITIAL_STATS: GameStats = { STR: 10, CHA: 10, INT: 10, HP: 100, MORALE: 100 };

export const RadKeepGame: React.FC<Props> = ({
    profile,
    chronicle,
    attachments,
    onSpeak,
    onStopAudio,
    isSpeaking,
    isPaused,
    onPauseResume,
    onClearAttachments,
    onResumeAudio
}) => {
    const [currentNode, setCurrentNode] = useState<GameNode | null>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
    const [inventory, setInventory] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sceneImage, setSceneImage] = useState<string | null>(null);
    const [isGeneratingImg, setIsGeneratingImg] = useState(false);
    
    // Auto TTS State
    const [autoTTS, setAutoTTS] = useState<boolean>(() => {
        return localStorage.getItem('radkeep_autotts') !== 'false';
    });

    const scrollRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    // Persist Auto TTS preference
    useEffect(() => {
        localStorage.setItem('radkeep_autotts', String(autoTTS));
    }, [autoTTS]);

    // Initialize or Load Game
    useEffect(() => {
        const savedState = localStorage.getItem('radkeep_gamestate');
        const savedNode = localStorage.getItem('radkeep_curnode');
        
        if (savedState && savedNode) {
            try {
                const parsedState = JSON.parse(savedState);
                setStats(parsedState.stats);
                setInventory(parsedState.inventory);
                setHistory(parsedState.history);
                setCurrentNode(JSON.parse(savedNode));
            } catch (e) {
                startNewGame();
            }
        } else {
            startNewGame();
        }
    }, []);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [currentNode, history]);

    const startNewGame = () => {
        const startNode: GameNode = {
            text: "You stand before the rusted gates of the Iron Vanguard Garage. The wind howls, carrying the scent of ozone and old dust. Your companion checks her gear.",
            speaker: "Narrator",
            choices: [
                { text: "Enter the Garage" },
                { text: "Check supplies" }
            ]
        };
        setCurrentNode(startNode);
        setHistory(["[SYSTEM] LINK ESTABLISHED. GAME START."]);
        setStats(INITIAL_STATS);
        setInventory(["Pistol", "Water Flask"]);
        saveGame(startNode, ["Link Established"], INITIAL_STATS, ["Pistol", "Water Flask"]);
    };

    const saveGame = (node: GameNode, hist: string[], sts: GameStats, inv: string[]) => {
        try {
            localStorage.setItem('radkeep_curnode', JSON.stringify(node));
            localStorage.setItem('radkeep_gamestate', JSON.stringify({
                stats: sts,
                inventory: inv,
                history: hist
            }));
        } catch (e) {
            console.error(">> RADKEEP STORAGE ERROR: FAILED TO SAVE GAME STATE", e);
            // If it fails, we keep playing in memory, but next reload will lose progress unless 
            // the user clears space or the chat history fix frees some.
        }
    };

    const handleAction = async (actionText: string) => {
        setIsLoading(true);
        onResumeAudio(); // Resume audio context on user interaction
        onStopAudio(); // Stop any previous TTS

        // Add user action to history
        const newHistory = [...history, `> ${actionText}`];
        setHistory(newHistory);

        // Prepare context
        const context = newHistory.slice(-10).join('\n');
        
        try {
            // Note: generateAdventureTurn is hardcoded to use Flash model (gemini-3-flash-preview)
            // to prevent excessive token usage on Pro tier.
            const result = await generateAdventureTurn(
                context, 
                actionText, 
                stats, 
                profile, 
                chronicle, 
                attachments
            );

            // Clear attachments after they are used in a turn
            if (attachments.length > 0) {
                onClearAttachments();
            }

            // Process Updates
            const newStats = { ...stats };
            let newInventory = [...inventory];

            if (result.combatUpdate) {
                if (result.combatUpdate.playerHpChange) {
                    newStats.HP += result.combatUpdate.playerHpChange;
                }
                // Handle other combat logic if needed
            }

            if (result.inventoryUpdate) {
                if (result.inventoryUpdate.add) {
                    newInventory = [...newInventory, ...result.inventoryUpdate.add];
                }
                if (result.inventoryUpdate.remove) {
                    newInventory = newInventory.filter(i => !result.inventoryUpdate!.remove!.includes(i));
                }
            }

            // Auto-Generate Image if scene changed significantly (simple heuristic)
            // We only set it if one is generated.
            if (result.bg) {
                generateSceneImage(result.bg, !!result.combatUpdate).then(img => {
                    if (img) setSceneImage(img);
                });
            } else {
                // Keep previous image if no new bg description, or set null? 
                // Usually RPGs keep background. We keep it unless explicitly changed.
            }

            // Update State
            setCurrentNode(result);
            setStats(newStats);
            setInventory(newInventory);
            setHistory([...newHistory, result.text]);
            saveGame(result, [...newHistory, result.text], newStats, newInventory);
            
            // Auto-speak result (Checked against preference)
            if (result.text && autoTTS) {
                onSpeak(result.text);
            }

        } catch (e) {
            console.error("Turn failed", e);
            setHistory(prev => [...prev, "[ERROR] Connection interrupted."]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenImage = (imgSrc: string) => {
        if (!imgSrc) return;
        const win = window.open();
        if (win) {
             win.document.write(`<body style="margin:0;background:black;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${imgSrc}" style="max-width:100%;max-height:100%;object-fit:contain;" /></body>`);
             win.document.title = "RadKeep Scene";
        }
    };

    const handleManualImageGen = async () => {
        if (!currentNode || isGeneratingImg) return;
        setIsGeneratingImg(true);
        try {
            const description = currentNode.bg || currentNode.text;
            const isCombat = !!currentNode.combatUpdate;
            const img = await generateSceneImage(description, isCombat);
            if (img) {
                setSceneImage(img);
                handleOpenImage(img);
            }
        } catch (e) {
            console.error("Manual Image Gen Error", e);
        } finally {
            setIsGeneratingImg(false);
        }
    };

    const handleSelectText = () => {
        if (textRef.current) {
            const range = document.createRange();
            range.selectNodeContents(textRef.current);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    };

    const handleDownloadSave = () => {
        const saveObj = {
            stats,
            inventory,
            history,
            currentNode
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(saveObj, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `radkeep_save_${Date.now()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadSave = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsedState = JSON.parse(event.target?.result as string);
                if (parsedState.stats && parsedState.history && parsedState.currentNode) {
                    setStats(parsedState.stats);
                    setInventory(parsedState.inventory || []);
                    setHistory(parsedState.history);
                    setCurrentNode(parsedState.currentNode);
                    saveGame(parsedState.currentNode, parsedState.history, parsedState.stats, parsedState.inventory || []);
                } else {
                    alert("Invalid save file format.");
                }
            } catch (err) {
                alert("Failed to parse save file.");
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="flex flex-col h-full bg-black font-mono text-amber-500 overflow-hidden relative">
            {/* Background Image Layer */}
            {sceneImage && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                    <img src={sceneImage} alt="scene" className="w-full h-full object-cover grayscale contrast-125" />
                    <div className="absolute inset-0 bg-black/60"></div>
                </div>
            )}

            {/* Top Bar: Stats */}
            <div className="flex justify-between items-center p-2 border-b border-amber-900/50 bg-black/80 z-10 shrink-0 text-[10px] md:text-xs tracking-wider">
                <div className="flex gap-3">
                    <span className="text-red-500 font-bold">HP {stats.HP}</span>
                    <span className="text-blue-500">MOR {stats.MORALE}</span>
                </div>
                <div className="flex gap-3 text-amber-700">
                    <span>STR {stats.STR}</span>
                    <span>INT {stats.INT}</span>
                    <span>CHA {stats.CHA}</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row z-10">
                
                {/* Text Output */}
                <div className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col gap-4" ref={scrollRef}>
                    {/* Render History slightly dimmed */}
                    {history.slice(-5).map((line, i) => (
                         <div key={i} className={`text-sm md:text-base leading-relaxed ${line.startsWith('>') ? 'text-amber-800 italic' : 'text-amber-700/50'}`}>
                             {line}
                         </div>
                    ))}
                    
                    {/* Current Node (Active) */}
                    {currentNode && (
                        <div className="mt-4 p-4 border-l-2 border-amber-500 bg-amber-900/10 animate-fade-in-up">
                            {currentNode.speaker && <div className="text-xs text-amber-600 font-bold uppercase mb-1">{currentNode.speaker}</div>}
                            <div 
                                className="text-lg md:text-xl font-medium text-amber-100 leading-relaxed whitespace-pre-wrap shadow-black drop-shadow-md"
                                ref={textRef}
                            >
                                {currentNode.text}
                            </div>
                        </div>
                    )}

                    {isLoading && <div className="text-amber-500 animate-pulse mt-4">{`>> CALCULATING OUTCOME...`}</div>}
                </div>

                {/* Sidebar: Inventory & Choices (Desktop: Right, Mobile: Bottom) */}
                <div className="w-full md:w-80 bg-black/90 border-t md:border-t-0 md:border-l border-amber-900/50 p-4 flex flex-col gap-4 shrink-0 h-1/3 md:h-auto overflow-y-auto">
                    
                    {/* Controls */}
                    <div className="flex flex-col gap-2 mb-2 border-b border-amber-900/30 pb-2">
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex gap-2 flex-wrap">
                                {(isSpeaking || isPaused) && (
                                    <button onClick={onPauseResume} className="text-[10px] border border-amber-900/30 px-2 py-1 text-amber-500/60 hover:bg-amber-900/20 hover:text-amber-400">
                                        {isPaused ? "RESUME" : "PAUSE"}
                                    </button>
                                )}
                                {(isSpeaking || isPaused) && (
                                    <button onClick={onStopAudio} className="text-[10px] border border-amber-900/30 px-2 py-1 text-red-500/60 hover:bg-red-900/20 hover:text-red-400">
                                        STOP
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2 justify-end flex-wrap flex-1">
                                <button 
                                    onClick={() => setAutoTTS(!autoTTS)} 
                                    className={`text-[10px] border border-amber-900/30 px-2 py-1 transition-colors ${autoTTS ? 'text-green-400/70 bg-green-900/10 border-green-900/50' : 'text-amber-900/50 hover:text-amber-500'}`}
                                >
                                    TTS: {autoTTS ? 'ON' : 'OFF'}
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        onResumeAudio();
                                        if (currentNode?.text) onSpeak(currentNode.text);
                                    }} 
                                    className="text-[10px] border border-amber-900/30 px-2 py-1 text-amber-500/50 hover:bg-amber-900/20 hover:text-amber-400"
                                    disabled={!currentNode?.text}
                                >
                                    REPLAY
                                </button>

                                <button 
                                    onClick={handleSelectText} 
                                    className="text-[10px] border border-amber-900/30 px-2 py-1 text-amber-500/50 hover:bg-amber-900/20"
                                    disabled={!currentNode?.text}
                                >
                                    SEL TEXT
                                </button>

                                <button 
                                    onClick={handleManualImageGen} 
                                    className="text-[10px] border border-amber-900/30 px-2 py-1 text-blue-400/50 hover:bg-blue-900/20 hover:text-blue-400"
                                    disabled={isGeneratingImg || !currentNode}
                                >
                                    {isGeneratingImg ? 'GEN...' : 'GEN IMG'}
                                </button>

                                {sceneImage && !isGeneratingImg && (
                                    <button 
                                        onClick={() => handleOpenImage(sceneImage)} 
                                        className="text-[10px] border border-amber-900/30 px-2 py-1 text-blue-400/50 hover:bg-blue-900/20 hover:text-blue-400"
                                    >
                                        OPEN IMG
                                    </button>
                                )}

                                <button 
                                    onClick={handleDownloadSave} 
                                    className="text-[10px] border border-amber-900/30 px-2 py-1 text-green-400/50 hover:bg-green-900/20 hover:text-green-400"
                                >
                                    SAVE GAME
                                </button>

                                <button 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="text-[10px] border border-amber-900/30 px-2 py-1 text-purple-400/50 hover:bg-purple-900/20 hover:text-purple-400"
                                >
                                    LOAD GAME
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleUploadSave} 
                                    className="hidden" 
                                    accept=".json" 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Choices */}
                    <div className="flex flex-col gap-2">
                        <h3 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">AVAILABLE ACTIONS</h3>
                        {currentNode?.choices && currentNode.choices.length > 0 ? (
                            currentNode.choices.map((choice, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => !isLoading && handleAction(choice.text)}
                                    disabled={isLoading}
                                    className="w-full text-left px-3 py-3 border bg-black/40 border-amber-900/50 hover:bg-amber-900/20 hover:border-amber-500 text-amber-400 hover:text-amber-200 transition-all font-mono tracking-tight uppercase text-sm flex justify-between group items-center shrink-0"
                                >
                                    <span className="mr-2 flex-1 break-words leading-tight text-base">{`> ${choice.text}`}</span>
                                    {choice.reqStat && <span className="text-[10px] text-amber-700 group-hover:text-amber-500 shrink-0 ml-2 border border-amber-900/30 px-1 bg-black/50">REQ: {choice.reqStat} {choice.reqVal}</span>}
                                </button>
                            ))
                        ) : (
                            <button 
                                onClick={() => !isLoading && handleAction("[CONTINUE]")} 
                                className="w-full text-left px-3 py-3 border bg-black/40 border-amber-900/50 hover:border-amber-500 text-amber-400 uppercase text-sm"
                            >
                                {`> [CONTINUE]`}
                            </button>
                        )}
                    </div>

                    {/* Inventory */}
                    <div className="mt-4 flex-1">
                        <h3 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2 border-b border-amber-900/30 pb-1">INVENTORY</h3>
                        {inventory.length === 0 ? (
                            <div className="text-xs text-amber-900 italic">Empty...</div>
                        ) : (
                            <ul className="text-xs text-amber-400 space-y-1">
                                {inventory.map((item, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <span className="w-1 h-1 bg-amber-600 rounded-full"></span>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};