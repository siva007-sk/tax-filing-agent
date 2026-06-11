import { useState } from 'react';
import { Shield, User, Moon, Globe, HelpCircle, ChevronRight, Settings2, ArrowLeft } from 'lucide-react';

function PrivacyScreen({ onClearMemory, onBack }) {
  return (
    <div className="animate-fade-in flex flex-col gap-5 pt-2">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer border-0 bg-transparent w-fit"
      >
        <ArrowLeft size={15} /> Security &amp; Privacy
      </button>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-indigo-600/20 p-2.5 rounded-xl">
            <Shield size={18} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="font-bold text-gray-100">Data Protection</h3>
            <p className="text-xs text-gray-500 mt-0.5">AES-256 encrypted · Never shared</p>
          </div>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed mb-5">
          Your data is encrypted with AES-256. We never share your PAN, uploaded documents,
          or tax data with any third party. All data is stored locally on this device.
        </p>
        <div className="flex flex-col gap-2">
          <button className="text-sm text-indigo-400 hover:text-indigo-300 text-left transition-colors cursor-pointer border-0 bg-transparent py-1">
            📄 Read Privacy Policy →
          </button>
          <button className="text-sm text-indigo-400 hover:text-indigo-300 text-left transition-colors cursor-pointer border-0 bg-transparent py-1">
            🔍 See what data we have →
          </button>
        </div>
      </div>

      <div className="card p-6 border-l-4 border-red-500/50">
        <h3 className="font-bold text-gray-100 mb-2">Delete My Data</h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-5">
          Under India's DPDP Act 2023, you have the right to erase all your tax data.
          This wipes your profile, uploaded documents, and session data from this device.{' '}
          <strong className="text-gray-300">This cannot be undone.</strong>
        </p>
        <button className="btn-danger" onClick={onClearMemory}>
          <Shield size={14} /> Request Data Deletion
        </button>
        <p className="text-xs text-gray-600 mt-2">Requires confirmation before proceeding.</p>
      </div>
    </div>
  );
}

export default function Settings({ onClearMemory, setTab, theme, toggleTheme }) {
  const [showPrivacy, setShowPrivacy] = useState(false);

  if (showPrivacy) {
    return (
      <PrivacyScreen
        onClearMemory={onClearMemory}
        onBack={() => setShowPrivacy(false)}
      />
    );
  }

  return (
    <div className="animate-fade-in pt-2">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-100">Profile</h2>
        <p className="text-sm text-gray-400 mt-0.5">Settings and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Left column: user card + settings list */}
        <div className="flex flex-col gap-5">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 flex items-center justify-center shrink-0">
              <User size={22} className="text-indigo-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-100">Tax Payer</div>
              <div className="text-xs text-gray-500 mt-0.5">AY 2026-27 · FY 2025-26</div>
            </div>
          </div>

          <div className="card divide-y divide-gray-800">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors cursor-pointer border-0 bg-transparent text-left"
            >
              <div className="flex items-center gap-3">
                <Moon size={17} className="text-gray-400" />
                <span className="text-sm text-gray-200">Dark Mode</span>
              </div>
              <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${theme === 'dark' ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>

            <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors cursor-pointer border-0 bg-transparent text-left">
              <div className="flex items-center gap-3">
                <Globe size={17} className="text-gray-400" />
                <span className="text-sm text-gray-200">Language</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">English</span>
                <ChevronRight size={15} className="text-gray-700" />
              </div>
            </button>

            <button
              onClick={() => setShowPrivacy(true)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors cursor-pointer border-0 bg-transparent text-left"
            >
              <div className="flex items-center gap-3">
                <Shield size={17} className="text-gray-400" />
                <span className="text-sm text-gray-200">Security &amp; Privacy</span>
              </div>
              <ChevronRight size={15} className="text-gray-700" />
            </button>

            <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors cursor-pointer border-0 bg-transparent text-left">
              <div className="flex items-center gap-3">
                <HelpCircle size={17} className="text-gray-400" />
                <span className="text-sm text-gray-200">Help &amp; Support</span>
              </div>
              <ChevronRight size={15} className="text-gray-700" />
            </button>
          </div>
        </div>

        {/* Right column: about + admin link */}
        <div className="flex flex-col gap-5">
          <div className="card p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600/20 p-2.5 rounded-xl">
                <Shield size={18} className="text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-100">Your data is safe</h3>
                <p className="text-xs text-gray-500 mt-0.5">AES-256 encrypted · Never shared</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              All your tax data — PAN, income, documents — is stored only on this device.
              We never upload or share it with any third party.
            </p>
            <button
              onClick={() => setShowPrivacy(true)}
              className="text-sm text-indigo-400 hover:text-indigo-300 text-left transition-colors cursor-pointer border-0 bg-transparent"
            >
              Manage data &amp; privacy →
            </button>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-bold text-gray-100 mb-1">TAX ME</h3>
            <p className="text-xs text-gray-500 mb-4">AY 2026-27 · FY 2025-26 · Built for India</p>
            <button
              onClick={() => setTab && setTab('admin')}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer border-0 bg-transparent py-1.5 rounded-lg hover:bg-gray-800/50"
            >
              <Settings2 size={12} />
              Admin Configuration (LLM &amp; Corpus)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
