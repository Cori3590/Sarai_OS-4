import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { WaifuProfile } from './types';
import { PersonalitySelector } from './components/PersonalitySelector';
import { ChatInterface } from './components/ChatInterface';
import { generateWaifuAvatar } from './services/geminiService';
import { ConfigModal } from './components/ConfigModal';
import { LoadingScreen } from './components/LoadingScreen';
import { initGlobalAudio, getGlobalAudioContext, getGlobalAnalyser } from './services/audioManager';

// Frequency Visualizer Component
const FrequencyWaves = memo(({ analyser }: { analyser: AnalyserNode | null }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        let animationFrameId: number;
        let time = 0;

        const waves = [
            { color: '#22d3ee', speed: 0.02, amplitudeBase: 15, frequency: 0.02, offset: 0, bandIndex: 2 },
            { color: '#a855f7', speed: 0.03, amplitudeBase: 12, frequency: 0.03, offset: 10, bandIndex: 5 },
            { color: '#22c55e', speed: 0.01, amplitudeBase: 18, frequency: 0.015, offset: 20, bandIndex: 10 },
            { color: '#3b82f6', speed: 0.04, amplitudeBase: 10, frequency: 0.04, offset: 30, bandIndex: 20 },
            { color: '#eab308', speed: 0.015, amplitudeBase: 8, frequency: 0.01, offset: 40, bandIndex: 40 },
        ];

        const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);

        const render = () => {
            if (!canvas) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            time += 1;

            let audioMod = 1;
            if (analyser) {
                analyser.getByteFrequencyData(dataArray);
            }

            waves.forEach(wave => {
                ctx.beginPath();
                ctx.strokeStyle = wave.color;

                if (analyser && dataArray.length > 0) {
                     const val = dataArray[wave.bandIndex] || 0;
                     audioMod = 1 + (val / 100); 
                }

                ctx.lineWidth = 1.5 + ((audioMod - 1) * 3);
                const currentAmp = wave.amplitudeBase * audioMod;

                for (let x = 0; x < canvas.width; x++) {
                    const speedMod = time * wave.speed * (audioMod * 0.5 + 0.5);
                    const y = canvas.height / 2 + 
                              Math.sin(x * wave.frequency + speedMod + wave.offset) * currentAmp * Math.sin(time * 0.01); 
                    
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                    canvas.width = parent.clientWidth;
                    canvas.height = parent.clientHeight;
                }
            }
        };

        window.addEventListener('resize', resize);
        resize();
        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [analyser]);

    return <canvas ref={canvasRef} className="w-full h-full opacity-90" />;
});

// Connection Guard: Resyncs session and audio on tab refocus
const ConnectionGuard: React.FC = () => {
    const [lastSync, setLastSync] = useState(Date.now());

    useEffect(() => {
        const handleFocus = () => {
             const now = Date.now();
             // If away more than 2 minutes, force a light state refresh
             if (now - lastSync > 120000) {
                 console.log(">> SYSTEM RESYNC: SESSION RE-ESTABLISHED.");
             }
             setLastSync(now);
             // Wake up audio context if it was suspended by browser
             const ctx = getGlobalAudioContext();
             if (ctx && ctx.state === 'suspended') {
                 ctx.resume().catch(console.error);
             }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') handleFocus();
        });

        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, [lastSync]);

    return null;
};

const App: React.FC = () => {
  const [profile, setProfile] = useState<WaifuProfile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  const [waifuState, setWaifuState] = useState<'IDLE' | 'THINKING' | 'SPEAKING'>('IDLE');
  
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null); 

  useEffect(() => {
      const initAudio = () => {
          const { analyser: newAnalyser } = initGlobalAudio();
          setAnalyser(newAnalyser);
      };

      window.addEventListener('click', initAudio, { once: true });
      window.addEventListener('touchstart', initAudio, { once: true });
      window.addEventListener('keydown', initAudio, { once: true });

      return () => {
          window.removeEventListener('click', initAudio);
          window.removeEventListener('touchstart', initAudio);
          window.removeEventListener('keydown', initAudio);
      };
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
        e.preventDefault();
        setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
      const handleFsChange = () => {
          setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
          try {
            await document.documentElement.requestFullscreen();
          } catch(e) { console.error("Fullscreen denied", e); }
      } else {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          }
      }
  };

  const handleInstallClick = () => {
      if (installPrompt) {
          installPrompt.prompt();
          installPrompt.userChoice.then((choiceResult: any) => {
              if (choiceResult.outcome === 'accepted') {
                  setInstallPrompt(null);
              }
          });
      }
  };

  useEffect(() => {
    const savedProfile = localStorage.getItem('waifu_profile');
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch (e) {
        console.error("Failed to load saved profile", e);
      }
    }
  }, []);

  const handleCreateProfile = async (baseProfile: WaifuProfile, referenceImage?: string) => {
    setIsGenerating(true);
    try {
      const modifiedProfile = { ...baseProfile };
      const avatarUrl = await generateWaifuAvatar(modifiedProfile, referenceImage);
      const fallbackUrl = 'https://picsum.photos/seed/cyberpunk/1200/600?grayscale&blur=2';
      const finalAvatarUrl = avatarUrl || (referenceImage ? `data:image/png;base64,${referenceImage}` : fallbackUrl);

      const newProfile = { ...baseProfile, avatarUrl: finalAvatarUrl };
      setProfile(newProfile);
      try {
        localStorage.setItem('waifu_profile', JSON.stringify(newProfile));
      } catch (e) {
        console.error("Failed to save profile to storage", e);
      }
    } catch (error) {
      console.error(error);
      setProfile({
        ...baseProfile,
        avatarUrl: referenceImage ? `data:image/png;base64,${referenceImage}` : 'https://picsum.photos/seed/cyberpunk/1200/600'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateProfile = (updatedProfile: WaifuProfile) => {
    setProfile(updatedProfile);
    try {
      localStorage.setItem('waifu_profile', JSON.stringify(updatedProfile));
    } catch (e) {
      console.error("Failed to save updated profile to storage", e);
    }
    setShowConfig(false);
  };

  const handleReset = () => {
    localStorage.removeItem('waifu_profile');
    localStorage.removeItem('waifu_chat_history');
    localStorage.removeItem('waifu_chronicle');
    localStorage.removeItem('waifu_autospeak');
    localStorage.removeItem('waifu_model_chat');
    localStorage.removeItem('waifu_model_image');
    localStorage.removeItem('radkeep_gamestate');
    localStorage.removeItem('radkeep_curnode');
    window.location.reload();
  };

  const getAvatarClasses = () => {
      let base = "w-full h-full object-cover object-[center_20%] transition-all duration-500 contrast-110";
      
      if (waifuState === 'THINKING') {
          base += " animate-thinking contrast-125 brightness-110";
      } else if (waifuState === 'SPEAKING') {
          base += " animate-speaking";
      }
      return base;
  };

  if (!profile) {
    if (isGenerating) {
        return <LoadingScreen />;
    }
    return (
      <div className="h-[100dvh] bg-black text-blue-500 font-mono flex flex-col items-center justify-center p-4 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-3xl my-auto py-8">
          <header className="mb-6 md:mb-8 text-center border-b border-blue-500 pb-4 shrink-0">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter screen-glow text-blue-500">SARAI_OS</h1>
            <p className="text-blue-700 mt-2 uppercase tracking-[0.5em] text-sm md:text-base">System Initialization</p>
          </header>
          <PersonalitySelector onSelect={handleCreateProfile} isLoading={isGenerating} />
        </div>
      </div>
    );
  }

  return (
    // MAIN CONTAINER
    // Using 100dvh (Dynamic Viewport Height) to handle keyboard resizing gracefully via CSS.
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col" style={{ touchAction: 'none' }}>
      
      {/* --- LAYER 1: BACKGROUND (ABSOLUTE) --- */}
      {/* 
          Using absolute positioning to track the parent container's 100dvh.
          This replaces 'fixed' and 'h-screen' hacks.
      */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none bg-black">
          {/* Scanlines */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-20 pointer-events-none bg-[length:100%_2px,3px_100%] opacity-20"></div>
          
          <div className="scan-bar"></div>

          {/* BACKGROUND IMAGE - ANIMATIONS ACTIVE */}
          <img 
              src={profile.avatarUrl || 'https://picsum.photos/1200/600'} 
              alt={profile.name} 
              className={getAvatarClasses()}
              draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/80 z-10 pointer-events-none"></div>
      </div>

      {showConfig && (
        <ConfigModal 
            profile={profile} 
            onClose={() => setShowConfig(false)} 
            onSave={handleUpdateProfile}
            onReset={handleReset} 
        />
      )}

      {/* --- LAYER 2: CONTENT (Relative Flex) --- */}
      <div className="relative z-10 flex flex-col h-full pointer-events-auto">
          
          {/* Header */}
          <div className="flex-shrink-0 p-2 md:p-6 flex justify-between items-start pointer-events-auto">
              <div className="bg-black/10 border border-blue-900/40 rounded-sm flex flex-col gap-1 w-2/3 md:w-1/3">
                  <div className="flex justify-between items-center px-2 pt-1">
                      <h2 className="text-2xl md:text-5xl font-bold text-blue-600 screen-glow tracking-tighter leading-none flex items-center" style={{ textShadow: '0 0 10px rgba(37, 99, 235, 0.5)' }}>
                        {profile.name.toUpperCase()}
                        <span className="ml-2 text-base md:text-2xl animate-pulse text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" title="Wedding Ring Protocol Active">💍</span>
                      </h2>
                      <span className="text-[10px] md:text-xs text-blue-800 font-bold">9.22Hz // LINK</span>
                  </div>
                  
                  <div className="h-6 md:h-10 w-full bg-black/20 relative overflow-hidden border-t border-blue-900/30">
                      <FrequencyWaves analyser={analyser} />
                  </div>
              </div>

              <div className="flex gap-2">
                  {installPrompt && (
                      <button 
                          onClick={handleInstallClick}
                          className="bg-green-900/30 border border-green-500 text-green-400 p-2 md:p-3 rounded animate-pulse"
                          title="Install App"
                      >
                          ⬇
                      </button>
                  )}

                  <button 
                      onClick={toggleFullscreen}
                      className="bg-black/5 hover:bg-blue-900/10 border border-blue-900/10 text-blue-400/40 hover:text-blue-300/60 p-2 md:p-3 rounded transition-all group"
                      title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                  >
                      <span className="text-xl md:text-2xl font-bold">{isFullscreen ? '✖' : '⛶'}</span>
                  </button>
                  
                  <button 
                      onClick={() => setShowConfig(true)}
                      className="bg-black/5 hover:bg-blue-900/10 border border-blue-900/10 text-blue-400/40 hover:text-blue-300/60 p-2 md:p-3 rounded transition-all group"
                      title="System Config"
                  >
                      <span className="text-xl md:text-2xl group-hover:rotate-90 transition-transform duration-500 inline-block">⚙</span>
                  </button>
              </div>
          </div>

          <div className="flex-1 min-h-0 pointer-events-auto flex flex-col">
             <ConnectionGuard />
             <ChatInterface 
                profile={profile} 
                onStateChange={setWaifuState}
                isFullscreen={isFullscreen}
                toggleFullscreen={toggleFullscreen}
             />
          </div>
      </div>
    </div>
  );
};

export default App;