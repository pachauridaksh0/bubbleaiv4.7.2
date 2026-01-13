
import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { Chat, Message, Project, ChatWithProjectData, WorkspaceMode, Plan, EmotionData } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './useToast';
import {
    getAllChatsForUser,
    getMessages,
    addMessage,
    updateChat,
    deleteChat,
    updateMessagePlan,
    saveMemory,
    updateMessage,
    getChatsForProject,
    deductUserCredits,
    getAppSettings
} from '../services/databaseService';
import { localChatService } from '../services/localChatService';
import { runAgent } from '../agents';
import { AgentExecutionResult } from '../agents/types';
import { generateChatTitle } from '../services/geminiService';
import { emotionEngine } from '../services/emotionEngine';
import { NEW_CHAT_NAME } from '../constants';
import { customAgentService } from '../services/customAgentService';
// Import Instructions for Fallback Mode
import { autonomousInstruction } from '../agents/autonomous/instructions';
import { webAppAgentInstruction } from '../agents/cocreator/webapp/instructions';
import { robloxAgentInstruction } from '../agents/cocreator/roblox/instructions';

interface UseChatProps {
    user: User | null;
    geminiApiKey: string | null;
    workspaceMode: WorkspaceMode;
    adminProject?: Project | null;
}

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
};

interface Attachment {
    type: string;
    data: string;
    name: string;
}

export const useChat = ({ user, geminiApiKey, workspaceMode, adminProject }: UseChatProps) => {
    const { supabase, profile, isGuest, updateUserProfile } = useAuth();
    const { addToast } = useToast();

    const [allChats, setAllChats] = useState<ChatWithProjectData[]>([]);
    const [activeChat, setActiveChat] = useState<ChatWithProjectData | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isCreatingChat, setIsCreatingChat] = useState(false);

    // UI Status
    const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'planning' | 'building' | 'fixing' | 'error'>('idle');
    const [activityLog, setActivityLog] = useState<string[]>([]);
    const [currentEmotion, setCurrentEmotion] = useState<string>('Neutral');
    const [modelLoadingProgress, setModelLoadingProgress] = useState(0);

    const abortControllerRef = useRef<AbortController | null>(null);
    const isMountedRef = useRef(true);
    const activeChatIdRef = useRef<string | null>(null);
    const isSendingRef = useRef(false);
    const previousChatIdRef = useRef<string | null>(null);

    const streamBufferRef = useRef('');
    const lastStreamUpdateRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    
    // To prevent duplicate message IDs during rapid updates
    const processedMessageIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        isMountedRef.current = true;
        emotionEngine.setProgressCallback((p) => {
            if (isMountedRef.current) setModelLoadingProgress(p);
        });
        if (workspaceMode === 'autonomous') emotionEngine.init().catch(console.warn);
        return () => { 
            isMountedRef.current = false; 
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [workspaceMode]);

    useEffect(() => {
        const currentId = activeChat?.id || null;
        activeChatIdRef.current = currentId;

        if (currentId && previousChatIdRef.current && currentId !== previousChatIdRef.current) {
            setMessages([]); 
            setAiStatus('idle');
            setActivityLog([]);
            setCurrentEmotion('Neutral');
            processedMessageIds.current.clear();
            isSendingRef.current = false;
            setIsSending(false);
        }
        previousChatIdRef.current = currentId;
    }, [activeChat?.id]);

    useEffect(() => {
        const loadChats = async () => {
            if (isGuest) {
                const chats = await localChatService.getAllChats();
                if (isMountedRef.current) setAllChats(chats);
                return;
            }
            if (!user || !supabase) return;
            try {
                let chats: ChatWithProjectData[] = [];
                if (adminProject) {
                    const projectChats = await getChatsForProject(supabase, adminProject.id);
                    chats = projectChats.map(c => ({...c, projects: adminProject }));
                } else {
                    // Optimized: Only fetch recent 20 chats to prevent loading giant payloads
                    chats = await getAllChatsForUser(supabase, user.id);
                }
                if (isMountedRef.current) setAllChats(chats);
            } catch (error) { console.error("Failed to load chats", error); }
        };
        loadChats();
    }, [user, supabase, isGuest, adminProject]);

    const recoverStuckEmotions = useCallback(async (msgs: Message[]) => {
        if (isGuest || !supabase) return;
        const stuck = msgs.filter(m => 
            m.sender === 'user' && 
            m.emotionData?.raw_output && 
            (m.emotionData.raw_output.includes('Loading') || m.emotionData.raw_output.includes('Pending'))
        );
        if (stuck.length === 0) return;
        for (const msg of stuck) {
            try {
                if (!emotionEngine.isModelReady()) await emotionEngine.init();
                const newData = await emotionEngine.analyze(msg.text);
                await updateMessage(supabase, msg.id, { emotionData: newData });
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, emotionData: newData } : m));
            } catch (e) { console.warn("Failed to recover message:", msg.id); }
        }
    }, [isGuest, supabase]);

    // Intelligent Message Merger to Prevent Data Loss
    // Merges new DB messages with existing optimistic messages (temp IDs)
    const mergeMessages = useCallback((existing: Message[], incoming: Message[]): Message[] => {
        const tempMessages = existing.filter(m => m.id.startsWith('temp-') || m.id.startsWith('ai-temp-') || m.status === 'sending');
        const incomingIds = new Set(incoming.map(m => m.id));
        
        // Only keep temp messages if they aren't already represented in the incoming list (by text matching as fallback or ID mapping)
        const relevantTemps = tempMessages.filter(temp => {
            // Very simple heuristic: if a message with exact same text exists in incoming, assume it's synced
            // Realistically, we should rely on the caller replacing the temp ID, but this is a safety net
            return !incoming.some(inc => inc.text === temp.text && inc.sender === temp.sender);
        });

        // Combine: Incoming (Confirmed) + Pending (Optimistic)
        // Sort by creation date to maintain order
        const combined = [...incoming, ...relevantTemps].sort((a, b) => 
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
        
        return combined;
    }, []);

    useEffect(() => {
        activeChatIdRef.current = activeChat?.id || null;
        if (!activeChat) {
            setMessages([]);
            return;
        }

        // If currently sending, avoid full re-fetch clobbering state unless explicit
        if (isSendingRef.current) return;

        const fetchMessages = async () => {
            setIsLoading(true);
            try {
                let msgs: Message[];
                if (isGuest) msgs = await localChatService.getMessages(activeChat.id);
                else if (supabase) msgs = await getMessages(supabase, activeChat.id);
                else msgs = [];
                
                if (isMountedRef.current && activeChatIdRef.current === activeChat.id) {
                    // Use the merger to ensure we don't wipe out a just-sent message
                    // that hasn't hit the DB in this specific fetch cycle yet
                    setMessages(prev => mergeMessages(prev, msgs));
                    
                    // Only process emotions for fully synced messages
                    const confirmedMsgs = msgs.filter(m => !m.id.startsWith('temp'));
                    setTimeout(() => recoverStuckEmotions(confirmedMsgs), 500);
                }
            } catch (error) { addToast("Failed to load messages", "error"); }
            finally { if (isMountedRef.current && activeChatIdRef.current === activeChat.id) setIsLoading(false); }
        };
        fetchMessages();
    }, [activeChat?.id, isGuest, supabase, addToast, recoverStuckEmotions, isSending, mergeMessages]);

    const activeProject = adminProject || activeChat?.projects || null;

    const handleSelectChat = useCallback((chat: ChatWithProjectData) => { setActiveChat(chat); }, []);

    const handleUpdateChat = useCallback(async (chatId: string, updates: Partial<Chat>) => {
        if (isGuest) await localChatService.updateChat(chatId, updates);
        else if (supabase) await updateChat(supabase, chatId, updates);
        setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, ...updates } : c));
        if (activeChat?.id === chatId) setActiveChat(prev => prev ? { ...prev, ...updates } : null);
    }, [isGuest, supabase, activeChat?.id]);

    const handleDeleteChat = useCallback(async (chatId: string) => {
        try {
            if (isGuest) await localChatService.deleteChat(chatId);
            else if (supabase) await deleteChat(supabase, chatId);
            setAllChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChat?.id === chatId) setActiveChat(null);
            addToast("Chat deleted", "info");
        } catch (error) { addToast("Failed to delete chat", "error"); }
    }, [isGuest, supabase, activeChat?.id, addToast]);

    const handleStopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsSending(false);
            isSendingRef.current = false;
            setAiStatus('idle');
            addToast("Generation stopped.", "info");
        }
    }, [addToast]);

    const resyncMessage = useCallback(async (message: Message) => {
        if (message.status !== 'error' || !message.text) return;
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'sending' } : m));
        try {
            const msgPayload = {
                chat_id: message.chat_id,
                project_id: message.project_id,
                sender: message.sender,
                text: message.text,
                emotionData: message.emotionData,
                image_base64: message.image_base64,
                createdMemories: message.createdMemories,
                model: message.model
            };
            
            if (isGuest) {
                await localChatService.addMessage(msgPayload);
            } else if (supabase) {
                if (message.id.startsWith('temp') || message.id.startsWith('ai-temp')) {
                     const savedMsg = await addMessage(supabase, msgPayload);
                     setMessages(prev => prev.map(m => m.id === message.id ? savedMsg : m));
                } else {
                     await updateMessage(supabase, message.id, { ...msgPayload, status: 'sent' });
                     setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'sent' } : m));
                }
            }
            addToast("Message synced successfully.", "success");
        } catch (e) {
            console.error("Resync failed", e);
            setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'error' } : m));
            addToast("Failed to sync message. Please check connection.", "error");
        }
    }, [isGuest, supabase, addToast]);

    const handleSendMessage = useCallback(async (
        text: string, 
        files: File[] | null = null, 
        chatOverride?: ChatWithProjectData | null, 
        modelOverride?: string, 
        onProjectFileUpdate?: (path: string, content: string, isComplete: boolean) => void
    ): Promise<AgentExecutionResult> => {
        if (isSendingRef.current) {
            return { messages: [] };
        }
        
        const chatToUse = chatOverride || activeChat;
        if (!chatToUse) {
            addToast("No active chat", "error");
            return { messages: [] };
        }

        if ((!text.trim() && (!files || files.length === 0)) || (!user && !isGuest)) return { messages: [] };

        // === MODEL WATERFALL LOGIC ===
        let effectiveApiKey = geminiApiKey;
        let useAdminCredits = false;
        
        // 1. Check User's OpenRouter (Priority)
        const userOpenRouter = profile?.openrouter_api_key;
        
        // 2. Admin Credits
        const canUseAdminCredits = profile?.credits && profile.credits > 0.5;

        const tempUserMsgId = `temp-user-${Date.now()}`;
        const placeholderEmotion: EmotionData = { 
            dominant: 'Neutral (Loading)', 
            scores: { Neutral: 100 },
            raw_output: "Loading..."
        };
        
        const optimisticUserMessage: Message = {
            id: tempUserMsgId,
            chat_id: chatToUse.id,
            project_id: chatToUse.project_id,
            sender: 'user',
            text: text,
            emotionData: placeholderEmotion,
            created_at: new Date().toISOString(),
            status: 'sending'
        };

        // IMMEDIATELY ADD TO STATE
        setMessages(prev => [...prev, optimisticUserMessage]);
        
        isSendingRef.current = true;
        setIsSending(true);
        setAiStatus('thinking');
        setActivityLog([]);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // Save User Message Background
        const msgPayload = {
            chat_id: chatToUse.id,
            project_id: chatToUse.project_id,
            sender: 'user' as const,
            text: text,
            emotionData: placeholderEmotion,
            status: 'sent' as const
        };
        
        let savedUserMsg: Message | null = null;
        try {
            if (isGuest) savedUserMsg = await localChatService.addMessage(msgPayload);
            else if (supabase) savedUserMsg = await addMessage(supabase, msgPayload);
            else throw new Error("No backend");
            
            if (savedUserMsg) {
                processedMessageIds.current.add(savedUserMsg.id);
                // Replace temp ID with real ID, carefully preserving the message existence
                setMessages(prev => prev.map(m => m.id === tempUserMsgId ? savedUserMsg! : m));
            }
        } catch (dbError) {
            console.error("Failed to save user message:", dbError);
            setMessages(prev => prev.map(m => m.id === tempUserMsgId ? { ...optimisticUserMessage, status: 'error' } : m));
            // Keep going - AI can still respond even if user msg save failed momentarily (will retry later)
            savedUserMsg = { ...optimisticUserMessage, id: tempUserMsgId }; 
        }

        // Generate Chat Title
        if (text.trim() && chatToUse.name === NEW_CHAT_NAME) {
             generateChatTitle(text.trim(), "", effectiveApiKey).then(newTitle => {
                if (newTitle && newTitle !== "New Chat") {
                    handleUpdateChat(chatToUse.id, { name: newTitle });
                }
            }).catch(e => {});
        }

        const tempAiId = `ai-temp-${Date.now()}`;
        const optimisticAiMessage: Message = {
            id: tempAiId,
            chat_id: chatToUse.id,
            project_id: chatToUse.project_id,
            sender: 'ai',
            text: '',
            created_at: new Date().toISOString(),
            status: 'sending'
        };
        
        setMessages(prev => [...prev, optimisticAiMessage]);

        // UI Streaming Helper
        streamBufferRef.current = '';
        lastStreamUpdateRef.current = 0;

        const updateUI = () => {
            if (!isMountedRef.current || activeChatIdRef.current !== chatToUse.id) return;
            const currentText = streamBufferRef.current;
            setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, text: currentText } : m));
            if (currentText.includes("<THINK>") && aiStatus !== 'planning') setAiStatus("planning");
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
            // === STEP 1: USER OPENROUTER ===
            if (userOpenRouter && !isGuest) {
                effectiveApiKey = userOpenRouter; 
                // Default to DeepSeek R1 via OpenRouter as requested if not specified
                if (!modelOverride) modelOverride = 'deepseek/deepseek-r1-0528:free'; 
            } 
            
            // === STEP 2: ADMIN CREDITS (DeepSeek) ===
            else if (canUseAdminCredits && !effectiveApiKey && supabase) {
                 const settings = await getAppSettings(supabase);
                 // Fallback order: Admin OpenAI -> Admin DeepSeek
                 const adminKey = settings.admin_openai_key || settings.admin_deepseek_key;
                 const costPerMsg = settings.cost_per_interaction || 0.5;

                 if (adminKey) {
                    // Deduct Credits
                    await deductUserCredits(supabase, user.id, costPerMsg);
                    updateUserProfile({ credits: (profile?.credits || 0) - costPerMsg }, false);
                    effectiveApiKey = adminKey;
                    useAdminCredits = true;
                    // Force requested models if falling back to admin
                    if (!modelOverride) {
                         if (settings.admin_openai_key) modelOverride = settings.admin_system_model || 'gpt-4o';
                         else if (settings.admin_deepseek_key) modelOverride = 'deepseek/deepseek-r1-0528:free';
                         else modelOverride = 'gemini-2.0-flash-lite-preview-02-05';
                    }
                 }
            }

            // === STEP 3: USER GEMINI (Final Fallback) ===
            if (!effectiveApiKey && geminiApiKey) {
                effectiveApiKey = geminiApiKey;
                // Force correct Flash Lite ID if not overridden
                if (!modelOverride) modelOverride = 'gemini-2.0-flash-lite-preview-02-05';
            }

            if (!effectiveApiKey && !isGuest) {
                 throw new Error("No available AI providers. Please add an API key or buy credits.");
            }

            // Execute Standard Agent with effective key
            let historySnapshot = messages;
            if (historySnapshot.length === 0) {
                 if (isGuest) historySnapshot = await localChatService.getMessages(chatToUse.id);
                 else if (supabase) historySnapshot = await getMessages(supabase, chatToUse.id);
            }
            const cleanHistory = historySnapshot.filter(m => !m.id.startsWith('temp-') && !m.id.startsWith('ai-temp-'));

            let loadedCustomAgent = null;
            if (chatToUse.agent_id) {
                loadedCustomAgent = await customAgentService.getAgent(chatToUse.agent_id);
            }
            
            // Standard Run Agent
            const agentResult = await runAgent({
                prompt: text, 
                files: [], 
                apiKey: effectiveApiKey || '', 
                // Ensure model is set correctly even if override was null
                model: modelOverride || profile?.preferred_chat_model || 'gemini-2.0-flash-lite-preview-02-05',
                project: chatToUse.projects || { id: 'no-project', name: 'General', platform: 'Web App', project_type: 'conversation' } as Project, 
                chat: chatToUse, 
                user: user || { id: 'guest', aud: 'guest' } as any, 
                profile: profile || null, 
                supabase: supabase as any, 
                history: cleanHistory, 
                onStreamChunk, 
                onFileUpdate: (path, content, isComplete) => {
                    if (isMountedRef.current) setAiStatus("fixing");
                    if (onProjectFileUpdate) onProjectFileUpdate(path, content, isComplete);
                },
                workspaceMode,
                thinkingMode: 'fast', // Defaulting for simplicity in this fix
                signal: abortController.signal,
                customAgent: loadedCustomAgent
            });

            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            updateUI(); 

            // Save Agent Messages
            const savedAiMessages: Message[] = [];
            const finalTextBuffer = streamBufferRef.current;
            
            // Fallback content if agent returned nothing but streamed text
            if (agentResult.messages.length === 0 && finalTextBuffer) {
                 agentResult.messages.push({
                    project_id: chatToUse.project_id,
                    chat_id: chatToUse.id,
                    sender: 'ai',
                    text: finalTextBuffer
                 });
            }

            for (const messageContent of agentResult.messages) {
                const aiData = { 
                    ...messageContent, 
                    text: messageContent.text || finalTextBuffer || "...", 
                    chat_id: chatToUse.id,
                    project_id: chatToUse.project_id,
                    model: messageContent.model || (useAdminCredits ? 'admin-managed' : 'gemini-flash-lite-latest'),
                    status: 'sent' as const
                };
                let savedAiMessage: Message;
                try {
                    if (isGuest) savedAiMessage = await localChatService.addMessage(aiData);
                    else if (supabase) savedAiMessage = await addMessage(supabase, aiData);
                    else throw new Error("No backend");
                    
                    processedMessageIds.current.add(savedAiMessage.id);
                    savedAiMessages.push(savedAiMessage);
                } catch(e) {
                    savedAiMessages.push({ ...aiData, id: tempAiId, status: 'error', created_at: new Date().toISOString() });
                }
            }

            // Merge final AI messages, replacing temp one
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== tempAiId);
                return [...filtered, ...savedAiMessages];
            });

            if (agentResult.updatedPlan && !isGuest && supabase) {
                await updateMessagePlan(supabase, agentResult.updatedPlan.messageId, agentResult.updatedPlan.plan);
            }
            
            setAiStatus('idle');
            return agentResult;

        } catch (e: any) {
            console.error("Message process failed:", e);
            if (e.name !== 'AbortError') {
                setAiStatus('error');
                addToast(e.message || "Failed to generate response.", "error");
            }
            setMessages(prev => prev.map(m => m.id === tempUserMsgId || m.id.startsWith('ai-temp') ? { ...m, status: 'error', text: m.text || e.message } : m));
            return { messages: [] };
        } finally {
            isSendingRef.current = false;
            setIsSending(false);
            if (isMountedRef.current && activeChatIdRef.current === chatToUse.id) {
                 setIsLoading(false);
            }
        }
    }, [activeChat, supabase, user, geminiApiKey, addToast, profile, workspaceMode, recoverStuckEmotions, handleUpdateChat, updateUserProfile]); 

    return {
        allChats, setAllChats, activeChat, setActiveChat, messages, setMessages,
        isLoading, isSending, isCreatingChat, setIsCreatingChat, activeProject,
        handleUpdateChat, handleSelectChat, handleDeleteChat, handleSendMessage, handleStopGeneration,
        aiStatus, activityLog, currentEmotion, modelLoadingProgress, resyncMessage
    };
};
