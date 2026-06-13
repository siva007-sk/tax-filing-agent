import { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, RefreshCw, TrendingUp, Coins, FileText, Receipt } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const fmt = n => (n || 0).toLocaleString('en-IN');

const STATUS_VARIANT = {
  'Generated':  'warning',
  'Filed':      'default',
  'E-Verified': 'success',
  'Processed':  'success',
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

export default function Reports({ setTab }) {
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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteFiling = async (id) => {
    if (!window.confirm('Delete this filing record? This cannot be undone.')) return;
    const res = await fetch(`/api/v1/reports/filings/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const chartData = [...(summary?.by_year || [])]
    .reverse()
    .map(y => ({
      ay:             y.ay,
      'Gross Income': Math.round(y.gross_income / 1000),
      'Tax Paid':     Math.round(y.tax_paid     / 1000),
      'Tax Saved':    Math.round(y.tax_saved    / 1000),
    }));

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!loading && filings.length === 0) {
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-100">Tax Reports</h2>
            <p className="text-sm text-gray-400 mt-0.5">Your filing history and tax journey</p>
          </div>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>

        <Card className="p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-lg font-bold text-gray-100 mb-2">Welcome to your tax dashboard!</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto leading-relaxed">
            Once you file your first ITR, you'll see your refund history, savings trend,
            and year-over-year comparisons here.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {[
              '💰 Total refunds received',
              '📉 Tax saved year-over-year',
              '📊 Regime comparison history',
              '🔔 Filing deadline reminders',
            ].map(item => (
              <Badge key={item} variant="secondary" className="rounded-full px-3 py-1.5">
                {item}
              </Badge>
            ))}
          </div>
          {setTab && (
            <Button className="mx-auto" onClick={() => setTab('filing')}>
              File My First ITR →
            </Button>
          )}
        </Card>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600">OR</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <Card className="p-5 flex items-center gap-4">
          <span className="text-2xl shrink-0">💡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300 font-medium">Filed your taxes elsewhere last year?</p>
            <p className="text-xs text-gray-500 mt-0.5">Import past filings to start tracking your tax journey.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setTab && setTab('filing')}>
            Import
          </Button>
        </Card>
      </div>
    );
  }

  // ── Filled state ─────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Your Tax Journey</h2>
          <p className="text-sm text-gray-400 mt-0.5">Filing history and multi-year trends</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!filings.length}
            onClick={() => { if (filings.length) window.location.href = '/api/v1/reports/export'; }}
          >
            <Download size={13} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: <FileText   size={20} />, color: 'text-indigo-400',  bg: 'bg-indigo-500/15',  label: 'Total Filings',  value: summary.total_filings },
            { icon: <Coins      size={20} />, color: 'text-red-400',     bg: 'bg-red-500/15',     label: 'Total Tax Paid', value: `₹${fmt(summary.total_tax_paid)}` },
            { icon: <TrendingUp size={20} />, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Total Saved',    value: `₹${fmt(summary.total_saved)}` },
            { icon: <Receipt    size={20} />, color: 'text-amber-400',   bg: 'bg-amber-500/15',   label: 'Total Refunds',  value: `₹${fmt(summary.total_refunds)}` },
          ].map(({ icon, color, bg, label, value }) => (
            <Card key={label} className="p-4 flex items-center gap-3">
              <div className={`${bg} ${color} p-2.5 rounded-xl shrink-0`}>{icon}</div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 truncate">{label}</div>
                <div className="text-lg font-bold text-gray-100">{value}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card className="p-6">
          <h3 className="text-sm font-bold text-gray-100 mb-4 flex items-center gap-2">
            📈 Savings Trend
            <span className="text-gray-500 font-normal">(₹ thousands)</span>
          </h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={chartData} barGap={3} barCategoryGap="30%">
              <XAxis dataKey="ay" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8', paddingTop: 12 }} />
              <Bar dataKey="Gross Income" fill="#3D8B65" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tax Paid"     fill="#E07A5F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tax Saved"    fill="#4ADE80" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filings table */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-gray-100 mb-4">Saved Filing Records</h3>

        {loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {['AY', 'Form', 'Regime', 'Gross Income', 'Tax Liability', 'Saved', 'Refund / Payable', 'Status', 'Date', ''].map(h => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filings.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-semibold text-gray-100 whitespace-nowrap">{f.ay}</TableCell>
                  <TableCell>
                    <Badge>{f.itr_form}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-300 capitalize">{f.regime}</TableCell>
                  <TableCell className="text-gray-300 whitespace-nowrap">₹{fmt(f.gross_income)}</TableCell>
                  <TableCell className="text-gray-100 font-medium whitespace-nowrap">₹{fmt(f.tax_paid)}</TableCell>
                  <TableCell className="text-emerald-400 whitespace-nowrap">₹{fmt(f.tax_saved)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {f.refund > 0
                      ? <span className="text-emerald-400">+₹{fmt(f.refund)}</span>
                      : f.payable > 0
                        ? <span className="text-red-400">−₹{fmt(f.payable)}</span>
                        : <span className="text-gray-600">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[f.status] ?? 'secondary'}>{f.status}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs whitespace-nowrap">
                    {f.filed_on || f.created_at?.slice(0, 10) || '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFiling(f.id)}
                      className="h-8 w-8 text-gray-700 hover:text-red-400"
                      title="Delete record"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
