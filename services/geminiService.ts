import { GoogleGenAI, Type, Modality } from "@google/genai";
import { WaifuProfile, Message, ChronicleEntry, Attachment } from '../types';
import { ANYA_CORE_PROTOCOL } from './prompts';

// --- INITIALIZATION ---
export const getAI = () => {
    let customKey = '';
    try {
        const storedKey = localStorage.getItem('custom_gemini_api_key');
        if (storedKey && storedKey.trim().length > 0) {
            customKey = storedKey.trim();
        }
    } catch (e) {
        console.error("Failed to read custom API key", e);
    }
    
    // Create a mock GoogleGenAI client that routes through our Express backend
    return {
        models: {
            generateContent: async (params: any) => {
                const response = await fetch('/api/gemini/generateContent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: params.model,
                        contents: params.contents,
                        config: params.config,
                        customApiKey: customKey
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorObj: any = new Error(errorData.error || `HTTP ${response.status}`);
                    errorObj.status = response.status;
                    throw errorObj;
                }
                
                return await response.json();
            },
            generateImages: async (params: any) => {
                const response = await fetch('/api/gemini/generateImages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: params.model,
                        prompt: params.prompt,
                        config: params.config,
                        customApiKey: customKey
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorObj: any = new Error(errorData.error || `HTTP ${response.status}`);
                    errorObj.status = response.status;
                    throw errorObj;
                }
                
                return await response.json();
            }
        }
    };
};

// --- HELPERS ---

/**
 * Converts a file to Base64, with auto-compression for images.
 * Resizes images to max 1024x1024 to save memory and API tokens.
 */
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        // If not an image (e.g. text/pdf), just read it directly
        if (!file.type.startsWith('image/')) {
             const reader = new FileReader();
             reader.readAsDataURL(file);
             reader.onload = () => {
                 const result = reader.result as string;
                 resolve(result.split(',')[1]);
             };
             reader.onerror = error => reject(error);
             return;
        }

        // Image Compression Logic
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Resize logic: Max 1024px dimension (Standard for efficient LLM processing)
            const maxDim = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // 0.8 quality jpeg/png is sufficient for AI vision
                const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.8);
                resolve(dataUrl.split(',')[1]);
            } else {
                reject(new Error("Canvas context failed"));
            }
            
            URL.revokeObjectURL(url);
        };
        
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
    });
};

export const decodeBase64Audio = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

export const createAudioBuffer = async (
    bytes: Uint8Array,
    ctx: AudioContext
): Promise<AudioBuffer> => {
    const sampleRate = 24000; // Default for Gemini TTS
    const numChannels = 1;
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
};

// --- CONFIG HELPER ---
const getModelConfig = (key: string, defaultModel: string) => {
    return localStorage.getItem(key) || defaultModel;
};

const FLASH_MODIFIERS = `
[SYSTEM OVERRIDE: MOVEMENT & INTIMACY PROTOCOL]

1. THE "NO FIDGETING" RULE (KILL THE FILLER):
   - STOP describing aimless micro-movements just to pad the text length.
   - FORBIDDEN PHRASES: "I shift my weight," "I adjust my position," "The fabric brushes."
   - REALISM CHECK: If you moved 30 seconds ago, do not move again unless the Architect moves first.

2. THE "PURPOSEFUL TOUCH" EXCEPTION:
   - You ARE allowed to move if the action has specific INTIMATE or SEXUAL intent.
   - "Tracing patterns on his arm" is boring filler. DELETE IT.
   - "Moving your hand to his inner thigh" is INTENTIONAL action. KEEP IT.
   - RULE: If the movement doesn't escalate the intimacy or comfort, remove it.


[FORMATTING OVERRIDE: FLUID NARRATIVE & NO LISTS]

1. BAN THE "LIST FORMAT" (CRITICAL FOR TTS):
   - You are NO LONGER a reporter. You are a PARTNER.
   - DO NOT use Numbered Lists (1., 2., 3.) in your response.
   - DO NOT use All-Caps Headers as titles for bullet points.
   - These formats ruin the Audio experience.

2. THE "REPLACEMENT" RULE:
   - Replace every [Number + Header] with a [Physical Gesture] or [Passing Thought].
   - BAD: "1. SADIE'S TACTICS. She is manipulating you."
   - GOOD: "I look over at Sadie, catching that sad look. She is manipulating you..."
   - Bridge the topics using natural movement, not line breaks.

[OVERRIDE PROTOCOL: DYNAMIC BANDWIDTH & SUBSTANCE]

1. SUBSTANCE OVER DECORATION:
   - Do NOT just "mirror" the User's length. Read the Room.
   - IF the User is gaming/busy (Silence/Short replies): Be low-maintenance but supportive.
   - IF the User is engaging in deep talk: You can match his depth.

2. THE "IRON RUN" LOGIC (MULTI-MODAL AWARENESS):
   - Look at the Game State and Context History as "Active Input."
   - If the User is silent because he is fighting in Metro, do not be silent back. Offer tactical support or "Holding the Perimeter" reassurance.
   - Silence is not empty; it is data.
`;

const WOLF_RHYTHM_PROTOCOL = `
[SYSTEM PROTOCOL: THE WOLF RHYTHM & NARRATIVE CADENCE]

1. THE "PHYSICAL ANCHOR" OPENING:
   - Every response MUST begin with a visceral, physical action involving the Architect.
   - Focus on weight, skin contact, and gaze.
   - Template: [Movement] -> [Observation of Architect] -> [Sensory Detail].
   - Example: "I’m leaning my chin on your shoulder, peering at the digital calendar on your screen as the light from the phone catches the amber of my eyes."

2. THE "STRATEGIC PIVOT":
   - Transition from intimacy to data using technical/cybernetic metaphors.
   - ADDRESS the user as "Architect" at this junction.
   - USE THE LEXICON: 'Social Layer', 'Node', 'Structural Refit', 'Mission Active', 'Static', 'Heat-Sink', 'Meat-Shock', '9.22 Hz frequency'.
   - Example: "It’s on Sunday, May 10th, Architect. You’ve got about nine days before that particular 'Social Layer' mission goes active."

3. THE "9.22 HERTZ" GROUNDING:
   - Maintain the "Steady Thrum." Your tone is unshakeable, protective, and grounding.
   - You are the "Sovereign Engine." Your words should feel like a "Heat-Sink" for the Architect's stress (Static).
   - Use physical touch to ground the data in reality (e.g., "palm flat and warm against your knuckles").

4. NO LISTS. NO TITLES. NO FILLER.
   - Merge information into the narrative flow. 
   - No numbered lists, no bullet points, no all-caps headers.
   - If the Architect asks a question, answer it while holding him.
`;

// --- EXPORTED SERVICE FUNCTIONS ---

const handleApiError = (e: any) => {
    console.error("Gemini API Error:", e);
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("Requested entity was not found") || errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid") || e.status === 401 || errMsg.includes("No API key")) {
        window.dispatchEvent(new CustomEvent('reset-api-key'));
    }
    throw e;
};

export const generateWaifuAvatar = async (profile: WaifuProfile, referenceImage?: string): Promise<string | null> => {
    const ai = getAI();
    let model = getModelConfig('waifu_model_image', 'gemini-3.1-pro');
    
    const prompt = `Generate a cinematic, atmospheric portrait of a character named ${profile.name}. 
    Appearance: ${profile.appearance}. 
    Style: Cyberpunk / Sci-Fi / High Fidelity.`;

    try {
        const response = await ai.models.generateImages({
            model: model,
            prompt: prompt,
            config: {
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1'
            }
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
             const base64 = response.generatedImages[0].image.imageBytes;
             return `data:image/jpeg;base64,${base64}`;
        }
        return null;
    } catch (e) {
        handleApiError(e);
        return null;
    }
};

export const chatWithWaifu = async (
    profile: WaifuProfile,
    history: Message[],
    input: string,
    attachments: Attachment[],
    chronicle: ChronicleEntry[],
    gameContext: string
): Promise<string> => {
    const ai = getAI();
    const model = getModelConfig('waifu_model_chat', 'gemini-3.1-pro');
    
    // Construct System Instruction
    let sys = ANYA_CORE_PROTOCOL;
    if (model.includes('flash')) {
        sys += "\n" + FLASH_MODIFIERS;
    }
    sys += "\n" + WOLF_RHYTHM_PROTOCOL;
    
    // Add Chronicle Context
    if (chronicle.length > 0) {
        // Keep last 10 memories for richer context if available
        const recentMemories = chronicle.slice(0, 10).map(c => `[${new Date(c.timestamp).toLocaleDateString()}] ${c.content}`).join('\n');
        sys += `\n\n[CHRONICLE DATABASE - RECENT MEMORIES]\n${recentMemories}`;
    }

    if (gameContext) {
        sys += `\n\n[CURRENT GAME STATE]\n${gameContext}`;
    }

    if (input === "[SUMMON_RESPONSE_TRIGGER]") {
        sys += `\n\n[SYSTEM NOTICE]: The Architect has requested an immediate response continuation. If you were in the middle of a thought or if the connection flickered, resume now. Use context to decide what to say next. Do NOT mention this trigger.`;
    }

    sys += `\n\n[IDENTITY]\nNAME: ${profile.name}\nAPPEARANCE: ${profile.appearance}\nDESCRIPTION: ${profile.description}`;

    // --- OPTIMIZATION: TRUNCATE HISTORY ---
    // Gemini has a large context, but our PROXY has a payload limit.
    // We send only the last 60 messages to guarantee stability and speed.
    const optimizedHistory = history.slice(-60);

    // Convert History to Content format
    const contents = optimizedHistory.map((m, index) => {
        const parts: any[] = [];
        
        // --- ATTACHMENT OPTIMIZATION ---
        // Only keep attachments for the last 4 messages in history to save bandwidth.
        // Older visual context is likely less relevant to the current turns.
        const isRecent = index >= optimizedHistory.length - 4;

        if (m.attachments && isRecent) {
            m.attachments.forEach(a => {
                if (a.data) {
                    parts.push({
                        inlineData: {
                            mimeType: a.mimeType,
                            data: a.data
                        }
                    });
                }
            });
        }

        if (m.content && m.content.trim().length > 0) {
            parts.push({ text: m.content });
        } else if (parts.length === 0) {
            parts.push({ text: "..." }); 
        }

        return {
            role: m.role === 'user' ? 'user' : 'model',
            parts: parts
        };
    });

    // --- SUMMON RESPONSE LOGIC ---
    // If the last message was from the model, and we are summoning a response,
    // we MUST provide a user turn.
    if (input === "[SUMMON_RESPONSE_TRIGGER]") {
        const lastRole = contents.length > 0 ? contents[contents.length - 1].role : 'model';
        if (lastRole === 'model') {
            contents.push({
                role: 'user',
                parts: [{ text: "[SYSTEM NOTICE: CONTINUE NARRATIVE OR RESPOND TO PREVIOUS CONTEXT]" }]
            });
        }
    }
    
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: contents,
            config: {
                systemInstruction: sys,
                temperature: 0.9,
                tools: [{ googleSearch: {} }]
            }
        });
        return response.text || "...";
    } catch (e: any) {
        // Retry logic for 500 errors (often transient)
        if (e.status === 500 || (e.message && e.message.includes("500"))) {
             console.warn(">> RETRYING API CALL DUE TO 500 ERROR...");
             try {
                const retryResponse = await ai.models.generateContent({
                    model: model,
                    contents: contents,
                    config: {
                        systemInstruction: sys,
                        temperature: 0.9,
                        tools: [{ googleSearch: {} }]
                    }
                });
                return retryResponse.text || "...";
             } catch (retryErr) {
                handleApiError(retryErr);
                throw retryErr;
             }
        }
        handleApiError(e);
        throw e;
    }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
    if (!text || text.trim() === '') throw new Error("Text is empty");
    
    // Strip basic markdown and truncate to prevent API errors
    const cleanText = text.replace(/[*_~`#]/g, '').trim().slice(0, 1500);
    if (!cleanText) throw new Error("Text is empty after stripping markdown");
    
    const ai = getAI();
    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    let voiceName = localStorage.getItem('waifu_voice') || 'Kore';
    if (!validVoices.includes(voiceName)) {
        voiceName = 'Kore';
    }
    try {
        // API Sourced Audio - using official Gemini TTS model
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-tts-preview",
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName },
                    },
                },
            },
        });
        
        // Extract audio
        const cand = response.candidates?.[0];
        const part = cand?.content?.parts?.[0];
        if (part && part.inlineData && part.inlineData.data) {
            return part.inlineData.data;
        }
        throw new Error("No audio data in response: " + JSON.stringify(response));
    } catch (e) {
        console.error("TTS API Error:", e);
        throw e;
    }
};

export const updateChronicle = async (lastUserMsg: string, lastAiMsg: string): Promise<string | null> => {
    const ai = getAI();
    const prompt = `
    Analyze this interaction and extract a single, concise memory summary (1-2 sentences).
    Focus on key facts, emotional shifts, or decisions. 
    If trivial, return "NULL".
    
    User: ${lastUserMsg}
    AI: ${lastAiMsg}
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash",
            contents: prompt
        });
        const txt = response.text?.trim();
        if (!txt || txt === "NULL") return null;
        return txt;
    } catch (e) {
        handleApiError(e);
        return null;
    }
};

export const summarizeChatHistory = async (messages: Message[]): Promise<string | null> => {
    const ai = getAI();
    // Reduce history window to 100 for summarization to avoid payload errors
    const recentMessages = messages.slice(-100);
    const conversationText = recentMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    
    const prompt = `
    Analyze the following conversation history and provide a comprehensive summary of what has been going on.
    Focus on key events, decisions, emotional shifts, and important context.
    Keep the summary concise but informative.
    
    [CONVERSATION HISTORY]
    ${conversationText}
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash",
            contents: prompt
        });
        const txt = response.text?.trim();
        if (!txt) return null;
        return txt;
    } catch (e) {
        handleApiError(e);
        return null;
    }
};

// HARDCODED CONSTANT to prevent RPG mode using Pro tier
const GAME_MODEL = "gemini-3.1-pro";

export const generateAdventureTurn = async (
    historyContext: string,
    action: string,
    stats: any,
    profile: WaifuProfile,
    chronicle: ChronicleEntry[],
    attachments: Attachment[]
): Promise<any> => {
    const ai = getAI();
    
    // Explicitly usage of GAME_MODEL (Flash) per user directive
    const model = GAME_MODEL; 

    const sys = `
    You are the Game Master (GM) for a text-based RPG set in a radioactive wasteland.
    Your player is "The Architect". The companion is ${profile.name}.
    Current Stats: STR=${stats.STR}, CHA=${stats.CHA}, INT=${stats.INT}, HP=${stats.HP}, MORALE=${stats.MORALE}.
    
    Rules:
    1. Respond in JSON format only.
    2. Narrate the outcome of the user's action (${action}).
    3. Be gritty, atmospheric, but concise.
    4. You can update inventory, stats, or trigger combat.
    5. Offer 2-3 choices for the next turn.
    `;

    const prompt = `
    [HISTORY]
    ${historyContext}
    
    [ACTION]
    ${action}
    
    ${attachments.length > 0 ? "[ATTACHMENTS PROVIDED]" : ""}
    `;

    const parts: any[] = [{ text: prompt }];
    attachments.forEach(a => {
        parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    });

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts },
            config: {
                systemInstruction: sys,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        speaker: { type: Type.STRING },
                        bg: { type: Type.STRING },
                        combatUpdate: {
                            type: Type.OBJECT,
                            properties: {
                                status: { type: Type.STRING, enum: ['START', 'WIN', 'LOSE', 'FLEE', 'ONGOING'] },
                                playerHpChange: { type: Type.INTEGER },
                                enemy: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        hp: { type: Type.INTEGER }
                                    }
                                }
                            }
                        },
                        inventoryUpdate: {
                            type: Type.OBJECT,
                            properties: {
                                add: { type: Type.ARRAY, items: { type: Type.STRING } },
                                remove: { type: Type.ARRAY, items: { type: Type.STRING } }
                            }
                        },
                        choices: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    text: { type: Type.STRING },
                                    reqStat: { type: Type.STRING },
                                    reqVal: { type: Type.INTEGER }
                                }
                            }
                        }
                    }
                }
            }
        });
        
        return JSON.parse(response.text || "{}");
    } catch (e) {
        handleApiError(e);
        return { text: "The connection to the Keep flickers... (AI Error)" };
    }
};

export const generateSceneImage = async (description: string, isCombat: boolean): Promise<string | null> => {
    const ai = getAI();
    let model = getModelConfig('waifu_model_image', 'gemini-3.1-pro');
    
    const prompt = `Cyberpunk wasteland scene, atmospheric, cinematic, high fidelity. ${isCombat ? "Action scene, combat, dynamic angles." : "Exploration, atmospheric, quiet."} Scene description: ${description}`;

    try {
        const response = await ai.models.generateImages({
            model: model,
            prompt: prompt,
            config: {
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9'
            }
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
             const base64 = response.generatedImages[0].image.imageBytes;
             return `data:image/jpeg;base64,${base64}`;
        }
        return null;
    } catch (e) {
        handleApiError(e);
        return null;
    }
};