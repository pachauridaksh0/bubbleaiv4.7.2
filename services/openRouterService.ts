
export const validateOpenRouterKey = async (apiKey: string): Promise<{ success: boolean, message?: string }> => {
    if (!apiKey) {
        return { success: false, message: "API key cannot be empty." };
    }

    try {
        // We verify the key by attempting to list models. This is a lightweight read operation.
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        });

        if (response.ok) {
            return { success: true };
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || `API returned status ${response.status}`;
            
            if (response.status === 401) {
                return { success: false, message: "Invalid OpenRouter API key." };
            }
            
            return { success: false, message: `Validation failed: ${errorMessage}` };
        }
    } catch (error: any) {
        console.error("OpenRouter Key validation failed:", error);
        return { success: false, message: "Could not connect to OpenRouter. Please check your connection." };
    }
};

export const testOpenRouterModel = async (apiKey: string, modelId: string): Promise<{ success: boolean; latency?: number; message?: string }> => {
    const start = Date.now();
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin,
                "X-Title": "Bubble AI"
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: "user", content: "Ping" }],
                max_tokens: 1
            })
        });

        const end = Date.now();
        const latency = end - start;

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            let msg = errData.error?.message || `HTTP ${response.status}`;

            // Parse detailed provider errors (e.g. Venice 400)
            if (errData.error?.metadata) {
                const meta = errData.error.metadata;
                if (meta.provider_name) {
                    msg = `${meta.provider_name}: ${msg}`;
                }
                if (meta.raw) {
                    try {
                        // Sometimes raw is a JSON string inside the string
                        const rawObj = typeof meta.raw === 'string' ? JSON.parse(meta.raw) : meta.raw;
                        if (rawObj.error) msg += ` (${rawObj.error})`;
                    } catch (e) {
                        // If raw isn't JSON, append if short
                        if (typeof meta.raw === 'string' && meta.raw.length < 50) msg += ` (${meta.raw})`;
                    }
                }
            }

            // 404 usually means model is offline or deprecated
            if (response.status === 404) {
                return { success: false, message: "Model Not Found (Offline)" };
            }
            // 429 Rate Limit
            if (response.status === 429) {
                return { success: false, message: "Rate Limited" };
            }
            
            return { success: false, message: msg };
        }
        
        return { success: true, latency };
    } catch (error: any) {
        return { success: false, message: error.message || "Network Error" };
    }
};

export async function* generateOpenRouterChatCompletionStream(
    apiKey: string,
    modelId: string,
    messages: { role: string; content: string }[],
    systemInstruction?: string
): AsyncGenerator<string, void, unknown> {
    const finalMessages = [];
    if (systemInstruction) {
        finalMessages.push({ role: 'system', content: systemInstruction });
    }
    // Map Gemini roles to OpenAI roles
    messages.forEach(m => {
        finalMessages.push({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
        });
    });

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin,
                "X-Title": "Bubble AI",
            },
            body: JSON.stringify({
                model: modelId,
                messages: finalMessages,
                stream: true
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `OpenRouter Error ${response.status}`);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === "data: [DONE]") continue;
                if (trimmed.startsWith("data: ")) {
                    try {
                        const json = JSON.parse(trimmed.substring(6));
                        const content = json.choices[0]?.delta?.content || "";
                        if (content) yield content;
                    } catch (e) {
                        console.warn("Failed to parse OpenRouter chunk:", trimmed);
                    }
                }
            }
        }
    } catch (error) {
        console.error("OpenRouter Streaming Error:", error);
        throw error;
    }
}
