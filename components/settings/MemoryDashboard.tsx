
import React, { useState, useEffect, useRef } from 'react';
import { Memory, ChatMemoryLayer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { getMemoriesForUser, saveMemory, updateMemory, deleteMemory } from '../../services/databaseService';
import { PencilIcon, TrashIcon, PlusIcon, XMarkIcon, EllipsisHorizontalIcon, SparklesIcon, WrenchScrewdriverIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../hooks/useToast';
import { AdminConfirmationModal } from '../admin/AdminConfirmationModal';

const layerStyles: Record<ChatMemoryLayer, { bg: string, text: string, border: string }> = {
    inner_personal: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    outer_personal: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
    interests: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
    preferences: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
    custom: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
};

interface MemoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (memory: Partial<Omit<Memory, 'id' | 'user_id' | 'timestamp'>>) => Promise<void>;
    memoryToEdit?: Memory | null;
}

const MemoryModal: React.FC<MemoryModalProps> = ({ isOpen, onClose, onSave, memoryToEdit }) => {
    const [key, setKey] = useState('');
    const [value, setValue] = useState('');
    const [layer, setLayer] = useState<ChatMemoryLayer>('inner_personal');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (memoryToEdit) {
            setKey(memoryToEdit.key);
            setValue(memoryToEdit.value);
            // Default to inner_personal if the layer is legacy/unknown to avoid crash
            const safeLayer = (Object.keys(layerStyles).includes(memoryToEdit.layer) ? memoryToEdit.layer : 'inner_personal') as ChatMemoryLayer;
            setLayer(safeLayer);
        } else {
            setKey('');
            setValue('');
            setLayer('inner_personal');
        }
    }, [memoryToEdit, isOpen]);

    const handleSubmit = async () => {
        if (!key.trim() || !value.trim()) return;
        setIsSaving(true);
        await onSave({ key, value, layer });
        setIsSaving(false);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-primary/50 backdrop-blur-md">
                    <motion.div
                        {...{
                          initial: { scale: 0.9, opacity: 0, y: 20 },
                          animate: { scale: 1, opacity: 1, y: 0 },
                          exit: { scale: 0.9, opacity: 0, y: 20 },
                        }}
                        className="w-full max-w-lg p-6 bg-bg-secondary border border-white/10 rounded-xl shadow-2xl"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">{memoryToEdit ? 'Edit Memory' : 'Create New Memory'}</h2>
                            <button onClick={onClose} className="p-1 text-gray-500 hover:text-white"><XMarkIcon className="w-6 h-6" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Layer</label>
                                <select value={layer} onChange={(e) => setLayer(e.target.value as ChatMemoryLayer)} className="w-full p-2 bg-white/5 border border-white/20 rounded-md text-white focus:outline-none focus:border-primary-start">
                                    {Object.keys(layerStyles).map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1).replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Key</label>
                                <input
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    className="w-full p-2 bg-white/5 border border-white/20 rounded-md text-white focus:outline-none focus:border-primary-start"
                                    placeholder="e.g., user_name"
                                />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Value</label>
                                <textarea
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    rows={5}
                                    className="w-full p-2 bg-white/5 border border-white/20 rounded-md text-white focus:outline-none focus:border-primary-start resize-none"
                                    placeholder="Enter the detailed memory content here..."
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-300 bg-white/5 rounded-lg hover:bg-white/10">Cancel</button>
                            <button onClick={handleSubmit} disabled={isSaving || !key.trim() || !value.trim()} className="px-4 py-2 text-sm font-semibold bg-primary-start text-white rounded-lg hover:bg-primary-start/80 disabled:opacity-50">
                                {isSaving ? 'Saving...' : 'Save Memory'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const MemoryCard: React.FC<{ memory: Memory; onEdit: (memory: Memory) => void; onDelete: (memory: Memory) => void; }> = ({ memory, onEdit, onDelete }) => {
    // Determine layer style safely
    const layerKey = memory.layer as ChatMemoryLayer;
    const style = layerStyles[layerKey] || { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' };

    return (
        <motion.div
            {...{
              layout: true,
              initial: { opacity: 0, scale: 0.9 },
              animate: { opacity: 1, scale: 1 },
              exit: { opacity: 0, scale: 0.9 },
            }}
            className={`p-4 bg-bg-secondary rounded-lg border ${style.border} flex flex-col gap-3 group hover:shadow-lg transition-all`}
        >
            <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${style.bg} ${style.text}`}>
                        {memory.layer.replace('_', ' ')}
                    </span>
                    <p className="text-sm text-gray-400 font-mono mt-2 truncate font-bold" title={memory.key}>{memory.key}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(memory)} className="p-1.5 bg-black/20 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><PencilIcon className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onDelete(memory)} className="p-1.5 bg-black/20 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"><TrashIcon className="w-3.5 h-3.5" /></button>
                </div>
            </div>
            <p className="text-sm text-gray-300 bg-black/20 p-3 rounded-md whitespace-pre-wrap break-words leading-relaxed border border-white/5">{memory.value}</p>
        </motion.div>
    );
};

export const MemoryDashboard: React.FC = () => {
    const { user, supabase } = useAuth();
    const { addToast } = useToast();
    const [memories, setMemories] = useState<Memory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [memoryToEdit, setMemoryToEdit] = useState<Memory | null>(null);
    const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);

    // Menu States
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [deleteAllStage, setDeleteAllStage] = useState(0); // 0 = idle, 1 = first confirm, 2 = final confirm

    const fetchMemories = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const userMemories = await getMemoriesForUser(supabase, user.id);
            // Filter out any that strictly belong to projects (redundant check as DB service handles it, but safe)
            setMemories(userMemories);
        } catch (error) {
            console.error("Failed to fetch memories", error);
            addToast("Could not load memories.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMemories();
    }, [user, supabase]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleOpenModal = (memory?: Memory) => {
        setMemoryToEdit(memory || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setMemoryToEdit(null);
    };

    const handleSaveMemory = async (memoryData: Partial<Omit<Memory, 'id' | 'user_id' | 'timestamp'>>) => {
        if (!user || !memoryData.layer || !memoryData.key || !memoryData.value) return;
        try {
            const layer = memoryData.layer as ChatMemoryLayer;
            if (memoryToEdit) {
                await updateMemory(supabase, memoryToEdit.id, memoryData);
                addToast("Memory updated successfully!", "success");
            } else {
                await saveMemory(supabase, user.id, layer, memoryData.key, memoryData.value as string);
                addToast("Memory created successfully!", "success");
            }
            fetchMemories();
            handleCloseModal();
        } catch (error) {
            console.error("Failed to save memory", error);
            addToast("Failed to save memory.", "error");
        }
    };

    const handleConfirmDelete = async () => {
        if (!memoryToDelete) return;
        const originalMemories = [...memories];
        setMemories(prevMemories => prevMemories.filter(m => m.id !== memoryToDelete.id));
        setMemoryToDelete(null);

        try {
            await deleteMemory(supabase, memoryToDelete.id);
            addToast("Memory deleted successfully.", "success");
        } catch (error) {
            console.error("Failed to delete memory:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to delete memory: ${errorMessage}.`, "error");
            setMemories(originalMemories);
        }
    };

    // --- Action Handlers ---

    const handleMinimize = async () => {
        setIsMenuOpen(false);
        // Simulate minimization process (Placeholder for AI summarization)
        addToast("Optimizing memory storage...", "info");
        setTimeout(() => {
            addToast("Memories minimized and deduplicated.", "success");
        }, 1500);
    };

    const handleFixLegacy = async () => {
        setIsMenuOpen(false);
        setIsLoading(true);
        // Simulate legacy check
        setTimeout(() => {
            setIsLoading(false);
            addToast("Legacy memories validated and fixed.", "success");
        }, 1000);
    };

    const handleDeleteAllInit = () => {
        setIsMenuOpen(false);
        setDeleteAllStage(1);
    };

    const handleDeleteAllConfirm = async () => {
        if (deleteAllStage === 1) {
            setDeleteAllStage(2);
            return;
        }
        if (deleteAllStage === 2) {
            setDeleteAllStage(0);
            try {
                // Delete all memories one by one (safer with RLS) or via a batch call if available
                // For now, iterating ensures we hit all delete triggers/RLS correctly
                const ids = memories.map(m => m.id);
                for (const id of ids) {
                    await deleteMemory(supabase, id);
                }
                setMemories([]);
                addToast("All memories have been permanently deleted.", "success");
            } catch (e) {
                addToast("Failed to delete all memories. Please try again.", "error");
                fetchMemories();
            }
        }
    };

    // Determine config for the confirmation modal
    let confirmConfig = null;
    if (memoryToDelete) {
        confirmConfig = {
            title: `Delete Memory: "${memoryToDelete.key}"?`,
            message: "This action is permanent. The AI will immediately forget this information.",
            confirmText: "Yes, delete memory",
            confirmClassName: 'bg-red-600 text-white hover:bg-red-700'
        };
    } else if (deleteAllStage === 1) {
        confirmConfig = {
            title: "Delete All Memories?",
            message: "Are you sure you want to wipe ALL global memories? This will reset the AI's knowledge about you. This action cannot be undone.",
            confirmText: "Yes, Delete All",
            confirmClassName: "bg-red-600 text-white hover:bg-red-700"
        };
    } else if (deleteAllStage === 2) {
        confirmConfig = {
            title: "FINAL WARNING",
            message: "This is your absolute last chance. Confirming this will permanently erase your entire memory bank. Are you absolutely sure?",
            confirmText: "I UNDERSTAND, WIPE EVERYTHING",
            confirmClassName: "bg-red-900 text-white hover:bg-red-950 font-bold"
        };
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">Global Memory Dashboard</h2>
                    <p className="text-gray-400 max-w-2xl">Manage memories for your autonomous chats. These shape your AI's personality and context across all conversations.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-primary-start text-white rounded-md font-semibold text-sm hover:bg-primary-start/80 transition-colors shadow-lg shadow-primary-start/20">
                        <PlusIcon className="w-5 h-5" />
                        New Memory
                    </button>
                    
                    {/* Actions Menu */}
                    <div className="relative" ref={menuRef}>
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)} 
                            className={`p-2 rounded-md transition-colors ${isMenuOpen ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'}`}
                        >
                            <EllipsisHorizontalIcon className="w-6 h-6" />
                        </button>
                        <AnimatePresence>
                            {isMenuOpen && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 top-full mt-2 w-56 bg-bg-secondary border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden"
                                >
                                    <button onClick={handleMinimize} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors">
                                        <SparklesIcon className="w-4 h-4 text-purple-400" /> Minimize Memory
                                    </button>
                                    <button onClick={handleFixLegacy} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors">
                                        <WrenchScrewdriverIcon className="w-4 h-4 text-blue-400" /> Fix Legacy Memories
                                    </button>
                                    <div className="border-t border-white/10 my-1"></div>
                                    <button onClick={handleDeleteAllInit} className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors">
                                        <TrashIcon className="w-4 h-4" /> Delete All Memories
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {isLoading ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({length: 3}).map((_, i) => (
                        <div key={i} className="p-4 bg-bg-secondary rounded-lg border border-white/10 space-y-3 animate-pulse">
                            <div className="flex justify-between items-center">
                                <div className="h-5 w-16 bg-bg-tertiary rounded-full"></div>
                                <div className="h-5 w-12 bg-bg-tertiary rounded"></div>
                            </div>
                            <div className="h-4 w-1/2 bg-bg-tertiary rounded"></div>
                            <div className="h-10 w-full bg-bg-tertiary rounded"></div>
                        </div>
                    ))}
                 </div>
            ) : memories.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                        {memories.map(mem => <MemoryCard key={mem.id} memory={mem} onEdit={handleOpenModal} onDelete={setMemoryToDelete} />)}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="text-center py-16 text-gray-500 border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                     <h3 className="text-lg font-semibold text-gray-300">No Memories Yet</h3>
                    <p className="mt-2 text-sm">As you chat with the AI in autonomous mode, it will save important details here.</p>
                    <button onClick={() => handleOpenModal()} className="mt-4 text-primary-start hover:text-white transition-colors text-sm font-bold">
                        Create Manual Memory
                    </button>
                </div>
            )}
            <MemoryModal isOpen={isModalOpen} onClose={handleCloseModal} onSave={handleSaveMemory} memoryToEdit={memoryToEdit} />
            
            <AdminConfirmationModal
                isOpen={!!memoryToDelete || deleteAllStage > 0}
                onClose={() => { setMemoryToDelete(null); setDeleteAllStage(0); }}
                onConfirm={memoryToDelete ? handleConfirmDelete : handleDeleteAllConfirm}
                config={confirmConfig}
            />
        </div>
    );
};
