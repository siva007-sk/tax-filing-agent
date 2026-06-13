import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Loader, TrendingDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const fmt = n => (n || 0).toLocaleString('en-IN');

const SCENARIO_FIELDS = [
  { key: '80C_elss',    label: 'ELSS Investment (80C)',            cap: 150000 },
  { key: '80C_ppf',     label: 'PPF Contribution (80C)',           cap: 150000 },
  { key: '80CCD_1B',    label: 'NPS — 80CCD(1B)',                  cap: 50000  },
  { key: '80D_self',    label: 'Health Insurance — Self (80D)',    cap: 25000  },
  { key: '80D_parents', label: 'Health Insurance — Parents (80D)', cap: 50000  },
  { key: 'sec_24b',     label: 'Home Loan Interest (24b)',         cap: 200000 },
];

const QUICK_QUESTIONS = [
  { text: 'Which regime saves more tax for me?', emoji: '💰' },
  { text: 'How much can I save with 80C?',       emoji: '📊' },
  { text: 'Explain HRA exemption rules',         emoji: '🏠' },
  { text: 'What is the 87A rebate limit?',       emoji: '🎯' },
];

function MsgTime({ ts }) {
  return (
    <span className="text-[10px] text-gray-600 select-none">
      {new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

function ScenarioCard({ onSendMessage, onClose }) {
  const [vals, setVals]         = useState(() => Object.fromEntries(SCENARIO_FIELDS.map(f => [f.key, 0])));
  const [simResult, setResult]  = useState(null);
  const [loading, setLoading]   = useState(false);

  const run = async () => {
    const changes = SCENARIO_FIELDS
      .filter(f => vals[f.key] > 0)
      .map(f => ({ section: f.key, amount: vals[f.key] }));
    if (!changes.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/scenarios/simulate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ changes }),
      });
      setResult(await res.json());
    } catch { setResult(null); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setVals(Object.fromEntries(SCENARIO_FIELDS.map(f => [f.key, 0])));
    setResult(null);
  };

  const bestSaving = simResult
    ? Math.max(simResult.diff.new_regime_saving, simResult.diff.old_regime_saving)
    : 0;

  return (
    <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700/50 my-2 w-full max-w-[88%]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingDown size={16} className="text-amber-400" />
          <span className="text-sm font-semibold text-gray-100">Scenario Simulator</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-500 h-7">
          Done
        </Button>
      </div>

      <div className="flex flex-col gap-4 mb-5">
        {SCENARIO_FIELDS.map(f => (
          <div key={f.key}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-gray-400">{f.label}</span>
              <span className="text-xs text-indigo-400 font-mono font-semibold">₹{fmt(vals[f.key])}</span>
            </div>
            <input
              type="range"
              min="0"
              max={f.cap}
              step={f.cap <= 50000 ? 1000 : 5000}
              value={vals[f.key]}
              onChange={e => setVals(s => ({ ...s, [f.key]: Number(e.target.value) }))}
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>₹0</span>
              <span>₹{fmt(f.cap)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <Button className="flex-1" onClick={run} disabled={loading}>
          {loading
            ? <span className="flex items-center justify-center gap-1.5"><Loader size={13} className="animate-spin" /> Running…</span>
            : 'Simulate Impact'}
        </Button>
        <Button variant="ghost" size="icon" onClick={reset} title="Reset">
          <RotateCcw size={15} />
        </Button>
      </div>

      {simResult && (
        <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/30">
          {[
            { label: 'New Regime', saving: simResult.diff.new_regime_saving, orig: simResult.original.new_regime.total_tax, sim: simResult.simulated.new_regime.total_tax },
            { label: 'Old Regime', saving: simResult.diff.old_regime_saving, orig: simResult.original.old_regime.total_tax, sim: simResult.simulated.old_regime.total_tax },
          ].map(({ label, saving, orig, sim }) => (
            <div key={label} className="flex justify-between items-center mb-2 last:mb-0 text-sm">
              <span className="text-gray-400">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-mono text-xs line-through">₹{fmt(orig)}</span>
                <span className="text-gray-200 font-mono font-semibold">₹{fmt(sim)}</span>
                {saving > 0 && (
                  <span className="text-amber-400 text-xs font-bold">−₹{fmt(saving)}</span>
                )}
              </div>
            </div>
          ))}
          {bestSaving > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700/30 flex justify-between items-center">
              <span className="text-amber-400 font-semibold text-sm">💰 Best savings</span>
              <span className="text-amber-400 font-bold font-mono">₹{fmt(bestSaving)}</span>
            </div>
          )}
          <Button
            variant="link"
            size="sm"
            className="mt-3 text-indigo-400 w-full justify-center"
            onClick={() => {
              const parts = SCENARIO_FIELDS
                .filter(f => vals[f.key] > 0)
                .map(f => `₹${vals[f.key].toLocaleString('en-IN')} in ${f.label}`)
                .join(', ');
              onSendMessage(`I'm considering: ${parts}. Explain the tax impact and recommend the best strategy.`);
            }}
          >
            Ask Mitra to explain this scenario →
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Chatbot() {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: "Hi! I'm Mitra, your personal tax advisor. Ask me anything about deductions, regimes, ITR deadlines, or what-if scenarios.",
    ts:   Date.now(),
    showQuick: true,
  }]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showSimulator, setShowSim]   = useState(false);
  const [autoScroll, setAutoScroll]   = useState(true);
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, autoScroll]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setAutoScroll(true);
    setShowSim(false);

    const ts   = Date.now();
    const next = [...messages, { role: 'user', text: msg, ts }];
    setMessages(next);
    setLoading(true);

    try {
      const res  = await fetch('/api/v1/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: msg, history: next.slice(-10, -1) }),
      });
      const data = await res.json();
      const isErr = data.error === 'llm_unavailable';
      setMessages(prev => [...prev, {
        role:      'assistant',
        text:      isErr ? data.message : data.answer,
        citations: data.citations,
        ts:        Date.now(),
        isError:   isErr,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role:    'assistant',
        text:    'Hmm, I had trouble reaching the tax engine. Please try again.',
        ts:      Date.now(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      role:      'assistant',
      text:      'Chat cleared. How can I help with your taxes today?',
      ts:        Date.now(),
      showQuick: true,
    }]);
    setShowSim(false);
    setAutoScroll(true);
  };

  return (
    <div
      className="animate-fade-in flex flex-col rounded-2xl overflow-hidden border border-gray-800 min-h-[500px] [height:calc(100dvh-180px)] lg:[height:calc(100dvh-56px)]"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <div className="text-sm font-bold text-gray-100">Mitra</div>
            <div className="text-xs text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              FY 2025-26 · Tax Advisor
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showSimulator ? 'outline' : 'ghost'}
            onClick={() => setShowSim(s => !s)}
            className={showSimulator ? 'text-amber-400 border-amber-500/30 bg-amber-500/20 hover:bg-amber-500/30' : ''}
          >
            🎚️ Simulate
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearChat}
            className="h-8 w-8 text-gray-500 hover:text-gray-300"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4 bg-gray-950"
        onScroll={e => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
      >
        {messages.map((m) => (
          <div key={m.ts}>
            {m.role === 'user' ? (
              <div className="flex flex-col items-end gap-1">
                <div className="bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed max-w-[82%]">
                  {m.text}
                </div>
                <MsgTime ts={m.ts} />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-1.5">
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed max-w-[88%] ${
                  m.isError
                    ? 'bg-red-900/30 text-red-300 border border-red-700/40'
                    : 'bg-gray-800 text-gray-100 border border-gray-700/40'
                }`}>
                  <p className="whitespace-pre-line">{m.text}</p>
                  {m.citations?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-gray-700/40">
                      {m.citations.map((c, j) => (
                        <span key={j} className="text-[10px] bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-gray-400">
                          {c.section} — {c.title?.slice(0, 30)}…
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {m.showQuick && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {QUICK_QUESTIONS.map(q => (
                      <Button
                        key={q.text}
                        variant="outline"
                        size="sm"
                        onClick={() => sendMessage(q.text)}
                        className="rounded-full text-xs h-7"
                      >
                        {q.emoji} {q.text}
                      </Button>
                    ))}
                  </div>
                )}
                <MsgTime ts={m.ts} />
              </div>
            )}
          </div>
        ))}

        {showSimulator && (
          <ScenarioCard
            onSendMessage={msg => { setShowSim(false); sendMessage(msg); }}
            onClose={() => setShowSim(false)}
          />
        )}

        {loading && (
          <div className="self-start bg-gray-800 border border-gray-700/40 px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-gray-400 flex items-center gap-2">
            <span className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce-dot"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
            Mitra is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 shrink-0">
        <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Ask about 80C, HRA, regime choice, ITR deadlines…"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 min-w-0 rounded-xl"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim()}
            className="shrink-0"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
