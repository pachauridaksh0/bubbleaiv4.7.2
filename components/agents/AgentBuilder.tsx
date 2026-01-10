
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    XMarkIcon, SparklesIcon, ChatBubbleLeftRightIcon, WrenchScrewdriverIcon, 
    ArrowPathIcon, CheckCircleIcon, PlusIcon, TrashIcon, PhotoIcon, 
    EyeIcon, GlobeAltIcon, LockClosedIcon, ChevronLeftIcon,
    DocumentPlusIcon, ChevronDownIcon, Cog6ToothIcon, FolderIcon,
    PaperClipIcon
} from '@heroicons/react/24/solid';
import { CustomAgent, Message } from '../../types';
import { AgentTestChat } from './AgentTestChat';
import { GoogleGenAI } from '@google/genai';
import { builderAgentInstruction } from '../../agents/builder/instructions';
import { useAuth } from '../../contexts/AuthContext';
import { MessageContent } from '../chat/MessageContent';
import { generateImage } from '../../services/geminiService';
import { useToast } from '../../hooks/useToast';
import { useResizable } from '../../hooks/useResizable';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useWindowSize } from '../../hooks/useWindowSize';

interface AgentBuilderProps {
    onSave: (agent: Omit<CustomAgent, 'id' | 'created_at' | 'updated_at'>) => void;
    onBack: () => void;
    initialData?: CustomAgent | null;
}

// Left Panel: Builder Chat
const BuilderChat: React.FC<{ 
    onConfigUpdate: (config: Partial<CustomAgent>) => void;
    apiKey: string;
    currentConfig: Partial<CustomAgent>;
}> = ({ onConfigUpdate, apiKey, currentConfig }) => {
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
                    systemInstruction: `${builderAgentInstruction}\n\nCURRENT CONFIG:\n${JSON.stringify(currentConfig)}`,
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
        <div className="flex flex-col h-full bg-[#18181b]">
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[90%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                                msg.sender === 'user' 
                                ? 'bg-[#27272a] text-white' 
                                : 'bg-transparent text-gray-200 pl-0'
                            }`}>
                                {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mb-3"><SparklesIcon className="w-5 h-5 text-black"/></div>}
                                <MessageContent content={msg.text} searchQuery="" sender={msg.sender} />
                            </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex justify-start pl-0 p-6">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center animate-pulse">
                            <div className="w-2 h-2 bg-black rounded-full"></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSend} className="p-6 border-t border-white/5 bg-[#18181b]">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Message the Builder..."
                        className="w-full bg-[#27272a] border border-white/5 rounded-full pl-6 pr-12 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder-gray-500 shadow-inner"
                    />
                    <button 
                        type="submit" 
                        disabled={!input.trim() || isThinking}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${isThinking ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </form>
        </div>
    );
};

// Left Panel: Manual Configuration
const ConfigureForm: React.FC<{
    config: Partial<CustomAgent>;
    updateConfig: (updates: Partial<CustomAgent>) => void;
    generateIcon: () => void;
    isGeneratingIcon: boolean;
}> = ({ config, updateConfig, generateIcon, isGeneratingIcon }) => {
    
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    
    const handleStarterChange = (index: number, value: string) => {
        const newStarters = [...(config.starters || [])];
        newStarters[index] = value;
        updateConfig({ starters: newStarters });
    };

    const addStarter = () => {
        const current = config.starters || [];
        if (current.length < 4) {
            updateConfig({ starters: [...current, ''] });
        }
    };
    
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const newFiles = Array.from(files).map((f: File) => ({ name: f.name, type: f.type, size: f.size }));
            const currentKB = config.knowledge_base || [];
            updateConfig({ knowledge_base: [...currentKB, ...newFiles] });
        }
    };
    
    const removeFile = (index: number) => {
        const currentKB = config.knowledge_base || [];
        const newKB = currentKB.filter((_, i) => i !== index);
        updateConfig({ knowledge_base: newKB });
    };

    return (
        <div className="h-full overflow-y-auto p-8 space-y-8 custom-scrollbar bg-[#18181b]">
            {/* Identity Section */}
            <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 group relative">
                    <div className="w-24 h-24 rounded-full bg-[#27272a] border border-white/10 flex items-center justify-center text-5xl overflow-hidden cursor-pointer hover:border-white/30 transition-colors shadow-lg">
                        {config.icon?.startsWith('http') ? (
                            <img src={config.icon} alt="Icon" className="w-full h-full object-cover" />
                        ) : (
                            <span>{config.icon || '🤖'}</span>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity">
                             <button onClick={generateIcon} disabled={isGeneratingIcon} className="text-white text-xs font-bold hover:text-primary-start">
                                 {isGeneratingIcon ? '...' : 'Generate'}
                             </button>
                        </div>
                    </div>
                </div>
                <div className="flex-1 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                        <input
                            type="text"
                            value={config.name || ''}
                            onChange={(e) => updateConfig({ name: e.target.value })}
                            placeholder="Name your agent"
                            className="w-full p-3 bg-[#27272a] border border-white/5 rounded-lg text-white focus:outline-none focus:border-white/20 transition-colors placeholder-gray-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description</label>
                        <input
                            type="text"
                            value={config.description || ''}
                            onChange={(e) => updateConfig({ description: e.target.value })}
                            placeholder="Short description"
                            className="w-full p-3 bg-[#27272a] border border-white/5 rounded-lg text-white focus:outline-none focus:border-white/20 transition-colors placeholder-gray-600"
                        />
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="flex-1 flex flex-col">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Instructions</label>
                <textarea
                    value={config.system_prompt || ''}
                    onChange={(e) => updateConfig({ system_prompt: e.target.value })}
                    placeholder="What does this agent do? How does it behave?"
                    className="w-full min-h-[250px] p-4 bg-[#27272a] border border-white/5 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-white/20 resize-y leading-relaxed placeholder-gray-600"
                />
            </div>

            {/* Starters */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Conversation Starters</label>
                    {(config.starters?.length || 0) < 4 && (
                        <button onClick={addStarter} className="text-xs text-white hover:text-gray-300 flex items-center gap-1 bg-[#27272a] px-2 py-1 rounded border border-white/5">
                            <PlusIcon className="w-3 h-3" /> Add
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {(config.starters || []).map((starter, index) => (
                        <div key={index} className="flex gap-2 group">
                            <input
                                type="text"
                                value={starter}
                                onChange={(e) => handleStarterChange(index, e.target.value)}
                                className="flex-1 p-2.5 bg-[#27272a] border border-white/5 rounded-lg text-white text-sm focus:outline-none focus:border-white/20 placeholder-gray-600"
                                placeholder="e.g. Help me fix my code"
                            />
                            <button 
                                onClick={() => updateConfig({ starters: config.starters?.filter((_, i) => i !== index) })} 
                                className="p-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {(config.starters?.length || 0) === 0 && (
                         <div className="text-xs text-gray-600 italic p-2 border border-dashed border-white/5 rounded bg-[#27272a]/50">No starters added.</div>
                    )}
                </div>
            </div>

            <div className="h-px bg-white/5 w-full my-4"></div>

            {/* Knowledge */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white">Knowledge</h3>
                    <label className="cursor-pointer text-xs text-white bg-[#27272a] border border-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
                        <DocumentPlusIcon className="w-3.5 h-3.5" />
                        <span>Upload Files</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} multiple />
                    </label>
                </div>
                
                <div className="space-y-2">
                    {(config.knowledge_base || []).map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-[#27272a] rounded-lg border border-white/5">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <FolderIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm text-gray-200 truncate">{file.name}</span>
                                    <span className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(1)} KB</span>
                                </div>
                            </div>
                            <button onClick={() => removeFile(idx)} className="text-gray-500 hover:text-red-400 p-1">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {(config.knowledge_base?.length || 0) === 0 && (
                        <div className="p-6 border-2 border-dashed border-white/5 rounded-xl text-center flex flex-col items-center gap-2 text-gray-500 hover:border-white/10 transition-colors">
                            <DocumentPlusIcon className="w-8 h-8 opacity-20" />
                            <span className="text-xs">Upload files to give the agent context.</span>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="h-px bg-white/5 w-full my-4"></div>
            
            {/* Capabilities */}
            <div className="space-y-4">
                <h3 className="text-sm font-bold text-white">Capabilities</h3>
                <div className="space-y-3">
                    <label className="flex items-center justify-between p-3.5 bg-[#27272a] rounded-lg cursor-pointer border border-white/5 hover:border-white/10 transition-colors">
                        <span className="text-sm text-gray-300">Web Browsing</span>
                        <input 
                            type="checkbox" 
                            checked={config.capabilities?.web_search}
                            onChange={(e) => updateConfig({ capabilities: { ...config.capabilities, web_search: e.target.checked } })}
                            className="rounded border-white/20 bg-black text-primary-start focus:ring-0 w-4 h-4" 
                        />
                    </label>

                    <div className="bg-[#27272a] rounded-lg border border-white/5 overflow-hidden">
                        <label className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/5 transition-colors">
                            <span className="text-sm text-gray-300">Image Generator</span>
                            <input 
                                type="checkbox" 
                                checked={config.capabilities?.image_generation}
                                onChange={(e) => updateConfig({ capabilities: { ...config.capabilities, image_generation: e.target.checked } })}
                                className="rounded border-white/20 bg-black text-primary-start focus:ring-0 w-4 h-4" 
                            />
                        </label>
                        
                        {config.capabilities?.image_generation && (
                             <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="px-3.5 pb-3.5 pt-0"
                             >
                                <div className="p-3 bg-black/20 rounded border border-white/5">
                                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-2">Provider</label>
                                    <select 
                                        value={config.image_gen_provider || 'owner'}
                                        onChange={(e) => updateConfig({ image_gen_provider: e.target.value as any })}
                                        className="w-full p-2 bg-[#18181b] border border-white/10 rounded text-xs text-white focus:outline-none"
                                    >
                                        <option value="owner">Powered by your API (Owner)</option>
                                        <option value="user">Use User's API Key</option>
                                    </select>
                                </div>
                             </motion.div>
                        )}
                    </div>
                    
                     <label className="flex items-center justify-between p-3.5 bg-[#27272a] rounded-lg cursor-pointer border border-white/5 hover:border-white/10 transition-colors">
                        <span className="text-sm text-gray-300">Code Interpreter (Python)</span>
                        <input 
                             type="checkbox" 
                             checked={config.capabilities?.code_execution}
                             onChange={(e) => updateConfig({ capabilities: { ...config.capabilities, code_execution: e.target.checked } })}
                             className="rounded border-white/20 bg-black text-primary-start focus:ring-0 w-4 h-4" 
                        />
                    </label>
                </div>
            </div>

            <div className="h-px bg-white/5 w-full my-4"></div>

            {/* Advanced / More Options */}
             <div className="pb-8">
                <button 
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} 
                    className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white transition-colors"
                >
                    <Cog6ToothIcon className="w-4 h-4" />
                    {isAdvancedOpen ? 'Hide Advanced Options' : 'Show Advanced Options'}
                    <ChevronDownIcon className={`w-3 h-3 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                    {isAdvancedOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="pt-4 space-y-4">
                                <div className="p-4 bg-[#27272a] border border-white/5 rounded-lg">
                                    <h4 className="text-xs font-bold text-white mb-3">Interface Settings</h4>
                                    
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-white/10 rounded">
                                                <PlusIcon className="w-4 h-4 text-gray-300" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-medium text-gray-200 block">Allow Attachments & Actions</span>
                                                <span className="text-[10px] text-gray-500">Show the (+) button for files and tools</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            checked={config.capabilities?.allow_attachments !== false}
                                            onChange={(e) => updateConfig({ capabilities: { ...config.capabilities, allow_attachments: e.target.checked } })}
                                            className="rounded border-white/20 bg-black text-primary-start focus:ring-0 w-4 h-4" 
                                        />
                                    </label>
                                </div>

                                <div className="p-4 bg-[#27272a] border border-white/5 rounded-lg">
                                    <h4 className="text-xs font-bold text-white mb-2">Model Configuration</h4>
                                    <p className="text-xs text-gray-500 mb-3">Force a specific base model for this agent.</p>
                                    <select className="w-full p-2 bg-[#18181b] border border-white/10 rounded text-xs text-gray-300">
                                        <option>Default (Auto)</option>
                                        <option>Gemini 2.5 Flash</option>
                                        <option>Gemini 3 Pro</option>
                                    </select>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export const AgentBuilder: React.FC<AgentBuilderProps> = ({ onSave, onBack, initialData }) => {
    const { geminiApiKey } = useAuth();
    const { addToast } = useToast();
    const { width } = useWindowSize();
    const isMobile = width ? width < 1024 : false;
    
    // Collapse sidebar on mount
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorage('adminSidebarCollapsed', false);
    useEffect(() => {
        setIsSidebarCollapsed(true);
    }, []);

    const [activeTab, setActiveTab] = useState<'create' | 'configure'>('create');
    const [mobileActiveTab, setMobileActiveTab] = useState<'create' | 'configure' | 'preview'>('create');
    const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
    
    // Agent Config State
    const [agentConfig, setAgentConfig] = useState<Partial<CustomAgent>>({
        name: '',
        description: '',
        system_prompt: '',
        icon: '',
        starters: [],
        visibility: 'private',
        capabilities: {
            web_search: true,
            image_generation: false,
            code_execution: false,
            allow_attachments: true // Default enabled
        },
        image_gen_provider: 'owner',
        ...initialData
    });
    
    // Split pane logic
    const { size: leftPanelWidth, startResizing, isResizing } = useResizable({ initialSize: 450, minSize: 350, maxSize: 700 });

    const handleUpdateConfig = (updates: Partial<CustomAgent>) => {
        setAgentConfig(prev => ({ ...prev, ...updates }));
    };

    const handleGenerateIcon = async () => {
        if (!agentConfig.description && !agentConfig.name) {
            addToast("Please add a name or description first.", "info");
            return;
        }
        setIsGeneratingIcon(true);
        try {
            const prompt = `A minimalist, high-quality vector icon or avatar for an AI agent named "${agentConfig.name}". Description: ${agentConfig.description}. Style: Modern, flat, tech-focused, no text.`;
            const { imageBase64 } = await generateImage(prompt, geminiApiKey || '', 'imagen_3'); // Using Image3 for quality
            setAgentConfig(prev => ({ ...prev, icon: `data:image/png;base64,${imageBase64}` }));
            addToast("Icon generated!", "success");
        } catch (e) {
            console.error(e);
            addToast("Failed to generate icon.", "error");
        } finally {
            setIsGeneratingIcon(false);
        }
    };

    const handleSave = () => {
        // Validation
        if (!agentConfig.name || !agentConfig.description) {
            addToast("Name and description are required.", "error");
            return;
        }

        onSave({
            name: agentConfig.name,
            description: agentConfig.description,
            system_prompt: agentConfig.system_prompt || '',
            icon: agentConfig.icon || '🤖',
            starters: (agentConfig.starters || []).filter(s => s.trim() !== ''),
            visibility: agentConfig.visibility || 'private',
            image_gen_provider: agentConfig.image_gen_provider || 'owner',
            knowledge_base: agentConfig.knowledge_base || [],
            capabilities: agentConfig.capabilities || {},
            user_id: 'current-user', // This will be overwritten by service
        });
    };

    // Mobile View
    if (isMobile) {
        return (
            <div className="h-full flex flex-col bg-[#09090b] text-white overflow-hidden">
                {/* Header */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-[#09090b] flex-shrink-0">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <h1 className="text-sm font-bold">{agentConfig.name || 'New Agent'}</h1>
                    <button onClick={handleSave} className="text-xs font-bold text-green-400">Save</button>
                </div>

                {/* Mobile Tabs */}
                <div className="flex border-b border-white/10 bg-[#18181b] flex-shrink-0">
                     <button onClick={() => setMobileActiveTab('create')} className={`flex-1 py-3 text-xs font-medium border-b-2 ${mobileActiveTab === 'create' ? 'border-primary-start text-white' : 'border-transparent text-gray-500'}`}>Create</button>
                     <button onClick={() => setMobileActiveTab('configure')} className={`flex-1 py-3 text-xs font-medium border-b-2 ${mobileActiveTab === 'configure' ? 'border-primary-start text-white' : 'border-transparent text-gray-500'}`}>Configure</button>
                     <button onClick={() => setMobileActiveTab('preview')} className={`flex-1 py-3 text-xs font-medium border-b-2 ${mobileActiveTab === 'preview' ? 'border-primary-start text-white' : 'border-transparent text-gray-500'}`}>Preview</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {mobileActiveTab === 'create' && <BuilderChat apiKey={geminiApiKey || ''} onConfigUpdate={handleUpdateConfig} currentConfig={agentConfig} />}
                    {mobileActiveTab === 'configure' && <ConfigureForm config={agentConfig} updateConfig={handleUpdateConfig} generateIcon={handleGenerateIcon} isGeneratingIcon={isGeneratingIcon} />}
                    {mobileActiveTab === 'preview' && (
                         <div className="h-full bg-[#1e1e1e] flex flex-col">
                             <div className="h-10 bg-[#252526] border-b border-[#3e3e3e] flex items-center px-4 justify-between flex-shrink-0">
                                 <div className="flex gap-1.5">
                                     <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
                                     <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
                                     <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
                                 </div>
                             </div>
                             <div className="flex-1 overflow-hidden"><AgentTestChat agentData={agentConfig} /></div>
                         </div>
                    )}
                </div>
            </div>
        )
    }

    // Desktop View
    return (
        <div className="h-full flex flex-col bg-[#09090b] text-white overflow-hidden">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-[#09090b]">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-bold text-white flex items-center gap-2">
                            {agentConfig.name || 'New Agent'}
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-gray-400 border border-white/5 uppercase tracking-wide">
                                {initialData ? 'Edit' : 'Draft'}
                            </span>
                        </h1>
                        <p className="text-xs text-gray-500">{agentConfig.visibility === 'public' ? 'Public' : 'Private'}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex bg-white/5 rounded-lg p-1 border border-white/5 mr-4">
                         <button 
                             onClick={() => handleUpdateConfig({ visibility: 'private' })} 
                             className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${agentConfig.visibility !== 'public' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                             <LockClosedIcon className="w-3 h-3" /> Private
                         </button>
                         <button 
                             onClick={() => handleUpdateConfig({ visibility: 'public' })} 
                             className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${agentConfig.visibility === 'public' ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                             <GlobeAltIcon className="w-3 h-3" /> Public
                         </button>
                    </div>

                    <button 
                        onClick={handleSave}
                        className="px-5 py-2 bg-white text-black rounded-full text-sm font-bold hover:bg-gray-200 transition-colors shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        {initialData ? 'Update' : 'Create'}
                    </button>
                </div>
            </div>

            {/* Main Content Split */}
            <div 
                className="flex-1 flex overflow-hidden relative" 
                style={{ userSelect: isResizing ? 'none' : 'auto' }}
            >
                {/* LEFT PANEL (Config/Builder) */}
                <div className="flex flex-col bg-[#18181b] border-r border-white/10" style={{ width: leftPanelWidth }}>
                     {/* Tabs */}
                     <div className="flex border-b border-white/5 px-6 pt-2">
                        <button 
                            onClick={() => setActiveTab('create')}
                            className={`flex items-center gap-2 pb-3 pt-3 text-sm font-bold transition-colors border-b-2 mr-6 ${activeTab === 'create' ? 'border-primary-start text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <SparklesIcon className="w-4 h-4" /> Create
                        </button>
                        <button 
                            onClick={() => setActiveTab('configure')}
                            className={`flex items-center gap-2 pb-3 pt-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'configure' ? 'border-primary-start text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <WrenchScrewdriverIcon className="w-4 h-4" /> Configure
                        </button>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                         {activeTab === 'create' ? (
                             <BuilderChat 
                                apiKey={geminiApiKey || ''} 
                                onConfigUpdate={handleUpdateConfig}
                                currentConfig={agentConfig}
                             />
                         ) : (
                             <ConfigureForm 
                                config={agentConfig} 
                                updateConfig={handleUpdateConfig}
                                generateIcon={handleGenerateIcon}
                                isGeneratingIcon={isGeneratingIcon}
                             />
                         )}
                    </div>
                </div>

                {/* RESIZER */}
                <div 
                    className="w-1 bg-[#18181b] hover:bg-primary-start cursor-col-resize transition-colors z-10 border-l border-white/5"
                    onMouseDown={startResizing}
                />

                {/* RIGHT PANEL (PREVIEW) */}
                <div className="flex-1 bg-[#000000] flex flex-col relative overflow-hidden">
                     <div className="flex-1 h-full w-full p-8 pt-10 flex justify-center items-center">
                         {/* Device Mockup */}
                         <div className="w-full max-w-4xl h-full flex flex-col">
                             <AgentTestChat agentData={agentConfig} />
                         </div>
                     </div>
                </div>
            </div>
        </div>
    );
};
