
import { CustomAgent } from '../types';
import { supabase } from '../supabaseClient';

const STORAGE_KEY = 'bubble_custom_agents';

export const customAgentService = {
    // === READ ===
    getAllAgents: async (userId?: string): Promise<CustomAgent[]> => {
        try {
            // 1. Try Supabase if user is logged in
            if (userId && userId !== 'guest') {
                const { data, error } = await supabase
                    .from('agents')
                    .select('*')
                    .eq('user_id', userId)
                    .order('updated_at', { ascending: false });
                
                if (error) {
                    console.warn("Supabase error fetching agents (likely missing table):", error);
                    // Fallback to empty array if table doesn't exist yet to prevent app crash
                    return [];
                }
                return data || [];
            }

            // 2. Fallback to LocalStorage (Guest Mode)
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Error in getAllAgents:", e);
            return []; // Always return array to prevent UI crashes
        }
    },

    getAgent: async (id: string): Promise<CustomAgent | undefined> => {
        try {
            if (id.length > 20 && !id.startsWith('agent-')) {
                 const { data } = await supabase.from('agents').select('*').eq('id', id).single();
                 if (data) return data;
            }

            const agents = await customAgentService.getAllAgents('guest');
            return agents.find(a => a.id === id);
        } catch (e) {
            console.error("Error getting agent:", e);
            return undefined;
        }
    },

    // === CREATE ===
    createAgent: async (agent: Omit<CustomAgent, 'id' | 'created_at' | 'updated_at'>, userId?: string): Promise<CustomAgent> => {
        if (userId && userId !== 'guest') {
            const { data, error } = await supabase
                .from('agents')
                .insert({ ...agent, user_id: userId })
                .select()
                .single();
            
            if (error) throw new Error(error.message || "Failed to create agent");
            return data;
        }

        // Guest Mode
        const agents = await customAgentService.getAllAgents('guest');
        const newAgent: CustomAgent = {
            ...agent,
            id: `agent-${Date.now()}`,
            user_id: 'guest',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        agents.unshift(newAgent);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
        return newAgent;
    },

    // === UPDATE ===
    updateAgent: async (id: string, updates: Partial<Omit<CustomAgent, 'id' | 'created_at'>>, userId?: string): Promise<CustomAgent | null> => {
        if (userId && userId !== 'guest') {
            const { data, error } = await supabase
                .from('agents')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw new Error(error.message);
            return data;
        }

        // Guest Mode
        const agents = await customAgentService.getAllAgents('guest');
        const index = agents.findIndex(a => a.id === id);
        if (index === -1) return null;

        const updatedAgent = { ...agents[index], ...updates, updated_at: new Date().toISOString() };
        agents[index] = updatedAgent;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
        return updatedAgent;
    },

    // === DELETE ===
    deleteAgent: async (id: string, userId?: string): Promise<void> => {
        if (userId && userId !== 'guest') {
            await supabase.from('agents').delete().eq('id', id);
            return;
        }

        let agents = await customAgentService.getAllAgents('guest');
        agents = agents.filter(a => a.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    }
};
