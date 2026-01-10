
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

    useEffect(() => {
        activeChatIdRef.current = activeChat?.id || null;
        if (!activeChat) {
            setMessages([]);
            return;
        }

        if (isSendingRef.current) return;

        const fetchMessages = async () => {
            setIsLoading(true);
            try {
                let msgs: Message[];
                if (isGuest) msgs = await localChatService.getMessages(activeChat.id);
                else if (supabase) msgs = await getMessages(supabase, activeChat.id);
                else msgs = [];
                
                if (isMountedRef.current && activeChatIdRef.current === activeChat.id) {
                    if (!isSendingRef.current) {
                        msgs.forEach(m => processedMessageIds.current.add(m.id));
                        setMessages(msgs);
                        setTimeout(() => recoverStuckEmotions(msgs), 500);
                    }
                }
            } catch (error) { addToast("Failed to load messages", "error"); }
            finally { if (isMountedRef.current && activeChatIdRef.current === activeChat.id) setIsLoading(false); }
        };
        fetchMessages();
    }, [activeChat?.id, isGuest, supabase, addToast, recoverStuckEmotions, isSending]);

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

    const processMemoryTags = async (text: string, projectId: string | null) => {
        if (isGuest || !supabase || !user) return [];
        const memoryMatch = text.match(/<MEMORY>([\s\S]*?)<\/MEMORY>/);
        const createdKeys: string[] = [];

        if (memoryMatch && memoryMatch[1]) {
            try {
                const jsonStr = memoryMatch[1].replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
                const memoryData = JSON.parse(jsonStr);
                const mems = memoryData.memories || (Array.isArray(memoryData) ? memoryData : [memoryData]);

                if (Array.isArray(mems)) {
                    for (const mem of mems) {
                        if (mem.layer && mem.key && mem.value) {
                            await saveMemory(supabase, user.id, mem.layer, mem.key, mem.value, projectId);
                            createdKeys.push(mem.key);
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to parse local memory tag:", e);
            }
        }
        return createdKeys;
    };
    
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

        // === CREDIT & ADMIN KEY LOGIC ===
        let effectiveApiKey = geminiApiKey;

        // Only run logic if not Guest and DB is connected
        if (!isGuest && supabase && user && profile && profile.membership !== 'admin') {
            try {
                // 1. Fetch App Settings for cost and Admin Key
                const settings = await getAppSettings(supabase);
                const costPerMsg = settings.cost_chat_gemini_flash_lite || 0.5; // Default 0.5 if not set
                const adminKey = settings.admin_gemini_key;

                // 2. If user has no personal key, we attempt to use Admin key via credits
                if (!effectiveApiKey) {
                    if (!adminKey) {
                        addToast("System Error: No API Key available (User or Admin).", "error");
                        return { messages: [] };
                    }
                    
                    // Check Balance
                    if ((profile.credits || 0) < costPerMsg) {
                        addToast(`Credits exhausted. Add your own API Key or wait for refill.`, "error");
                        return { messages: [] };
                    }

                    // Deduct Credits
                    await deductUserCredits(supabase, user.id, costPerMsg);
                    
                    // Sync local profile for UI update
                    updateUserProfile({ credits: (profile.credits || 0) - costPerMsg }, false);
                    
                    // Use Admin Key for this request
                    effectiveApiKey = adminKey;
                }
            } catch (err: any) {
                console.error("Credit/Key logic failed:", err);
                addToast("Failed to process credits or retrieve keys. Message not sent.", "error");
                return { messages: [] };
            }
        } else if (!isGuest && supabase && user && profile && profile.membership === 'admin') {
            // Admins get free access via their own key or system key
            if (!effectiveApiKey) {
                 const settings = await getAppSettings(supabase);
                 if (settings.admin_gemini_key) effectiveApiKey = settings.admin_gemini_key;
            }
        }

        // Final check: Do we have a key to use? (Guest mode handles this separately or requires key in some configs)
        if (!effectiveApiKey && !isGuest) {
             addToast("API Key missing. Please add one in settings.", "error");
             return { messages: [] };
        }

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

        setMessages(prev => [...prev, optimisticUserMessage]);
        
        isSendingRef.current = true;
        setIsSending(true);
        setAiStatus('thinking');
        setActivityLog([]);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const safetyTimeout = setTimeout(() => {
            if (isSendingRef.current && !abortController.signal.aborted) {
                console.warn("AI Response timed out.");
                abortController.abort();
                if (isMountedRef.current) {
                    setIsSending(false);
                    setAiStatus('error');
                    isSendingRef.current = false;
                }
                addToast("Response timed out.", "error");
            }
        }, 300000); 

        try {
            const attachments: Attachment[] = [];
            const agentFiles: File[] = [];

            if (files && files.length > 0) {
                for (const file of files) {
                    const mimeType = file.type;
                    const fileName = file.name.toLowerCase();
                    if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)) {
                         try {
                            const b64 = await fileToBase64(file);
                            attachments.push({ type: mimeType || 'image/jpeg', data: b64, name: file.name });
                            agentFiles.push(file);
                        } catch(e) {}
                    } else {
                         attachments.push({ type: 'application/octet-stream', data: '', name: file.name });
                         agentFiles.push(file);
                    }
                }
            }

            const msgPayload = {
                chat_id: chatToUse.id,
                project_id: chatToUse.project_id,
                sender: 'user' as const,
                text: text,
                emotionData: placeholderEmotion,
                status: 'sent' as const
            };
            
            if (attachments.length > 0) (msgPayload as any).image_base64 = JSON.stringify(attachments);

            let savedUserMsg: Message;
            try {
                if (isGuest) savedUserMsg = await localChatService.addMessage(msgPayload);
                else if (supabase) savedUserMsg = await addMessage(supabase, msgPayload);
                else throw new Error("No backend");
                
                processedMessageIds.current.add(savedUserMsg.id);
                setMessages(prev => prev.map(m => m.id === tempUserMsgId ? savedUserMsg : m));
            } catch (dbError) {
                console.error("Failed to save user message:", dbError);
                setMessages(prev => prev.map(m => m.id === tempUserMsgId ? { ...optimisticUserMessage, status: 'error' } : m));
                savedUserMsg = { ...optimisticUserMessage, id: tempUserMsgId }; 
            }

            if (text.trim()) {
                 generateChatTitle(text.trim(), "", effectiveApiKey).then(newTitle => {
                    if (newTitle && newTitle !== "New Chat" && chatToUse.name === NEW_CHAT_NAME) {
                        handleUpdateChat(chatToUse.id, { name: newTitle });
                    }
                }).catch(e => {});
            }

            (async () => {
                try {
                    if (!emotionEngine.isModelReady()) await emotionEngine.init();
                    const realEmotion = await emotionEngine.analyze(text);
                    setCurrentEmotion(realEmotion.dominant);
                    if (savedUserMsg.id && !savedUserMsg.id.startsWith('temp-') && !isGuest && supabase) {
                        await updateMessage(supabase, savedUserMsg.id, { emotionData: realEmotion });
                    }
                    setMessages(prev => prev.map(m => m.id === savedUserMsg.id || m.id === tempUserMsgId ? { ...m, emotionData: realEmotion } : m));
                } catch (e) { console.warn("Emotion analysis failed", e); }
            })();

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

            streamBufferRef.current = '';
            lastStreamUpdateRef.current = 0;

            const updateUI = () => {
                if (!isMountedRef.current || activeChatIdRef.current !== chatToUse.id) return;
                const currentText = streamBufferRef.current;
                
                setMessages(prev => prev.map(m => {
                    if (m.id === tempAiId) {
                        return { ...m, text: currentText };
                    }
                    return m;
                }));
                
                if (currentText.includes("<THINK>") && aiStatus !== 'planning') {
                    setAiStatus("planning");
                }
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

            const modes = ['instant', 'fast', 'think', 'deep'];
            const effectiveMode = modes.includes(modelOverride || '') ? (modelOverride as any) : 'fast'; // Default to fast (paid/credits)
            const actualModelOverride = modes.includes(modelOverride || '') ? undefined : modelOverride;
            
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

            const agentResult = await runAgent({
                prompt: text, 
                files: agentFiles, 
                apiKey: effectiveApiKey || '', // Use the resolved key (User or Admin)
                model: actualModelOverride || profile?.preferred_chat_model || 'gemini-flash-lite-latest',
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
                thinkingMode: effectiveMode,
                signal: abortController.signal,
                customAgent: loadedCustomAgent
            });

            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            updateUI(); 

            const savedAiMessages: Message[] = [];
            const finalTextBuffer = streamBufferRef.current;
            
            if (agentResult.messages.length === 0 && finalTextBuffer) {
                 agentResult.messages.push({
                    project_id: chatToUse.project_id,
                    chat_id: chatToUse.id,
                    sender: 'ai',
                    text: finalTextBuffer
                 });
            } else if (agentResult.messages.length === 0) {
                 agentResult.messages.push({
                    project_id: chatToUse.project_id,
                    chat_id: chatToUse.id,
                    sender: 'ai',
                    text: "Done."
                 });
            }

            let createdMemories: string[] = [];
            if (!isGuest && supabase) {
                const extractionProjectId = chatToUse.project_id || null;
                const extractionText = agentResult.messages.map(m => m.text).join('\n') || finalTextBuffer;
                try {
                     const keys = await processMemoryTags(extractionText, extractionProjectId);
                     if (keys && keys.length > 0) createdMemories = keys; 
                } catch(e) { console.warn("Local memory parsing failed", e); }
            }

            for (const messageContent of agentResult.messages) {
                const aiData = { 
                    ...messageContent, 
                    text: messageContent.text || finalTextBuffer || "...", 
                    chat_id: chatToUse.id,
                    project_id: chatToUse.project_id,
                    model: messageContent.model || profile?.preferred_chat_model || 'gemini-flash-lite-latest',
                    createdMemories,
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
                    console.error("Failed to save AI message", e);
                    savedAiMessages.push({ ...aiData, id: tempAiId, status: 'error', created_at: new Date().toISOString() });
                }
            }

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
                addToast("Failed to generate response.", "error");
            }
            setMessages(prev => prev.map(m => m.id === tempUserMsgId || m.id.startsWith('ai-temp') ? { ...m, status: 'error', text: m.text || "Error generating response." } : m));
            return { messages: [] };
        } finally {
            clearTimeout(safetyTimeout);
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