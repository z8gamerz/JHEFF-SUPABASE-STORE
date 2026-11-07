'use client';

import { useState, useEffect } from 'react';
import { metadataService } from '@/lib/services/metadata-service';
import { auditService } from '@/lib/services/audit-service';
import { useAuth } from '@/lib/contexts/auth-context';
import { apiFetch } from '@/lib/api-client';
import { 
  Mail, 
  KeyRound, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Loader2, 
  Save, 
  ExternalLink,
  ShieldCheck,
  CalendarCheck
} from 'lucide-react';

export function EmailSettings() {
  const { user } = useAuth();
  const [senderEmail, setSenderEmail] = useState('');
  const [appPassword, setAppPassword] = useState(''); // not persisted; used only for explicit test when server env is not configured
  const [defaultRecipient, setDefaultRecipient] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadEmailConfig() {
      try {
        const [senderEntry, recipientEntry] = await Promise.all([
          metadataService.get('email_smtp_sender'),
          metadataService.get('email_default_recipient'),
        ]);
        if (senderEntry?.value) setSenderEmail(senderEntry.value);
        if (recipientEntry?.value) setDefaultRecipient(recipientEntry.value);
        // Never load persisted app passwords; configure SMTP_APP_PASSWORD on the server.
      } catch (err) {
        console.error('Failed to load email SMTP settings:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadEmailConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTestResult(null);

    try {
      await Promise.all([
        metadataService.set('email_smtp_sender', senderEmail.trim()),
        metadataService.set('email_default_recipient', defaultRecipient.trim()),
      ]);
      // Do NOT persist app passwords in browser storage or cloud-synced metadata.
      // Configure SMTP_SENDER_EMAIL / SMTP_APP_PASSWORD in server environment.

      await auditService.log(
        'EMAIL_CONFIG_UPDATED',
        JSON.stringify({
          senderEmail: senderEmail.trim(),
          defaultRecipient: defaultRecipient.trim(),
          passwordStoredLocally: false,
        }),
        user?.name || 'Administrator'
      );

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to save email settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // If appPassword is provided, test that explicit credential once (server-side). Otherwise test server-configured SMTP.
      const body: any = appPassword.trim()
        ? { senderEmail: senderEmail.trim(), appPassword: appPassword.trim() }
        : {};
      const response = await apiFetch('/api/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let data: any = null;
      try { data = responseText ? JSON.parse(responseText) : null; } catch {}

      if (response.ok && data?.success) {
        setTestResult({ success: true, message: data?.message || 'SMTP connection verified.' });
      } else {
        const hint = response.status === 503
          ? ' Set POS_API_SECRET and SMTP env vars on the server, then redeploy.'
          : response.status === 401
            ? ' Save the POS API key (same as server POS_API_SECRET) in Admin → System Health, or verify SMTP credentials.'
            : response.status === 403
              ? ' Set ALLOWED_ORIGINS to your deployed site URL.'
              : '';
        setTestResult({
          success: false,
          message: (data?.error || `Authentication failed (HTTP ${response.status}).`) + hint + ' For production, configure SMTP_SENDER_EMAIL/SMTP_APP_PASSWORD on the server; the test password field is not saved.',
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Network error occurred while testing SMTP connection.' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  const isConfigured = Boolean(senderEmail);

  return (
    <div className="space-y-8">
      {/* Configuration Header Card */}
      <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 dark:bg-orange-950/60 p-3.5 rounded-2xl text-orange-600 dark:text-orange-400">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-lg text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                Gmail &amp; Weekly Report Dispatch
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isConfigured 
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                }`}>
                  {isConfigured ? 'Ready to Send' : 'Credentials Needed'}
                </span>
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                Configure your Google Account and App Password to automatically dispatch Monday–Sunday weekly audits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-xl">
            <CalendarCheck className="w-4 h-4 text-orange-600" />
            <span>Cycle: Monday – Sunday</span>
          </div>
        </div>

        {/* Instructions banner */}
        <div className="mt-6 p-5 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900 dark:text-blue-300 font-medium leading-relaxed">
                <strong className="font-bold">Security:</strong> App passwords are <strong>not saved</strong> in this app and are never synced to cloud metadata. Configure <code>SMTP_SENDER_EMAIL</code> and <code>SMTP_APP_PASSWORD</code> in your server environment for production. You may enter a password below only to test the connection (it is not stored).
              </div>
          </div>
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs"
          >
            Google App Passwords
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Credential Form */}
        <form onSubmit={handleSave} className="mt-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sender Email */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 ml-3">
                Sender Gmail Address
              </label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  required
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="your-store@gmail.com"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl pl-14 pr-6 py-4 font-bold text-gray-950 dark:text-white focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition-all outline-none text-sm"
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-3 font-medium">
                The Gmail account used to send the report emails.
              </p>
            </div>

            {/* App Password */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 ml-3">
                Google App Password (test only, not saved)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx (not saved)"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl pl-14 pr-12 py-4 font-bold text-gray-950 dark:text-white focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition-all outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-3 font-medium">
                16-character password for one-time SMTP test only. It is cleared from the form context by not persisting; do not store secrets in the browser.
              </p>
            </div>

            {/* Default Recipient Email */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 ml-3">
                Default Recipient Email (Owner / Manager / Accountant)
              </label>
              <div className="relative">
                <Send className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  value={defaultRecipient}
                  onChange={(e) => setDefaultRecipient(e.target.value)}
                  placeholder="owner@gmail.com, accountant@store.ph"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl pl-14 pr-6 py-4 font-bold text-gray-950 dark:text-white focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition-all outline-none text-sm"
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-3 font-medium">
                The primary email that will automatically populate when clicking &quot;Email Report&quot;.
              </p>
            </div>
          </div>

          {/* Test Status Feedback */}
          {testResult && (
            <div className={`p-4 rounded-2xl border flex items-start gap-3 transition-all ${
              testResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-bold leading-relaxed">{testResult.message}</div>
            </div>
          )}

          {/* Actions Bar */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="w-full sm:w-auto px-6 py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing SMTP...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 text-orange-600" />
                    Test Connection
                  </>
                )}
              </button>

              {saveSuccess && (
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Credentials Saved!
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black px-10 py-4 rounded-2xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-lg shadow-orange-500/20 cursor-pointer border-none transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Credentials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

