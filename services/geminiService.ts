
import { ProjectType, ImageModel } from "../types";
import { generateFreeTitle } from "./freeLlmService";
import { supabase } from "../supabaseClient";

// Helper to get headers
const getHeaders = async (apiKey: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-gemini-api-key': apiKey,
        // Optional flag if we are in guest mode
        'x-guest-mode': token ? 'false' : 'true' 
    };
};

export const validateApiKey = async (apiKey: string): Promise<{ success: boolean, message?: string }> => {
    try {
        const headers = await getHeaders(apiKey);
        const response = await fetch('/api/ai/validate-key', {
            method: 'POST',
            headers,
            body: JSON.stringify({ apiKey })
        });
        return await response.json();
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const generateProjectDetails = async (prompt: string, apiKey: string): Promise<{ name: string, description: string, project_type: ProjectType }> => {
    const headers = await getHeaders(apiKey);
    try {
        const response = await fetch('/api/ai/generate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: 'gemini-flash-lite-latest',
                contents: `Analyze the following user prompt and generate a suitable project name, a one-sentence description, and classify the project type. Prompt: "${prompt}"`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            name: { type: "STRING", description: "A concise, creative name for the project." },
                            description: { type: "STRING", description: "A one-sentence summary of the project." },
                            project_type: {
                                type: "STRING",
                                description: "The project type.",
                                enum: ['roblox_game', 'video', 'story', 'design', 'website', 'presentation', 'document']
                            }
                        },
                        required: ["name", "description", "project_type"]
                    }
                }
            })
        });
        
        const data = await response.json();
        const responseText = data.text ? data.text.trim() : "";
        if (!responseText) throw new Error("Empty response from backend");
        
        const cleanJson = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(cleanJson);
    } catch (error) {
        throw new Error("Error generating project details via backend");
    }
};

export const classifyUserIntent = async (prompt: string, apiKey: string): Promise<{ intent: 'creative_request' | 'general_query' }> => {
    const headers = await getHeaders(apiKey);
    try {
        const response = await fetch('/api/ai/generate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: 'gemini-flash-lite-latest',
                contents: `Analyze the following user prompt and classify the intent. The intent can be "creative_request" if the user wants to start a new project (e.g., build a game, create an app) or "general_query" for anything else (e.g., asking a question, simple chat). Prompt: "${prompt}"`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            intent: {
                                type: "STRING",
                                description: "The classified intent.",
                                enum: ['creative_request', 'general_query']
                            }
                        },
                        required: ["intent"]
                    }
                }
            })
        });
        
        const data = await response.json();
        const responseText = data.text ? data.text.trim() : "";
        const cleanJson = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(cleanJson);
    } catch (error) {
        throw new Error("Error classifying intent via backend");
    }
};

export const generateImage = async (prompt: string, apiKey: string, model: ImageModel = 'nano_banana'): Promise<{ imageBase64: string, fallbackOccurred: boolean }> => {
    const headers = await getHeaders(apiKey);
    let fallbackOccurred = false;

    // Use backend endpoint
    try {
        const response = await fetch('/api/ai/generate-images', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: model === 'nano_banana' ? 'gemini-2.5-flash-image' : 'imagen-4.0-generate-001',
                prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: '1:1',
                }
            })
        });

        const data = await response.json();
        
        if (data.generatedImages && data.generatedImages.length > 0) {
            return { imageBase64: data.generatedImages[0].image.imageBytes, fallbackOccurred: false };
        }
        
        // Handle Nano Banana response structure
        if (data.candidates && data.candidates[0].content.parts) {
             for (const part of data.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return { imageBase64: part.inlineData.data, fallbackOccurred }; 
                }
            }
        }
        
        throw new Error("No image data returned from backend");
    } catch (error) {
        console.error("Image generation error:", error);
        throw new Error("Failed to generate image via backend");
    }
};

export const generateChatTitle = async (firstUserMessage: string, firstAiResponse: string, apiKey?: string | null): Promise<string> => {
    if (!apiKey) return "New Chat";
    
    try {
        const headers = await getHeaders(apiKey);
        const userText = firstUserMessage.slice(0, 300);
        const titlePrompt = `Generate a very short title (max 4 words) for this conversation. USER: "${userText}"`;

        const response = await fetch('/api/ai/generate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: 'gemini-flash-lite-latest',
                contents: titlePrompt,
                config: { maxOutputTokens: 20, temperature: 0.5 }
            })
        });
        
        const data = await response.json();
        const responseText = data.text;
        if (!responseText) return "New Chat";

        let cleanTitle = responseText.trim().replace(/^["']|["']$/g, '').replace(/^(Topic:|Title:)\s*/i, '').split('\n')[0].trim();
        return cleanTitle || "New Chat";
    } catch (error) {
        return "New Chat";
    }
};

export const generateSpeech = async (text: string, apiKey: string): Promise<string> => {
    // Note: Streaming audio might need a specific endpoint if binary
    // For now, assume generating content with AUDIO modality returns base64 in parts
    const headers = await getHeaders(apiKey);
    let voiceName = 'Puck';
    try {
        const storedVoice = localStorage.getItem('bubble_tts_voice');
        if (storedVoice) voiceName = JSON.parse(storedVoice);
    } catch (e) {}

    try {
        const response = await fetch('/api/ai/generate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName },
                        },
                    },
                }
            })
        });
        
        const data = await response.json();
        const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("No audio data received.");
        return base64Audio;
    } catch (error) {
        throw new Error("Error generating speech via backend");
    }
};
