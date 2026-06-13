import { useState, useEffect, lazy, Suspense } from 'react';
import { Home, FileText, MessageSquare, BarChart2, User, Sparkles } from 'lucide-react';
import Dashboard from './components/Dashboard';
import TaxFiling from './components/TaxFiling';
import Chatbot from './components/Chatbot';
import Settings from './components/Settings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const Reports    = lazy(() => import('./components/Reports'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

const NAV = [
  { id: 'dashboard', label: 'Home',    icon: Home },
  { id: 'filing',    label: 'File',    icon: FileText },
  { id: 'advisor',   label: 'Mitra',   icon: MessageSquare },
  { id: 'reports',   label: 'Reports', icon: BarChart2 },
  { id: 'profile',   label: 'Profile', icon: User },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profile, setProfile]     = useState(null);
  const [taxData, setTaxData]     = useState(null);
  const [theme, setTheme]         = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const loadContext = async () => {
    try {
      const profData = await fetch('/api/v1/memory/profile').then(r => r.json());
      setProfile(profData);
      fetch('/api/v1/tax/calculate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(profData),
      }).then(r => r.json()).then(setTaxData).catch(() => {});
    } catch {
      // profile fetch failed — backend unreachable
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

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 flex items-center justify-center">
            <Sparkles className="text-indigo-400 animate-pulse" size={26} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-300">Setting up Mitra</p>
            <p className="text-xs text-gray-500 mt-1">Loading your tax context…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-950">

      {/* ── Desktop Sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[220px] bg-gray-900 border-r border-gray-800 z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl flex items-center justify-center">
              <Sparkles size={15} color="#fff" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100">TAX ME</h1>
              <p className="text-xs text-gray-500">AY 2026-27</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 p-3 pt-4">
          {NAV.filter(n => n.id !== 'profile').map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer border-0 text-left w-full font-[inherit]',
                activeTab === id
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              )}
            >
              <Icon size={18} strokeWidth={activeTab === id ? 2.5 : 1.8} />
              {label}
            </button>
          ))}
        </nav>

        {/* Profile at bottom */}
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer border-0 text-left w-full font-[inherit]',
              activeTab === 'profile' || activeTab === 'admin'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            )}
          >
            <User size={18} strokeWidth={activeTab === 'profile' ? 2.5 : 1.8} />
            Profile
          </button>
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-1 lg:ml-[220px] min-h-screen">
        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-20 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Sparkles size={13} color="#fff" />
            </div>
            <span className="text-sm font-bold text-gray-100">TAX ME</span>
            <span className="text-xs text-gray-500">AY 2026-27</span>
          </div>
        </div>

        {/* Page content */}
        <div className="px-4 lg:px-8 pt-4 lg:pt-6 pb-28 lg:pb-8">
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
          {activeTab === 'advisor'  && <Chatbot />}
          {activeTab === 'reports'  && <Suspense fallback={<div className="text-gray-500 text-sm py-10 text-center">Loading…</div>}><Reports setTab={setActiveTab} /></Suspense>}
          {activeTab === 'profile'  && <Settings onClearMemory={handleClearMemory} setTab={setActiveTab} theme={theme} toggleTheme={toggleTheme} />}
          {activeTab === 'admin'    && <Suspense fallback={<div className="text-gray-500 text-sm py-10 text-center">Loading…</div>}><AdminPanel /></Suspense>}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ──────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 z-30">
        <div
          className="flex items-center justify-around px-1"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))', paddingTop: '8px' }}
        >
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all cursor-pointer border-0 min-w-[56px] font-[inherit]',
                activeTab === id || (id === 'profile' && activeTab === 'admin')
                  ? 'text-indigo-400'
                  : 'text-gray-500'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-xl transition-all',
                activeTab === id || (id === 'profile' && activeTab === 'admin')
                  ? 'bg-indigo-600/20'
                  : ''
              )}>
                <Icon
                  size={20}
                  strokeWidth={activeTab === id || (id === 'profile' && activeTab === 'admin') ? 2.5 : 1.8}
                />
              </div>
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </nav>

    </div>
  );
}
