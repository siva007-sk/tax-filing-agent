import { useState, useRef } from 'react';
import { Send, MessageSquare, Trash2, TrendingDown, RotateCcw, Loader } from 'lucide-react';

const fmt = n => (n || 0).toLocaleString('en-IN');

const SCENARIO_FIELDS = [
  { key: '80C_elss',    label: 'ELSS Investment (80C)',           section: '80C',       cap: 150000 },
  { key: '80C_ppf',     label: 'PPF Contribution (80C)',          section: '80C',       cap: 150000 },
  { key: '80CCD_1B',    label: 'NPS Contribution (80CCD1B)',      section: '80CCD(1B)', cap: 50000  },
  { key: '80D_self',    label: 'Health Insurance — Self (80D)',   section: '80D',       cap: 25000  },
  { key: '80D_parents', label: 'Health Insurance — Parents (80D)',section: '80D',       cap: 50000  },
  { key: 'sec_24b',     label: 'Home Loan Interest (24b)',        section: '24(b)',     cap: 200000 },
];

const QUICK_QUESTIONS = [
  'Which regime saves more tax for me?',
  'How much can I save with 80C?',
  'Explain HRA exemption rules',
  'What is the 87A rebate limit?',
];

export default function Chatbot() {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: 'Hello! I\'m your Tax Advisor. Ask me about deductions, regime comparisons, ITR rules, or type a scenario like "what if I invest ₹50,000 in NPS?" to instantly see your tax impact.',
  }]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [scenario, setScenario]     = useState(() =>
    Object.fromEntries(SCENARIO_FIELDS.map(f => [f.key, '']))
  );
  const [simResult, setSimResult]   = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const endRef = useRef(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    if (!text) setInput('');

    const next = [...messages, { role: 'user', text: msg }];
    setMessages(next);
    setLoading(true);
    scrollToBottom();

    try {
      const res  = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: next.slice(0, -1) }),
      });
      const data = await res.json();
      if (data.error === 'llm_unavailable') {
        setMessages(prev => [...prev, { role: 'assistant', text: data.message, isError: true }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.answer, citations: data.citations }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Error communicating with the tax engine. Please try again.',
      }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const runSimulation = async () => {
    const changes = SCENARIO_FIELDS
      .filter(f => scenario[f.key] !== '' && Number(scenario[f.key]) >= 0)
      .map(f => ({ section: f.key, amount: Number(scenario[f.key]) }));
    if (!changes.length) return;

    setSimLoading(true);
    try {
      const res = await fetch('/api/v1/scenarios/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      setSimResult(await res.json());
    } catch {
      setSimResult(null);
    } finally {
      setSimLoading(false);
    }
  };

  const clearSim = () => {
    setScenario(Object.fromEntries(SCENARIO_FIELDS.map(f => [f.key, ''])));
    setSimResult(null);
  };

  return (
    <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-5 gap-6" style={{ height: 'calc(100vh - 180px)', minHeight: '580px' }}>

      {/* ── Chat ────────────────────────────────────────────────────────────── */}
      <div className="card lg:col-span-3 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/15 p-2 rounded-lg text-indigo-400">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-100">Tax Advisor</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                FY 2025-26 corpus · RAG-powered
              </div>
            </div>
          </div>
          <button
            onClick={() => setMessages([{ role: 'assistant', text: 'Chat cleared. How can I help with your taxes today?' }])}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 cursor-pointer bg-transparent border-0"
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col gap-1.5 max-w-[88%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
              <div className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-line rounded-2xl ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : m.isError
                    ? 'bg-red-900/30 text-red-300 border border-red-700/50 rounded-bl-sm'
                    : 'bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-sm'
              }`}>
                {m.text}
              </div>
              {m.citations?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {m.citations.map((c, j) => (
                    <span key={j} className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-400">
                      {c.section} — {c.title?.slice(0, 30)}…
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="self-start bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm text-sm text-gray-400 flex items-center gap-2">
              <Loader size={13} className="animate-spin" /> Retrieving answer…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-950/50">
          <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <input
              type="text"
              placeholder="Ask about 80C, HRA, NPS, regime choice, ITR deadlines…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="btn-primary px-3 py-2.5 shrink-0" type="submit" disabled={loading}>
              <Send size={15} />
            </button>
          </form>
          <div className="flex flex-wrap gap-2 mt-3">
            {QUICK_QUESTIONS.map(q => (
              <button key={q} onClick={() => sendMessage(q)} className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-2.5 py-1 rounded-full transition-colors cursor-pointer">
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scenario simulator ───────────────────────────────────────────────── */}
      <div className="card lg:col-span-2 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-3">
          <div className="bg-amber-500/15 p-2 rounded-lg text-amber-400">
            <TrendingDown size={16} />
          </div>
          <div className="text-sm font-semibold text-gray-100">Scenario Simulator</div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            Adjust investment amounts and hit <strong className="text-gray-200">Simulate</strong> to see your tax savings under each regime.
          </p>

          <div className="flex flex-col gap-3">
            {SCENARIO_FIELDS.map(f => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label className="form-label">{f.label}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">₹</span>
                  <input
                    type="number"
                    value={scenario[f.key]}
                    min={0}
                    max={f.cap}
                    onChange={e => setScenario(s => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={`0 – ${fmt(f.cap)}`}
                    className="pl-6 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1 text-xs py-2" onClick={runSimulation} disabled={simLoading}>
              {simLoading ? <><Loader size={12} className="animate-spin" /> Running…</> : 'Simulate Tax Impact'}
            </button>
            <button className="btn-secondary px-3 py-2" onClick={clearSim} title="Reset">
              <RotateCcw size={14} />
            </button>
          </div>

          {simResult && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">Results</div>
              {[
                { label: 'New Regime', orig: simResult.original.new_regime.total_tax, sim: simResult.simulated.new_regime.total_tax, saving: simResult.diff.new_regime_saving },
                { label: 'Old Regime', orig: simResult.original.old_regime.total_tax, sim: simResult.simulated.old_regime.total_tax, saving: simResult.diff.old_regime_saving },
              ].map(({ label, orig, sim, saving }) => (
                <div key={label} className={`rounded-xl p-4 border ${saving > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-gray-800/50 border-gray-700'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-300">{label}</span>
                    {saving > 0 && (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        −₹{fmt(saving)} saved
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Before: <strong className="text-gray-200">₹{fmt(orig)}</strong></span>
                    <span>After: <strong className={saving > 0 ? 'text-emerald-400' : 'text-gray-200'}>₹{fmt(sim)}</strong></span>
                  </div>
                </div>
              ))}
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300 text-left transition-colors cursor-pointer bg-transparent border-0"
                onClick={() => {
                  const invested = SCENARIO_FIELDS
                    .filter(f => scenario[f.key])
                    .map(f => `₹${Number(scenario[f.key]).toLocaleString('en-IN')} in ${f.label}`)
                    .join(', ');
                  sendMessage(`I'm considering: ${invested}. Explain the tax impact and recommend the best strategy.`);
                }}
              >
                Ask advisor to explain this scenario →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
