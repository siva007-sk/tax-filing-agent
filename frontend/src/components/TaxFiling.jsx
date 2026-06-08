import { Fragment, useState } from 'react';
import {
  Upload, PenLine, ArrowRight, ArrowLeft, CheckCircle, FileText,
  Sparkles, ChevronDown, ChevronUp, Download, AlertCircle, Loader, Database,
} from 'lucide-react';

const fmt = n => (n || 0).toLocaleString('en-IN');

const EMPTY_FORM = {
  personal: { pan: '', age_category: 'general', residential_status: 'resident' },
  income: {
    salary:             { basic: '', hra: '', lta: '', special: '' },
    house_property:     { rental: '', interest_paid: '', municipal_taxes: '', rental_paid: '' },
    capital_gains:      { stcg_111a: '', ltcg_112a: '' },
    business_profession:{ turnover: '' },
    other_sources:      { interest: '', dividend: '', family_pension: '' },
  },
  deductions: {
    '80C':      { breakdown: { epf: '', ppf: '', elss: '', lic: '', tuition: '' } },
    '80D':      { self_family: '', parents: '', senior_citizen_flag: false, parents_senior_citizen_flag: false },
    '80CCD_1B': '',
    '80E':      '',
    '80G':      { eligible_100: '', eligible_50: '' },
    '80EEA':    { interest: '' },
    '80TTA':    '',
    '80TTB':    '',
  },
  tax_paid: { tds_salary: '', tds_other: '', advance_tax: '' },
};

function toProfile(f) {
  const n = v => Number(v) || 0;
  return {
    personal: {
      pan: f.personal.pan || 'XXXXX0000X',
      age_category: f.personal.age_category,
      residential_status: f.personal.residential_status,
    },
    income: {
      salary: { basic: n(f.income.salary.basic), hra: n(f.income.salary.hra), lta: n(f.income.salary.lta), special: n(f.income.salary.special) },
      house_property: { rental: n(f.income.house_property.rental), interest_paid: n(f.income.house_property.interest_paid), municipal_taxes: n(f.income.house_property.municipal_taxes), rental_paid: n(f.income.house_property.rental_paid) },
      capital_gains: { stcg_111a: n(f.income.capital_gains.stcg_111a), ltcg_112a: n(f.income.capital_gains.ltcg_112a) },
      business_profession: { turnover: n(f.income.business_profession.turnover), presumptive: false },
      other_sources: { interest: n(f.income.other_sources.interest), dividend: n(f.income.other_sources.dividend), family_pension: n(f.income.other_sources.family_pension) },
    },
    deductions: {
      '80C': { breakdown: { epf: n(f.deductions['80C'].breakdown.epf), ppf: n(f.deductions['80C'].breakdown.ppf), elss: n(f.deductions['80C'].breakdown.elss), lic: n(f.deductions['80C'].breakdown.lic), tuition: n(f.deductions['80C'].breakdown.tuition) } },
      '80D': { self_family: n(f.deductions['80D'].self_family), parents: n(f.deductions['80D'].parents), senior_citizen_flag: f.deductions['80D'].senior_citizen_flag, parents_senior_citizen_flag: f.deductions['80D'].parents_senior_citizen_flag },
      '80CCD_1B': n(f.deductions['80CCD_1B']),
      '80E': n(f.deductions['80E']),
      '80G': { eligible_100: n(f.deductions['80G'].eligible_100), eligible_50: n(f.deductions['80G'].eligible_50), total: 0 },
      '80EEA': { interest: n(f.deductions['80EEA'].interest) },
      '80TTA': n(f.deductions['80TTA']),
      '80TTB': n(f.deductions['80TTB']),
      '80U': { disability_percentage: 0 },
    },
    tax_paid: { tds_salary: n(f.tax_paid.tds_salary), tds_other: n(f.tax_paid.tds_other), advance_tax: n(f.tax_paid.advance_tax), self_assessment_tax: 0 },
    regime: { chosen: 'new', switched: false },
  };
}

function suggestItrForm(profile) {
  const sal = profile.income.salary;
  const grossSalary = sal.basic + sal.hra + sal.lta + sal.special;
  const hasCG = profile.income.capital_gains.stcg_111a > 0 || profile.income.capital_gains.ltcg_112a > 0;
  const hasBusiness = profile.income.business_profession.turnover > 0;
  const hasHPLoss = profile.income.house_property.interest_paid > 0 || profile.income.house_property.rental > 0;
  const totalIncome = grossSalary +
    profile.income.capital_gains.stcg_111a + profile.income.capital_gains.ltcg_112a +
    profile.income.other_sources.interest + profile.income.other_sources.dividend +
    profile.income.other_sources.family_pension +
    profile.income.business_profession.turnover;

  if (hasBusiness) {
    return {
      form: 'ITR-3', accent: 'amber',
      reasons: ['Business or professional income reported'],
      note: 'Covers all income types including business/professional income.',
    };
  }
  const reasons = [];
  if (hasCG) reasons.push('Capital gains income (STCG/LTCG)');
  if (totalIncome > 5_000_000) reasons.push('Total income exceeds ₹50 Lakh');
  if (hasHPLoss) reasons.push('House property income or interest deduction');
  if (reasons.length) {
    return {
      form: 'ITR-2', accent: 'indigo',
      reasons,
      note: 'Covers salary, capital gains, house property, and other sources (excludes business income).',
    };
  }
  return {
    form: 'ITR-1', accent: 'emerald',
    reasons: ['Salary income only', 'Total income under ₹50 Lakh', 'No capital gains'],
    note: 'Simplest form. Covers salary + 1 house property + other sources up to ₹50 Lakh.',
  };
}

function Field({ label, value, onChange, placeholder = '0', type = 'number', prefix = '₹' }) {
  return (
    <div className="field-row">
      <label className="form-label">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={prefix ? 'pl-7' : ''}
          min="0"
        />
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        className="w-full flex justify-between items-center px-5 py-4 text-sm font-bold text-gray-100 hover:bg-gray-800/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {title}
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>}
    </div>
  );
}

const STEPS = ['Income', 'Deductions', 'Tax Paid', 'Results'];

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => {
        const idx  = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${done || active ? (active ? 'text-indigo-400' : 'text-emerald-400') : 'text-gray-600'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-600'}`}>
                {done ? <CheckCircle size={12} /> : idx}
              </div>
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${step > idx ? 'bg-emerald-500' : 'bg-gray-800'}`} />}
          </Fragment>
        );
      })}
    </div>
  );
}

export default function TaxFiling({ setProfile: setGlobalProfile, setTaxData, setTab }) {
  const [step, setStep]     = useState(0);       // 0=entry, 1=income, 2=deductions, 3=taxpaid, 4=results
  const [form, setForm]     = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [calculating, setCal]     = useState(false);
  const [result, setResult] = useState(null);
  const [itr, setItr]       = useState(null);
  const [suggestion, setSug] = useState(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [saving, setSaving]   = useState(false);
  const [savedId, setSavedId] = useState(null);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const setIncome   = (path, val) => setForm(f => ({ ...f, income:     { ...f.income,     [path[0]]: { ...f.income[path[0]],     [path[1]]: val } } }));
  const setDed      = (key, val)  => setForm(f => ({ ...f, deductions: { ...f.deductions, [key]: val } }));
  const setDed80C   = (k, val)    => setForm(f => ({ ...f, deductions: { ...f.deductions, '80C': { breakdown: { ...f.deductions['80C'].breakdown, [k]: val } } } }));
  const setDed80D   = (k, val)    => setForm(f => ({ ...f, deductions: { ...f.deductions, '80D': { ...f.deductions['80D'], [k]: val } } }));
  const setDed80G   = (k, val)    => setForm(f => ({ ...f, deductions: { ...f.deductions, '80G': { ...f.deductions['80G'], [k]: val } } }));
  const setTaxPaid  = (k, val)    => setForm(f => ({ ...f, tax_paid:   { ...f.tax_paid,   [k]: val } }));
  const setPersonal = (k, val)    => setForm(f => ({ ...f, personal:   { ...f.personal,   [k]: val } }));

  // ── Form 16 upload ───────────────────────────────────────────────────────────
  const handleForm16Upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('document_type', 'form16');
    try {
      const res  = await fetch('/api/v1/documents/parse', { method: 'POST', body: fd });
      const data = await res.json();
      const ext  = data.parse_result?.extracted_data;
      if (ext?.income) {
        const sb = ext.income.salary_breakup;
        setForm(f => ({
          ...f,
          personal: { ...f.personal, pan: ext.employee?.pan || '' },
          income: { ...f.income, salary: { basic: sb.basic || '', hra: sb.hra || '', lta: sb.lta || '', special: sb.special || '' } },
          deductions: {
            ...f.deductions,
            '80C': { breakdown: { epf: ext.deductions_chapter_via?.sec_80c?.epf || '', ppf: ext.deductions_chapter_via?.sec_80c?.ppf || '', elss: ext.deductions_chapter_via?.sec_80c?.elss || '', lic: ext.deductions_chapter_via?.sec_80c?.lic || '', tuition: '' } },
            '80D': { ...f.deductions['80D'], self_family: ext.deductions_chapter_via?.sec_80d?.self_family || '' },
          },
          tax_paid: { ...f.tax_paid, tds_salary: ext.tax_deducted?.tds_salary || '' },
        }));
        setUploadMsg(`Form 16 extracted — ${ext.employee?.name || 'employee'}, ${ext.employee?.assessment_year}. Review and proceed.`);
      }
    } catch {
      setUploadMsg('Extraction failed. You can still edit fields manually.');
    } finally {
      setUploading(false);
      setStep(1);
    }
  };

  // ── Calculate & generate ITR ─────────────────────────────────────────────────
  const handleCalculate = async () => {
    setCal(true);
    const profile = toProfile(form);
    try {
      const [taxRes, itrRes] = await Promise.all([
        fetch('/api/v1/tax/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }),
        fetch('/api/v1/itr/generate',  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regime: null }) }),
      ]);
      const taxData = await taxRes.json();
      const itrData = await itrRes.json();
      setResult(taxData);
      setItr(itrData);
      setSug(suggestItrForm(profile));
      // Update global session so dashboard refreshes
      await fetch('/api/v1/memory/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
      setGlobalProfile(profile);
      setTaxData(taxData);
      setStep(4);
    } catch (err) {
      console.error(err);
    } finally {
      setCal(false);
    }
  };

  const saveToRecords = async () => {
    if (!result || !itr) return;
    setSaving(true);
    try {
      const profile     = toProfile(form);
      const sal         = profile.income.salary;
      const grossIncome = sal.basic + sal.hra + sal.lta + sal.special
        + profile.income.other_sources.interest
        + profile.income.other_sources.dividend
        + profile.income.other_sources.family_pension
        + profile.income.capital_gains.stcg_111a
        + profile.income.capital_gains.ltcg_112a
        + profile.income.business_profession.turnover;

      const isNew     = result.summary.optimal_regime === 'new';
      const optTax    = isNew ? result.new_regime.total_tax : result.old_regime.total_tax;
      const tp        = profile.tax_paid;
      const totalPaid = tp.tds_salary + tp.tds_other + tp.advance_tax;
      const netDiff   = totalPaid - optTax;

      const res = await fetch('/api/v1/reports/filings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ay:           '2026-27',
          fy:           '2025-26',
          itr_form:     itr.itr_form || suggestion?.form,
          regime:       result.summary.optimal_regime,
          gross_income: grossIncome,
          tax_paid:     optTax,
          tax_saved:    result.summary.tax_saved,
          refund:       Math.max(0, netDiff),
          payable:      Math.max(0, -netDiff),
          status:       'Generated',
          filed_on:     new Date().toISOString().slice(0, 10),
          ack_no:       '',
          itr_json:     itr.itr_json,
        }),
      });
      const data = await res.json();
      setSavedId(data.id);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const downloadItr = () => {
    const blob = new Blob([JSON.stringify(itr?.itr_json, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ITR_AY2026-27_${form.personal.pan || 'return'}.json`;
    a.click();
  };

  // ── STEP 0: entry mode ───────────────────────────────────────────────────────
  if (step === 0) return (
    <div className="animate-fade-in max-w-2xl mx-auto flex flex-col gap-6 pt-4">
      <div>
        <h2 className="text-2xl font-extrabold text-gray-100">File Your ITR — AY 2026-27</h2>
        <p className="text-gray-400 text-sm mt-1">Choose how you'd like to start. You can edit any pre-filled data before submitting.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="card p-6 flex flex-col gap-3 border-2 border-transparent hover:border-indigo-500/50 cursor-pointer transition-all group">
          <input type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => handleForm16Upload(e.target.files[0])} />
          <div className="bg-indigo-500/15 p-3 rounded-xl w-fit text-indigo-400 group-hover:bg-indigo-500/25 transition-colors">
            <Upload size={24} />
          </div>
          <div>
            <div className="font-bold text-gray-100 text-sm">Upload Form 16</div>
            <div className="text-xs text-gray-400 mt-1 leading-relaxed">Auto-extract salary, TDS, and deductions from your employer-issued Form 16.</div>
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-indigo-400">
              <Loader size={12} className="animate-spin" /> Extracting data...
            </div>
          )}
        </label>

        <button
          className="card p-6 flex flex-col gap-3 border-2 border-transparent hover:border-emerald-500/50 cursor-pointer transition-all text-left group"
          onClick={() => setStep(1)}
        >
          <div className="bg-emerald-500/15 p-3 rounded-xl w-fit text-emerald-400 group-hover:bg-emerald-500/25 transition-colors">
            <PenLine size={24} />
          </div>
          <div>
            <div className="font-bold text-gray-100 text-sm">Enter Manually</div>
            <div className="text-xs text-gray-400 mt-1 leading-relaxed">Fill in your income, deductions, and TDS details step by step.</div>
          </div>
        </button>
      </div>
    </div>
  );

  // ── STEP 1: income ───────────────────────────────────────────────────────────
  if (step === 1) return (
    <div className="animate-fade-in flex flex-col gap-4 max-w-4xl mx-auto">
      <StepBar step={step} />
      {uploadMsg && (
        <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-300">
          <CheckCircle size={16} className="shrink-0 mt-0.5" /> {uploadMsg}
        </div>
      )}

      {/* Personal */}
      <Section title="Personal Details">
        <div className="field-row">
          <label className="form-label">PAN</label>
          <input type="text" value={form.personal.pan} onChange={e => setPersonal('pan', e.target.value.toUpperCase())} placeholder="XXXXX0000X" maxLength={10} />
        </div>
        <div className="field-row">
          <label className="form-label">Age Category</label>
          <select value={form.personal.age_category} onChange={e => setPersonal('age_category', e.target.value)}>
            <option value="general">General (below 60)</option>
            <option value="senior">Senior Citizen (60–79)</option>
            <option value="super_senior">Super Senior (80+)</option>
          </select>
        </div>
        <div className="field-row">
          <label className="form-label">City Type (for HRA)</label>
          <select value={form.personal.residential_status} onChange={e => setPersonal('residential_status', e.target.value)}>
            <option value="resident">Non-Metro</option>
            <option value="metro">Metro (Delhi / Mumbai / Kolkata / Chennai)</option>
          </select>
        </div>
      </Section>

      {/* Salary */}
      <Section title="Salary Income">
        <Field label="Basic Salary"   value={form.income.salary.basic}   onChange={v => setIncome(['salary','basic'],   v)} />
        <Field label="HRA Received"   value={form.income.salary.hra}     onChange={v => setIncome(['salary','hra'],     v)} />
        <Field label="LTA"            value={form.income.salary.lta}     onChange={v => setIncome(['salary','lta'],     v)} />
        <Field label="Special Allowance" value={form.income.salary.special} onChange={v => setIncome(['salary','special'], v)} />
      </Section>

      {/* Other income */}
      <Section title="Other Income" defaultOpen={false}>
        <Field label="Savings / FD Interest"  value={form.income.other_sources.interest}       onChange={v => setIncome(['other_sources','interest'],       v)} />
        <Field label="Dividend Income"         value={form.income.other_sources.dividend}       onChange={v => setIncome(['other_sources','dividend'],       v)} />
        <Field label="Family Pension"          value={form.income.other_sources.family_pension} onChange={v => setIncome(['other_sources','family_pension'], v)} />
        <Field label="STCG u/s 111A"          value={form.income.capital_gains.stcg_111a}      onChange={v => setIncome(['capital_gains','stcg_111a'],      v)} />
        <Field label="LTCG u/s 112A"          value={form.income.capital_gains.ltcg_112a}      onChange={v => setIncome(['capital_gains','ltcg_112a'],      v)} />
        <Field label="Business / Profession Turnover" value={form.income.business_profession.turnover} onChange={v => setIncome(['business_profession','turnover'], v)} />
      </Section>

      {/* House property */}
      <Section title="House Property Income (Old Regime)" defaultOpen={false}>
        <Field label="Annual Rental Income"  value={form.income.house_property.rental}        onChange={v => setIncome(['house_property','rental'],        v)} />
        <Field label="Municipal Taxes Paid"  value={form.income.house_property.municipal_taxes} onChange={v => setIncome(['house_property','municipal_taxes'], v)} />
        <Field label="Home Loan Interest Paid" value={form.income.house_property.interest_paid} onChange={v => setIncome(['house_property','interest_paid'], v)} />
        <Field label="Rent Paid by You (for HRA)" value={form.income.house_property.rental_paid} onChange={v => setIncome(['house_property','rental_paid'], v)} />
      </Section>

      <div className="flex justify-between pt-2">
        <button className="btn-secondary" onClick={() => setStep(0)}><ArrowLeft size={15} /> Back</button>
        <button className="btn-primary" onClick={() => setStep(2)}>Next: Deductions <ArrowRight size={15} /></button>
      </div>
    </div>
  );

  // ── STEP 2: deductions ───────────────────────────────────────────────────────
  if (step === 2) return (
    <div className="animate-fade-in flex flex-col gap-4 max-w-4xl mx-auto">
      <StepBar step={step} />
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-indigo-300">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        Deductions below apply only under the <strong className="text-indigo-200">Old Tax Regime</strong>. The engine computes both regimes and recommends the optimal one.
      </div>

      <Section title="Section 80C — Investments (Cap ₹1,50,000)">
        <Field label="EPF (Employer's PF)"     value={form.deductions['80C'].breakdown.epf}    onChange={v => setDed80C('epf',    v)} />
        <Field label="PPF Contribution"        value={form.deductions['80C'].breakdown.ppf}    onChange={v => setDed80C('ppf',    v)} />
        <Field label="ELSS Mutual Funds"       value={form.deductions['80C'].breakdown.elss}   onChange={v => setDed80C('elss',   v)} />
        <Field label="LIC Premium"             value={form.deductions['80C'].breakdown.lic}    onChange={v => setDed80C('lic',    v)} />
        <Field label="Children's Tuition Fees" value={form.deductions['80C'].breakdown.tuition} onChange={v => setDed80C('tuition', v)} />
      </Section>

      <Section title="Section 80D — Health Insurance">
        <Field label="Self & Family Premium"   value={form.deductions['80D'].self_family} onChange={v => setDed80D('self_family', v)} />
        <Field label="Parents Premium"         value={form.deductions['80D'].parents}     onChange={v => setDed80D('parents',     v)} />
        <div className="field-row sm:col-span-2 lg:col-span-3">
          <label className="form-label">Senior Citizen Flags</label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.deductions['80D'].senior_citizen_flag} onChange={e => setDed80D('senior_citizen_flag', e.target.checked)} className="w-4 h-4 accent-indigo-500" />
              Self is Senior Citizen (limit ₹50k)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.deductions['80D'].parents_senior_citizen_flag} onChange={e => setDed80D('parents_senior_citizen_flag', e.target.checked)} className="w-4 h-4 accent-indigo-500" />
              Parents are Senior Citizens (limit ₹50k)
            </label>
          </div>
        </div>
      </Section>

      <Section title="Other Deductions" defaultOpen={false}>
        <Field label="NPS 80CCD(1B) (Cap ₹50k)"   value={form.deductions['80CCD_1B']} onChange={v => setDed('80CCD_1B', v)} />
        <Field label="Education Loan Interest 80E"  value={form.deductions['80E']}      onChange={v => setDed('80E', v)} />
        <Field label="First Home Loan 80EEA (Cap ₹1.5L)" value={form.deductions['80EEA'].interest} onChange={v => setDed('80EEA', { ...form.deductions['80EEA'], interest: v })} />
        <Field label="Donations 80G (100% eligible)" value={form.deductions['80G'].eligible_100} onChange={v => setDed80G('eligible_100', v)} />
        <Field label="Donations 80G (50% eligible)"  value={form.deductions['80G'].eligible_50}  onChange={v => setDed80G('eligible_50',  v)} />
        <Field label="Savings Interest 80TTA (Cap ₹10k)" value={form.deductions['80TTA']} onChange={v => setDed('80TTA', v)} />
        <Field label="Senior Deposit Interest 80TTB (Cap ₹50k)" value={form.deductions['80TTB']} onChange={v => setDed('80TTB', v)} />
      </Section>

      <div className="flex justify-between pt-2">
        <button className="btn-secondary" onClick={() => setStep(1)}><ArrowLeft size={15} /> Back</button>
        <button className="btn-primary" onClick={() => setStep(3)}>Next: Tax Paid <ArrowRight size={15} /></button>
      </div>
    </div>
  );

  // ── STEP 3: tax paid ─────────────────────────────────────────────────────────
  if (step === 3) return (
    <div className="animate-fade-in flex flex-col gap-4 max-w-4xl mx-auto">
      <StepBar step={step} />

      <Section title="Tax Deducted at Source & Advance Tax">
        <Field label="TDS — Salary (from Form 16)" value={form.tax_paid.tds_salary}  onChange={v => setTaxPaid('tds_salary',  v)} />
        <Field label="TDS — Other Sources"          value={form.tax_paid.tds_other}   onChange={v => setTaxPaid('tds_other',   v)} />
        <Field label="Advance Tax Paid"             value={form.tax_paid.advance_tax} onChange={v => setTaxPaid('advance_tax', v)} />
      </Section>

      <div className="flex justify-between pt-2">
        <button className="btn-secondary" onClick={() => setStep(2)}><ArrowLeft size={15} /> Back</button>
        <button className="btn-primary" onClick={handleCalculate} disabled={calculating}>
          {calculating ? <><Loader size={15} className="animate-spin" /> Calculating…</> : <><Sparkles size={15} /> Calculate &amp; Suggest ITR</>}
        </button>
      </div>
    </div>
  );

  // ── STEP 4: results ──────────────────────────────────────────────────────────
  if (step === 4 && result && suggestion) {
    const isNew    = result.summary.optimal_regime === 'new';
    const optTax   = isNew ? result.new_regime.total_tax : result.old_regime.total_tax;
    const tp       = toProfile(form).tax_paid;
    const totalPaid = tp.tds_salary + tp.tds_other + tp.advance_tax;
    const netDiff  = totalPaid - optTax;

    const accentMap = { emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400' }, indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500', text: 'text-indigo-400' }, amber: { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-400' } };
    const ac = accentMap[suggestion.accent];

    return (
      <div className="animate-fade-in flex flex-col gap-5 max-w-4xl mx-auto">
        <StepBar step={step} />

        {/* ITR form suggestion */}
        <div className={`card p-6 border-l-4 ${ac.border} ${ac.bg}`}>
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <span className={`text-xs font-bold uppercase tracking-widest ${ac.text}`}>Engine Recommendation</span>
              <h2 className="text-2xl font-extrabold text-gray-100 mt-1 flex items-center gap-3">
                <FileText size={22} className={ac.text} />
                File using <span className={ac.text}>{suggestion.form}</span>
              </h2>
              <p className="text-xs text-gray-400 mt-2">{suggestion.note}</p>
            </div>
            <div className="flex flex-col gap-1">
              {suggestion.reasons.map(r => (
                <span key={r} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${ac.bg} ${ac.text} border ${ac.border}`}>
                  <CheckCircle size={11} /> {r}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Regime & tax */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`card p-5 border-l-4 ${isNew ? 'border-emerald-500 bg-emerald-500/5' : 'border-indigo-500 bg-indigo-500/5'}`}>
            <div className="form-label">Optimal Regime</div>
            <div className={`text-xl font-extrabold ${isNew ? 'text-emerald-400' : 'text-indigo-400'}`}>
              {isNew ? 'New Tax Regime' : 'Old Tax Regime'}
            </div>
            <div className="text-xs text-gray-400 mt-1">Saves ₹{fmt(result.summary.tax_saved)} vs the alternative</div>
          </div>
          <div className="card p-5">
            <div className="form-label">Net Tax Liability</div>
            <div className="text-xl font-extrabold text-gray-100">₹{fmt(optTax)}</div>
            <div className="text-xs text-gray-400 mt-1">
              New Regime: ₹{fmt(result.new_regime.total_tax)} · Old Regime: ₹{fmt(result.old_regime.total_tax)}
            </div>
          </div>
          <div className={`card p-5 border-l-4 ${netDiff >= 0 ? 'border-emerald-500' : 'border-red-500'}`}>
            <div className="form-label">{netDiff >= 0 ? 'Estimated Refund' : 'Tax Payable'}</div>
            <div className={`text-xl font-extrabold ${netDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{fmt(Math.abs(netDiff))}</div>
            <div className="text-xs text-gray-400 mt-1">TDS paid: ₹{fmt(totalPaid)}</div>
          </div>
          <div className="card p-5">
            <div className="form-label">Taxable Income</div>
            <div className="text-xl font-extrabold text-gray-100">
              ₹{fmt(isNew ? result.new_regime.taxable_income : result.old_regime.taxable_income)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {isNew
                ? `After SD ₹${fmt(result.new_regime.standard_deduction)}`
                : `After SD + deductions ₹${fmt(result.old_regime.deductions.total + result.old_regime.standard_deduction)}`}
            </div>
          </div>
        </div>

        {/* Tax breakdown */}
        <div className="card p-6">
          <h3 className="text-sm font-bold text-gray-100 mb-4">Tax Computation Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {[
              ['Gross Total Income', fmt(isNew ? result.new_regime.gross_total_income : result.old_regime.gross_total_income)],
              ['Standard Deduction', fmt(isNew ? result.new_regime.standard_deduction : result.old_regime.standard_deduction)],
              ...(isNew ? [] : [['Total Ch. VI-A Deductions', fmt(result.old_regime.deductions.total)], ['HRA Exemption', fmt(result.old_regime.hra_exemption)]]),
              ['Taxable Income', fmt(isNew ? result.new_regime.taxable_income : result.old_regime.taxable_income)],
              ['Base Tax', fmt(isNew ? result.new_regime.base_tax : result.old_regime.base_tax)],
              ['87A Rebate', fmt(isNew ? result.new_regime.rebate_87a : result.old_regime.rebate_87a)],
              ['Health & Education Cess (4%)', fmt(isNew ? result.new_regime.cess : result.old_regime.cess)],
              ['Total Tax Payable', fmt(optTax)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-800">
                <span className="text-gray-400">{label}</span>
                <span className="text-gray-100 font-medium">₹{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button className="btn-success" onClick={downloadItr}>
            <Download size={15} /> Download ITR JSON
          </button>
          <button
            className="btn-primary"
            onClick={saveToRecords}
            disabled={saving || !!savedId}
          >
            {saving
              ? <><Loader size={15} className="animate-spin" /> Saving…</>
              : savedId
                ? <><CheckCircle size={15} /> Saved to Records</>
                : <><Database size={15} /> Save to Records</>}
          </button>
          <button className="btn-secondary" onClick={() => setTab('reports')}>
            View Reports <ArrowRight size={15} />
          </button>
          <button className="btn-secondary" onClick={() => { setStep(0); setForm(EMPTY_FORM); setResult(null); setSavedId(null); }}>
            Start Over
          </button>
        </div>
      </div>
    );
  }

  return null;
}
