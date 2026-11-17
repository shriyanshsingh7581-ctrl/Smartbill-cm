import React, { useState } from 'react';
import {
  Smartphone,
  Lock,
  CheckCircle2,
  CloudOff,
  ArrowRight,
  Eye,
  EyeOff,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from '../firebase';

interface AuthScreenProps {
  onAuthSuccess?: (phone?: string, shopName?: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [modalMode, setModalMode] = useState<'none' | 'email_login' | 'email_signup'>('none');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+917581030272');
  const [shopName, setShopName] = useState('SmartBill CM');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [providerConsoleHint, setProviderConsoleHint] = useState(false);

  const normalizeEmail = (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (trimmed.includes('@')) return trimmed;
    // Allow phone number + password login by mapping phone digits to a valid email domain
    const digits = trimmed.replace(/[^0-9a-zA-Z]/g, '');
    return `${digits || 'user'}@smartbillcm.shop`;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setProviderConsoleHint(false);
    if (!email.trim() || !password) {
      setErrorMsg('Please enter your Email ID / Phone and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const finalEmail = normalizeEmail(email);

    try {
      if (modalMode === 'email_signup') {
        await createUserWithEmailAndPassword(auth, finalEmail, password);
      } else {
        try {
          await signInWithEmailAndPassword(auth, finalEmail, password);
        } catch (signInErr: unknown) {
          const code = (signInErr as { code?: string })?.code || '';
          if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
            // Automatically register new user if account doesn't exist yet
            await createUserWithEmailAndPassword(auth, finalEmail, password);
          } else {
            throw signInErr;
          }
        }
      }
      onAuthSuccess?.(phone, shopName);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const message = err instanceof Error ? err.message : String(err);
      if (code === 'auth/operation-not-allowed' || message.includes('operation-not-allowed')) {
        setProviderConsoleHint(true);
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in your Firebase project console. Enable it in Firebase Console → Authentication → Sign-in method, or click "Instant Sign In with Google" below.'
        );
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErrorMsg('Incorrect password or email. Please check your credentials or create a new account.');
      } else if (code === 'auth/email-already-in-use') {
        try {
          await signInWithEmailAndPassword(auth, finalEmail, password);
          onAuthSuccess?.(phone, shopName);
          return;
        } catch {
          setErrorMsg('This email is already registered. Please sign in with your existing password.');
        }
      } else {
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onAuthSuccess?.(phone, shopName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#06182c] flex flex-col justify-between text-white select-none overflow-x-hidden">
      {/* Top Hero Marketing Section (Exact match to 07:54) */}
      <div className="px-5 pt-6 pb-4 max-w-md mx-auto w-full">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-5">
          <img
            src="https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png"
            alt="SmartBill CM Logo"
            className="w-12 h-12 rounded-2xl object-cover shadow-lg border border-white/20 bg-white shrink-0"
          />
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white leading-tight">
              SmartBill CM
            </h1>
            <p className="text-xs text-slate-300">Billing & Inventory Management</p>
          </div>
        </div>

        {/* Main Tagline */}
        <div className="mb-5">
          <p className="text-xl font-bold text-slate-200 leading-snug">Not just billing.</p>
          <h2 className="text-2xl font-extrabold text-[#4ea8ff] leading-tight">
            WhatsApp Sales Automation.
          </h2>
        </div>

        {/* Horizontal Feature Cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Card 1: WhatsApp Automation Bot */}
          <div className="bg-white text-slate-900 rounded-2xl p-3.5 shadow-lg">
            <h3 className="text-xs font-extrabold text-[#0A2540] leading-tight">
              WhatsApp Automation Bot
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 mb-2.5 leading-snug">
              Automate sales, support & payments on WhatsApp
            </p>
            <div className="space-y-1.5 text-[10px] font-semibold text-slate-700">
              <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px]">
                  💬
                </span>
                <span>Autoreply</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1">
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px]">
                  🛒
                </span>
                <span>Order & Payment</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1">
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[9px]">
                  📦
                </span>
                <span>Track & Update</span>
              </div>
            </div>
            <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-slate-500">Payment Received</p>
                <p className="text-xs font-extrabold text-slate-900">₹299.00</p>
              </div>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                Confirmed ✓
              </span>
            </div>
          </div>

          {/* Card 2: One Tap Online Store */}
          <div className="bg-white text-slate-900 rounded-2xl p-3.5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
                  🏪
                </span>
                <h3 className="text-xs font-extrabold text-[#0A2540] leading-tight">
                  One Tap Online Store
                </h3>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug mb-2">
                Launch your online store with custom domain & mobile app in one click
              </p>
            </div>
            <div className="bg-gradient-to-br from-[#0A2540] to-[#1e3a8a] text-white rounded-xl p-2.5 text-[10px]">
              <p className="font-bold text-[10px] leading-tight">Welcome to Your Online Store</p>
              <p className="text-[8px] text-blue-200 mt-0.5">
                Shop the best products at unbeatable prices
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1">
                <div className="bg-white/15 rounded p-1 text-center text-[8px]">Snacks</div>
                <div className="bg-white/15 rounded p-1 text-center text-[8px]">Dairy</div>
                <div className="bg-white/15 rounded p-1 text-center text-[8px]">Staples</div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-[#0f2942] border border-white/10 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>50,000+ retailers</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#0f2942] border border-white/10 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200">
            <CloudOff className="w-3.5 h-3.5 text-sky-400" />
            <span>Works offline</span>
          </div>
        </div>
      </div>

      {/* Bottom White Sheet (Exact match to 07:54) */}
      <div className="bg-white text-slate-900 rounded-t-3xl px-6 pt-6 pb-8 shadow-2xl max-w-md mx-auto w-full">
        <h2 className="text-xl font-extrabold text-[#0A2540]">Sign in to your shop</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Products, bills, staff, orders and your online store — synced live on every device you
          sign in from.
        </p>

        {/* Primary CTA 1 */}
        <button
          type="button"
          onClick={() => {
            setModalMode('email_signup');
            setErrorMsg(null);
          }}
          className="mt-5 w-full bg-[#1565c0] hover:bg-[#0d47a1] text-white rounded-2xl p-3.5 flex items-center justify-between shadow-md active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">Continue with Email / Phone</p>
              <p className="text-[11px] text-blue-100 mt-0.5">
                Create new shop account or sign in
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-white shrink-0" />
        </button>

        {/* Secondary CTA 2: Email / Phone & Password */}
        <button
          type="button"
          onClick={() => {
            setModalMode('email_login');
            setErrorMsg(null);
          }}
          className="mt-3 w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 rounded-2xl p-3.5 flex items-center justify-between active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <Lock className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0A2540] leading-tight">
                Email / Phone & password
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">For existing users</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>

        {/* Instant Google Sign-In option */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="mt-3 w-full bg-slate-100 hover:bg-slate-200 text-[#0A2540] rounded-xl py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <span>G</span>
          <span>Continue with Google Account</span>
        </button>

        {/* Language Strip */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <span>文A</span>
          <span>English · Hindi · Gujarati · Marathi · Tamil</span>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          By continuing, you agree to our{' '}
          <span className="text-[#1565c0] underline cursor-pointer">Privacy Policy</span>
        </p>
      </div>

      {/* Email / Password Sign-In & Sign-Up Modal */}
      {modalMode !== 'none' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white text-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-[#0A2540]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0A2540]">
                    {modalMode === 'email_signup' ? 'Create Shop Account' : 'Sign In to Shop'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {modalMode === 'email_signup'
                      ? 'Register with Email ID & Password'
                      : 'Sign in with your Email ID or Phone & Password'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalMode('none')}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1">
                  <p>{errorMsg}</p>
                  {providerConsoleHint && (
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="mt-2 bg-[#0A2540] text-white font-bold px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
                    >
                      <span>Instant Sign In with Google</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email ID or Phone Number *
                </label>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@shop.com or +919876543210"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#0A2540]"
                />
              </div>

              {modalMode === 'email_signup' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Shop Name
                    </label>
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="SmartBill CM"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0A2540]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+917581030272"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0A2540]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (min 6 chars)"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-[#0A2540]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setModalMode(modalMode === 'email_signup' ? 'email_login' : 'email_signup')
                  }
                  className="text-[#1565c0] font-bold hover:underline"
                >
                  {modalMode === 'email_signup'
                    ? 'Already have an account? Sign In'
                    : 'New user? Create Shop Account'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="py-3 rounded-xl bg-[#0A2540] text-white font-bold text-sm shadow-md disabled:opacity-50"
                >
                  {loading
                    ? 'Signing in...'
                    : modalMode === 'email_signup'
                      ? 'Create Account'
                      : 'Sign In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
