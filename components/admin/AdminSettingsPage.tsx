
import React, { useState, useEffect } from 'react';
import { Cog8ToothIcon, KeyIcon, SignalIcon, CheckCircleIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { CreditSystemSettings } from '../settings/CreditSettings';
import { useAuth } from '../../contexts/AuthContext';
import { getAppSettings, updateAppSettings } from '../../services/databaseService';
import { useToast } from '../../hooks/useToast';
import { BoltIcon } from '@heroicons/react/24/solid';

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

// Models available for selection
const SYSTEM_MODELS = [
    { id: 'gpt-5.2', name: 'GPT-5.2 (Future Preview)' },
    { id: 'gpt-5', name: 'GPT-5 (Preview)' },
    { id: 'gpt-4o', name: 'GPT-4o (Fast & Intelligent)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4 (Classic)' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Cost Effective)' },
];

export const AdminSettingsPage: React.FC = () => {
  const { supabase } = useAuth();
  const { addToast } = useToast();
  
  const [adminKeys, setAdminKeys] = useState({
      admin_openai_key: '',
      admin_deepseek_key: '',
      admin_system_model: 'gpt-4o'
  });
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  
  // Test Connection State
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
      if (!supabase) return;
      getAppSettings(supabase).then(settings => {
          setAdminKeys({
              admin_openai_key: settings.admin_openai_key || '',
              admin_deepseek_key: settings.admin_deepseek_key || '',
              admin_system_model: settings.admin_system_model || 'gpt-4o'
          });
          setIsLoadingKeys(false);
      });
  }, [supabase]);

  const handleSaveKeys = async () => {
      setIsSavingKeys(true);
      try {
          await updateAppSettings(supabase, adminKeys);
          addToast("System configuration updated successfully.", "success");
      } catch (e) {
          addToast("Failed to update settings.", "error");
      } finally {
          setIsSavingKeys(false);
      }
  };

  const handleTestConnection = async () => {
      if (!adminKeys.admin_openai_key) {
          setTestStatus('error');
          setTestMessage("Please enter an API Key first.");
          return;
      }
      
      setTestStatus('loading');
      setTestMessage('Pinging OpenAI...');

      try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKeys.admin_openai_key}`
              },
              body: JSON.stringify({
                  model: adminKeys.admin_system_model,
                  messages: [{ role: "user", content: "Test." }],
                  max_tokens: 1
              })
          });

          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error?.message || `Status ${response.status}`);
          }

          setTestStatus('success');
          setTestMessage('Connection Successful!');
          setTimeout(() => setTestStatus('idle'), 3000);
      } catch (error: any) {
          console.error(error);
          setTestStatus('error');
          setTestMessage(error.message || "Connection Failed");
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
            title="System AI Configuration"
            description="Configure the primary LLM used for system-level tasks and credit-based usage."
        >
            <SectionCard>
                 <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                         <div className="p-2 bg-primary-start/20 rounded-lg"><KeyIcon className="w-6 h-6 text-primary-start"/></div>
                         <h3 className="text-lg font-semibold text-white">OpenAI Integration</h3>
                    </div>
                    
                    {isLoadingKeys ? <div className="text-gray-500">Loading keys...</div> : (
                        <div className="grid gap-6">
                            <TextInput 
                                label="Admin OpenAI API Key" 
                                value={adminKeys.admin_openai_key} 
                                onChange={(v) => setAdminKeys(p => ({...p, admin_openai_key: v}))}
                                placeholder="sk-..."
                                type="password"
                            />
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">System Model</label>
                                <select 
                                    value={adminKeys.admin_system_model}
                                    onChange={(e) => setAdminKeys(p => ({...p, admin_system_model: e.target.value}))}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white focus:ring-1 focus:ring-primary-start outline-none"
                                >
                                    {SYSTEM_MODELS.map(model => (
                                        <option key={model.id} value={model.id}>{model.name}</option>
                                    ))}
                                    {/* Allow custom if current value isn't in list */}
                                    {!SYSTEM_MODELS.find(m => m.id === adminKeys.admin_system_model) && (
                                        <option value={adminKeys.admin_system_model}>{adminKeys.admin_system_model} (Custom)</option>
                                    )}
                                </select>
                            </div>

                            <TextInput 
                                label="Admin DeepSeek API Key (Optional)" 
                                value={adminKeys.admin_deepseek_key} 
                                onChange={(v) => setAdminKeys(p => ({...p, admin_deepseek_key: v}))}
                                placeholder="sk-..."
                                type="password"
                            />
                            
                            <div className="flex justify-between pt-2 border-t border-white/10 mt-4">
                                <div className="flex items-center gap-2">
                                     <button 
                                        onClick={handleTestConnection}
                                        disabled={testStatus === 'loading' || !adminKeys.admin_openai_key}
                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                                     >
                                         {testStatus === 'loading' ? <ArrowPathIcon className="w-4 h-4 animate-spin"/> : <SignalIcon className="w-4 h-4"/>}
                                         Test Connection
                                     </button>
                                     {testStatus === 'success' && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircleIcon className="w-4 h-4"/> {testMessage}</span>}
                                     {testStatus === 'error' && <span className="text-red-400 text-sm flex items-center gap-1"><XMarkIcon className="w-4 h-4"/> {testMessage}</span>}
                                </div>
                                
                                <button 
                                    onClick={handleSaveKeys}
                                    disabled={isSavingKeys}
                                    className="px-6 py-2 bg-primary-start text-white rounded-md font-medium hover:bg-primary-start/80 transition-colors flex items-center gap-2"
                                >
                                    {isSavingKeys ? 'Saving...' : 'Save Configuration'}
                                    {!isSavingKeys && <CheckCircleIcon className="w-4 h-4"/>}
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-4 bg-blue-500/10 p-3 rounded border border-blue-500/20">
                        <strong>Note:</strong> This API key will be used for all "System" actions and for users who do not provide their own key (using the credit system). Ensure your OpenAI billing is active.
                    </p>
                 </div>
            </SectionCard>
        </Section>
      </div>
    </div>
  );
};
