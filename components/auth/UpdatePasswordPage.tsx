
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

export const UpdatePasswordPage: React.FC = () => {
    const { updateUserPassword, supabase } = useAuth();
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // Ensure we actually have a session (the link should have logged us in via hash fragment)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // Sometimes the session takes a moment to initialize from the URL hash
                const { error } = await supabase.auth.getSession(); 
                if (error) {
                    setError("Invalid or expired reset link. Please request a new password reset.");
                }
            }
        };
        checkSession();
    }, [supabase]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim() || isLoading) return;
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await updateUserPassword(password);
            setSuccess(true);
            // Redirect after a short delay
            setTimeout(() => {
                window.location.href = '/projects';
            }, 2000);
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : 'An unknown error occurred.';
            setError(errorMessage);
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-bg-primary text-white p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md p-8 bg-bg-secondary/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
            >
                <div className="text-center">
                    <LockClosedIcon className="w-12 h-12 mx-auto text-primary-start mb-4" />
                    <h1 className="text-3xl font-bold text-white mt-3 mb-2">Set New Password</h1>
                    <p className="text-gray-400 mb-6">Enter your new secure password below.</p>
                </div>

                {success ? (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center p-4 bg-green-500/10 border border-green-500/20 rounded-xl"
                    >
                        <CheckCircleIcon className="w-10 h-10 text-green-400 mx-auto mb-2" />
                        <h3 className="text-green-400 font-bold">Password Updated!</h3>
                        <p className="text-sm text-gray-300 mt-1">Redirecting you to the app...</p>
                    </motion.div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-2">
                                New Password
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-start transition-colors text-white"
                                required
                                autoFocus
                            />
                        </div>
                        
                        {error && (
                            <p className="text-red-400 text-sm text-left flex items-center gap-2 bg-red-500/10 p-2 rounded">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={!password.trim() || isLoading || !!error}
                            className="w-full px-4 py-3 bg-primary-start text-white rounded-lg font-semibold hover:bg-primary-start/80 transition-colors disabled:opacity-50 flex items-center justify-center h-[51px] mt-2"
                        >
                            {isLoading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                'Update Password'
                            )}
                        </button>
                    </form>
                )}
            </motion.div>
        </div>
    );
};
