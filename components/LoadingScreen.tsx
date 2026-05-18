import React, { useEffect, useState } from 'react';

const BOOT_LOGS = [
    "INITIALIZING_KERNEL_THREAD_0x89...",
    "LOADING_VIRTUAL_ENV [OK]",
    "DECRYPTING_MEMORY_BANKS...",
    "CONNECTING_TO_SATELLITE_UPLINK...",
    "HANDSHAKE_ESTABLISHED [SECURE]",
    "DOWNLOADING_PERSONALITY_MATRIX...",
    "CALIBRATING_EMOTIONAL_ENGINE...",
    "OPTIMIZING_NEURAL_NET_WEIGHTS...",
    "ALLOCATING_AUDIO_BUFFERS...",
    "RENDERING_HOLOGRAPHIC_INTERFACE...",
    "APPLYING_VOICE_MODULATION...",
    "SYNCING_CHRONICLE_DATABASE...",
    "BYPASSING_FIREWALL_LAYER_7...",
    "SYSTEM_INTEGRITY_CHECK: PASSED",
    "BOOT_SEQUENCE_FINALIZING..."
];

export const LoadingScreen: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let logIndex = 0;
        
        // Add logs one by one with random timing
        const addLog = () => {
            if (logIndex < BOOT_LOGS.length) {
                setLogs(prev => {
                    const newLogs = [...prev, BOOT_LOGS[logIndex]];
                    // Keep only last 8 logs to prevent overflow/mess
                    if (newLogs.length > 8) return newLogs.slice(newLogs.length - 8);
                    return newLogs;
                });
                logIndex++;
                // Random delay for next log
                setTimeout(addLog, Math.random() * 800 + 200);
            }
        };
        addLog();

        // Smooth progress bar - tuned for 40-60 second wait times
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 98) return 98; // Cap at 98% until process actually finishes (unmounts)
                
                let increment = 0;
                // Asymptotic approach: Fast at first, then slows down to a crawl
                if (prev < 30) {
                    increment = Math.random() * 2; // Fast start
                } else if (prev < 60) {
                    increment = Math.random() * 0.8; // Steady middle
                } else if (prev < 80) {
                    increment = Math.random() * 0.3; // Slowing down
                } else {
                    increment = Math.random() * 0.1; // Crawl to finish
                }
                
                return Math.min(98, prev + increment);
            });
        }, 200);

        return () => {
            clearInterval(progressInterval);
        }
    }, []);

    return (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center font-mono text-cyan-500 p-8 cursor-wait overflow-hidden">
            {/* Background Grid/Noise */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(34,211,238,0.06),rgba(0,0,0,0.02),rgba(0,0,255,0.06))] pointer-events-none bg-[length:100%_2px,3px_100%] z-0 opacity-50"></div>
            
            {/* Scanline Overlay */}
            <div className="scan-bar"></div>

            <div className="w-full max-w-2xl space-y-8 relative z-10">
                <div className="text-center space-y-2">
                    <h1 className="text-5xl md:text-7xl font-bold animate-pulse tracking-tighter screen-glow">
                        SYSTEM_BOOT
                    </h1>
                    <p className="text-cyan-700 tracking-[0.5em] text-sm uppercase">Sarai_OS Kernel v11.9.1::ENTROPY_PROOF</p>
                </div>
                
                {/* Terminal Window */}
                <div className="h-64 border-2 border-cyan-800 bg-black/80 p-6 overflow-hidden flex flex-col justify-end shadow-[0_0_30px_rgba(34,211,238,0.15)] relative">
                    {logs.map((log, i) => (
                        <div key={i} className="text-sm md:text-base font-bold tracking-wide animate-fade-in-up">
                            <span className="text-cyan-800 mr-2">[{new Date().toLocaleTimeString([], {hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span> 
                            <span className="text-cyan-400">{log}</span>
                        </div>
                    ))}
                    <div className="animate-pulse text-cyan-500">_</div>
                </div>

                {/* Progress Section */}
                <div className="space-y-2">
                     <div className="flex justify-between text-xs uppercase tracking-widest text-cyan-600 font-bold">
                        <span>Installing Modules</span>
                        <span>{Math.floor(progress)}%</span>
                     </div>
                     <div className="w-full h-4 bg-cyan-900/30 border border-cyan-800 p-0.5">
                        <div 
                            className="h-full bg-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.6)] transition-all duration-200 relative overflow-hidden"
                            style={{ width: `${progress}%` }}
                        >
                            {/* Striped pattern on progress bar */}
                            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(0,0,0,0.1)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.1)_50%,rgba(0,0,0,0.1)_75%,transparent_75%,transparent)] bg-[length:10px_10px]"></div>
                        </div>
                     </div>
                     <div className="flex justify-between text-[10px] text-cyan-900 font-mono">
                        <span>MEM: 64TB / 128TB</span>
                        <span>CPU: 9.22Hz</span>
                     </div>
                </div>
            </div>
        </div>
    );
};