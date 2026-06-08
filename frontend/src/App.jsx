import { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, MessageSquare, Settings as SettingsIcon, Sparkles, BarChart2 } from 'lucide-react';
import Dashboard from './components/Dashboard';
import TaxFiling from './components/TaxFiling';
import Chatbot from './components/Chatbot';
import Settings from './components/Settings';
import Reports from './components/Reports';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'filing',    label: 'File Taxes',  icon: FileText },
  { id: 'advisor',   label: 'Tax Advisor', icon: MessageSquare },
  { id: 'reports',   label: 'Reports',     icon: BarChart2 },
  { id: 'settings',  label: 'Settings',    icon: SettingsIcon },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profile, setProfile] = useState(null);
  const [taxData, setTaxData] = useState(null);

  // Defined before useEffect so the hook closure captures the stable reference
  const loadContext = async () => {
    try {
      const profRes = await fetch('/api/v1/memory/profile');
      const profData = await profRes.json();
      setProfile(profData);

      const taxRes = await fetch('/api/v1/tax/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profData),
      });
      setTaxData(await taxRes.json());
    } catch (err) {
      console.error('Context load error:', err);
    }
  };

  useEffect(() => { loadContext(); }, []);

  const handleClearMemory = async () => {
    if (!window.confirm('Permanently erase all tax profile and document data?')) return;
    try {
      await fetch('/api/v1/memory/clear', { method: 'DELETE' });
      await loadContext();
      setActiveTab('dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  if (!profile || !taxData) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Sparkles className="animate-spin text-indigo-400" size={32} />
          <span className="text-sm font-medium">Loading tax agent context...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="mx-6 mt-4 px-6 py-3 bg-gray-900 border border-gray-800 rounded-xl flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-indigo-600 p-2 rounded-xl flex items-center justify-center">
            <Sparkles size={17} color="#fff" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-100">TAX ME</h1>
            <p className="text-xs text-gray-500">AY 2026-27 · FY 2025-26</p>
          </div>
        </div>

        <nav className="flex gap-0.5 bg-gray-950 p-1 rounded-lg border border-gray-800">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab-btn px-3 py-2 text-xs ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 px-6 pb-6 pt-4 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <Dashboard profile={profile} taxData={taxData} setTab={setActiveTab} />
        )}
        {activeTab === 'filing' && (
          <TaxFiling
            profile={profile}
            setProfile={setProfile}
            taxData={taxData}
            setTaxData={setTaxData}
            setTab={setActiveTab}
          />
        )}
        {activeTab === 'advisor'   && <Chatbot />}
        {activeTab === 'reports'   && <Reports />}
        {activeTab === 'settings'  && <Settings onClearMemory={handleClearMemory} />}
      </main>
    </div>
  );
}
