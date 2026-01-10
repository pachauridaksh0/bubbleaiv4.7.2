
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusIcon, UserGroupIcon, MagnifyingGlassIcon, SparklesIcon, Cog6ToothIcon, TrashIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { CustomAgent } from '../../types';
import { customAgentService } from '../../services/customAgentService';
import { AgentBuilder } from './AgentBuilder';
import { useAuth } from '../../contexts/AuthContext';
import { createChat as createDbChat } from '../../services/databaseService';
import { localChatService } from '../../services/localChatService';
import { useToast } from '../../hooks/useToast';

interface AgentsPageProps {
    onNavigate: (path: string) => void;
}

export const AgentsPage: React.FC<AgentsPageProps> = ({ onNavigate }) => {
    const { user, supabase, isGuest, profile } = useAuth();
    const { addToast } = useToast();
    
    // View State
    const [view, setView] = useState<'list' | 'builder'>('list');
    
    // Data State
    const [agents, setAgents] = useState<CustomAgent[]>([]);
    const [editingAgent, setEditingAgent] = useState<CustomAgent | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (view === 'list') {
            loadAgents();
        }
    }, [user, isGuest, view]);

    const loadAgents = async () => {
        setLoading(true);
        try {
            const userId = user?.id || (isGuest ? 'guest' : undefined);
            const data = await customAgentService.getAllAgents(userId);
            setAgents(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Failed to load agents", e);
            setAgents([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAgent = async (agentData: Omit<CustomAgent, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const userId = user?.id || (isGuest ? 'guest' : undefined);
            
            // Logic for author_name
            const finalAgentData = { ...agentData };
            if (profile?.role === 'admin' || profile?.membership === 'admin') {
                finalAgentData.author_name = 'Bubble AI Labs';
            } else {
                finalAgentData.author_name = profile?.roblox_username || 'User';
            }

            if (editingAgent) {
                await customAgentService.updateAgent(editingAgent.id, finalAgentData, userId);
                addToast("Agent updated successfully", "success");
            } else {
                await customAgentService.createAgent(finalAgentData, userId);
                addToast("New agent created!", "success");
            }
            setView('list');
            setEditingAgent(null);
        } catch (e: any) {
            console.error(e);
            addToast("Failed to save agent.", "error");
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this agent?")) {
            try {
                const userId = user?.id || (isGuest ? 'guest' : undefined);
                await customAgentService.deleteAgent(id, userId);
                loadAgents();
                addToast("Agent deleted.", "info");
            } catch (e) {
                addToast("Failed to delete agent.", "error");
            }
        }
    };

    const handleEdit = (e: React.MouseEvent, agent: CustomAgent) => {
        e.stopPropagation();
        setEditingAgent(agent);
        setView('builder');
    };

    const handleStartChat = async (agent: CustomAgent) => {
        try {
            let newChat;
            if (isGuest) {
                newChat = await localChatService.createChat(agent.name, 'custom');
            } else if (supabase && user) {
                newChat = await createDbChat(supabase, user.id, agent.name, 'custom', null);
                await supabase.from('chats').update({ agent_id: agent.id }).eq('id', newChat.id);
            }
            
            if (newChat) {
                onNavigate(`/c/${newChat.id}`);
            }
        } catch (error) {
            console.error("Failed to start chat with agent", error);
            addToast("Could not start chat.", "error");
        }
    };
    
    const filteredAgents = agents.filter(a => 
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        a.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (view === 'builder') {
        return (
            <AgentBuilder 
                initialData={editingAgent} 
                onSave={handleSaveAgent} 
                onBack={() => { setView('list'); setEditingAgent(null); }} 
            />
        );
    }

    return (
        <div className="h-full overflow-y-auto bg-bg-primary">
            {/* Hero Header */}
            <div className="relative pt-12 pb-8 px-8 border-b border-white/5 bg-gradient-to-b from-bg-secondary to-bg-primary">
                 <div className="max-w-6xl mx-auto">
                    <h1 className="text-4xl font-bold text-white mb-2">Explore Agents</h1>
                    <p className="text-text-secondary text-lg">Discover and create custom versions of Bubble AI that combine instructions, extra knowledge, and any combination of skills.</p>
                    
                    <div className="mt-8 flex gap-4">
                        <div className="relative flex-1 max-w-lg">
                            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Search public agents..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-full pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                            />
                        </div>
                        <button 
                            onClick={() => { setEditingAgent(null); setView('builder'); }}
                            className="bg-white text-black px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-gray-200 transition-colors shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        >
                            <PlusIcon className="w-5 h-5" />
                            Create
                        </button>
                    </div>
                 </div>
            </div>

            <div className="max-w-6xl mx-auto px-8 py-12">
                {/* My Agents Section */}
                <div className="mb-12">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <UserGroupIcon className="w-5 h-5 text-primary-start" /> My Agents
                    </h2>
                    
                    {loading ? (
                         <div className="flex gap-4 overflow-x-auto pb-4">
                            {[1,2,3].map(i => <div key={i} className="w-64 h-32 bg-white/5 rounded-xl animate-pulse flex-shrink-0" />)}
                         </div>
                    ) : filteredAgents.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredAgents.map(agent => (
                                <motion.div
                                    key={agent.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => handleStartChat(agent)}
                                    className="group relative bg-[#202123] hover:bg-[#2A2B32] border border-white/5 rounded-xl p-4 cursor-pointer transition-all flex flex-col h-40"
                                >
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button onClick={(e) => handleEdit(e, agent)} className="p-1.5 text-gray-400 hover:text-white bg-black/50 rounded-md hover:bg-black/70">
                                            <Cog6ToothIcon className="w-4 h-4" />
                                        </button>
                                        <button onClick={(e) => handleDelete(e, agent.id)} className="p-1.5 text-gray-400 hover:text-red-400 bg-black/50 rounded-md hover:bg-black/70">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="flex gap-4">
                                        {agent.icon.startsWith('http') ? (
                                             <img src={agent.icon} alt="" className="w-12 h-12 rounded-full object-cover bg-white/5" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl border border-white/5">
                                                {agent.icon}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-white truncate">{agent.name}</h3>
                                            <p className="text-xs text-gray-400 mt-1">By {agent.author_name || 'You'}</p>
                                        </div>
                                    </div>
                                    
                                    <p className="text-sm text-gray-400 mt-3 line-clamp-2 leading-relaxed flex-1">
                                        {agent.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-white/10 rounded-2xl bg-white/5 text-center">
                             <SparklesIcon className="w-12 h-12 text-gray-600 mb-4" />
                             <h3 className="text-lg font-medium text-white">No agents created yet</h3>
                             <p className="text-gray-400 text-sm mt-1 mb-6">Create custom versions of Bubble AI for specific tasks.</p>
                             <button onClick={() => { setEditingAgent(null); setView('builder'); }} className="text-primary-start hover:text-white font-medium text-sm">Create a new agent</button>
                        </div>
                    )}
                </div>

                {/* Featured (Placeholder for future Public Marketplace) */}
                <div className="opacity-50 pointer-events-none grayscale">
                    <h2 className="text-xl font-bold text-white mb-6">Featured (Coming Soon)</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="bg-[#202123] border border-white/5 rounded-xl p-4 flex gap-4">
                                <div className="w-12 h-12 rounded-full bg-white/10" />
                                <div>
                                    <div className="h-4 w-24 bg-white/10 rounded mb-2" />
                                    <div className="h-3 w-32 bg-white/5 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
