
import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon, ChatBubbleLeftRightIcon, PlusIcon, CommandLineIcon, PlayIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { CustomAgent, Message, EmotionData } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { runAgent } from '../../agents';
import { MessageContent } from '../chat/MessageContent';
import { ChatInput } from '../chat/ChatInput'; // Use full ChatInput component
import { motion, AnimatePresence } from 'framer-motion';

interface AgentTestChatProps {
    agentData: Partial<CustomAgent>;
}

// Simulated Python Console Output
const PythonOutput: React.FC<{ code: string }> = ({ code }) => {
    const [output, setOutput] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(true);

    useEffect(() => {
        setIsRunning(true);
        setOutput([]);
        
        // Simulating execution delay and output
        const lines = code.split('\n');
        const simulatedOutput: string[] = [];

        // Basic mock logic to make it look alive
        if (code.includes('print')) {
            const printMatches = code.matchAll(/print\((["'])(.*?)\1\)/g);
            for (const match of printMatches) {
                simulatedOutput.push(match[2]);
            }
        }
        if (code.includes('import pandas')) {
             simulatedOutput.push("[System] Loading pandas library...");
             simulatedOutput.push("     ...done (0.4s)");
        }
        if (code.includes('plt.show') || code.includes('plot')) {
             simulatedOutput.push("[System] Generated plot image (matplotlib)");
        }

        // If no explicit print, just show "Executed successfully"
        if (simulatedOutput.length === 0) {
             simulatedOutput.push("Executed successfully.");
        }

        let i = 0;
        const interval = setInterval(() => {
            if (i < simulatedOutput.length) {
                setOutput(prev => [...prev, simulatedOutput[i]]);
                i++;
            } else {
                setIsRunning(false);
                clearInterval(interval);
            }
        }, 800); // Slow type simulation

        return () => clearInterval(interval);
    }, [code]);

    return (
        <div className="bg-black/40 rounded-lg p-3 my-2 border border-white/10 font-mono text-xs text-gray-300">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                <CommandLineIcon className="w-3 h-3 text-green-500" />
                <span className="text-[10px] uppercase font-bold text-gray-500">Python 3.10 (Simulated)</span>
                {isRunning ? (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-yellow-500">
                        <ArrowPathIcon className="w-3 h-3 animate-spin" /> Running
                    </span>
                ) : (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-green-500">
                         <CheckCircleIcon className="w-3 h-3" /> Finished
                    </span>
                )}
            </div>
            <div className="space-y-1">
                {output.map((line, idx) => (
                    <div key={idx} className="break-all">{line}</div>
                ))}
            </div>
        </div>
    );
};

// Specialized renderer for python blocks
const AgentMessageContent: React.FC<{ content: string }> = ({ content }) => {
    const parts = content.split(/(```python[\s\S]*?```)/g);

    return (
        <>
            {parts.map((part, index) => {
                if (part.startsWith('```python')) {
                    const code = part.replace(/```python\n?|```$/g, '');
                    return (
                        <div key={index} className="not-prose my-2">
                             <div className="bg-[#1e1e1e] rounded-t-lg px-3 py-1.5 flex items-center gap-2 border-b border-white/5">
                                 <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                 <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                 <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                 <span className="ml-2 text-xs text-gray-400 font-mono">script.py</span>
                             </div>
                             <pre className="bg-[#1e1e1e] p-3 text-xs font-mono text-blue-200 overflow-x-auto">
                                {code}
                             </pre>
                             <PythonOutput code={code} />
                        </div>
                    );
                }
                return <MessageContent key={index} content={part} searchQuery="" sender="ai" />;
            })}
        </>
    );
};

export const AgentTestChat: React.FC<AgentTestChatProps> = ({ agentData }) => {
    const { user, profile, geminiApiKey, supabase } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [selectedAction, setSelectedAction] = useState('default');
    
    // --- Streaming Buffers (Identical to useChat logic) ---
    const streamBufferRef = useRef('');
    const lastStreamUpdateRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
             isMountedRef.current = false;
             if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text: string, files?: File[] | null) => {
        if (!text.trim() && (!files || files.length === 0)) return;
        if (isSending) return;

        const userMsg: Message = {
            id: `test-user-${Date.now()}`,
            chat_id: 'test-chat',
            sender: 'user',
            text: text,
            created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMsg]);
        setIsSending(true);
        
        // Prepare UI for AI response
        const tempAiId = `test-ai-${Date.now()}`;
        const tempAiMsg: Message = {
            id: tempAiId,
            chat_id: 'test-chat',
            sender: 'ai',
            text: '',
            created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempAiMsg]);
        
        // Reset buffers
        streamBufferRef.current = '';
        lastStreamUpdateRef.current = 0;

        // UI Update Loop
        const updateUI = () => {
            if (!isMountedRef.current) return;
            const currentText = streamBufferRef.current;
            setMessages(prev => prev.map(m => {
                if (m.id === tempAiId) {
                    return { ...m, text: currentText };
                }
                return m;
            }));
        };

        const onStreamChunk = (chunkText: string) => {
            streamBufferRef.current += chunkText;
            const now = Date.now();
            if (now - lastStreamUpdateRef.current > 32) {
                lastStreamUpdateRef.current = now;
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = requestAnimationFrame(updateUI);
            }
        };

        try {
            // Construct a temporary custom agent object safely
            const tempAgent: CustomAgent = {
                id: 'temp-test-agent',
                user_id: user?.id || 'guest',
                name: agentData?.name || 'Test Agent',
                description: agentData?.description || '',
                system_prompt: agentData?.system_prompt || 'You are a helpful assistant.',
                icon: agentData?.icon || '🤖',
                starters: agentData?.starters || [],
                capabilities: agentData?.capabilities, // Pass capabilities
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const result = await runAgent({
                prompt: userMsg.text,
                files: files,
                apiKey: geminiApiKey || '',
                model: profile?.preferred_chat_model || 'gemini-flash-lite-latest',
                project: { 
                    id: 'test-project', 
                    name: 'Test Environment', 
                    description: 'Test Project Environment',
                    platform: 'Web App', 
                    project_type: 'conversation', 
                    status: 'In Progress', 
                    default_model: 'gemini-flash-lite-latest',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    user_id: user?.id || 'guest'
                },
                chat: {
                    id: 'test-chat',
                    user_id: user?.id || 'guest',
                    name: 'Test Chat',
                    mode: 'custom',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                user: user || { id: 'guest', aud: 'guest' } as any,
                profile: profile || null,
                supabase: supabase as any,
                history: messages.filter(m => m.id !== tempAiId), // Don't send temp msg as history
                workspaceMode: 'autonomous',
                customAgent: tempAgent,
                thinkingMode: 'fast',
                onStreamChunk: onStreamChunk // Pass the streamer!
            });

            // Final flush
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            updateUI(); // Ensure last text is committed

            if (result.messages && result.messages.length > 0) {
                // Ensure we update with final full text just in case stream missed a beat
                const finalMsgText = result.messages[0].text;
                if (finalMsgText !== streamBufferRef.current && finalMsgText.length > streamBufferRef.current.length) {
                     setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, text: finalMsgText } : m));
                }
            }
        } catch (error) {
            console.error("Test chat error:", error);
            setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, text: "Error: Failed to get response." } : m));
        } finally {
            setIsSending(false);
        }
    };

    const handleClear = () => {
        setMessages([]);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
    
    // Safely handle null/undefined agentData for render
    const safeAgentData = agentData || {};
    // Default allow_attachments to true if undefined
    const showAttachments = safeAgentData.capabilities?.allow_attachments !== false;
    const allowedTools = safeAgentData.capabilities?.allowed_tools;

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] rounded-2xl overflow-hidden border border-white/10 shadow-2xl w-full">
            {/* Window Controls Header */}
            <div className="h-10 bg-[#252526] border-b border-[#3e3e3e] flex items-center px-4 justify-between flex-shrink-0">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
                </div>
                <div className="text-xs font-medium text-gray-400">Preview</div>
                <button onClick={handleClear} className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors" title="Clear Chat">
                    <ArrowPathIcon className="w-3 h-3" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#1e1e1e]">
                {messages.length === 0 ? (
                    <div className="flex flex-col h-full justify-center items-center text-center p-4">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-5xl mb-4 border border-white/10 shadow-inner overflow-hidden">
                            {safeAgentData.icon?.startsWith('http') || safeAgentData.icon?.startsWith('data:image') ? (
                                <img src={safeAgentData.icon} alt="Agent" className="w-full h-full object-cover" />
                            ) : (
                                <span>{safeAgentData.icon || '🤖'}</span>
                            )}
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{safeAgentData.name || 'New Agent'}</h3>
                        <p className="text-sm text-gray-400 mb-8 max-w-xs">{safeAgentData.description || 'I can help you with...'}</p>
                        
                        {/* Conversation Starters */}
                        {safeAgentData.starters && safeAgentData.starters.length > 0 && (
                            <div className="grid gap-2 w-full max-w-sm">
                                {safeAgentData.starters.map((starter, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(starter)}
                                        className="text-sm bg-white/5 hover:bg-white/10 text-gray-300 py-3 px-4 rounded-xl text-left transition-colors border border-white/5 hover:border-white/20"
                                    >
                                        {starter}
                                    </button>
                                ))}
                            </div>
                        )}
                        {!safeAgentData.starters?.length && (
                             <div className="text-gray-600 text-xs italic">Send a message to test behavior.</div>
                        )}
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} ref={messagesEndRef} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                             {/* Use ChatMessage component style layout but simplified for test preview */}
                             {msg.sender === 'ai' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center border border-border-color shadow-sm mt-1 mr-2 overflow-hidden">
                                     {safeAgentData.icon?.startsWith('http') || safeAgentData.icon?.startsWith('data:image') ? (
                                        <img src={safeAgentData.icon} alt="Agent" className="w-full h-full object-cover" />
                                     ) : (
                                        <span className="text-lg">{safeAgentData.icon || '🤖'}</span>
                                     )}
                                </div>
                             )}
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                                msg.sender === 'user' 
                                ? 'bg-primary-start/20 text-white rounded-br-sm' 
                                : 'bg-white/5 text-gray-200 rounded-bl-sm border border-white/5'
                            }`}>
                                {msg.sender === 'ai' && safeAgentData.capabilities?.code_execution ? (
                                    <AgentMessageContent content={msg.text} />
                                ) : (
                                    <MessageContent content={msg.text} searchQuery="" sender={msg.sender} />
                                )}
                            </div>
                        </div>
                    ))
                )}
                {isSending && messages.length > 0 && messages[messages.length-1].sender === 'user' && (
                     // Only show independent loading indicator if the AI message hasn't been created yet
                     // But in this logic, we create temp message immediately, so this is fallback
                     null
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-2 border-t border-[#3e3e3e] bg-[#252526]">
                <ChatInput 
                    onSendMessage={(text, files, thinkingMode) => handleSend(text, files)}
                    isLoading={isSending}
                    chat={null}
                    onChatUpdate={null}
                    isAdmin={false}
                    workspaceMode="autonomous"
                    isInitialView={false}
                    loadingMessage=""
                    project={null}
                    selectedAction={selectedAction}
                    onActionSelect={setSelectedAction}
                    showAttachmentsButton={showAttachments}
                    allowedTools={allowedTools}
                />
            </div>
        </div>
    );
};
