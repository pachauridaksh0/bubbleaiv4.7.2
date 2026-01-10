
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, SparklesIcon, ChatBubbleLeftRightIcon, WrenchScrewdriverIcon, ArrowPathIcon, CheckCircleIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/solid';
import { CustomAgent, Message } from '../../types';
import { AgentTestChat } from './AgentTestChat';
import { GoogleGenAI } from '@google/genai';
import { builderAgentInstruction } from '../../agents/builder/instructions';
import { useAuth } from '../../contexts/AuthContext';
import { MessageContent } from '../chat/MessageContent';

interface AgentEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (agent: Omit<CustomAgent, 'id' | 'created_at' | 'updated_at'>) => void;
    initialData?: CustomAgent | null;
}

// Internal component for the Builder Chat (Left Panel - Create Tab)
const BuilderChat: React.FC<{ 
    onConfigUpdate: (config: Partial<CustomAgent>) => void;
    apiKey: string;
}> = ({ onConfigUpdate, apiKey }) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { id: 'intro', chat_id: 'builder', sender: 'ai', text: "Hi! I'll help you build a new agent. What would you like it to do?", created_at: new Date().toISOString() }
    ]);
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isThinking) return;

        const userMsg: Message = { id: Date.now().toString(), chat_id: 'builder', sender: 'user', text: input, created_at: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsThinking(true);

        try {
            const ai = new GoogleGenAI({ apiKey });
            const conversationHistory = messages.map(m => `${m.sender === 'user' ? 'User' : 'Builder'}: ${m.text}`).join('\n');
            const fullPrompt = `${conversationHistory}\nUser: ${userMsg.text}\nBuilder:`;

            const response = await ai.models.generateContent({
                model: 'gemini-flash-lite-latest',
                contents: fullPrompt,
                config: {
                    systemInstruction: builderAgentInstruction,
                    temperature: 0.7,
                }
            });

            const text = response.text || "I'm having trouble connecting. Try again?";
            
            const configMatch = text.match(/<CONFIG>([\s\S]*?)<\/CONFIG>/);
            let displayText = text;

            if (configMatch) {
                try {
                    const configJson = JSON.parse(configMatch[1]);
                    onConfigUpdate(configJson);
                    displayText = text.replace(configMatch[0], '').trim();
                } catch (e) {
                    console.error("Failed to parse builder config", e);
                }
            }

            setMessages(prev => [...prev, { id: Date.now().toString(), chat_id: 'builder', sender: 'ai', text: displayText, created_at: new Date().toISOString() }]);

        } catch (error) {
            setMessages(prev => [...prev, { id: Date.now().toString(), chat_id: 'builder', sender: 'ai', text: "Sorry, I encountered an error. Please try again.", created_at: new Date().toISOString() }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                                msg.sender === 'user' 
                                ? 'bg-bg-tertiary text-white' 
                                : 'bg-transparent text-gray-200 pl-0' // Builder looks more native
                            }`}>
                                {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-primary-start flex items-center justify-center mb-2"><SparklesIcon className="w-5 h-5 text-white"/></div>}
                                <MessageContent content={msg.text} searchQuery="" sender={msg.sender} />
                            </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex justify-start pl-0 p-4">
                        <div className="w-8 h-8 rounded-full bg-primary-start flex items-center justify-center animate-pulse">
                            <SparklesIcon className="w-5 h-5 text-white"/>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSend} className="p-4 border-t border-white/10 bg-bg-secondary">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Message the Builder..."
                        className="w-full bg-bg-tertiary border border-white/10 rounded-full pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-start transition-all placeholder-gray-500"
                    />
                    <button 
                        type="submit" 
                        disabled={!input.trim() || isThinking}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-primary-start text-white rounded-full hover:bg-primary-start/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${isThinking ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </form>
        </div>
    );
};

export const AgentEditorModal: React.FC<AgentEditorModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const { geminiApiKey } = useAuth();
    const [activeTab, setActiveTab] = useState<'create' | 'configure'>('create');
    
    // Agent State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [instructions, setInstructions] = useState('');
    const [icon, setIcon] = useState('🤖');
    const [starters, setStarters] = useState<string[]>(['']);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description);
                setInstructions(initialData.system_prompt);
                setIcon(initialData.icon);
                setStarters(initialData.starters && initialData.starters.length > 0 ? initialData.starters : ['']);
                setActiveTab('configure');
            } else {
                setName('');
                setDescription('');
                setInstructions('');
                setIcon('🤖');
                setStarters(['']);
                setActiveTab('create');
            }
        }
    }, [isOpen, initialData]);

    const handleBuilderUpdate = (config: Partial<CustomAgent>) => {
        if (config.name) setName(config.name);
        if (config.description) setDescription(config.description);
        if (config.system_prompt) setInstructions(config.system_prompt);
        if (config.icon) setIcon(config.icon);
        if (config.starters) setStarters(config.starters);
    };

    const handleStarterChange = (index: number, value: string) => {
        const newStarters = [...starters];
        newStarters[index] = value;
        setStarters(newStarters);
    };

    const addStarter = () => {
        if (starters.length < 4) {
            setStarters([...starters, '']);
        }
    };

    const removeStarter = (index: number) => {
        const newStarters = starters.filter((_, i) => i !== index);
        setStarters(newStarters.length ? newStarters : ['']);
    };

    const handleSubmit = () => {
        onSave({
            name: name || 'New Agent',
            description,
            system_prompt: instructions,
            icon,
            starters: starters.filter(s => s.trim() !== ''),
            user_id: 'current-user'
        });
        onClose();
    };

    const currentAgentData: Partial<CustomAgent> = {
        name: name || 'New Agent',
        description,
        system_prompt: instructions,
        icon,
        starters: starters.filter(s => s.trim() !== '')
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-[90vw] h-[90vh] bg-bg-secondary border border-border-color rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Top Bar */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-bg-secondary">
                            <div className="flex items-center gap-4">
                                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                                    <XMarkIcon className="w-6 h-6" />
                                </button>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">{icon}</span>
                                    <div>
                                        <h2 className="text-sm font-bold text-white leading-tight">{name || 'New Agent'}</h2>
                                        <p className="text-xs text-gray-500">{initialData ? 'Editing' : 'Draft'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-full transition-all flex items-center gap-2 shadow-lg shadow-green-900/20">
                                    {initialData ? 'Update' : 'Create'}
                                    <CheckCircleIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* LEFT PANEL: Editor */}
                            <div className="w-1/2 border-r border-white/10 flex flex-col bg-bg-secondary">
                                {/* Tabs */}
                                <div className="flex border-b border-white/10 px-6 pt-6 gap-6">
                                    <button 
                                        onClick={() => setActiveTab('create')}
                                        className={`pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'create' ? 'text-primary-start border-primary-start' : 'text-gray-400 border-transparent hover:text-white'}`}
                                    >
                                        <span className="flex items-center gap-2"><SparklesIcon className="w-4 h-4"/> Create</span>
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('configure')}
                                        className={`pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'configure' ? 'text-primary-start border-primary-start' : 'text-gray-400 border-transparent hover:text-white'}`}
                                    >
                                         <span className="flex items-center gap-2"><WrenchScrewdriverIcon className="w-4 h-4"/> Configure</span>
                                    </button>
                                </div>

                                <div className="flex-1 overflow-hidden relative">
                                    {activeTab === 'create' ? (
                                        <BuilderChat onConfigUpdate={handleBuilderUpdate} apiKey={geminiApiKey || ''} />
                                    ) : (
                                        <div className="h-full overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                            <div className="flex gap-4">
                                                <div className="flex-shrink-0">
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Icon</label>
                                                    <input
                                                        type="text"
                                                        value={icon}
                                                        onChange={(e) => setIcon(e.target.value)}
                                                        className="w-16 h-16 text-center text-3xl bg-bg-tertiary border border-white/10 rounded-full focus:outline-none focus:border-primary-start transition-colors"
                                                        maxLength={2}
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Name</label>
                                                    <input
                                                        type="text"
                                                        value={name}
                                                        onChange={(e) => setName(e.target.value)}
                                                        placeholder="Name your agent"
                                                        className="w-full p-3 bg-bg-tertiary border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-start transition-colors"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</label>
                                                <input
                                                    type="text"
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    placeholder="Short description of what this agent does"
                                                    className="w-full p-3 bg-bg-tertiary border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-start transition-colors"
                                                />
                                            </div>

                                            <div className="flex-1 flex flex-col">
                                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Instructions</label>
                                                <textarea
                                                    value={instructions}
                                                    onChange={(e) => setInstructions(e.target.value)}
                                                    placeholder="What does this agent do? How does it behave? What should it avoid?"
                                                    className="w-full min-h-[200px] p-4 bg-bg-tertiary border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-primary-start resize-y leading-relaxed"
                                                />
                                            </div>
                                            
                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Conversation Starters</label>
                                                    {starters.length < 4 && (
                                                        <button onClick={addStarter} className="text-xs text-primary-start hover:text-white flex items-center gap-1">
                                                            <PlusIcon className="w-3 h-3" /> Add
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    {starters.map((starter, index) => (
                                                        <div key={index} className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={starter}
                                                                onChange={(e) => handleStarterChange(index, e.target.value)}
                                                                placeholder="e.g. Write a python script"
                                                                className="flex-1 p-2 bg-bg-tertiary border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-primary-start"
                                                            />
                                                            {starters.length > 1 && (
                                                                <button onClick={() => removeStarter(index)} className="p-2 text-gray-500 hover:text-red-400">
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="opacity-50">
                                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Knowledge</label>
                                                <div className="p-4 border-2 border-dashed border-white/10 rounded-xl text-center text-sm text-gray-500">
                                                    File uploads coming soon.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT PANEL: Preview */}
                            <div className="w-1/2 bg-[#09090b] flex flex-col border-l border-white/5 relative">
                                <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-black/50 backdrop-blur border border-white/10 rounded-full text-xs font-bold text-gray-300 pointer-events-none">
                                    Preview
                                </div>
                                <div className="flex-1 h-full overflow-hidden p-6 pt-16">
                                    <AgentTestChat agentData={currentAgentData} />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
