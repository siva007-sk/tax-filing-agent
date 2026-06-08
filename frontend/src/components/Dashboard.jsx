import { useState, useEffect } from 'react';
import {
  TrendingUp, Percent, Coins, ArrowRight, Clock, CheckCircle,
  ShieldAlert, FileText, BadgeCheck, AlertTriangle, ChevronRight,
  Wifi, RefreshCw, ExternalLink, Loader, Brain, Zap, CheckCircle2,
} from 'lucide-react';

const fmt = n => (n || 0).toLocaleString('en-IN');

const STATUS_STYLE = {
  'E-Verified': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: BadgeCheck },
  'Processed':  { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20',  icon: CheckCircle },
  'Filed':      { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   icon: FileText },
  default:      { bg: 'bg-gray-800',        text: 'text-gray-400',    border: 'border-gray-700',        icon: Clock },
};

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function LiveUpdates() {
  const [state, setState] = useState(null);
  const [localRunning, setLocalRunning] = useState(false);

  const load = () =>
    fetch('/api/v1/corpus/status')
      .then(r => r.json())
      .then(data => {
        setState(data);
        // Clear local flag once server confirms completion
        if (data.status !== 'running') setLocalRunning(false);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const triggerRefresh = async () => {
    setLocalRunning(true);
    // Optimistically reflect running state before the next poll returns
    setState(s => ({ ...s, status: 'running' }));
    await fetch('/api/v1/corpus/refresh', { method: 'POST' }).catch(() => {});
  };

  const isRunning = state?.status === 'running' || localRunning;
  const updates   = state?.recent_updates || [];

  return (
    <div className="card p-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
          <Wifi size={16} className="text-indigo-400" />
          Live Tax Law Intelligence
        </h3>
        <div className="flex items-center gap-3">
          {state?.last_updated && (
            <span className="text-xs text-gray-500">
              Updated {timeAgo(state.last_updated)}
              {state.update_count > 0 && ` · ${state.update_count} results`}
            </span>
          )}
          <button
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
            onClick={triggerRefresh}
            disabled={isRunning}
          >
            {isRunning
              ? <><Loader size={12} className="animate-spin" /> Searching…</>
              : <><RefreshCw size={12} /> Refresh Now</>}
          </button>
        </div>
      </div>

      {isRunning && (
        <div className="flex items-center gap-3 py-4 text-sm text-gray-400">
          <Loader size={16} className="animate-spin text-indigo-400" />
          Searching CBDT circulars, budget updates, and tax law amendments…
        </div>
      )}

      {!isRunning && updates.length === 0 && (
        <div className="text-sm text-gray-500 py-4 text-center">
          {state?.status === 'never_run'
            ? 'No updates yet — hit Refresh Now to search for the latest tax law changes.'
            : 'No relevant tax updates found. Try refreshing.'}
        </div>
      )}

      {!isRunning && updates.length > 0 && (
        <div className="flex flex-col gap-3">
          {updates.slice(0, 6).map((u, i) => (
            <div key={i} className="flex gap-3 bg-gray-800/40 border border-gray-700/60 rounded-xl p-3 hover:border-indigo-500/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-200 leading-snug line-clamp-1">{u.title}</p>
                  {u.url && (
                    <a href={u.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-gray-500 hover:text-indigo-400 transition-colors">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{u.snippet}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span className="bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-medium">{u.source}</span>
                  <span>{timeAgo(u.fetched_at)}</span>
                  <span>{'●'.repeat(Math.min(u.relevance || 0, 5))} relevance</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CHANGE_TYPE_LABEL = {
  standard_deduction: 'Std. Deduction',
  deduction_limit:    'Deduction Limit',
  rebate_87a:         '87A Rebate',
  cess_rate:          'Cess Rate',
  new_section:        'New Section',
  slab_rate:          'Slab Rate',
};

const CHANGE_TYPE_COLOR = {
  standard_deduction: 'text-indigo-400 bg-indigo-500/10',
  deduction_limit:    'text-emerald-400 bg-emerald-500/10',
  rebate_87a:         'text-amber-400 bg-amber-500/10',
  cess_rate:          'text-red-400 bg-red-500/10',
  new_section:        'text-cyan-400 bg-cyan-500/10',
  slab_rate:          'text-purple-400 bg-purple-500/10',
};

function RegulationChanges() {
  const [summary, setSummary] = useState(null);

  const load = () =>
    fetch('/api/v1/regulation-changes/summary')
      .then(r => r.json())
      .then(setSummary)
      .catch(() => {});

  useEffect(() => { load(); }, []);

  if (!summary) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          AI Regulation Intelligence
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-amber-400" />
            {summary.total} changes detected
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-400" />
            {summary.applied} applied
          </span>
          {summary.pending > 0 && (
            <span className="text-amber-400">{summary.pending} pending</span>
          )}
        </div>
      </div>

      {summary.total === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Brain size={28} className="mx-auto mb-2 text-gray-700" />
          No regulation changes detected yet.{' '}
          <span className="text-gray-400">Refresh tax law data to trigger LLM analysis.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(summary.recent || []).map((c, i) => {
            const typeLabel = CHANGE_TYPE_LABEL[c.change_type] || c.change_type;
            const typeColor = CHANGE_TYPE_COLOR[c.change_type] || 'text-gray-400 bg-gray-800';
            return (
              <div
                key={i}
                className="flex items-start gap-3 bg-gray-800/40 border border-gray-700/60 rounded-xl p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeColor}`}>
                      {typeLabel}
                    </span>
                    {c.regime && (
                      <span className="text-xs text-gray-500 capitalize">{c.regime} regime</span>
                    )}
                    {c.section && (
                      <span className="text-xs text-indigo-400">§{c.section}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 mt-1.5 leading-snug">{c.description}</p>
                  {c.new_value !== undefined && c.old_value !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      ₹{(c.old_value || 0).toLocaleString('en-IN')}
                      {' → '}
                      <strong className="text-emerald-400">₹{(c.new_value || 0).toLocaleString('en-IN')}</strong>
                    </p>
                  )}
                </div>
                <div className="shrink-0 mt-0.5">
                  {c.applied
                    ? <CheckCircle2 size={14} className="text-emerald-400" title="Applied to calculations" />
                    : <Clock size={14} className="text-amber-400" title="Pending application" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ profile, taxData, setTab }) {
  const isOptimalNew = taxData.summary.optimal_regime === 'new';
  const optimalTax   = isOptimalNew ? taxData.new_regime.total_tax : taxData.old_regime.total_tax;
  const taxSaved     = taxData.summary.tax_saved;

  const sal         = profile.income.salary;
  const grossSalary = (sal.basic || 0) + (sal.hra || 0) + (sal.lta || 0) + (sal.special || 0);
  const totalGross  =
    grossSalary +
    (profile.income.house_property.rental        || 0) +
    (profile.income.capital_gains.stcg_111a      || 0) +
    (profile.income.capital_gains.ltcg_112a      || 0) +
    (profile.income.business_profession.turnover || 0) +
    (profile.income.other_sources.interest       || 0) +
    (profile.income.other_sources.dividend       || 0) +
    (profile.income.other_sources.family_pension || 0);

  const tp       = profile.tax_paid;
  const totalTDS = (tp.tds_salary || 0) + (tp.tds_other || 0) + (tp.advance_tax || 0);
  const netDiff  = totalTDS - optimalTax;

  const pastFilings = profile.past_filings || [];
  const totalSavedAllYears = pastFilings.reduce((s, f) => s + (f.tax_saved || 0), 0);
  const totalPaidAllYears  = pastFilings.reduce((s, f) => s + (f.tax_paid  || 0), 0);

  const accentColor = isOptimalNew ? 'border-emerald-500' : 'border-indigo-500';
  const accentText  = isOptimalNew ? 'text-emerald-400'   : 'text-indigo-400';
  const accentBg    = isOptimalNew ? 'bg-emerald-500/10'  : 'bg-indigo-500/10';

  return (
    <div className="animate-fade-in flex flex-col gap-6">

      {/* ── Current year banner ─────────────────────────────────────────────── */}
      <div className={`card p-6 border-l-4 ${accentColor} ${accentBg} flex justify-between items-center flex-wrap gap-4`}>
        <div>
          <span className={`text-xs font-bold uppercase tracking-widest ${accentText}`}>
            AY 2026-27 · Optimal Regime
          </span>
          <h2 className="text-2xl font-extrabold text-gray-100 mt-1">
            Choose the {isOptimalNew ? 'New Tax Regime' : 'Old Tax Regime'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Save <strong className="text-gray-100">₹{fmt(taxSaved)}</strong> over the alternative regime.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1">Net Tax Liability</div>
            <div className={`text-3xl font-extrabold ${accentText}`}>₹{fmt(optimalTax)}</div>
          </div>
          <button
            className="btn-primary self-center text-xs px-3 py-2"
            onClick={() => setTab('filing')}
          >
            Start Filing <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── Current year metrics ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          { icon: <Coins size={22} />,      color: 'text-indigo-400', bg: 'bg-indigo-500/15',  label: 'Gross Total Income',   value: `₹${fmt(totalGross)}` },
          { icon: <TrendingUp size={22} />, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'TDS & Tax Paid',       value: `₹${fmt(totalTDS)}` },
          { icon: <Percent size={22} />,    color: 'text-amber-400',  bg: 'bg-amber-500/15',   label: 'Effective Tax Rate',   value: `${totalGross > 0 ? ((optimalTax / totalGross) * 100).toFixed(2) : 0}%` },
        ].map(({ icon, color, bg, label, value }) => (
          <div key={label} className="card p-5 flex items-center gap-4">
            <div className={`${bg} ${color} p-3 rounded-xl shrink-0`}>{icon}</div>
            <div>
              <div className="form-label">{label}</div>
              <div className="text-xl font-bold text-gray-100">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Refund / payable status ──────────────────────────────────────────── */}
      {totalTDS > 0 && (
        <div className={`card p-5 flex items-center justify-between gap-4 border-l-4 ${netDiff >= 0 ? 'border-emerald-500' : 'border-red-500'}`}>
          <div>
            <div className="form-label">{netDiff >= 0 ? 'Estimated Refund' : 'Tax Payable Before Filing'}</div>
            <div className={`text-2xl font-extrabold ${netDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹{fmt(Math.abs(netDiff))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {netDiff >= 0
                ? 'TDS deducted exceeds liability — file ITR to claim refund.'
                : 'Pay self-assessment tax u/s 140A via Challan 280 before filing.'}
            </p>
          </div>
          <button className="btn-secondary text-xs shrink-0" onClick={() => setTab('filing')}>
            File ITR <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* ── Past ITR filings ─────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-base font-bold text-gray-100">Past ITR Filings</h3>
          {pastFilings.length > 0 && (
            <div className="flex gap-4 text-xs text-gray-400">
              <span>
                Total Paid: <strong className="text-gray-200">₹{fmt(totalPaidAllYears)}</strong>
              </span>
              <span>
                Total Saved: <strong className="text-emerald-400">₹{fmt(totalSavedAllYears)}</strong>
              </span>
            </div>
          )}
        </div>

        {pastFilings.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            No past filings recorded. File your first return using the <strong className="text-gray-300">File Taxes</strong> tab.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  {['Assessment Year', 'Form', 'Regime', 'Gross Income', 'Tax Paid', 'Saved', 'Refund / Payable', 'Status', 'Filed On'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastFilings.map((f, i) => {
                  const s = STATUS_STYLE[f.status] || STATUS_STYLE.default;
                  const SIcon = s.icon;
                  return (
                    <tr key={i} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 pr-4 font-semibold text-gray-100">{f.ay}</td>
                      <td className="py-3 pr-4">
                        <span className="bg-indigo-500/10 text-indigo-400 text-xs font-bold px-2 py-0.5 rounded">
                          {f.itr_form}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-300 capitalize">{f.regime}</td>
                      <td className="py-3 pr-4 text-gray-300">₹{fmt(f.gross_income)}</td>
                      <td className="py-3 pr-4 text-gray-100 font-medium">₹{fmt(f.tax_paid)}</td>
                      <td className="py-3 pr-4 text-emerald-400 font-semibold">₹{fmt(f.tax_saved)}</td>
                      <td className="py-3 pr-4">
                        {f.refund > 0 ? (
                          <span className="text-emerald-400">+₹{fmt(f.refund)}</span>
                        ) : f.payable > 0 ? (
                          <span className="text-red-400">-₹{fmt(f.payable)}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                          <SIcon size={11} /> {f.status}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500 text-xs">{f.filed_on}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Live tax law intelligence ────────────────────────────────────────── */}
      <LiveUpdates />

      {/* ── AI regulation change detection ──────────────────────────────────── */}
      <RegulationChanges />

      {/* ── Regime comparison ────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-base font-bold text-gray-100">AY 2026-27 Regime Comparison</h3>
          <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setTab('filing')}>
            Adjust <ArrowRight size={13} />
          </button>
        </div>
        <div className="flex flex-col gap-5">
          {[
            {
              label: 'New Tax Regime (Default)',
              tax: taxData.new_regime.total_tax,
              isOpt: isOptimalNew,
              meta: [
                `Taxable ₹${fmt(taxData.new_regime.taxable_income)}`,
                `SD ₹${fmt(taxData.new_regime.standard_deduction)}`,
                taxData.new_regime.rebate_87a > 0 ? `87A Rebate ₹${fmt(taxData.new_regime.rebate_87a)}` : null,
              ],
            },
            {
              label: 'Old Tax Regime',
              tax: taxData.old_regime.total_tax,
              isOpt: !isOptimalNew,
              meta: [
                `Taxable ₹${fmt(taxData.old_regime.taxable_income)}`,
                `SD ₹${fmt(taxData.old_regime.standard_deduction)}`,
                `Deductions ₹${fmt(taxData.old_regime.deductions.total)}`,
              ],
            },
          ].map(({ label, tax, isOpt, meta }) => {
            const maxTax = Math.max(taxData.new_regime.total_tax, taxData.old_regime.total_tax, 1);
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-2">
                  <strong className="text-gray-200">{label}</strong>
                  <span className={isOpt ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                    ₹{fmt(tax)} {isOpt && '✓ Optimal'}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isOpt ? 'bg-emerald-500' : 'bg-gray-600'}`}
                    style={{ width: `${Math.min(100, (tax / maxTax) * 100)}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                  {meta.filter(Boolean).map(m => <span key={m}>{m}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Compliance alerts ────────────────────────────────────────────────── */}
      <div className="card p-6">
        <h3 className="text-base font-bold text-gray-100 mb-4">Filing Deadlines &amp; Compliance</h3>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <Clock size={17} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-gray-200">Filing Deadline (Non-Audit)</div>
              <div className="text-xs text-gray-400 mt-1">
                AY 2026-27 deadline is <strong className="text-gray-100">31 July 2026</strong>. Late filing penalty up to ₹5,000 u/s 234F.
              </div>
            </div>
          </div>
          <div className="flex gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
            <CheckCircle size={17} className="text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-gray-200">E-Verify After Filing</div>
              <div className="text-xs text-gray-400 mt-1">
                E-verify within <strong className="text-gray-100">120 days</strong> via Aadhaar OTP, Net Banking, or DSC. Unverified returns are treated as invalid.
              </div>
            </div>
          </div>
          {totalGross > 5000000 && (
            <div className="flex gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <ShieldAlert size={17} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-400">ITR Form Notice</div>
                <div className="text-xs text-gray-400 mt-1">
                  Income exceeds ₹50 Lakh — <strong>ITR-2</strong> is required, not ITR-1.
                </div>
              </div>
            </div>
          )}
          {netDiff < -5000 && (
            <div className="flex gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <AlertTriangle size={17} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-400">Self-Assessment Tax Due</div>
                <div className="text-xs text-gray-400 mt-1">
                  ₹{fmt(Math.abs(netDiff))} payable before filing. Use Challan 280 to avoid interest u/s 234B/234C.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
