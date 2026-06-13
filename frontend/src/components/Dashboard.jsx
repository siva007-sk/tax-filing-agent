import { useState, useEffect } from 'react';
import {
  Clock, ChevronRight, ExternalLink, RefreshCw, Loader,
  Shield, CheckCircle, FileText, BadgeCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

const fmt = n => (n || 0).toLocaleString('en-IN');

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDeadlineInfo() {
  const deadline = new Date('2026-07-31T23:59:59');
  const today    = new Date();
  const days     = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  return { days: Math.max(0, days), label: '31 July 2026' };
}

const STATUS_CONFIG = {
  'E-Verified': { variant: 'success',   icon: BadgeCheck  },
  'Processed':  { variant: 'default',   icon: CheckCircle },
  'Filed':      { variant: 'warning',   icon: FileText    },
  default:      { variant: 'secondary', icon: Clock       },
};

function TaxUpdatesCard() {
  const [state, setState]     = useState(null);
  const [localRunning, setLR] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch('/api/v1/corpus/status', { signal: controller.signal })
        .then(r => r.json())
        .then(data => { setState(data); if (data.status !== 'running') setLR(false); })
        .catch(err => { if (err.name !== 'AbortError') {} });
    load();
    const id = setInterval(load, 30_000);
    return () => { clearInterval(id); controller.abort(); };
  }, []);

  const triggerRefresh = async () => {
    setLR(true);
    setState(s => ({ ...s, status: 'running' }));
    await fetch('/api/v1/corpus/refresh', { method: 'POST' }).catch(() => {});
  };

  const isRunning = state?.status === 'running' || localRunning;
  const updates   = (state?.recent_updates || []).slice(0, 2);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          What's New in Tax Law
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={triggerRefresh}
          disabled={isRunning}
          className="h-7 w-7 text-gray-500 hover:text-gray-300"
          title="Refresh tax law data"
        >
          {isRunning
            ? <Loader size={13} className="animate-spin text-indigo-400" />
            : <RefreshCw size={13} />}
        </Button>
      </div>

      {isRunning && (
        <p className="text-xs text-gray-500 flex items-center gap-2 py-2">
          <Loader size={11} className="animate-spin text-indigo-400" />
          Searching CBDT circulars &amp; budget updates…
        </p>
      )}

      {!isRunning && updates.length === 0 && (
        <p className="text-xs text-gray-500 py-2 text-center">
          {state?.status === 'never_run'
            ? 'Hit refresh to fetch the latest tax law changes.'
            : 'No updates found. Try refreshing.'}
        </p>
      )}

      {!isRunning && updates.length > 0 && (
        <div className="flex flex-col gap-4">
          {updates.map((u, i) => (
            <div key={i} className="flex gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 leading-snug line-clamp-2">{u.title}</p>
                {u.snippet && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{u.snippet}</p>
                )}
                {u.url?.startsWith('https://') && (
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-1 w-fit"
                  >
                    Read more <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Dashboard({ profile, taxData, setTab }) {
  if (!taxData?.summary) {
    return (
      <div className="animate-fade-in flex items-center justify-center h-40 text-gray-500 text-sm">
        Calculating your tax snapshot…
      </div>
    );
  }

  const isOptimalNew = taxData.summary.optimal_regime === 'new';
  const optimalTax   = isOptimalNew ? taxData.new_regime.total_tax : taxData.old_regime.total_tax;
  const taxSaved     = taxData.summary.tax_saved;

  const tp       = profile.tax_paid;
  const totalTDS = (tp.tds_salary || 0) + (tp.tds_other || 0) + (tp.advance_tax || 0);
  const netDiff  = totalTDS - optimalTax;

  const pastFilings = profile.past_filings || [];

  const { days, label: deadlineLabel } = getDeadlineInfo();
  const isUrgent = days <= 30;
  const greeting = getGreeting();

  return (
    <div className="animate-fade-in">

      {/* ── Greeting & Deadline pill ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-100">{greeting} 👋</h2>
          <p className="text-sm text-gray-400 mt-0.5">Here's your tax snapshot for AY 2026-27.</p>
        </div>
        <Badge
          variant={isUrgent ? 'destructive' : 'warning'}
          className="shrink-0 px-3 py-2 rounded-xl text-xs"
        >
          <Clock size={12} />
          {deadlineLabel} · {days} days
        </Badge>
      </div>

      {/* ── 2-column grid on desktop ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── LEFT column ── */}
        <div className="flex flex-col gap-5">

          {/* Tax Snapshot hero card */}
          <Card className="p-5 bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Your Tax Snapshot
              </span>
              <Badge>AY 2026-27</Badge>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Regime</span>
                <span className="text-gray-100 font-semibold text-sm">
                  {isOptimalNew ? 'New (Optimal)' : 'Old (Optimal)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Est. Tax Liability</span>
                <span className="text-gray-100 font-bold text-lg font-mono">₹{fmt(optimalTax)}</span>
              </div>
              {totalTDS > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">TDS / Advance Tax Paid</span>
                  <span className="text-gray-300 font-mono text-sm">₹{fmt(totalTDS)}</span>
                </div>
              )}
              <Separator />
              {totalTDS > 0 ? (
                <div className="flex justify-between items-center">
                  {netDiff >= 0 ? (
                    <>
                      <span className="text-emerald-400 font-semibold text-sm">Estimated Refund</span>
                      <span className="text-emerald-400 font-bold font-mono">+₹{fmt(netDiff)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-red-400 font-semibold text-sm">⚠️ Balance Due</span>
                      <span className="text-red-400 font-bold font-mono">₹{fmt(Math.abs(netDiff))}</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">TDS / Advance Tax</span>
                  <span className="text-gray-500 text-xs">Enter via File Taxes</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <Button className="flex-1 py-3" onClick={() => setTab('filing')}>
                📁 Upload Form 16
              </Button>
              <Button variant="secondary" className="flex-1 py-3" onClick={() => setTab('advisor')}>
                💬 Ask Mitra
              </Button>
            </div>
          </Card>

          {/* Quick Wins (only when savings > 0) */}
          {taxSaved > 0 && (
            <Card className="p-5 border-amber-500/20 bg-amber-500/5">
              <div className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3">
                🎯 Quick Win
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">
                I checked — you could save{' '}
                <span className="text-amber-400 font-bold text-base">₹{fmt(taxSaved)}</span>
                {' '}by switching to the{' '}
                <strong className="text-gray-100">{isOptimalNew ? 'New' : 'Old'} Regime</strong>.
              </p>
              <div className="flex gap-2 mt-4">
                <Button className="flex-1 py-2.5" onClick={() => setTab('filing')}>
                  Show me how
                </Button>
                <Button variant="secondary" className="flex-1 py-2.5" onClick={() => setTab('advisor')}>
                  Ask Mitra
                </Button>
              </div>
            </Card>
          )}

          {/* Past Filings compact (if any) */}
          {pastFilings.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Recent Filings
                </span>
                <Button variant="link" size="sm" className="text-indigo-400 p-0 h-auto" onClick={() => setTab('reports')}>
                  View all <ChevronRight size={12} />
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {pastFilings.slice(0, 3).map((f) => {
                  const cfg  = STATUS_CONFIG[f.status] || STATUS_CONFIG.default;
                  const SIco = cfg.icon;
                  return (
                    <div key={f.ay + f.itr_form} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-200">{f.ay}</span>
                        <Badge>{f.itr_form}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-300 font-mono">₹{fmt(f.tax_paid)}</span>
                        <Badge variant={cfg.variant}>
                          <SIco size={10} /> {f.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

        </div>

        {/* ── RIGHT column ── */}
        <div className="flex flex-col gap-5">

          {/* Regime Comparison */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Regime Comparison
              </span>
              <Button variant="link" size="sm" className="text-indigo-400 p-0 h-auto" onClick={() => setTab('filing')}>
                Calculate <ChevronRight size={12} />
              </Button>
            </div>
            <div className="flex flex-col gap-4">
              {[
                {
                  label:    'New Regime',
                  sublabel: 'Lower slabs, standard deduction ₹75k',
                  tax:      taxData.new_regime.total_tax,
                  isOpt:    isOptimalNew,
                },
                {
                  label:    'Old Regime',
                  sublabel: `Deductions: ₹${fmt(taxData.old_regime.deductions.total)}`,
                  tax:      taxData.old_regime.total_tax,
                  isOpt:    !isOptimalNew,
                },
              ].map(({ label, sublabel, tax, isOpt }) => {
                const maxTax = Math.max(taxData.new_regime.total_tax, taxData.old_regime.total_tax, 1);
                return (
                  <div key={label}>
                    <div className="flex justify-between items-baseline mb-2">
                      <div>
                        <span className="text-sm font-semibold text-gray-200">{label}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
                      </div>
                      <span className={`text-sm font-bold ${isOpt ? 'text-emerald-400' : 'text-gray-400'}`}>
                        ₹{fmt(tax)} {isOpt && '✓'}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, (tax / maxTax) * 100)}
                      indicatorClassName={isOpt ? 'bg-emerald-500' : 'bg-gray-600'}
                    />
                  </div>
                );
              })}
            </div>

            {taxSaved > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-400">Savings vs alternative</span>
                <span className="text-emerald-400 font-bold text-sm">₹{fmt(taxSaved)}</span>
              </div>
            )}
          </Card>

          {/* What's New in Tax Law */}
          <TaxUpdatesCard />

        </div>
      </div>

      {/* ── Trust footer ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-gray-600 justify-center py-4 mt-2">
        <Shield size={11} className="text-indigo-400" />
        Your data is encrypted and never shared. Stored only on this device.
      </div>

    </div>
  );
}
