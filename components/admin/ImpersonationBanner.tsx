
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { XCircleIcon, EyeIcon } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';

export const StatusBar: React.FC = () => {
    const { isImpersonating, stopImpersonating, profile } = useAuth();
    const [isHovered, setIsHovered] = useState(false);

    if (!isImpersonating) return null;

    return (
        <div 
            className="fixed top-0 left-0 right-0 h-8 z-[9999] flex justify-center items-start pointer-events-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
             {/* Trigger Area: Invisible block at the top center to catch mouse enter. 
                 Only active in the center so corners (sidebar toggle) are free. */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-16 pointer-events-auto" /> 

            <motion.div
                initial={{ y: -60 }}
                animate={{ y: isHovered ? 0 : -44 }} // Slide up leaving just a handle visible
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="relative z-[10000] bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-2xl rounded-b-xl px-5 py-2.5 flex items-center gap-3 cursor-default pointer-events-auto border-x border-b border-white/20 backdrop-blur-md"
            >
                <div className="flex items-center gap-2 text-sm font-medium drop-shadow-md">
                     <EyeIcon className="w-4 h-4 text-white/90" />
                     <span className="whitespace-nowrap">
                        Viewing as <strong className="text-white">{profile?.roblox_username}</strong>
                     </span>
                </div>
                
                <div className="h-4 w-px bg-white/30 mx-1"></div>
                
                <button
                    onClick={(e) => { e.stopPropagation(); stopImpersonating(); }}
                    className="flex items-center gap-1.5 bg-black/20 hover:bg-black/40 text-white px-3 py-1 rounded-full transition-colors text-xs font-bold uppercase tracking-wider shadow-sm ring-1 ring-white/10 pointer-events-auto"
                >
                    <XCircleIcon className="w-4 h-4"/>
                    <span>Exit</span>
                </button>
                
                {/* Visual Handle (The part visible when tucked away) */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/40 rounded-full" />
            </motion.div>
        </div>
    );
};
