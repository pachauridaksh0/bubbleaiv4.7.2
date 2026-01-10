const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require("@google/genai");

const supabaseUrl = process.env.SUPABASE_URL;
// Use Service Key for backend operations to bypass RLS if necessary, or Anon Key if forwarding user token
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class MemoryService {
    async extractAndSave(userId, userText, aiText, projectId, apiKey) {
        if (!apiKey) return;

        const ai = new GoogleGenAI({ apiKey });
        const instruction = `You are an AI assistant that extracts important facts from a conversation to be saved to a long-term memory system.
Analyze the user's message and the AI's response. Identify any new, significant information that should be remembered.
The memory system has 4 layers: 'personal', 'project', 'codebase', 'aesthetic'.
Respond with a JSON object containing "memoriesToCreate" array.`;

        const schema = {
            type: 'OBJECT',
            properties: {
                memoriesToCreate: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            layer: { type: 'STRING', enum: ['personal', 'project', 'codebase', 'aesthetic'] },
                            key: { type: 'STRING' },
                            value: { type: 'STRING' }
                        },
                        required: ["layer", "key", "value"]
                    }
                }
            },
            required: ["memoriesToCreate"]
        };

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `PROJECT_ID: ${projectId || 'N/A'}\nCONVERSATION TURN:\nUser: "${userText}"\nAI: "${aiText}"`,
                config: {
                    systemInstruction: instruction,
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });

            const result = JSON.parse(response.text);
            if (result.memoriesToCreate && result.memoriesToCreate.length > 0) {
                for (const mem of result.memoriesToCreate) {
                    await this._saveMemory(userId, mem.layer, mem.key, mem.value, projectId);
                }
            }
        } catch (e) {
            console.error("Memory extraction failed:", e);
        }
    }

    async _saveMemory(userId, layer, key, value, projectId) {
        const metadata = { memory_key: key };
        if (projectId) metadata.project_id = projectId;

        // Manual Upsert Logic
        const { data: existing } = await supabase
            .from('memories')
            .select('id')
            .eq('user_id', userId)
            .eq('layer', layer)
            .eq('metadata->>memory_key', key)
            .limit(1);

        const payload = {
            user_id: userId,
            layer,
            content: value,
            metadata,
            updated_at: new Date().toISOString()
        };

        if (existing && existing.length > 0) {
            await supabase.from('memories').update(payload).eq('id', existing[0].id);
        } else {
            await supabase.from('memories').insert(payload);
        }
    }
}

module.exports = new MemoryService();