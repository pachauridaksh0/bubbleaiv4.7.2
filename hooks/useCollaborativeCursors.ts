
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface CursorPosition {
    x: number;
    y: number;
    user: string;
    color: string;
    userId: string;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98FB98', '#DDA0DD'];

export const useCollaborativeCursors = (projectId: string) => {
    const { supabase, user, profile } = useAuth();
    const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
    const myColor = useRef(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Use refs for stable access inside effect/callbacks without triggering re-runs
    const profileRef = useRef(profile);
    
    // Update ref when profile changes, but don't re-trigger the main effect
    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    useEffect(() => {
        if (!user || !supabase || !projectId) return;

        const channel = supabase.channel(`project-cursors:${projectId}`, {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                const newCursors: Record<string, CursorPosition> = {};
                
                Object.keys(newState).forEach(key => {
                    if (key === user.id) return; // Skip own cursor
                    const presence = newState[key][0] as any;
                    if (presence && presence.x !== undefined && presence.y !== undefined) {
                        newCursors[key] = {
                            x: presence.x,
                            y: presence.y,
                            user: presence.user,
                            color: presence.color,
                            userId: key
                        };
                    }
                });
                setCursors(newCursors);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Initial track
                    await channel.track({
                        user: profileRef.current?.roblox_username || 'Anonymous',
                        color: myColor.current,
                        x: 0,
                        y: 0,
                    });
                }
            });

        // Throttling logic
        let lastUpdate = 0;
        const THROTTLE_MS = 100; // 10 updates per second max

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastUpdate < THROTTLE_MS) return;
            
            if (!containerRef.current) return;
            
            const rect = containerRef.current.getBoundingClientRect();
            // Calculate relative position (0-100%)
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                lastUpdate = now;
                channel.track({
                    user: profileRef.current?.roblox_username || 'Anonymous',
                    color: myColor.current,
                    x,
                    y,
                });
            }
        };

        if (containerRef.current) {
            containerRef.current.addEventListener('mousemove', handleMouseMove);
        }

        return () => {
            if (containerRef.current) {
                containerRef.current.removeEventListener('mousemove', handleMouseMove);
            }
            supabase.removeChannel(channel);
        };
        // Removed 'profile' from dependencies to prevent reconnection loops
    }, [projectId, user, supabase]);

    return { cursors, containerRef };
};
