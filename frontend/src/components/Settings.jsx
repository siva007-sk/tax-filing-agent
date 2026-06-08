import { useState, useEffect } from 'react';
import { Shield, Cpu, Trash2, CheckCircle, RefreshCw, Wifi, Loader, AlertCircle, Save, PlugZap } from 'lucide-react';

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Settings({ onClearMemory }) {
  const [corpusStatus, setCorpusStatus] = useState(null);
  const [refreshing, setRefreshing]     = useState(false);

  const [llmUrl,   setLlmUrl]   = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmSaving,  setLlmSaving]  = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmStatus,  setLlmStatus]  = useState(null); // null | { reachable, error }
  const [llmSaved,   setLlmSaved]   = useState(false);

  const loadStatus = () =>
    fetch('/api/v1/corpus/status')
      .then(r => r.json())
      .then(data => {
        setCorpusStatus(data);
        // Clear local refreshing flag once the server confirms it's done
        if (data.status !== 'running') setRefreshing(false);
      })
      .catch(() => {});

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch('/api/v1/llm/config')
      .then(r => r.json())
      .then(d => { setLlmUrl(d.url); setLlmModel(d.model); })
      .catch(() => {});
  }, []);

  const saveLlmConfig = async () => {
    setLlmSaving(true);
    setLlmSaved(false);
    try {
      await fetch('/api/v1/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: llmUrl, model: llmModel }),
      });
      setLlmSaved(true);
      setLlmStatus(null);
      setTimeout(() => setLlmSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setLlmSaving(false);
    }
  };

  const testLlmConnection = async () => {
    setLlmTesting(true);
    setLlmStatus(null);
    try {
      // Save first so the backend tests with the current form values
      await fetch('/api/v1/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: llmUrl, model: llmModel }),
      });
      const res  = await fetch('/api/v1/llm/test', { method: 'POST' });
      const data = await res.json();
      setLlmStatus(data);
    } catch {
      setLlmStatus({ reachable: false, error: 'Request failed' });
    } finally {
      setLlmTesting(false);
    }
  };

  const triggerRefresh = async () => {
    setRefreshing(true);
    // Optimistically reflect running state before the first poll returns
    setCorpusStatus(s => ({ ...s, status: 'running' }));
    await fetch('/api/v1/corpus/refresh', { method: 'POST' }).catch(() => {});
  };

  const isRunning = corpusStatus?.status === 'running' || refreshing;

  return (
    <div className="animate-fade-in max-w-xl mx-auto flex flex-col gap-6">

      {/* ── LLM config ──────────────────────────────────────────────────────── */}
      <div className="card p-6 flex flex-col gap-4">
        <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
          <Cpu size={17} className="text-indigo-400" />
          LLM Configuration
        </h3>
        <p className="text-sm text-gray-400">
          Point the Tax Advisor at any OpenAI-compatible endpoint — llama.cpp, Ollama, LM Studio, or a hosted API.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Endpoint URL</label>
            <input
              type="text"
              value={llmUrl}
              onChange={e => { setLlmUrl(e.target.value); setLlmStatus(null); }}
              placeholder="http://localhost:8080/v1/chat/completions"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Model Name</label>
            <input
              type="text"
              value={llmModel}
              onChange={e => { setLlmModel(e.target.value); setLlmStatus(null); }}
              placeholder="local-model"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-primary text-xs flex items-center gap-1.5"
            onClick={saveLlmConfig}
            disabled={llmSaving || !llmUrl || !llmModel}
          >
            {llmSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {llmSaving ? 'Saving…' : llmSaved ? 'Saved!' : 'Save'}
          </button>
          <button
            className="btn-secondary text-xs flex items-center gap-1.5"
            onClick={testLlmConnection}
            disabled={llmTesting || !llmUrl || !llmModel}
          >
            {llmTesting ? <Loader size={13} className="animate-spin" /> : <PlugZap size={13} />}
            {llmTesting ? 'Testing…' : 'Test Connection'}
          </button>
        </div>

        {llmStatus && (
          llmStatus.reachable ? (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle size={13} />
              Connected — LLM is reachable at <code className="font-mono">{llmStatus.url}</code>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs text-red-400">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>Not reachable: {llmStatus.error}</span>
            </div>
          )
        )}
      </div>

      {/* ── Auto-update intelligence ─────────────────────────────────────────── */}
      <div className="card p-6 flex flex-col gap-4">
        <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
          <Wifi size={17} className="text-indigo-400" />
          Live Tax Law Intelligence
        </h3>
        <p className="text-sm text-gray-400">
          The engine periodically searches the web for the latest CBDT circulars, budget amendments, and
          Section limit changes. Results augment the RAG corpus and appear in the Dashboard.
        </p>

        <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Auto-update every</span>
            <span className="text-gray-200">24 hours</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Last updated</span>
            <span className="text-gray-200">{corpusStatus ? timeAgo(corpusStatus.last_updated) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Results cached</span>
            <span className="text-gray-200">{corpusStatus?.update_count ?? '—'} articles</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Status</span>
            <span className={`font-semibold ${
              isRunning                              ? 'text-amber-400'   :
              corpusStatus?.status === 'ok'          ? 'text-emerald-400' :
              corpusStatus?.status === 'never_run'   ? 'text-gray-400'   :
              corpusStatus?.status === 'error'       ? 'text-red-400'    :
              'text-gray-400'
            }`}>
              {isRunning                              ? 'Searching…'  :
               corpusStatus?.status === 'ok'         ? 'Up to date'  :
               corpusStatus?.status === 'never_run'  ? 'Not run yet' :
               corpusStatus?.status === 'error'      ? 'Error'       :
               corpusStatus?.status ?? 'Unknown'}
            </span>
          </div>
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <Loader size={13} className="animate-spin" />
            Searching CBDT, budget news, and tax law amendments…
          </div>
        )}

        {!isRunning && corpusStatus?.status === 'error' && corpusStatus?.error && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{corpusStatus.error}</span>
          </div>
        )}

        <button
          className="btn-secondary self-start flex items-center gap-2"
          onClick={triggerRefresh}
          disabled={isRunning}
        >
          {isRunning
            ? <><Loader size={15} className="animate-spin" /> Searching…</>
            : <><RefreshCw size={15} /> Refresh Tax Law Corpus Now</>}
        </button>

        <div className="flex items-start gap-2 text-xs text-gray-500">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          Searches DuckDuckGo for publicly available tax law sources. Results are filtered for
          relevance and only augment the chat context — the statutory corpus is not modified.
        </div>
      </div>

      {/* ── GDPR / Clear memory ──────────────────────────────────────────────── */}
      <div className="card p-6 flex flex-col gap-4 border-l-4 border-red-600">
        <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
          <Shield size={17} className="text-red-500" />
          DPDP Act 2023 / GDPR Compliance
        </h3>
        <p className="text-sm text-gray-400">
          Under Section 6 of the Digital Personal Data Protection (DPDP) Act 2023, you have the right to erase all
          tax data held by this agent. This wipes the in-memory session profile and all parsed document data.
        </p>
        <button className="btn-danger self-start" onClick={onClearMemory}>
          <Trash2 size={15} /> Erase All Personal Data
        </button>
      </div>

    </div>
  );
}
