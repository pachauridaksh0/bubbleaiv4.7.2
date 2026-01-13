
import React, { useState, useEffect } from 'react';
import { IdeWorkspace, IdeWorkspaceProps } from '../shared/IdeWorkspace';
import { ChatView } from '../../chat/ChatView';
import { WebAppPreview } from '../../preview/WebAppPreview';
import { CodeBracketIcon, ChatBubbleLeftEllipsisIcon, ComputerDesktopIcon, CheckCircleIcon, ArrowDownTrayIcon, ShareIcon, EyeIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, Cog6ToothIcon, WrenchScrewdriverIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useWindowSize } from '../../../hooks/useWindowSize';
import { motion, AnimatePresence } from 'framer-motion';
import { useResizable } from '../../../hooks/useResizable';
import { useToast } from '../../../hooks/useToast';
import JSZip from 'jszip';
import { ProjectSettingsModal } from '../../../scripts/ProjectSettingsModal';

const TabButton: React.FC<{ isActive: boolean; onClick: () => void; children: React.ReactNode; }> = ({ isActive, onClick, children }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isActive
                ? 'text-white border-primary-start bg-white/5'
                : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
        }`}
    >
        {children}
    </button>
);

const BuildStatus: React.FC<{ loadingMessage: string; isBuilding: boolean; writingFile?: string | null }> = ({ loadingMessage, isBuilding, writingFile }) => {
    const [fileHistory, setFileHistory] = useState<{name: string, status: 'pending'|'done'}[]>([]);

    useEffect(() => {
        if (writingFile) {
            setFileHistory(prev => {
                if (prev.find(f => f.name === writingFile && f.status === 'pending')) return prev;
                const updated = prev.map(f => f.status === 'pending' ? { ...f, status: 'done' as const } : f);
                return [...updated, { name: writingFile, status: 'pending' }];
            });
        } else if (!isBuilding && fileHistory.some(f => f.status === 'pending')) {
             setFileHistory(prev => prev.map(f => ({ ...f, status: 'done' })));
             setTimeout(() => setFileHistory([]), 5000);
        }
    }, [writingFile, isBuilding]);

    useEffect(() => {
        if (isBuilding && !writingFile && fileHistory.length > 0 && fileHistory.every(f => f.status === 'done')) {
             setFileHistory([]);
        }
    }, [isBuilding]);

    if (!isBuilding && fileHistory.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                className="absolute bottom-6 right-6 z-[60] bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl ring-1 ring-white/5 w-72 overflow-hidden"
                style={{ maxHeight: '300px' }}
            >
                <div className="bg-white/5 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        {isBuilding ? <ArrowPathIcon className="w-3 h-3 animate-spin text-primary-start"/> : <CheckCircleIcon className="w-3 h-3 text-green-400"/>}
                        {isBuilding ? 'Building...' : 'Complete'}
                    </span>
                </div>
                <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: '200px' }}>
                    {fileHistory.length === 0 && isBuilding && (
                        <div className="text-xs text-gray-500 italic">Initializing build agent...</div>
                    )}
                    {fileHistory.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-xs">
                             {file.status === 'pending' ? (
                                 <div className="w-3 h-3 rounded-full border-2 border-primary-start border-t-transparent animate-spin flex-shrink-0"></div>
                             ) : (
                                 <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                             )}
                             <span className={`truncate ${file.status === 'pending' ? 'text-white font-medium' : 'text-gray-400'}`}>
                                 {file.name}
                             </span>
                        </div>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

const ShareModal: React.FC<{ isOpen: boolean; onClose: () => void; projectId: string; onCopyLink: () => void; isCopied: boolean }> = ({ isOpen, onClose, projectId, onCopyLink, isCopied }) => {
    if (!isOpen) return null;
    const shareUrl = `${window.location.origin}/share/${projectId}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-bg-secondary border border-white/10 rounded-xl shadow-2xl p-6 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-xl font-bold text-white mb-2">Publish & Share</h3>
                <p className="text-gray-400 text-sm mb-6">Share your creation with the world.</p>
                <div className="flex items-center gap-2 p-2 bg-black/30 border border-white/10 rounded-lg mb-6">
                    <input type="text" readOnly value={shareUrl} className="flex-1 bg-transparent text-sm text-gray-300 outline-none px-2 font-mono truncate" />
                    <button onClick={onCopyLink} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1">
                        {isCopied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400"/> : <ClipboardDocumentIcon className="w-4 h-4"/>}
                        {isCopied ? "Copied" : "Copy"}
                    </button>
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Close</button>
                    <a href={`/share/${projectId}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-primary-start hover:bg-primary-start/80 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2">
                        <EyeIcon className="w-4 h-4" /> Open Preview
                    </a>
                </div>
            </motion.div>
        </div>
    );
};

export const WebAppWorkspace: React.FC<IdeWorkspaceProps> = (props) => {
    const { width } = useWindowSize();
    const { addToast } = useToast();
    const isMobile = width ? width < 1024 : false; 
    const [mobileTab, setMobileTab] = useState<'chat' | 'code' | 'preview'>('preview');
    const [desktopTab, setDesktopTab] = useState<'code' | 'preview'>('preview');
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [detectedError, setDetectedError] = useState<string | null>(null);
    
    // Default chat width to a reasonable starting size to prevent layout collapse
    const { size: chatWidth, startResizing, isResizing } = useResizable({ 
        initialSize: 350, 
        minSize: 300, 
        maxSize: 600 
    });
    
    useEffect(() => {
        if (isMobile && props.project.files && Object.keys(props.project.files).length > 0 && mobileTab === 'code') {
            // Optional: Auto-preview on update
        }
    }, [props.project.files, isMobile]);

    const handleFixError = (errorMsg: string) => { setDetectedError(errorMsg); };
    const submitFixRequest = () => {
        if (!detectedError) return;
        props.onSendMessage(`Fix this runtime error: ${detectedError}`);
        setDetectedError(null);
    };

    const handleDownload = async () => {
        if (!props.project.files) { addToast("No files to download yet.", "error"); return; }
        const zip = new JSZip();
        // ... (zip logic matches previous)
        const packageJson = {
            name: props.project.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            version: '0.0.0', type: 'module', scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
            dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0", "lucide-react": "latest", "clsx": "latest", "tailwind-merge": "latest", "framer-motion": "latest" },
            devDependencies: { "@vitejs/plugin-react": "^4.2.1", "vite": "^5.2.0", "tailwindcss": "^3.4.3", "autoprefixer": "^10.4.19", "postcss": "^8.4.38" }
        };
        Object.entries(props.project.files).forEach(([path, file]) => {
            const fileData = file as { content: string };
            if (path !== 'package.json') zip.file(path, fileData.content);
        });
        if (!zip.file('package.json')) zip.file('package.json', JSON.stringify(packageJson, null, 2));
        if (!Object.keys(props.project.files).some(k => k.endsWith('index.html'))) {
            zip.file('index.html', `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${props.project.name}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
        }
        try {
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${props.project.name.replace(/\s+/g, '-').toLowerCase()}.zip`; a.click(); URL.revokeObjectURL(url);
            addToast("Project downloaded!", "success");
        } catch (e) { addToast("Failed to create ZIP.", "error"); }
    };

    const handleShareLink = () => {
        const shareUrl = `${window.location.origin}/share/${props.project.id}`;
        navigator.clipboard.writeText(shareUrl); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); addToast("Share link copied!", "success");
    };
    
    const handleSaveProject = async (projectId: string, updates: any) => {
        if (props.onActiveProjectUpdate) await props.onActiveProjectUpdate(updates);
    };

    const errorBanner = detectedError && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-20 left-4 right-4 z-50">
            <div className="bg-red-500/10 border border-red-500/30 backdrop-blur-xl p-3 rounded-lg shadow-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-red-500/20 rounded-md"><WrenchScrewdriverIcon className="w-5 h-5 text-red-400" /></div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-red-300 uppercase tracking-wider mb-0.5">Runtime Error Detected</p>
                        <p className="text-sm text-gray-200 truncate" title={detectedError}>{detectedError}</p>
                    </div>
                </div>
                <button onClick={submitFixRequest} className="flex-shrink-0 px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-md hover:bg-red-600 transition-colors shadow-lg">Fix with AI</button>
            </div>
        </motion.div>
    );

    if (isMobile) {
        return (
            <div className="h-full w-full bg-bg-primary flex flex-col relative overflow-hidden">
                <div className="flex-shrink-0 flex items-center justify-between border-b border-border-color bg-bg-secondary pr-2">
                    <div className="flex">
                        <TabButton isActive={mobileTab === 'chat'} onClick={() => setMobileTab('chat')}><ChatBubbleLeftEllipsisIcon className="w-5 h-5" /> Chat</TabButton>
                        <TabButton isActive={mobileTab === 'code'} onClick={() => setMobileTab('code')}><CodeBracketIcon className="w-5 h-5" /> Code</TabButton>
                        <TabButton isActive={mobileTab === 'preview'} onClick={() => setMobileTab('preview')}><ComputerDesktopIcon className="w-5 h-5" /> Preview</TabButton>
                    </div>
                    <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-white"><Cog6ToothIcon className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    {mobileTab === 'chat' && <><ChatView {...props} />{errorBanner}</>}
                    {mobileTab === 'code' && <IdeWorkspace {...props} />}
                    {mobileTab === 'preview' && <WebAppPreview project={props.project} onFixError={handleFixError} />}
                </div>
                <BuildStatus loadingMessage={props.loadingMessage} isBuilding={props.loadingMessage.includes('Generating') || props.loadingMessage.includes('Building') || props.loadingMessage.includes('Thinking')} writingFile={props.writingFile} />
                <ProjectSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} project={props.project} onSave={handleSaveProject} />
            </div>
        );
    }
    
    return (
        <div className="h-full w-full bg-[#121212] text-white relative flex flex-col overflow-hidden">
            <div className="flex-1 grid w-full h-full bg-bg-primary overflow-hidden" style={{ gridTemplateColumns: `${chatWidth}px 2px 1fr`, userSelect: isResizing ? 'none' : 'auto' }}>
                <div className="h-full bg-bg-secondary overflow-hidden flex flex-col relative border-r border-[#2d2d2d]">
                    <ChatView {...props} />
                    <AnimatePresence>{detectedError && errorBanner}</AnimatePresence>
                    <BuildStatus loadingMessage={props.loadingMessage} isBuilding={props.loadingMessage.toLowerCase().includes('thinking') || props.loadingMessage.toLowerCase().includes('building') || !!props.writingFile} writingFile={props.writingFile} />
                </div>
                <div className="h-full bg-[#2d2d2d] cursor-col-resize hover:bg-primary-start transition-colors z-10" onMouseDown={startResizing} />
                <div className="h-full flex flex-col overflow-hidden bg-[#1e1e1e]">
                    <div className="flex-shrink-0 flex items-center justify-between border-b border-[#2d2d2d] bg-[#252526] pr-4">
                        <div className="flex">
                            <TabButton isActive={desktopTab === 'preview'} onClick={() => setDesktopTab('preview')}><ComputerDesktopIcon className="w-4 h-4" /> Live Preview</TabButton>
                            <TabButton isActive={desktopTab === 'code'} onClick={() => setDesktopTab('code')}><CodeBracketIcon className="w-4 h-4" /> Source Code</TabButton>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 flex items-center gap-2 border-r border-white/10 pr-3">
                                {Object.keys(props.project.files || {}).length > 0 ? <><CheckCircleIcon className="w-4 h-4 text-green-500" /> Ready</> : <span>Initialize project via chat</span>}
                            </div>
                            <button onClick={handleDownload} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Download App"><ArrowDownTrayIcon className="w-4 h-4" /></button>
                            <button onClick={() => setIsShareModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-start text-white text-xs font-bold rounded-md hover:bg-primary-start/80 transition-colors" title="Publish & Share"><ShareIcon className="w-4 h-4" /> Share</button>
                            <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Project Settings"><Cog6ToothIcon className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        <div className={`absolute inset-0 transition-opacity duration-300 ${desktopTab === 'code' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}><IdeWorkspace {...props} /></div>
                        <div className={`absolute inset-0 transition-opacity duration-300 ${desktopTab === 'preview' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}><WebAppPreview project={props.project} onFixError={handleFixError} /></div>
                    </div>
                </div>
            </div>
            <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} projectId={props.project.id} onCopyLink={handleShareLink} isCopied={isCopied} />
            <ProjectSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} project={props.project} onSave={handleSaveProject} />
        </div>
    );
};
