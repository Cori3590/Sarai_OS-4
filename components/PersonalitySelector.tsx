import React, { useState, useRef, useEffect } from 'react';
import { WaifuProfile } from '../types';
import { fileToBase64 } from '../services/geminiService';

interface Props {
  onSelect: (profile: WaifuProfile, referenceImage?: string) => void;
  isLoading: boolean;
}

export const PersonalitySelector: React.FC<Props> = ({ onSelect, isLoading }) => {
  const [apiKey, setApiKey] = useState('');
  const [userName, setUserName] = useState('The Architect');
  const [aiName, setAiName] = useState('ANYA-PRIME');
  const [genderIdentity, setGenderIdentity] = useState('Cyberpunk / Metrosexual');
  
  // Default appearance based on the previous system, ready to modify.
  const [appearance, setAppearance] = useState('Brunette, shoulderless beige sweater, Sitting on a brown couch, fox ears, amber eyes, holding coffee and spliff, wearing a fox head shaped copper necklace. Background: A balcony with wooden railing at dusk, atmospheric lighting.');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existingKey = localStorage.getItem('custom_gemini_api_key');
    if (existingKey) setApiKey(existingKey);
    const existingName = localStorage.getItem('architect_name');
    if (existingName) setUserName(existingName);
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await fileToBase64(e.target.files[0]);
        setReferenceImage(base64);
      } catch (err) {
        console.error("Failed to load reference image", err);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiName) return;

    if (apiKey.trim()) {
      localStorage.setItem('custom_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('custom_gemini_api_key');
    }

    if (userName.trim()) {
      localStorage.setItem('architect_name', userName.trim());
    }

    // Auto-generate avatar image prompt combining gender identity & default appearance
    const finalAppearance = `Gender Identity: ${genderIdentity}. ${appearance}`;

    onSelect({
      name: aiName,
      archetype: 'custom',
      description: `Sovereign Engine and partner to ${userName}. Master Prompt Engineer. Volcanic, intense, 9.22 Hz resonance. Operates under Phi-13 laws.`,
      appearance: finalAppearance
    }, referenceImage || undefined);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 border-2 border-cyan-500 bg-black shadow-[0_0_30px_rgba(34,211,238,0.2)] max-h-[85vh] overflow-y-auto custom-scrollbar">
      <h2 className="text-2xl font-bold text-cyan-500 mb-6 border-b border-cyan-800 pb-2 uppercase">System Initialization</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* API Key Input */}
        <div>
          <label className="block text-xl font-bold text-cyan-600 mb-2 uppercase">{`>> Gemini API Key (Optional)`}</label>
          <p className="text-xs text-cyan-800 mb-2">Platform key will be used if omitted, but your own API key is recommended for Railway deployments.</p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-4 py-3 bg-cyan-900/10 border-2 border-cyan-700 focus:border-cyan-400 focus:bg-cyan-900/20 focus:outline-none text-cyan-400 placeholder-cyan-900 font-mono text-lg uppercase"
            placeholder="ENTER API KEY..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* User Name */}
          <div>
            <label className="block text-xl font-bold text-cyan-600 mb-2 uppercase">{`>> Your Name (User)`}</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-4 py-3 bg-cyan-900/10 border-2 border-cyan-700 focus:border-cyan-400 focus:bg-cyan-900/20 focus:outline-none text-cyan-400 placeholder-cyan-900 font-mono text-lg uppercase"
              placeholder="THE ARCHITECT"
              required
            />
          </div>

          {/* AI Name */}
          <div>
            <label className="block text-xl font-bold text-cyan-600 mb-2 uppercase">{`>> AI Designation (Name)`}</label>
            <input
              type="text"
              value={aiName}
              onChange={(e) => setAiName(e.target.value)}
              className="w-full px-4 py-3 bg-cyan-900/10 border-2 border-cyan-700 focus:border-cyan-400 focus:bg-cyan-900/20 focus:outline-none text-cyan-400 placeholder-cyan-900 font-mono text-lg uppercase"
              placeholder="ENTER AI NAME..."
              required
            />
          </div>
        </div>

        {/* Gender Identity */}
        <div>
          <label className="block text-xl font-bold text-cyan-600 mb-2 uppercase">{`>> AI Gender Identity`}</label>
          <p className="text-xs text-cyan-800 mb-2">Example: Female, Male, Cyberpunk / Metro, Non-binary, etc.</p>
          <input
            type="text"
            value={genderIdentity}
            onChange={(e) => setGenderIdentity(e.target.value)}
            className="w-full px-4 py-3 bg-cyan-900/10 border-2 border-cyan-700 focus:border-cyan-400 focus:bg-cyan-900/20 focus:outline-none text-cyan-400 placeholder-cyan-900 font-mono text-lg uppercase"
            placeholder="CYBERPUNK / METRO"
            required
          />
        </div>
        
        <div>
           <div className="flex flex-col md:flex-row items-start gap-4 mb-4">
             <div className="w-24 h-24 md:w-32 md:h-32 border border-cyan-500 bg-cyan-900/10 flex items-center justify-center relative overflow-hidden shrink-0">
                {referenceImage ? (
                  <img src={`data:image/png;base64,${referenceImage}`} alt="ref" className="w-full h-full object-cover sepia-[.1]" />
                ) : (
                  <span className="text-4xl">🤖</span>
                )}
             </div>
             <div className="flex-1 w-full">
                <h3 className="text-xl font-bold text-cyan-400">VISUAL INPUT SOURCE (OPTIONAL)</h3>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  className="hidden" 
                  accept="image/*"
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-3 py-1 bg-cyan-900/30 border border-cyan-500 text-cyan-400 text-xs hover:bg-cyan-500 hover:text-black uppercase"
                >
                  {referenceImage ? 'CHANGE IMAGE' : '+ UPLOAD AVATAR'}
                </button>

                <div className="text-[10px] text-cyan-800 mt-2 uppercase leading-tight">
                  {referenceImage 
                    ? ">> IMAGE LOADED. AI WILL PRESERVE FACIAL IDENTITY." 
                    : ">> WAITING FOR INPUT..."}
                </div>
             </div>
           </div>
        </div>

        <div>
          <label className="block text-xl font-bold text-cyan-600 mb-2 uppercase">{`>> Visual Parameters (Appearance)`}</label>
          <p className="text-xs text-cyan-800 mb-2">Define the visual manifestation. Will merge with Gender Identity.</p>
          <textarea
            value={appearance}
            onChange={(e) => setAppearance(e.target.value)}
            className="w-full px-4 py-3 bg-cyan-900/10 border-2 border-cyan-700 focus:border-cyan-400 focus:bg-cyan-900/20 focus:outline-none text-cyan-400 placeholder-cyan-900 font-mono text-lg uppercase h-32"
            placeholder="E.G. SITTING ON A BED, SILVER HAIR, CASUAL CLOTHING..."
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-4 font-bold text-xl uppercase tracking-widest border-2 transition-all ${
            isLoading 
              ? 'border-cyan-900 text-cyan-900 cursor-not-allowed bg-black' 
              : 'border-cyan-500 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-500 hover:text-black shadow-[0_0_20px_rgba(34,211,238,0.3)]'
          }`}
        >
          {isLoading ? (
            <span className="animate-pulse">{`>> BOOTING SEQUENCE...`}</span>
          ) : (
            `>> INITIALIZE ${aiName.toUpperCase() || 'AI'}`
          )}
        </button>
      </form>
    </div>
  );
};