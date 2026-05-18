import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-red-500 font-mono p-8 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Scanline Effect */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,0,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%] opacity-20"></div>
            
            <div className="relative z-10 max-w-2xl w-full border-2 border-red-800 bg-black/90 p-8 shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                <h1 className="text-4xl md:text-5xl font-bold mb-2 animate-pulse tracking-tighter">SYSTEM_CRITICAL_FAILURE</h1>
                <div className="w-full h-1 bg-red-800 mb-6"></div>
                
                <p className="mb-4 text-red-300 text-lg">
                    The kernel has encountered an unrecoverable exception. 
                    This is likely due to memory corruption or storage quota limits.
                </p>
                
                <div className="bg-red-950/30 border border-red-900/50 p-4 mb-8 text-xs font-mono text-red-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {this.state.error?.toString() || "Unknown Error"}
                </div>
                
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={() => window.location.reload()}
                        className="w-full py-3 border border-red-500 hover:bg-red-900/20 text-red-400 uppercase font-bold tracking-widest transition-colors"
                    >
                        {`>> ATTEMPT SYSTEM REBOOT`}
                    </button>
                    
                    <button 
                        onClick={() => {
                            localStorage.clear();
                            sessionStorage.clear();
                            window.location.reload();
                        }}
                        className="w-full py-3 bg-red-600 hover:bg-red-500 text-black border border-red-500 uppercase font-bold tracking-widest transition-colors shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                    >
                        {`>> EMERGENCY FACTORY RESET (DATA WIPE)`}
                    </button>
                </div>
            </div>
        </div>
      );
    }

    return (this as any).props.children || null;
  }
}