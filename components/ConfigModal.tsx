import React from 'react';
import { WaifuProfile } from '../types';
import { fileToBase64, generateWaifuAvatar } from '../services/geminiService';

interface Props {
    profile: WaifuProfile;
    onSave: (newProfile: WaifuProfile) => void;
    onClose: () => void;
    onReset: () => void;
}

export const ConfigModal: React.FC<Props> = ({ profile, onSave, onClose, onReset }) => {
    const [appearance, setAppearance] = React.useState(profile.appearance);
    const [referenceImage, setReferenceImage] = React.useState<string | null>(null);
    const [isGenerating, setIsGenerating] = React.useState(false);
    
    const [chatModel, setChatModel] = React.useState(localStorage.getItem('waifu_model_chat') || 'gemini-1.5-pro');
    const [imageModel, setImageModel] = React.useState(localStorage.getItem('waifu_model_image') || 'gemini-2.5-flash-image');
    const [voiceModel, setVoiceModel] = React.useState(localStorage.getItem('waifu_voice') || 'Kore');
    const [customApiKey, setCustomApiKey] = React.useState(localStorage.getItem('custom_gemini_api_key') || '');

    const [confirmReset, setConfirmReset] = React.useState(false);
    const [confirmRepair, setConfirmRepair] = React.useState(false);

    const refFileInputRef = React.useRef<HTMLInputElement>(null);
    const directFileInputRef = React.useRef<HTMLInputElement>(null);

    // Handler for Reference Image (Used for AI Gen)
    const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await fileToBase64(e.target.files[0]);
                setReferenceImage(base64);
            } catch (err) {
                console.error("Failed to load reference image", err);
            }
        }
    };

    // Handler for Direct Avatar Upload (Bypasses AI)
    const handleDirectAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const file = e.target.files[0];
                const base64 = await fileToBase64(file);
                const mime = file.type;
                const fullUrl = `data:${mime};base64,${base64}`;
                
                // Immediately update profile with this image
                onSave({ ...profile, avatarUrl: fullUrl });
                alert("Background updated successfully.");
            } catch (err) {
                console.error("Direct upload failed", err);
                alert("Failed to upload image.");
            }
        }
    };

    // Save Settings Only (No Gen)
    const handleSaveConfigOnly = () => {
        localStorage.setItem('waifu_model_chat', chatModel);
        localStorage.setItem('waifu_model_image', imageModel);
        localStorage.setItem('waifu_voice', voiceModel);
        if (customApiKey.trim()) {
            localStorage.setItem('custom_gemini_api_key', customApiKey.trim());
        } else {
            localStorage.removeItem('custom_gemini_api_key');
        }
        // Save appearance text changes too, but don't touch avatarUrl
        onSave({ ...profile, appearance });
        onClose();
    };

    // Generate New Avatar (AI)
    const handleGenerate = async () => {
        setIsGenerating(true);
        // Ensure models are saved before generating
        localStorage.setItem('waifu_model_chat', chatModel);
        localStorage.setItem('waifu_model_image', imageModel);
        localStorage.setItem('waifu_voice', voiceModel);
        if (customApiKey.trim()) {
            localStorage.setItem('custom_gemini_api_key', customApiKey.trim());
        } else {
            localStorage.removeItem('custom_gemini_api_key');
        }

        try {
            // Re-run avatar generation with potentially new appearance or new reference image
            const avatarUrl = await generateWaifuAvatar({ ...profile, appearance }, referenceImage || undefined);
            
            // Priority: New AI Result -> New Reference Image Uploaded -> Current Profile Avatar
            const finalUrl = avatarUrl || (referenceImage ? `data:image/png;base64,${referenceImage}` : profile.avatarUrl);
            
            onSave({ ...profile, appearance, avatarUrl: finalUrl });
        } catch (e) {
            alert("Generation failed. Check connection/API Key.");
        } finally {
            setIsGenerating(false);
        }
    }

    const handleDownloadAvatar = () => {
        if (profile.avatarUrl) {
            // Open in new tab for manual saving (Better for mobile/Hermit compatibility)
            const win = window.open();
            if (win) {
                win.document.write(`<img src="${profile.avatarUrl}" style="width:100%; height:auto;" />`);
                win.document.title = "Sarai Avatar";
            } else {
                // Fallback
                window.open(profile.avatarUrl, '_blank');
            }
        } else {
            alert("No avatar to view.");
        }
    };

    const handleNuclearRepair = async () => {
        if (!confirmRepair) {
            setConfirmRepair(true);
            setTimeout(() => setConfirmRepair(false), 3000);
            return;
        }

        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let reg of regs) await reg.unregister();
            }
            const cacheKeys = await caches.keys();
            for (let key of cacheKeys) await caches.delete(key);
            
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
        } catch (e) {
            alert("Repair failed. Please clear browser data manually.");
        }
    }

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 font-mono text-cyan-500 backdrop-blur-sm">
            <div className="w-full max-w-lg border-2 border-cyan-500 bg-black p-6 shadow-[0_0_50px_rgba(34,211,238,0.2)] relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h2 className="text-2xl font-bold mb-6 border-b-2 border-cyan-900 pb-2 flex justify-between items-center">
                    <span>SYSTEM_CONFIG</span>
                    <button onClick={onClose} className="text-xl hover:text-white">✕</button>
                </h2>
                
                <div className="space-y-8">
                    
                    {/* SECTION 1: SYSTEM SETTINGS (Decoupled) */}
                    <div className="bg-cyan-900/10 p-4 border border-cyan-800 relative">
                        <div className="absolute -top-3 left-4 bg-black px-2 text-xs font-bold text-cyan-300">CORE LOGIC</div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] text-cyan-600 mb-1">CHAT MODEL (Brain)</label>
                                <select value={chatModel} onChange={(e) => setChatModel(e.target.value)} className="w-full bg-black border border-cyan-700 text-cyan-400 p-2 text-base">
                                    <option value="gemini-2.5-pro">GEMINI 3.1 PRO (Advanced)</option>
                                    <option value="gemini-1.5-pro">GEMINI 3 PRO (Expensive/Smart)</option>
                                    <option value="gemini-1.5-flash">GEMINI 3 FLASH (Cheap/Fast)</option>
                                    <option value="gemini-2.5-flash">GEMINI 3.1 FLASH LITE (Fastest)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-cyan-600 mb-1">IMAGE MODEL (Eyes)</label>
                                <select value={imageModel} onChange={(e) => setImageModel(e.target.value)} className="w-full bg-black border border-cyan-700 text-cyan-400 p-2 text-base">
                                    <option value="imagen-4.0-generate-001">IMAGEN 4 GENERATE (High Quality)</option>
                                    <option value="imagen-3.0-fast-generate-001">IMAGEN 3 FAST (Fast)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-cyan-600 mb-1">VOICE MODEL (TTS)</label>
                                <select value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)} className="w-full bg-black border border-cyan-700 text-cyan-400 p-2 text-base">
                                    <option value="Kore">Kore (Female - Default)</option>
                                    <option value="Zephyr">Zephyr (Male - High Quality)</option>
                                    <option value="Puck">Puck (Male - Alternative)</option>
                                    <option value="Charon">Charon (Male - Deep)</option>
                                    <option value="Fenrir">Fenrir (Male - Gruff)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-cyan-600 mb-1">CUSTOM GEMINI API KEY (Optional)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="password" 
                                        value={customApiKey} 
                                        onChange={(e) => setCustomApiKey(e.target.value)} 
                                        placeholder="AIzaSy..." 
                                        className="flex-1 bg-black border border-cyan-700 text-cyan-400 p-2 text-base placeholder-cyan-900"
                                    />
                                    <button 
                                        onClick={() => setCustomApiKey('')}
                                        className="px-4 border border-red-800 text-red-500 hover:bg-red-900/30 text-xs font-bold"
                                        title="Clear Key"
                                    >
                                        CLEAR
                                    </button>
                                </div>
                                <p className="text-[9px] text-cyan-700 mt-1">Leave blank to use default platform key. Required for TTS on public links.</p>
                                <p className="text-[9px] text-amber-600 mt-1 font-bold">WARNING: If you get a 403 Forbidden error, ensure your API key does NOT have HTTP Referrer restrictions in Google Cloud Console, or add this app's URL to the allowed list.</p>
                            </div>
                             <button 
                                 onClick={() => window.location.reload()} 
                                 className="w-full py-2 bg-blue-900/40 border border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white uppercase text-xs font-bold tracking-widest"
                             >
                                 RESTART SESSION (SOFT RELOAD)
                             </button>
                             <button 
                                 onClick={handleSaveConfigOnly} 
                                 className="w-full py-2 bg-cyan-900/40 border border-cyan-600 text-cyan-400 hover:bg-cyan-600 hover:text-black uppercase text-xs font-bold tracking-widest"
                             >
                                 SAVE SETTINGS
                             </button>
                        </div>
                    </div>

                    {/* SECTION 2: AVATAR STUDIO */}
                    <div className="bg-cyan-900/5 p-4 border border-cyan-800/50 relative">
                        <div className="absolute -top-3 left-4 bg-black px-2 text-xs font-bold text-purple-400">AVATAR STUDIO</div>
                        
                        {/* Current Preview & Direct Actions */}
                        <div className="flex gap-4 mb-4 items-start">
                            <div className="w-24 h-24 border border-cyan-800 shrink-0 overflow-hidden bg-black relative group">
                                <img src={profile.avatarUrl} className="w-full h-full object-cover" alt="current" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <span className="text-[10px]">CURRENT</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 flex-1">
                                <button 
                                    onClick={handleDownloadAvatar} 
                                    className="w-full py-2 border border-cyan-800 text-cyan-600 hover:border-cyan-500 hover:text-cyan-400 text-[10px] uppercase"
                                >
                                    OPEN IMAGE IN NEW TAB (LONG PRESS TO SAVE)
                                </button>
                                <input type="file" ref={directFileInputRef} onChange={handleDirectAvatarUpload} className="hidden" accept="image/*" />
                                <button 
                                    onClick={() => directFileInputRef.current?.click()} 
                                    className="w-full py-2 bg-purple-900/20 border border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-black text-[10px] uppercase font-bold"
                                >
                                    UPLOAD DIRECT BACKGROUND (NO AI)
                                </button>
                            </div>
                        </div>

                        <hr className="border-cyan-900/50 my-4" />

                        {/* AI Generation Tools */}
                        <label className="block mb-2 uppercase text-[10px] font-bold tracking-wider text-cyan-700">{`>> AI GENERATOR (REROLL)`}</label>
                        
                        <div className="flex gap-4 mb-3">
                            <div className="w-16 h-16 border border-cyan-800 shrink-0 overflow-hidden bg-cyan-950 flex items-center justify-center">
                                {referenceImage ? (
                                    <img src={`data:image/png;base64,${referenceImage}`} className="w-full h-full object-cover" alt="ref" />
                                ) : (
                                    <span className="text-2xl opacity-50">🤖</span>
                                )}
                            </div>
                            <div className="flex flex-col justify-center flex-1">
                                <input type="file" ref={refFileInputRef} onChange={handleReferenceImageUpload} className="hidden" accept="image/*" />
                                <button onClick={() => refFileInputRef.current?.click()} className="px-3 py-2 border border-cyan-500 text-[10px] hover:bg-cyan-500 hover:text-black w-full text-left">
                                    {referenceImage ? 'CHANGE REFERENCE IMAGE' : '+ ADD REFERENCE IMAGE (FOR AI)'}
                                </button>
                            </div>
                        </div>
                        
                        <textarea 
                            className="w-full bg-black/50 border border-cyan-800 p-2 text-cyan-400 text-sm focus:border-cyan-400 focus:outline-none mb-3" 
                            rows={3} 
                            value={appearance} 
                            onChange={e => setAppearance(e.target.value)} 
                            placeholder="Describe new avatar appearance..." 
                        />

                        <button 
                            onClick={handleGenerate} 
                            disabled={isGenerating} 
                            className="w-full py-3 bg-cyan-500/10 border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-black uppercase text-xs font-bold shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                        >
                            {isGenerating ? 'GENERATING NEW AVATAR...' : 'GENERATE NEW LOOK (COSTS $)'}
                        </button>
                    </div>

                    <div className="mt-8 pt-4 border-t border-red-900/30 flex flex-col gap-2">
                        <button onClick={handleNuclearRepair} className={`w-full py-2 border text-[10px] uppercase tracking-widest transition-all ${confirmRepair ? 'bg-orange-600 text-black border-orange-600 animate-pulse' : 'border-orange-900 text-orange-900 hover:text-orange-400'}`}>
                            {confirmRepair ? 'CONFIRM REPAIR (WIPES ALL DATA)' : 'SYSTEM REPAIR (FIX BROKEN IMAGES)'}
                        </button>
                        
                        <button onClick={() => confirmReset ? onReset() : setConfirmReset(true)} className={`w-full py-2 border text-[10px] uppercase tracking-widest transition-all ${confirmReset ? 'bg-red-600 text-black border-red-600 animate-pulse' : 'border-red-900 text-red-900 hover:text-red-400'}`}>
                            {confirmReset ? 'CONFIRM FACTORY RESET' : 'FACTORY RESET'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}