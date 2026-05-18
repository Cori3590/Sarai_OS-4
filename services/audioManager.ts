export let globalAudioContext: AudioContext | null = null;
export let globalAnalyser: AnalyserNode | null = null;

export const initGlobalAudio = () => {
    if (!globalAudioContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        globalAudioContext = new AudioContextClass();
        globalAnalyser = globalAudioContext.createAnalyser();
        globalAnalyser.fftSize = 256;
        globalAnalyser.smoothingTimeConstant = 0.5;
    }
    if (globalAudioContext.state === 'suspended') {
        globalAudioContext.resume().catch(console.error);
    }
    return { audioContext: globalAudioContext, analyser: globalAnalyser };
};

export const getGlobalAudioContext = () => globalAudioContext;
export const getGlobalAnalyser = () => globalAnalyser;
