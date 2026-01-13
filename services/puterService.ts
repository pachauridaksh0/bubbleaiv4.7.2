
// Service to interact with Puter.js AI capabilities
// This is the "Zero Cost" tier for users without API keys.

export const generatePuterResponse = async (
    prompt: string, 
    history: any[] = [],
    onStream?: (chunk: string) => void,
    systemContext?: string // NEW: Accept system instructions/file context
): Promise<string> => {
    // @ts-ignore - Puter is loaded globally via index.html script
    if (typeof puter === 'undefined') {
        throw new Error("Puter.js not loaded");
    }

    const messages = history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
    }));

    // Inject System Context
    if (systemContext) {
        // We prepend it as a 'system' message if supported, or prepended to the first user message
        // Puter's abstraction is often cleaner if we just make it the very first message
        messages.unshift({
            role: 'system',
            content: systemContext
        });
    }

    messages.push({ role: 'user', content: prompt });

    // The specific model requested by the user that supports streaming
    // UPDATED: Using the specific version ID required by Puter API
    const MODEL_ID = 'claude-3-5-sonnet-20241022'; 

    try {
        // @ts-ignore
        const response = await puter.ai.chat(messages, {
            model: MODEL_ID, 
            stream: true 
        });

        let fullText = '';

        // Handle Streaming Response
        for await (const part of response) {
            const text = part?.text;
            if (text) {
                fullText += text;
                if (onStream) onStream(text);
            }
        }
        
        return fullText;

    } catch (error: any) {
        console.warn(`Puter model ${MODEL_ID} failed:`, error);
        
        // Fallback to non-streaming if streaming fails
        try {
            // @ts-ignore
            const fallback = await puter.ai.chat(messages, { model: MODEL_ID, stream: false });
            return typeof fallback === 'string' ? fallback : fallback?.message?.content || "";
        } catch (e) {
            throw new Error("Puter AI unavailable. Please add an API Key.");
        }
    }
};
