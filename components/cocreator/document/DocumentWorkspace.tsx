
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Split from 'react-split-grid';
import { IdeWorkspaceProps } from '../shared/IdeWorkspace';
import { ChatView } from '../../chat/ChatView';
import { useWindowSize } from '../../../hooks/useWindowSize';
import { 
    ListBulletIcon, QueueListIcon, LinkIcon,
    BoldIcon, ItalicIcon, PencilSquareIcon, 
    Cog6ToothIcon, EyeIcon, PencilIcon,
    SparklesIcon, ArrowPathIcon, SwatchIcon,
    Bars3CenterLeftIcon, Bars3Icon, Bars3BottomRightIcon, Bars3BottomLeftIcon,
    ArrowsUpDownIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import { useAuth } from '../../../contexts/AuthContext';

// --- Types & Interfaces ---
interface DocumentSettings {
    fontSize: 'sm' | 'base' | 'lg' | 'xl';
    fontFamily: 'sans' | 'serif' | 'mono';
    lineHeight: 'tight' | 'normal' | 'relaxed' | 'loose';
    paragraphSpacing: 'normal' | 'wide';
    textAlign: 'left' | 'justify';
    pageColorOverride?: string;
    backgroundImage?: string;
}

const ToolbarButton: React.FC<{ 
    icon: React.ReactNode; 
    label: string; 
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
}> = ({ icon, label, onClick, active, disabled }) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        className={`p-1.5 rounded transition-colors ${
            active 
            ? 'bg-primary-start text-white shadow-sm' 
            : disabled 
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
        }`}
        title={label}
    >
        {icon}
    </button>
);

const ColorPicker: React.FC<{ 
    value: string; 
    onChange: (c: string) => void;
    label: string;
}> = ({ value, onChange, label }) => (
    <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">{label}</label>
        <div className="relative w-6 h-6 rounded-full overflow-hidden border border-white/20 cursor-pointer hover:scale-110 transition-transform">
            <input 
                type="color" 
                value={value} 
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-[-50%] w-[200%] h-[200%] p-0 cursor-pointer"
            />
        </div>
    </div>
);

const IconWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-5 h-5 flex items-center justify-center">{children}</div>
);

// --- Settings Modal ---
const DocumentSettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    settings: DocumentSettings;
    onUpdate: (s: Partial<DocumentSettings>) => void;
}> = ({ isOpen, onClose, settings, onUpdate }) => {
    if (!isOpen) return null;
    return (
        <div className="absolute top-12 right-4 z-50 bg-bg-secondary border border-white/10 rounded-xl shadow-2xl p-4 w-72 backdrop-blur-xl">
            <h3 className="text-sm font-bold text-white mb-3">Document Appearance</h3>
            <div className="space-y-4">
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Font</label>
                    <div className="flex bg-black/30 rounded p-1 border border-white/5">
                        <button onClick={() => onUpdate({ fontFamily: 'sans' })} className={`flex-1 text-xs py-1 rounded ${settings.fontFamily === 'sans' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Sans</button>
                        <button onClick={() => onUpdate({ fontFamily: 'serif' })} className={`flex-1 text-xs py-1 rounded ${settings.fontFamily === 'serif' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Serif</button>
                        <button onClick={() => onUpdate({ fontFamily: 'mono' })} className={`flex-1 text-xs py-1 rounded ${settings.fontFamily === 'mono' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Mono</button>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Size</label>
                    <div className="flex bg-black/30 rounded p-1 border border-white/5">
                        <button onClick={() => onUpdate({ fontSize: 'sm' })} className={`flex-1 text-xs py-1 rounded ${settings.fontSize === 'sm' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>S</button>
                        <button onClick={() => onUpdate({ fontSize: 'base' })} className={`flex-1 text-xs py-1 rounded ${settings.fontSize === 'base' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>M</button>
                        <button onClick={() => onUpdate({ fontSize: 'lg' })} className={`flex-1 text-xs py-1 rounded ${settings.fontSize === 'lg' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>L</button>
                        <button onClick={() => onUpdate({ fontSize: 'xl' })} className={`flex-1 text-xs py-1 rounded ${settings.fontSize === 'xl' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>XL</button>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Line Height</label>
                    <div className="flex bg-black/30 rounded p-1 border border-white/5">
                         <button onClick={() => onUpdate({ lineHeight: 'tight' })} className={`flex-1 text-xs py-1 rounded ${settings.lineHeight === 'tight' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Tight</button>
                         <button onClick={() => onUpdate({ lineHeight: 'normal' })} className={`flex-1 text-xs py-1 rounded ${settings.lineHeight === 'normal' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Normal</button>
                         <button onClick={() => onUpdate({ lineHeight: 'loose' })} className={`flex-1 text-xs py-1 rounded ${settings.lineHeight === 'loose' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Loose</button>
                    </div>
                </div>
                 <div className="space-y-2 pt-2 border-t border-white/10">
                    <ColorPicker label="Paper Color" value={settings.pageColorOverride || '#ffffff'} onChange={(c) => onUpdate({ pageColorOverride: c })} />
                </div>
                 <div>
                    <label className="text-xs text-gray-400 block mb-1">Background Image</label>
                    <input 
                        type="text" 
                        value={settings.backgroundImage || ''} 
                        onChange={(e) => onUpdate({ backgroundImage: e.target.value })}
                        placeholder="https://..."
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-start"
                    />
                </div>
            </div>
            <button onClick={onClose} className="mt-4 w-full py-1.5 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300">Close</button>
        </div>
    );
}

const Ruler: React.FC = () => {
    return (
        <div className="w-[210mm] h-6 bg-[#e5e5e5] border-b border-gray-300 flex text-[10px] text-gray-500 select-none overflow-hidden relative mx-auto mb-6 shadow-sm">
            {Array.from({ length: 21 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-gray-400 h-full relative group">
                    {i > 0 && <span className="absolute bottom-0 left-[-3px]">{i}</span>}
                    <div className="absolute top-0 left-1/2 h-1.5 w-px bg-gray-400"></div>
                    <div className="absolute top-0 left-1/4 h-1 w-px bg-gray-300"></div>
                    <div className="absolute top-0 left-3/4 h-1 w-px bg-gray-300"></div>
                </div>
            ))}
        </div>
    )
}

// --- Main Editor Component ---
const DocumentEditor: React.FC<{
    project: IdeWorkspaceProps['project'];
    onActiveProjectUpdate: IdeWorkspaceProps['onActiveProjectUpdate'];
    onSmartEdit: (selection: string, instruction: string) => void;
    writingFile?: string | null;
}> = ({ project, onActiveProjectUpdate, onSmartEdit, writingFile }) => {
    
    const { profile } = useAuth();
    const [content, setContent] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [viewMode, setViewMode] = useState<'edit' | 'read'>('edit');
    const [showSettings, setShowSettings] = useState(false);
    
    // Persistent Settings
    const [settings, setSettings] = useLocalStorage<DocumentSettings>('doc_settings', {
        fontFamily: 'serif',
        fontSize: 'base',
        lineHeight: 'normal',
        paragraphSpacing: 'normal',
        textAlign: 'left'
    });

    // Magic Edit State
    const [showMagicBtn, setShowMagicBtn] = useState(false);
    const [selectionRange, setSelectionRange] = useState<{start: number, end: number} | null>(null);
    const [selectionText, setSelectionText] = useState('');
    const [isMagicInputOpen, setIsMagicInputOpen] = useState(false);
    const [magicInstruction, setMagicInstruction] = useState('');

    // Determine Paper Color based on App Theme
    const paperColor = useMemo(() => {
        if (settings.pageColorOverride) return settings.pageColorOverride;
        const theme = profile?.ui_theme || 'dark';
        switch (theme) {
            case 'light': return '#ffffff';
            case 'gray': return '#f3f4f6';
            case 'dark': 
            default: return '#2d2d2d';
        }
    }, [profile?.ui_theme, settings.pageColorOverride]);

    const textColor = useMemo(() => {
        const theme = profile?.ui_theme || 'dark';
        if (theme === 'light' || theme === 'gray') return '#000000';
        return '#e5e5e5';
    }, [profile?.ui_theme]);

    const documentFile = useMemo(() => {
        if (!project.files) return null;
        const filePaths = Object.keys(project.files);
        return filePaths.find(p => p.endsWith('.md')) || filePaths.find(p => p.endsWith('.txt')) || filePaths[0] || 'document.md';
    }, [project.files]);

    useEffect(() => {
        const fileContent = documentFile ? project.files?.[documentFile]?.content || '' : '';
        // If AI is actively writing to this file, we sync instantly (no heuristic check)
        const isAIWriting = writingFile === documentFile;
        
        // RELAXED CHECK: If contents differ at all, update. The user typing will override this due to state, 
        // but if AI updates, it comes via project.files.
        if (isAIWriting || fileContent !== content) {
            setContent(fileContent);
        }
    }, [documentFile, project.files, writingFile]); 

    useEffect(() => {
        const handler = setTimeout(() => {
            if (documentFile && onActiveProjectUpdate && content !== project.files?.[documentFile]?.content) {
                 const updatedFiles = {
                    ...(project.files || {}),
                    [documentFile]: { content: content }
                };
                onActiveProjectUpdate({ files: updatedFiles });
            }
        }, 1500); 
        return () => clearTimeout(handler);
    }, [content, documentFile, project.files, onActiveProjectUpdate]);

    const handleSelection = () => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        
        if (start !== end) {
            const selectedText = textareaRef.current.value.substring(start, end);
            setSelectionText(selectedText);
            setSelectionRange({ start, end });
            setShowMagicBtn(true);
        } else {
            setShowMagicBtn(false);
            setSelectionRange(null);
            setSelectionText('');
        }
    };

    const applyHtmlFormatting = (tag: string, style?: string) => {
        if (!textareaRef.current || !selectionRange) return;
        const start = selectionRange.start;
        const end = selectionRange.end;
        const selectedText = textareaRef.current.value.substring(start, end);
        
        let replacement = '';
        if (style) {
            replacement = `<${tag} style="${style}">${selectedText}</${tag}>`;
        } else {
            if (tag === 'b') replacement = `**${selectedText}**`;
            else if (tag === 'i') replacement = `*${selectedText}*`;
            else replacement = `<${tag}>${selectedText}</${tag}>`;
        }

        const newContent = content.substring(0, start) + replacement + content.substring(end);
        setContent(newContent);
        setShowMagicBtn(false);
        setSelectionRange(null);
    };

    // Styling Maps
    const fontFamilies = {
        sans: 'font-sans',
        serif: 'font-serif',
        mono: 'font-mono'
    };
    const fontSizes = {
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl'
    };
    const lineHeights = {
        tight: 'leading-tight',
        normal: 'leading-normal',
        relaxed: 'leading-relaxed',
        loose: 'leading-loose'
    };

    // Dynamic Pagination Logic
    const getPageCapacity = (settings: DocumentSettings): number => {
        // Increased base capacity significantly to fill A4 pages
        const baseCapacity = 4200; 
        
        // Less aggressive scaling for fonts
        const fontScale = { sm: 1.2, base: 1.0, lg: 0.85, xl: 0.7 };
        const lineScale = { tight: 1.1, normal: 1.0, relaxed: 0.9, loose: 0.8 };
        const spacingScale = { normal: 1.0, wide: 0.95 };

        const capacity = baseCapacity * 
            fontScale[settings.fontSize] * 
            lineScale[settings.lineHeight] * 
            spacingScale[settings.paragraphSpacing];
            
        return Math.floor(capacity);
    };

    const renderPaginatedContent = (text: string) => {
        const charLimit = getPageCapacity(settings);
        const chunks = [];
        
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= charLimit) {
                chunks.push(remaining);
                break;
            }

            // Heuristic: Try to find the best break point that fills the page
            let bestBreak = -1;
            
            // 1. Paragraph break (ideal) - Look in the last 25% of the page
            const lastPara = remaining.lastIndexOf('\n\n', charLimit);
            if (lastPara > charLimit * 0.75) {
                bestBreak = lastPara;
            }
            
            // 2. Line break - Look in the last 15%
            if (bestBreak === -1) {
                const lastLine = remaining.lastIndexOf('\n', charLimit);
                if (lastLine > charLimit * 0.85) {
                    bestBreak = lastLine;
                }
            }

            // 3. Sentence break - Look in the last 10%
            if (bestBreak === -1) {
                const lastSentence = remaining.lastIndexOf('. ', charLimit);
                if (lastSentence > charLimit * 0.9) {
                     bestBreak = lastSentence + 1; // Include the period
                }
            }
            
            // 4. Word break (fallback) - Look in the last 5%
            if (bestBreak === -1) {
                const lastSpace = remaining.lastIndexOf(' ', charLimit);
                // Only split if it's somewhat close to the end, otherwise we might cut too early
                // If the word is massive (no space in last 5%), we might just have to cut
                if (lastSpace > charLimit * 0.8) { 
                    bestBreak = lastSpace;
                } else {
                     // If we can't find a space near the end, find ANY space within limit
                     // to avoid breaking a word mid-string if possible
                     bestBreak = remaining.lastIndexOf(' ', charLimit);
                }
            }
            
            // 5. Hard break (absolute fallback)
            if (bestBreak === -1) {
                bestBreak = charLimit;
            }
            
            chunks.push(remaining.substring(0, bestBreak));
            remaining = remaining.substring(bestBreak).trimStart();
        }
        
        return chunks.map((chunk, i) => (
            <div 
                key={i}
                className={`mb-12 mx-auto shadow-2xl overflow-hidden relative ${fontFamilies[settings.fontFamily]} ${fontSizes[settings.fontSize]} ${lineHeights[settings.lineHeight]}`}
                style={{ 
                    backgroundColor: paperColor, 
                    color: textColor,
                    width: '210mm',
                    minHeight: '297mm',
                    // Increased padding to prevent clipping and give professional look
                    padding: '80px 64px', // py-20 px-16 equiv
                    backgroundImage: settings.backgroundImage ? `url(${settings.backgroundImage})` : 'none',
                    backgroundSize: 'cover'
                }}
            >
                <div 
                    className="prose max-w-none prose-p:my-2 prose-headings:my-4" 
                    style={{ color: textColor }}
                    dangerouslySetInnerHTML={{ 
                        __html: chunk
                            // Handle block elements first before converting newlines to breaks
                            .replace(/^#### (.*$)/gm, '<h4 class="text-base font-bold my-2 uppercase tracking-wide">$1</h4>')
                            .replace(/^### (.*$)/gm, '<h3 class="text-lg font-bold my-2">$1</h3>')
                            .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold my-3">$1</h2>')
                            .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold my-4">$1</h1>')
                            .replace(/^---$/gm, '<hr class="my-4 border-gray-500/30"/>')
                            .replace(/^[-*] (.*$)/gm, '<div class="flex gap-2 ml-4 mb-1"><span class="opacity-60">•</span><span>$1</span></div>')
                            // Inline formatting
                            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                            .replace(/\*(.*?)\*/g, '<i>$1</i>')
                            // Finally convert newlines to breaks
                            .replace(/\n/g, '<br/>')
                    }}
                />
                
                <div className="absolute bottom-4 right-8 text-xs opacity-50 select-none">
                    Page {i + 1}
                </div>
            </div>
        ));
    };

    const handleMagicEditSubmit = () => {
        // Mode 1: Targeted Selection
        if (selectionRange && selectionText) {
            onSmartEdit(selectionText, magicInstruction); 
        } 
        // Mode 2: Global / Autonomous
        else {
             // Passing empty selection signals to the wrapper to use global mode
             onSmartEdit("", magicInstruction); 
        }
        
        setIsMagicInputOpen(false);
        setShowMagicBtn(false);
        setSelectionRange(null);
        setSelectionText('');
        setMagicInstruction('');
    };
    
    // Toggle for the toolbar button
    const openMagicEditGlobal = () => {
        setSelectionRange(null);
        setSelectionText('');
        setIsMagicInputOpen(true);
    }

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] relative">
            {/* Top Bar */}
            <div className="flex items-center justify-between p-2 border-b border-white/10 bg-[#252526]">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                    <div className="flex bg-black/20 p-0.5 rounded border border-white/5 mr-2 flex-shrink-0">
                        <button onClick={() => setViewMode('edit')} className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'edit' ? 'bg-primary-start text-white' : 'text-gray-400 hover:text-white'}`}>Edit</button>
                        <button onClick={() => setViewMode('read')} className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'read' ? 'bg-primary-start text-white' : 'text-gray-400 hover:text-white'}`}>Preview</button>
                    </div>

                    <div className="h-4 w-px bg-white/10 mx-1 flex-shrink-0" />

                    <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Magic Edit Button in Toolbar */}
                         <button 
                            onClick={openMagicEditGlobal}
                            className="flex items-center gap-1 px-2 py-1.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded text-xs font-medium text-purple-200 transition-all mr-2"
                            title="Magic Edit (AI)"
                         >
                             <SparklesIcon className="w-4 h-4" />
                             <span className="hidden md:inline">Magic Edit</span>
                         </button>

                        <div className="w-px h-3 bg-white/10 mx-1" />

                        <ToolbarButton icon={<IconWrapper><BoldIcon className="w-4 h-4"/></IconWrapper>} label="Bold" onClick={() => applyHtmlFormatting('b')} disabled={viewMode === 'read'} />
                        <ToolbarButton icon={<IconWrapper><ItalicIcon className="w-4 h-4"/></IconWrapper>} label="Italic" onClick={() => applyHtmlFormatting('i')} disabled={viewMode === 'read'} />
                        <div className="w-px h-3 bg-white/10 mx-1" />
                        <ToolbarButton icon={<IconWrapper><Bars3BottomLeftIcon className="w-4 h-4"/></IconWrapper>} label="Align Left" onClick={() => applyHtmlFormatting('div', 'text-align: left')} disabled={viewMode === 'read'} />
                        <ToolbarButton icon={<IconWrapper><Bars3Icon className="w-4 h-4"/></IconWrapper>} label="Align Center" onClick={() => applyHtmlFormatting('div', 'text-align: center')} disabled={viewMode === 'read'} />
                        <div className="w-px h-3 bg-white/10 mx-1" />
                        
                        <div className="flex items-center gap-1">
                            <button onClick={() => applyHtmlFormatting('span', 'color: #ef4444')} className="w-4 h-4 rounded-full bg-red-500 hover:scale-110 transition-transform" title="Red Text"></button>
                            <button onClick={() => applyHtmlFormatting('span', 'color: #3b82f6')} className="w-4 h-4 rounded-full bg-blue-500 hover:scale-110 transition-transform" title="Blue Text"></button>
                            <button onClick={() => applyHtmlFormatting('span', 'background-color: #fef08a; color: black')} className="w-4 h-4 rounded-full bg-yellow-200 border border-yellow-400 hover:scale-110 transition-transform" title="Highlight"></button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                     <div className="text-xs text-gray-500 mr-2 bg-black/20 px-2 py-1 rounded">
                         {Math.ceil(content.length / getPageCapacity(settings))} Pages
                     </div>
                    <ToolbarButton icon={<IconWrapper><Cog6ToothIcon className="w-4 h-4"/></IconWrapper>} label="Appearance" onClick={() => setShowSettings(!showSettings)} active={showSettings} />
                </div>
            </div>

            <DocumentSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={settings} onUpdate={(s) => setSettings(prev => ({ ...prev, ...s }))} />

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto bg-[#1a1a1a] relative flex flex-col items-center custom-scrollbar">
                 {viewMode === 'edit' && <div className="w-full sticky top-0 z-10 pt-2 bg-[#1a1a1a]"><Ruler /></div>}
                 
                {viewMode === 'edit' ? (
                    <div className="min-h-full py-8 flex justify-center cursor-text w-full" onClick={() => textareaRef.current?.focus()}>
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onSelect={handleSelection}
                            className={`w-[210mm] min-h-[297mm] p-16 shadow-2xl resize-none focus:outline-none focus:ring-1 focus:ring-primary-start/50 leading-relaxed ${fontFamilies[settings.fontFamily]} ${fontSizes[settings.fontSize]} ${lineHeights[settings.lineHeight]}`}
                            style={{ 
                                backgroundColor: paperColor, 
                                color: textColor,
                                border: 'none',
                                backgroundImage: settings.backgroundImage ? `url(${settings.backgroundImage})` : 'none',
                                backgroundSize: 'cover',
                                marginBottom: '4rem',
                                marginTop: '1rem'
                            }}
                            placeholder="Start writing..."
                            spellCheck={false}
                        />
                    </div>
                ) : (
                    <div className="min-h-full py-12 flex flex-col items-center gap-12 w-full">
                        {renderPaginatedContent(content)}
                    </div>
                )}

                {/* Magic Edit Button (Floating) - Only shows when selection exists */}
                <AnimatePresence>
                    {showMagicBtn && viewMode === 'edit' && !isMagicInputOpen && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="absolute top-20 right-8 z-40"
                        >
                            <button onClick={() => setIsMagicInputOpen(true)} className="flex items-center gap-2 bg-primary-start text-white px-3 py-1.5 rounded-full shadow-lg hover:scale-105 transition-transform">
                                <SparklesIcon className="w-4 h-4" />
                                <span className="text-xs font-bold">Magic Edit</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Magic Edit Modal */}
                <AnimatePresence>
                    {isMagicInputOpen && (
                         <div className="absolute top-20 right-8 z-50">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-bg-secondary border border-primary-start rounded-xl p-3 shadow-2xl w-72"
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs text-gray-400 font-semibold flex items-center gap-2">
                                        <SparklesIcon className="w-3 h-3 text-primary-start"/>
                                        {selectionText ? 'Edit Selection' : 'Autonomous Edit'}
                                    </p>
                                    {!selectionText && <span className="text-[10px] bg-white/10 px-1.5 rounded text-gray-400">Full Doc</span>}
                                </div>
                                
                                {selectionText && (
                                    <div className="mb-2 p-1 bg-black/20 rounded border border-white/5 max-h-16 overflow-hidden">
                                        <p className="text-[10px] text-gray-500 italic truncate">{selectionText}</p>
                                    </div>
                                )}
                                
                                <textarea
                                    value={magicInstruction}
                                    onChange={(e) => setMagicInstruction(e.target.value)}
                                    placeholder={selectionText ? "e.g. Make this red, rewrite formally..." : "e.g. Fix grammar, add a summary to the end..."}
                                    className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-white mb-2 h-20 resize-none focus:outline-none focus:border-primary-start"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setIsMagicInputOpen(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                                    <button onClick={handleMagicEditSubmit} className="px-3 py-1 bg-primary-start text-white text-xs rounded hover:bg-primary-start/80">
                                        {selectionText ? 'Edit Selection' : 'Auto Edit'}
                                    </button>
                                </div>
                            </motion.div>
                         </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export const DocumentWorkspace: React.FC<IdeWorkspaceProps> = (props) => {
    const { width } = useWindowSize();
    const isMobile = width ? width < 1024 : false;

    if (isMobile) {
        return <ChatView {...props} />;
    }

    const handleSmartEdit = (selection: string, instruction: string) => {
        let prompt;
        if (selection) {
             prompt = `[SMART EDIT REQUEST]\nInstruction: ${instruction}\nText to Modify: "${selection}"\n\nPlease provide ONLY the rewritten text for that section.`;
        } else {
             // Global/Autonomous Mode
             prompt = `[SMART EDIT REQUEST]\nInstruction: ${instruction}\nTarget: ENTIRE DOCUMENT\n\nPlease analyze the document in the file context and apply the requested changes. You may rewrite the whole file or use [PATCH] tags if you are confident.`;
        }
        props.onSendMessage(prompt);
    };

    return (
        <div className="h-full w-full bg-transparent text-white">
            <Split gridTemplateColumns="minmax(350px, 1fr) 8px 2fr" minSize={300} cursor="col-resize">
                {(split: any) => (
                    <div className="grid h-full w-full bg-bg-primary" {...split.getGridProps()}>
                        <div className="h-full bg-bg-secondary overflow-hidden border-r border-border-color">
                            <ChatView {...props} />
                        </div>
                        <div className="h-full bg-bg-tertiary cursor-col-resize hover:bg-primary-start/50 transition-colors" {...split.getGutterProps('column', 1)} />
                        <div className="h-full overflow-hidden">
                           <DocumentEditor 
                                project={props.project} 
                                onActiveProjectUpdate={props.onActiveProjectUpdate} 
                                onSmartEdit={handleSmartEdit}
                                writingFile={props.writingFile}
                           />
                        </div>
                    </div>
                )}
            </Split>
        </div>
    );
};
