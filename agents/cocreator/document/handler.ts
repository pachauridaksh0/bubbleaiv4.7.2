
import { GoogleGenAI } from "@google/genai";
import { AgentInput, AgentOutput, AgentExecutionResult } from '../../types';
import { documentAgentInstruction } from './instructions';
import { getUserFriendlyError } from '../../errorUtils';

// Helper for retrying Gemini calls
const generateContentStreamWithRetry = async (
    ai: GoogleGenAI, 
    params: any, 
    retries = 3,
    onRetry?: (msg: string) => void
) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await ai.models.generateContentStream(params);
        } catch (error: any) {
            // Handle 404 (Model Not Found) - Fallback logic
            if (error.status === 404 || error.status === 400 || (error.message && (error.message.includes('404') || error.message.includes('not found') || error.message.includes('Requested entity was not found')))) {
                console.warn(`Model ${params.model} not found. Falling back to gemini-flash-lite-latest.`);
                if (onRetry) onRetry(`(Model ${params.model} unavailable. Falling back to Gemini Flash Lite...)`);
                
                if (params.model === 'gemini-flash-lite-latest') {
                     throw error;
                }

                params.model = 'gemini-flash-lite-latest';
                continue; 
            }

            const isQuotaError = error.status === 429 || 
                                 (error.message && error.message.includes('429')) ||
                                 (error.message && error.message.includes('quota'));
            
            if (isQuotaError && attempt < retries) {
                const delay = Math.pow(2, attempt) * 2000 + 1000;
                if (onRetry) onRetry(`(Rate limit hit. Retrying in ${Math.round(delay/1000)}s...)`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries exceeded");
};

// Helper to apply a search/replace patch
const applyPatch = (originalContent: string, searchBlock: string, replaceBlock: string): string | null => {
    if (!originalContent.includes(searchBlock)) {
        // Try relaxed matching (ignoring leading/trailing whitespace on lines)
        const normalize = (str: string) => str.split('\n').map(l => l.trim()).filter(l => l).join('\n');
        if (normalize(originalContent).includes(normalize(searchBlock))) {
             console.warn("Patch match failed (strict). Normalized match found but not implemented safely.");
             return null;
        }
        return null;
    }
    return originalContent.replace(searchBlock, replaceBlock);
};

class DocStreamingResponseParser {
    private buffer: string = "";
    private mode: 'TEXT' | 'FILE' | 'PATCH' = 'TEXT';
    private currentFilePath: string | null = null;
    private currentContent: string = "";
    
    // Regex matches [FILE: ...] or [PATCH: ...]
    private startTagRegex = /\[\s*(FILE|PATCH)\s*:\s*(.*?)\s*\]/i;
    
    constructor(
        private onTextChunk: (text: string) => void,
        private onFileUpdate: (path: string, content: string, isComplete: boolean) => void,
        private projectFiles: Record<string, { content: string }>
    ) {}

    processChunk(chunk: string) {
        this.buffer += chunk;
        let processed = true;
        while (processed) {
            processed = false;
            if (this.mode === 'TEXT') {
                const match = this.buffer.match(this.startTagRegex);
                if (match && match.index !== undefined) {
                    const textBefore = this.buffer.substring(0, match.index);
                    if (textBefore) this.onTextChunk(textBefore);
                    
                    this.mode = match[1].toUpperCase() as 'FILE' | 'PATCH';
                    this.currentFilePath = match[2].trim();
                    this.currentContent = "";
                    this.buffer = this.buffer.substring(match.index + match[0].length);
                    processed = true;
                } else {
                    const lastOpenBracket = this.buffer.lastIndexOf('[');
                    if (lastOpenBracket !== -1) {
                        const safeText = this.buffer.substring(0, lastOpenBracket);
                        if (safeText) this.onTextChunk(safeText);
                        this.buffer = this.buffer.substring(lastOpenBracket);
                    } else {
                        if (this.buffer) {
                            this.onTextChunk(this.buffer);
                            this.buffer = "";
                        }
                    }
                }
            } else {
                const endTag = this.mode === 'FILE' ? '[/FILE]' : '[/PATCH]';
                const endTagIndex = this.buffer.indexOf(endTag);
                if (endTagIndex !== -1) {
                    const contentChunk = this.buffer.substring(0, endTagIndex);
                    this.currentContent += contentChunk;
                    
                    if (this.mode === 'FILE' && this.currentFilePath) {
                        this.onFileUpdate(this.currentFilePath, this.currentContent, true);
                    } else if (this.mode === 'PATCH' && this.currentFilePath) {
                        this.processPatch(this.currentContent);
                    }
                    
                    let remaining = this.buffer.substring(endTagIndex + endTag.length);
                    const trimMatch = remaining.match(/^\s*[\r\n]+/);
                    if (trimMatch) remaining = remaining.substring(trimMatch[0].length);
                    
                    this.buffer = remaining;
                    this.mode = 'TEXT';
                    this.currentFilePath = null;
                    processed = true;
                } else {
                    const safetyThreshold = 10; 
                    if (this.buffer.length > safetyThreshold) {
                        const safeLength = this.buffer.length - safetyThreshold;
                        const contentChunk = this.buffer.substring(0, safeLength);
                        this.currentContent += contentChunk;
                        this.buffer = this.buffer.substring(safeLength);
                        
                        if (this.mode === 'FILE' && this.currentFilePath) {
                            this.onFileUpdate(this.currentFilePath, this.currentContent, false);
                        }
                    }
                }
            }
        }
    }

    private processPatch(patchBlock: string) {
        // Format: <<<< search ==== replace >>>>
        const searchStart = patchBlock.indexOf('<<<<');
        const separator = patchBlock.indexOf('====');
        const replaceEnd = patchBlock.lastIndexOf('>>>>');

        if (searchStart !== -1 && separator !== -1 && replaceEnd !== -1 && this.currentFilePath) {
            const searchBlock = patchBlock.substring(searchStart + 4, separator).trim();
            const replaceBlock = patchBlock.substring(separator + 4, replaceEnd);
            
            const currentFile = this.projectFiles[this.currentFilePath];
            if (currentFile) {
                const patchedContent = applyPatch(currentFile.content, searchBlock, replaceBlock);
                if (patchedContent) {
                    this.onFileUpdate(this.currentFilePath, patchedContent, true);
                } else {
                    this.onTextChunk(`\n\n[SYSTEM ERROR]: Failed to apply patch to ${this.currentFilePath}. Search block not found or context mismatch.`);
                }
            } else {
                this.onTextChunk(`\n\n[SYSTEM ERROR]: File ${this.currentFilePath} not found for patching.`);
            }
        }
    }
    
    finish() {
        if (this.mode === 'TEXT' && this.buffer.length > 0) {
            this.onTextChunk(this.buffer);
        }
    }
}

export const runDocumentAgent = async (input: AgentInput): Promise<AgentExecutionResult> => {
    const { project, chat, prompt, apiKey, history, memoryContext, onStreamChunk, onFileUpdate, profile } = input;
    const ai = new GoogleGenAI({ apiKey });
    
    // Determine target file - default to document.md if not found
    const files = project.files || {};
    const docFile = Object.keys(files).find(f => f.endsWith('.md') || f.endsWith('.txt')) || 'document.md';
    const currentContent = files[docFile]?.content || '';

    // Construct Context
    const fileContext = `
=== CURRENT DOCUMENT (${docFile}) ===
${currentContent}
=== END DOCUMENT ===
`;

    const geminiHistory = history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model' as 'user' | 'model',
        parts: [{ text: msg.text }],
    })).filter(msg => msg.parts[0].text.trim() !== '');

    let cleanResponseText = "";
    const newFilesState = { ...files };

    try {
        const modelToUse = input.model || 'gemini-flash-lite-latest';

        const parser = new DocStreamingResponseParser(
            (text) => {
                cleanResponseText += text;
                onStreamChunk?.(text);
            },
            (path, content, isComplete) => {
                newFilesState[path] = { content };
                if (onFileUpdate) onFileUpdate(path, content, isComplete);
            },
            newFilesState
        );

        const stream = await generateContentStreamWithRetry(ai, {
            model: modelToUse,
            contents: [...geminiHistory, { role: 'user', parts: [{ text: `User request: "${prompt}"\n\n${fileContext}` }] }],
            config: {
                systemInstruction: `${documentAgentInstruction}\n\nMEMORY:\n${memoryContext || 'None'}`,
                temperature: 0.7,
            }
        }, 2, (msg) => onStreamChunk?.(msg));

        for await (const chunk of stream) {
            if (chunk.text) {
                parser.processChunk(chunk.text);
            }
        }
        parser.finish();

        const message: AgentOutput[0] = {
            project_id: project.id,
            chat_id: chat.id,
            sender: 'ai',
            text: cleanResponseText,
        };

        return { messages: [message], projectUpdate: { files: newFilesState } };

    } catch (error) {
        console.error("Error in runDocumentAgent:", error);
        const errorMessage = getUserFriendlyError(error);
        const fallbackMessage: AgentOutput[0] = {
            project_id: project.id,
            chat_id: chat.id,
            sender: 'ai',
            text: `I couldn't edit the document: ${errorMessage}`
        };
        return { messages: [fallbackMessage] };
    }
};
