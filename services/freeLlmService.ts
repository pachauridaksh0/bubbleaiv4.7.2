
// This service is DEPRECATED.
// The application now uses a credit-based system with the Admin's API key.
// Free fallback providers (LMArena, Lumio, etc.) have been removed.

export const generateFreeCompletion = async (
    messages: { role: string; content: string }[], 
    onStream?: (chunk: string) => void,
    signal?: AbortSignal,
    memoryContext?: string
): Promise<{ text: string, modelUsed: string }> => {
    
    const errorMsg = "Free API providers are disabled. Please add your own API key in settings or use your daily credits.";
    
    if (onStream) {
        onStream(errorMsg);
    }
    
    return { 
        text: errorMsg, 
        modelUsed: 'System' 
    };
};

export const generateFreeTitle = async (userMessage: string, aiResponse: string): Promise<string> => {
    const words = userMessage.split(' ').slice(0, 5).join(' ');
    const title = words.charAt(0).toUpperCase() + words.slice(1);
    return title.length > 0 ? title : "New Chat";
};
