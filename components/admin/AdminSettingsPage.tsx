
import React, { useState, useEffect } from 'react';
import { Cog8ToothIcon, KeyIcon } from '@heroicons/react/24/outline';
import { CreditSystemSettings } from '../settings/CreditSettings';
import { useAuth } from '../../contexts/AuthContext';
import { getAppSettings, updateAppSettings } from '../../services/databaseService';
import { useToast } from '../../hooks/useToast';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const Section: React.FC<{ title: string; children: React.ReactNode; description?: string }> = ({ title, children, description }) => (
    <div>
        <h2 className="text-2xl font-bold text-text-primary">{title}</h2>
        <div className="w-16 border-b-2 border-primary-start mt-2 mb-6"></div>
        {description && <p className="text-text-secondary mb-6 max-w-2xl">{description}</p>}
        <div className="space-y-6">{children}</div>
    </div>
);

const SectionCard: React.FC<{children: React.ReactNode}> = ({children}) => (
    <div className="p-6 bg-bg-secondary/50 rounded-xl border border-white/10">{children}</div>
);

const TextInput: React.FC<{ label: string; value: string; onChange: (val: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type="text" }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white focus:ring-1 focus:ring-primary-start outline-none"
            placeholder={placeholder}
        />
    </div>
);

export const AdminSettingsPage: React.FC = () => {
  const { supabase } = useAuth();
  const { addToast } = useToast();
  
  const [adminKeys, setAdminKeys] = useState({
      admin_gemini_key: '',
      admin_deepseek_key: ''
  });
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  useEffect(() => {
      if (!supabase) return;
      getAppSettings(supabase).then(settings => {
          setAdminKeys({
              admin_gemini_key: settings.admin_gemini_key || '',
              admin_deepseek_key: settings.admin_deepseek_key || ''
          });
          setIsLoadingKeys(false);
      });
  }, [supabase]);

  const handleSaveKeys = async () => {
      setIsSavingKeys(true);
      try {
          await updateAppSettings(supabase, adminKeys);
          addToast("Admin keys updated successfully.", "success");
      } catch (e) {
          addToast("Failed to update admin keys.", "error");
      } finally {
          setIsSavingKeys(false);
      }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary">Admin Settings</h1>
        <p className="text-text-secondary mt-1">Manage global application settings and configurations.</p>
      </div>
      
      <div className="space-y-12">
        <Section 
            title="Credit System"
            description="Manage daily credit allowances, purchase costs, and AI model usage costs."
        >
            <SectionCard>
                <CreditSystemSettings />
            </SectionCard>
        </Section>
        
        <Section 
            title="AI Agent Configuration"
            description="Configure the system-level API keys used when users pay with credits."
        >
            <SectionCard>
                 <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                         <div className="p-2 bg-primary-start/20 rounded-lg"><KeyIcon className="w-6 h-6 text-primary-start"/></div>
                         <h3 className="text-lg font-semibold text-white">System API Keys</h3>
                    </div>
                    
                    {isLoadingKeys ? <div className="text-gray-500">Loading keys...</div> : (
                        <div className="grid gap-6">
                            <TextInput 
                                label="Admin Gemini API Key" 
                                value={adminKeys.admin_gemini_key} 
                                onChange={(v) => setAdminKeys(p => ({...p, admin_gemini_key: v}))}
                                placeholder="sk-..."
                                type="password"
                            />
                            <TextInput 
                                label="Admin DeepSeek API Key" 
                                value={adminKeys.admin_deepseek_key} 
                                onChange={(v) => setAdminKeys(p => ({...p, admin_deepseek_key: v}))}
                                placeholder="sk-..."
                                type="password"
                            />
                            
                            <div className="flex justify-end pt-2">
                                <button 
                                    onClick={handleSaveKeys}
                                    disabled={isSavingKeys}
                                    className="px-6 py-2 bg-primary-start text-white rounded-md font-medium hover:bg-primary-start/80 transition-colors flex items-center gap-2"
                                >
                                    {isSavingKeys ? 'Saving...' : 'Save Keys'}
                                    {!isSavingKeys && <CheckCircleIcon className="w-4 h-4"/>}
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-4 bg-yellow-500/10 p-3 rounded border border-yellow-500/20">
                        <strong>Note:</strong> These keys are used when a user does not provide their own key but has sufficient credits. 
                        Ensure your API provider billing is configured correctly.
                    </p>
                 </div>
            </SectionCard>
        </Section>
      </div>
    </div>
  );
};
