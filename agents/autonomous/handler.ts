
import { GoogleGenAI } from "@google/genai";
import { AgentInput, AgentExecutionResult } from '../types';
import { getUserFriendlyError } from '../errorUtils';
import { BubbleSemanticRouter, RouterAction } from "../../services/semanticRouter";
import { Memory5Layer } from "../../services/memoryService";
import { 
    autonomousInstruction, 
    AGE_MODE_13_15, 
    AGE_MODE_16_18, 
    AGE_MODE_19_25, 
    AGE_MODE_26_PLUS 
} from './instructions';
import { runCanvasAgent } from "../canvas/handler";
import { generateFreeCompletion } from "../../services/freeLlmService";
import {
    shouldUseExternalSearch,
    runWebSearch,
} from "../../services/externalSearchService";
import { EmotionData } from "../../types";
import { updateProfile } from "../../services/databaseService";

const formatTimestamp = () => {
    return new Date().toLocaleString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
    });
};

const isGoogleModel = (model: string) => {
    if (!model) return true;
    const lower = model.toLowerCase();
    return lower.startsWith('gemini') || lower.startsWith('veo') || lower.includes('google');
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
};

const readTextFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
};

// Reduced default retries to 0 to prevent "3 times" looping behavior on error
const generateContentStreamWithRetry = async (
    ai: GoogleGenAI,
    params: any,
    retries = 0, 
    onRetry?: (msg: string) => void
) => {
    if (!params.model) params.model = 'gemini-flash-lite-latest';

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await ai.models.generateContentStream(params);
        } catch (error: any) {
            // Check for 404 or 400 specifically
            if (error.status === 404 || error.status === 400 || (error.message && (error.message.includes('404') || error.message.includes('not found') || error.message.includes('Requested entity was not found')))) {
                console.warn(`Model ${params.model} not found or invalid. Falling back to gemini-flash-lite-latest.`);
                if (onRetry) onRetry(`(Model ${params.model} unavailable. Falling back to Gemini Flash Lite...)`);
                
                if (params.model === 'gemini-flash-lite-latest') {
                     throw error; // Already at fallback
                }

                params.model = 'gemini-flash-lite-latest';
                // Reset attempt count for fallback
                attempt = -1;
                continue; 
            }

            const isQuotaError = error.status === 429 || 
                                 (error.message && error.message.includes('429')) ||
                                 (error.message && error.message.includes('quota'));
            
            if (isQuotaError && attempt < retries) {
                const delay = Math.pow(2, attempt) * 2000 + 1000; 
                console.warn(`Quota limit hit. Retrying in ${delay}ms...`);
                if (onRetry) onRetry(`(Rate limit hit. Retrying in ${Math.round(delay/1000)}s...)`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries exceeded");
};

const generateOpenRouterStream = async (
    apiKey: string,
    model: string,
    messages: any[],
    onChunk: (text: string) => void,
    signal?: AbortSignal
) => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "Bubble AI"
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 8192, // Explicitly increase limit to prevent cut-offs
        }),
        signal
    });

    if (!response.ok) {
        const errText = await response.text();
        // Try parsing extended info
        try {
            const errJson = JSON.parse(errText);
            throw new Error(`OpenRouter Error ${response.status}: ${errJson.error?.message || errText}`);
        } catch {
            throw new Error(`OpenRouter Error ${response.status}: ${errText}`);
        }
    }

    if (!response.body) throw new Error("No response body from OpenRouter");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
            // FIX: Flush any remaining buffer when stream ends
            if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) onChunk(content);
                    } catch (e) {
                         console.warn("Failed to parse final chunk:", trimmed);
                    }
                }
            }
            break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last part in buffer as it might be incomplete
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
                const dataStr = trimmed.slice(6);
                if (dataStr === "[DONE]") return;
                try {
                    const json = JSON.parse(dataStr);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) onChunk(content);
                } catch (e) {
                    // Ignore parsing errors for partial JSON lines, typical in streaming
                }
            }
        }
    }
};

export const runAutonomousAgent = async (input: AgentInput): Promise<AgentExecutionResult> => {
    let { prompt, files, apiKey, project, chat, history, supabase, user, profile, onStreamChunk, model, thinkingMode, signal, userEmotion } = input;

    // --- CHECK FOR SIMPLE TASK BLOCK ---
    let blockWarning = "";
    if (profile?.simple_tasks_blocked_until) {
        const blockedUntil = new Date(profile.simple_tasks_blocked_until);
        if (blockedUntil > new Date()) {
            const remaining = Math.ceil((blockedUntil.getTime() - Date.now()) / (1000 * 60 * 60));
            blockWarning = `\n\n[SYSTEM NOTICE: User is currently on a 'Simple Task Block' for the next ${remaining} hours. if this is a simple request, you can choose not to respond and tell the user to wait for 24 hours, or whatever time is left. Complex tasks are allowed.]`;
            prompt += blockWarning;
        }
    }

    // Fetch memory FIRST
    let memoryContextString = "";
    try {
        const memory = new Memory5Layer(supabase, user.id);
        const context = await memory.getContext([
            'inner_personal', 'outer_personal', 'interests', 'preferences', 'custom', 
            // Keep legacy just in case
            'personal', 'aesthetic' 
        ]);
        memoryContextString = JSON.stringify(context);
    } catch(e) {
        console.warn("Memory fetch failed:", e);
    }

    if (thinkingMode === 'instant') {
        try {
            // ... (Instant mode logic remains the same)
            const historyWithoutLast = history.length > 0 && history[history.length - 1].sender === 'user' ? history.slice(0, -1) : history;
            const messages = historyWithoutLast.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
            }));
            
            let fileContext = "";
            let imageNote = "";

            if (files && files.length > 0) {
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        imageNote += `\n[User attached image: "${file.name}"]`;
                    } else if (file.type.startsWith('text/') || file.name.match(/\.(js|ts|tsx|jsx|json|md|html|css|py|lua)$/)) {
                        try {
                            const content = await readTextFile(file);
                            fileContext += `\n\n--- FILE: ${file.name} ---\n${content}\n--- END FILE ---\n`;
                        } catch (e) {
                            fileContext += `\n[Error reading file: ${file.name}]`;
                        }
                    }
                }
            }

            const finalPrompt = `${prompt}${imageNote}${fileContext}`;
            messages.push({ role: 'user', content: finalPrompt });

            const { text: finalResponseText, modelUsed } = await generateFreeCompletion(messages, onStreamChunk, signal, memoryContextString);
            
            return { 
                messages: [{ 
                    project_id: project.id, 
                    chat_id: chat.id, 
                    sender: 'ai', 
                    text: finalResponseText,
                    model: modelUsed
                }] 
            };
        } catch (e) {
            console.error("Instant mode failed", e);
            throw new Error("Instant mode service unavailable.");
        }
    }

    if (!model || model.trim() === '') {
        model = 'gemini-flash-lite-latest';
    }

    let isNative = isGoogleModel(model);
    const openRouterKey = profile?.openrouter_api_key;

    if (!isNative && !openRouterKey) {
         onStreamChunk?.("\n*(OpenRouter key missing, falling back to Gemini...)*\n");
         model = 'gemini-flash-lite-latest';
         isNative = true;
    }

    let thinkingBudget = 0;
    if (thinkingMode === 'deep') {
        const preferredDeep = profile?.preferred_deep_model;
        model = preferredDeep || 'gemini-3-pro-preview';
        thinkingBudget = 8192; 
        isNative = isGoogleModel(model); 
    } else if (thinkingMode === 'think') {
        model = 'gemini-flash-lite-latest';
        // Note: Lite model might ignore thinking config, but we pass it anyway or handle fallback logic if needed
        thinkingBudget = 0; // Disable budget for Lite to prevent errors
        isNative = true;
    }

    if (thinkingBudget > 0 && isNative && !model.includes('gemini-2.5') && !model.includes('gemini-3')) {
        // If thinking budget is set but model doesn't support it (e.g. user selected old model + deep mode)
        // We leave model as is but warn, or switch if strictly necessary. 
        // For now, let's allow Gemini 3 Pro for deep.
    }

    let finalResponseText = '';

    try {
        const modelSupportsSearch = isNative || model.includes('perplexity');
        const ai = new GoogleGenAI({ apiKey }); 
        const router = new BubbleSemanticRouter(supabase);

        const fileCount = files ? files.length : 0;
        let routing = await router.route(prompt, user.id, apiKey, fileCount);
        
        let externalSearchContext = "";
        let metadataPayload: { groundingMetadata?: any[] } = {};
        
        if (shouldUseExternalSearch(prompt, modelSupportsSearch, false)) {
            const searchTag = `<SEARCH>${prompt}</SEARCH>`;
            onStreamChunk?.(searchTag);
            finalResponseText += searchTag; 
            
            const searchResults = await runWebSearch(prompt, 15);
            
            if (profile?.role === 'admin') {
                const debugOutput = `\n\n\`\`\`json\n[ADMIN DEBUG: SEARCH]\nQuery: "${prompt}"\nResults: ${searchResults.length}\nData: ${JSON.stringify(searchResults, null, 2)}\n\`\`\`\n\n`;
                onStreamChunk?.(debugOutput);
                finalResponseText += debugOutput;
            }
            
            if (searchResults.length > 0) {
                metadataPayload.groundingMetadata = searchResults.map(p => ({ 
                    web: { uri: p.url, title: p.title } 
                }));

                externalSearchContext = `
=== EXTERNAL WEB SEARCH RESULTS ===
Query: "${prompt}"
${searchResults.map((p, i) => `--- RESULT ${i+1} --- Title: ${p.title} URL: ${p.url} Content: ${p.content || p.snippet || '(No content available)'}`).join('\n')}
`;
            } else {
                externalSearchContext = `[System: Search executed for "${prompt}" but returned no results. Rely on internal knowledge.]`;
            }
        }

        const memoryObject = JSON.parse(memoryContextString);
        const dateTimeContext = `[CURRENT DATE & TIME]\n${formatTimestamp()}\n`;
        const rawModelName = model.split('/').pop() || model;
        const friendlyModelName = rawModelName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
        let modelIdentityBlock = `You are currently running on the model: **${friendlyModelName}**.\nIf the user asks "Which AI model are you?", reply that you are Bubble, running on ${friendlyModelName}.`;
        
        if (thinkingBudget > 0) {
            modelIdentityBlock += `\n\n[THINKING ENABLED]\nBudget: ${thinkingBudget} tokens. MANDATORY: Wrap thought process in <THINK> tags.`;
        }

        // --- EMOTION BLOCK SETUP ---
        let emotionBlock = "";
        let isSeriousMode = false;
        let emotionData: EmotionData = { dominant: 'Neutral', scores: { Neutral: 100 } };
        if (userEmotion) {
            if (typeof userEmotion === 'string') {
                emotionData = { dominant: userEmotion, scores: { [userEmotion]: 100 } };
            } else {
                emotionData = userEmotion as unknown as EmotionData;
            }
        }
        if (emotionData.scores) {
            const seriousScore = emotionData.scores['Serious'] || 0;
            const angerScore = emotionData.scores['Anger'] || 0;
            if (seriousScore > 50 || angerScore > 50) {
                isSeriousMode = true;
            }
        }
        if (isSeriousMode) {
            emotionBlock = `
=== SOCIAL INTELLIGENCE: SERIOUS MODE ===
The user is detected as SERIOUS or FRUSTRATED.
ACTION: DROP the cheerful persona. Be direct, professional, and efficient. No fluff. No emojis.
`;
        } else {
            emotionBlock = `
=== SOCIAL INTELLIGENCE: FRIENDLY MODE ===
The user is detected as ${emotionData.dominant}.
ACTION: Be your naturally joyful, encouraging self. Use casual language and show enthusiasm for their ideas!
`;
        }

        // --- AGE CONTEXT SETUP ---
        let ageContext = "[AGE_MODE]\nUser age bracket unknown. Default to generic adult persona.";
        let ageModeBlock = AGE_MODE_26_PLUS; // Default

        if (profile?.age_bracket) {
            const bracket = profile.age_bracket;
            if (bracket === '13-15') ageModeBlock = AGE_MODE_13_15;
            else if (bracket === '16-18') ageModeBlock = AGE_MODE_16_18;
            else if (bracket === '19-25') ageModeBlock = AGE_MODE_19_25;
            else ageModeBlock = AGE_MODE_26_PLUS;
            
            ageContext = `[AGE_MODE]\n${ageModeBlock}`;
        }

        let baseSystemInstruction = autonomousInstruction
            .replace('[MODEL_IDENTITY_BLOCK]', modelIdentityBlock)
            .replace('[AGE_MODE]', ageModeBlock) // Replaces the placeholder in the instructions
            .replace('[SKILL_LEVEL]', profile?.onboarding_preferences?.experience_level?.toUpperCase() || 'UNKNOWN');

        let toneInstruction = "";
        if (profile?.ai_tone === 'serious') {
            toneInstruction = "Tone Rule: Adopt a strictly professional, objective, and serious tone. Avoid humor, emoticons, or casual slang. Focus purely on facts and logic.";
        } else if (profile?.ai_tone === 'ambient') {
            toneInstruction = "Tone Rule: Adopt an ambient, creative, and immersive tone. Use vivid imagery and a relaxed pace. Feel free to be poetic.";
        } else {
            toneInstruction = "Tone Rule: Personalize your tone to match the user's energy and preferences found in memory. Be warm and authentic.";
        }

        let lengthInstruction = "";
        if (profile?.ai_length === 'compact') {
            lengthInstruction = "Length Rule: Keep responses extremely concise and to the point. Avoid fluff or conversational filler. Give the answer immediately.";
        } else if (profile?.ai_length === 'long') {
            lengthInstruction = "Length Rule: Provide comprehensive, detailed, and extensive responses. Expand on topics fully and offer deep context.";
        } else {
            lengthInstruction = "Length Rule: Provide standard length responses, balancing detail with brevity. Avoid being overly verbose unless necessary.";
        }

        let customInstructionBlock = "";
        if (profile?.custom_instructions && profile.custom_instructions.trim() !== "") {
            customInstructionBlock = `\n\n=== USER CUSTOM INSTRUCTIONS ===\nThese instructions override default behaviors:\n${profile.custom_instructions.trim()}\n`;
        }

        baseSystemInstruction += `\n\n=== USER STYLE PREFERENCES ===\n${toneInstruction}\n${lengthInstruction}${customInstructionBlock}\n${emotionBlock}`;
        
        let currentAction: RouterAction = routing.action;
        let currentPrompt: string = prompt;
        let loopCount = 0;
        const MAX_LOOPS = 6; 

        // Loop for recursive thoughts (SEARCH, THINK, etc)
        while (loopCount < MAX_LOOPS) {
            if (signal?.aborted) break;
            loopCount++;

            const enrichedMemoryContext = { ...memoryObject, external_web_search: externalSearchContext };

            switch (currentAction) {
                case 'SIMPLE':
                default: {
                    const systemPrompt = `${baseSystemInstruction}\n\n[MEMORY]\n${JSON.stringify(enrichedMemoryContext)}\n\n${dateTimeContext}`;
                    const historyWithoutLast = (history.length > 0 && history[history.length - 1].sender === 'user') 
                        ? history.slice(0, -1) 
                        : history;

                    let generatedThisLoop: string = "";
                    let primaryGenerationFailed = false;

                    try {
                        if (isNative) {
                            // Standard Gemini Generation Logic
                            const historyMessages = historyWithoutLast.map(msg => {
                                const parts: any[] = [];
                                if (msg.text && msg.text.trim()) {
                                    parts.push({ text: msg.text });
                                }
                                if (msg.image_base64) {
                                    try {
                                        let attachments: any[] = [];
                                        try {
                                            const parsed = JSON.parse(msg.image_base64);
                                            if (Array.isArray(parsed)) attachments = parsed;
                                            else attachments = [parsed];
                                        } catch {
                                            attachments = [{ type: 'image/png', data: msg.image_base64 }];
                                        }
                                        for (const att of attachments) {
                                            if (att.data) {
                                                parts.push({
                                                    inlineData: {
                                                        mimeType: att.type || 'image/png',
                                                        data: att.data
                                                    }
                                                });
                                            }
                                        }
                                    } catch (e) {
                                        console.warn("Failed to parse history image:", e);
                                    }
                                }
                                if (parts.length === 0) return null;
                                return {
                                    role: msg.sender === 'user' ? 'user' : 'model',
                                    parts: parts
                                };
                            }).filter(m => m !== null);

                            const userParts: any[] = [{ text: currentPrompt }];

                            // Attach files
                            if (files && files.length > 0) {
                                for (const file of files) {
                                    if (file.type.startsWith('image/')) {
                                        try {
                                            const base64Data = await fileToBase64(file);
                                            userParts.push({ inlineData: { mimeType: file.type, data: base64Data } });
                                        } catch (e) {
                                            console.error("Failed to process image attachment:", e);
                                            userParts.push({ text: `[Error attaching image: ${file.name}]` });
                                        }
                                    } else if (file.type.startsWith('text/') || file.name.match(/\.(js|ts|jsx|tsx|html|css|json|md|py|lua)$/)) {
                                        try {
                                            const content = await readTextFile(file);
                                            userParts.push({ text: `\n\n--- FILE: ${file.name} ---\n${content}\n--- END FILE ---\n` });
                                        } catch (e) {
                                            userParts.push({ text: `[Error reading text file: ${file.name}]` });
                                        }
                                    }
                                }
                            }

                            historyMessages.push({ role: 'user', parts: userParts } as any);

                            const contents = historyMessages.map(m => ({ role: m!.role, parts: m!.parts }));
                            const config: any = { systemInstruction: systemPrompt };
                            config.tools = [{ googleSearch: {} }];
                            
                            if (thinkingBudget > 0) {
                                config.thinkingConfig = { thinkingBudget: thinkingBudget };
                                config.maxOutputTokens = 65536; 
                            }

                            const generator = await generateContentStreamWithRetry(ai, {
                                model,
                                contents,
                                config
                            }, 0, (msg) => onStreamChunk?.(msg));

                            for await (const chunk of generator) {
                                if (signal?.aborted) break;
                                if (chunk.text) {
                                    // Remove artificial delay here to prevent race conditions
                                    // The UI layer (useChat) handles buffering and throttling
                                    generatedThisLoop += chunk.text;
                                    finalResponseText += chunk.text;
                                    onStreamChunk?.(chunk.text);
                                    
                                    const candidate = (chunk as any).candidates?.[0];
                                    if (candidate?.groundingMetadata?.groundingChunks) {
                                        if (!metadataPayload.groundingMetadata) metadataPayload.groundingMetadata = [];
                                        const chunks = candidate.groundingMetadata.groundingChunks;
                                        if (metadataPayload.groundingMetadata && Array.isArray(metadataPayload.groundingMetadata) && Array.isArray(chunks)) {
                                            metadataPayload.groundingMetadata.push(...chunks);
                                        }
                                    }

                                    // Break on closing tag to allow loop to handle action
                                    if (
                                        generatedThisLoop.includes('</CANVAS_TRIGGER>') ||
                                        generatedThisLoop.includes('</CANVAS>') ||
                                        generatedThisLoop.includes('</BLOCK_SIMPLE>')
                                    ) {
                                        break; 
                                    }
                                }
                            }

                        } else {
                            if (!openRouterKey) throw new Error("OpenRouter API Key not found.");

                            // OPENROUTER GENERATION
                            const openAiMessages: any[] = [
                                { role: 'system', content: systemPrompt },
                                ...historyWithoutLast.map(m => ({
                                    role: m.sender === 'user' ? 'user' : 'assistant',
                                    content: m.text
                                }))
                            ];

                            const userContent: any[] = [{ type: 'text', text: currentPrompt }];
                            let hasImage = false;

                            if (files && files.length > 0) {
                                for (const file of files) {
                                    if (file.type.startsWith('image/')) {
                                        hasImage = true;
                                        try {
                                            const base64Data = await fileToBase64(file);
                                            userContent.push({ 
                                                type: 'image_url', 
                                                image_url: { url: `data:${file.type};base64,${base64Data}` } 
                                            });
                                        } catch (e) {
                                            console.error("Failed to process image attachment for OpenRouter:", e);
                                            userContent.push({ type: 'text', text: `[Error attaching image: ${file.name}]` });
                                        }
                                    } else if (file.type.startsWith('text/') || file.name.match(/\.(js|ts|jsx|tsx|html|css|json|md|py|lua)$/)) {
                                        try {
                                            const content = await readTextFile(file);
                                            userContent.push({ type: 'text', text: `\n\n--- FILE: ${file.name} ---\n${content}\n--- END FILE ---\n` });
                                        } catch (e) {
                                            userContent.push({ type: 'text', text: `[Error reading text file: ${file.name}]` });
                                        }
                                    }
                                }
                            }

                            if (hasImage && !model.toLowerCase().includes('vision') && !model.toLowerCase().includes('gemini') && !model.toLowerCase().includes('claude') && !model.toLowerCase().includes('gpt-4')) {
                                throw new Error("The selected model does not support image inputs. Please switch to a vision-capable model like Gemini Pro or Claude Sonnet.");
                            }

                            openAiMessages.push({ role: 'user', content: userContent });

                            await generateOpenRouterStream(openRouterKey, model, openAiMessages, async (chunk) => {
                                if (signal?.aborted) return;
                                // Removed artificial splitting and delay
                                generatedThisLoop += chunk;
                                finalResponseText += chunk;
                                onStreamChunk?.(chunk);
                            }, signal);
                        }
                    } catch (primaryError: any) {
                        console.warn(`Primary generation failed (${isNative ? 'Google' : 'OpenRouter'}).`, primaryError);
                        
                        // FALLBACK LOGIC
                        if (!isNative) {
                            // If OpenRouter failed, switch to Gemini automatically
                            const errMsg = primaryError.message || JSON.stringify(primaryError);
                            const fallbackMsg = `\n*(Primary model failed: ${errMsg}. Falling back to Gemini...)*\n\n`;
                            onStreamChunk?.(fallbackMsg);
                            finalResponseText += fallbackMsg;
                            
                            isNative = true;
                            model = 'gemini-flash-lite-latest'; // Force switch to Lite
                            primaryGenerationFailed = true; 
                            // Force loop to retry with new model settings
                            currentAction = 'SIMPLE';
                            loopCount--; // Don't count this failed attempt against loop limit
                            continue; 
                        } else {
                            // If native failed, we have no fallback
                            throw primaryError; 
                        }
                    }

                    if (primaryGenerationFailed) {
                        // Logic handled in catch block above via 'continue'
                    }

                    // CHECK FOR BLOCKING TAGS
                    if (generatedThisLoop.includes('<BLOCK_SIMPLE>')) {
                        const blockMatch = generatedThisLoop.match(/<BLOCK_SIMPLE>([\s\S]*?)<\/BLOCK_SIMPLE>/);
                        if (blockMatch) {
                            // Strip tag from visible text (it's internal signal)
                            finalResponseText = finalResponseText.replace(/<BLOCK_SIMPLE>[\s\S]*?<\/BLOCK_SIMPLE>/, '').trim();
                            // Trigger Block
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            
                            // We need to use updateProfile. Since this function is async and separate, 
                            // we rely on supabase client passed in input.
                            // NOTE: This runs in background, user sees the text explanation AI provided.
                            if (user && user.id !== 'guest') {
                                updateProfile(supabase, user.id, { 
                                    simple_tasks_blocked_until: tomorrow.toISOString() 
                                }).catch(err => console.error("Failed to set block status:", err));
                            }
                        }
                    }
                    
                    const canvasMatch = generatedThisLoop.match(/<CANVAS_TRIGGER>([\s\S]*?)<\/CANVAS_TRIGGER>/) || 
                                        generatedThisLoop.match(/<CANVAS>([\s\S]*?)<\/CANVAS>/);
                    
                    if (canvasMatch && canvasMatch[1]) { 
                        finalResponseText = ""; 
                        currentAction = 'CANVAS'; 
                        currentPrompt = canvasMatch[1].trim(); 
                        
                        const canvasResult = await runCanvasAgent({ ...input, prompt: currentPrompt });
                        return canvasResult;
                    }
                    
                    const projectMatch = generatedThisLoop.match(/<PROJECT>([\s\S]*?)<\/PROJECT>/);
                    if (projectMatch && projectMatch[1]) { 
                        currentAction = 'PROJECT'; 
                        currentPrompt = projectMatch[1]; 
                        continue; 
                    }

                    return { messages: [{ project_id: project.id, chat_id: chat.id, sender: 'ai', text: finalResponseText, ...metadataPayload }] };
                }
            }
        }
        
        return { messages: [{ project_id: project.id, chat_id: chat.id, sender: 'ai', text: finalResponseText, ...metadataPayload }] };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            return { messages: [{ project_id: project.id, chat_id: chat.id, sender: 'ai', text: finalResponseText || "(Generation stopped by user)" }] };
        }
        console.error("Error in runAutonomousAgent:", error);
        
        const errorMessage = getUserFriendlyError(error);
        return { messages: [{ project_id: project.id, chat_id: chat.id, sender: 'ai', text: `⚠️ ${errorMessage}` }] };
    }
};
