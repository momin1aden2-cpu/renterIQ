'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { login, signup, socialLogin, resetPassword, error, clearError } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password, rememberMe);
        onClose();
      } else if (mode === 'signup') {
        await signup(email, password, name);
        setMode('verify');
      } else if (mode === 'forgot') {
        await resetPassword(email);
        alert('Password reset email sent!');
        setMode('login');
      }
    } catch {
      // Error handled by auth context
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple' | 'microsoft') => {
    setLoading(true);
    try {
      await socialLogin(provider);
      onClose();
    } catch {
      // Error handled by auth context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'verify' && 'Verify Email'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {mode === 'login' && 'Sign in to access your saved properties'}
            {mode === 'signup' && 'Join RenterIQ to track your rental journey'}
            {mode === 'forgot' && "We'll send you a reset link"}
            {mode === 'verify' && 'Check your email for a verification link'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Forms */}
        {mode !== 'verify' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="float-right text-xs text-teal-600 hover:text-teal-700"
                    >
                      Forgot password?
                    </button>
                  )}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password (min 8 chars)' : 'Enter your password'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            )}

            {mode === 'login' && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Remember me
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-slate-600">
              We&apos;ve sent a verification link to <strong>{email}</strong>
            </p>
            <button
              onClick={() => setMode('login')}
              className="rounded-lg bg-teal-600 px-6 py-2.5 font-semibold text-white transition hover:bg-teal-700"
            >
              Go to Sign In
            </button>
          </div>
        )}

        {/* Social Login */}
        {mode !== 'verify' && mode !== 'forgot' && (
          <>
            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-500">or continue with</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSocialLogin('google')}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialLogin('apple')}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.128 22 16.991 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                Apple
              </button>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-slate-600">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-semibold text-teal-600 hover:text-teal-700"
              >
                Sign up
              </button>
            </>
          ) : mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="font-semibold text-teal-600 hover:text-teal-700"
              >
                Sign in
              </button>
            </>
          ) : null}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
