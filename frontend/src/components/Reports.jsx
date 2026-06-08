import { useState, useEffect, useCallback } from 'react';
import { BarChart2, Download, Trash2, RefreshCw, TrendingUp, Coins, FileText, Receipt } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const fmt = n => (n || 0).toLocaleString('en-IN');

const STATUS_CLS = {
  'Generated':  'text-amber-400 bg-amber-500/10 border-amber-500/40',
  'Filed':      'text-blue-400 bg-blue-500/10 border-blue-500/40',
  'E-Verified': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
  'Processed':  'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="font-bold text-gray-200 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }} className="flex justify-between gap-6">
          <span>{p.name}</span>
          <span className="font-semibold">₹{fmt(p.value * 1000)}</span>
        </p>
      ))}
    </div>
  );
};

export default function Reports() {
  const [filings, setFilings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, sRes] = await Promise.all([
        fetch('/api/v1/reports/filings'),
        fetch('/api/v1/reports/summary'),
      ]);
      const { filings: f } = await fRes.json();
      const s = await sRes.json();
      setFilings(f || []);
      setSummary(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteFiling = async (id) => {
    if (!window.confirm('Delete this filing record? This cannot be undone.')) return;
    await fetch(`/api/v1/reports/filings/${id}`, { method: 'DELETE' });
    load();
  };

  const chartData = [...(summary?.by_year || [])]
    .reverse()
    .map(y => ({
      ay: y.ay,
      'Gross Income': Math.round(y.gross_income / 1000),
      'Tax Paid':     Math.round(y.tax_paid     / 1000),
      'Tax Saved':    Math.round(y.tax_saved    / 1000),
    }));

  return (
    <div className="animate-fade-in flex flex-col gap-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Tax Reports</h2>
          <p className="text-sm text-gray-400 mt-0.5">Saved filing records and multi-year trends</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
          <a
            href="/api/v1/reports/export"
            className={`btn-secondary text-xs flex items-center gap-1.5 ${!filings.length ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <Download size={13} /> Export CSV
          </a>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: <FileText  size={20} />, color: 'text-indigo-400',  bg: 'bg-indigo-500/15',  label: 'Total Filings',  value: summary.total_filings },
            { icon: <Coins     size={20} />, color: 'text-red-400',     bg: 'bg-red-500/15',     label: 'Total Tax Paid', value: `₹${fmt(summary.total_tax_paid)}` },
            { icon: <TrendingUp size={20}/>, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Total Saved',    value: `₹${fmt(summary.total_saved)}` },
            { icon: <Receipt   size={20} />, color: 'text-amber-400',   bg: 'bg-amber-500/15',   label: 'Total Refunds',  value: `₹${fmt(summary.total_refunds)}` },
          ].map(({ icon, color, bg, label, value }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              <div className={`${bg} ${color} p-2.5 rounded-xl shrink-0`}>{icon}</div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 truncate">{label}</div>
                <div className="text-lg font-bold text-gray-100">{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Bar chart ─────────────────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-bold text-gray-100 mb-4 flex items-center gap-2">
            <BarChart2 size={15} className="text-indigo-400" />
            Year-wise Tax Trend <span className="text-gray-500 font-normal">(₹ thousands)</span>
          </h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={chartData} barGap={3} barCategoryGap="30%">
              <XAxis dataKey="ay" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 12 }} />
              <Bar dataKey="Gross Income" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Tax Paid"     fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Tax Saved"    fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Filings table ─────────────────────────────────────────────────── */}
      <div className="card p-6">
        <h3 className="text-sm font-bold text-gray-100 mb-4">Saved Filing Records</h3>

        {loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">Loading…</div>
        ) : filings.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No records yet. Generate an ITR in the{' '}
            <strong className="text-gray-300">File Taxes</strong> tab and click{' '}
            <strong className="text-gray-300">Save to Records</strong>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  {['AY', 'Form', 'Regime', 'Gross Income', 'Tax Liability', 'Saved', 'Refund / Payable', 'Status', 'Date', ''].map(h => (
                    <th key={h} className="text-left py-2 pr-4 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filings.map(f => {
                  const cls = STATUS_CLS[f.status] || 'text-gray-400 bg-gray-800/60 border-gray-700';
                  return (
                    <tr key={f.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 pr-4 font-semibold text-gray-100 whitespace-nowrap">{f.ay}</td>
                      <td className="py-3 pr-4">
                        <span className="bg-indigo-500/10 text-indigo-400 text-xs font-bold px-2 py-0.5 rounded">{f.itr_form}</span>
                      </td>
                      <td className="py-3 pr-4 text-gray-300 capitalize">{f.regime}</td>
                      <td className="py-3 pr-4 text-gray-300 whitespace-nowrap">₹{fmt(f.gross_income)}</td>
                      <td className="py-3 pr-4 text-gray-100 font-medium whitespace-nowrap">₹{fmt(f.tax_paid)}</td>
                      <td className="py-3 pr-4 text-emerald-400 whitespace-nowrap">₹{fmt(f.tax_saved)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {f.refund > 0
                          ? <span className="text-emerald-400">+₹{fmt(f.refund)}</span>
                          : f.payable > 0
                            ? <span className="text-red-400">−₹{fmt(f.payable)}</span>
                            : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
                          {f.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
                        {f.filed_on || f.created_at?.slice(0, 10) || '—'}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => deleteFiling(f.id)}
                          className="text-gray-700 hover:text-red-400 transition-colors p-1 cursor-pointer bg-transparent border-0"
                          title="Delete record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
