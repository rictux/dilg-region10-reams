
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import AuthBrandPanel from './AuthBrandPanel';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login, user, loading, loginWithGoogle } = useAuth();

  useEffect(() => {
    const authError = localStorage.getItem('auth_error');
    if (authError) {
      setError(authError);
      localStorage.removeItem('auth_error');
    }
    const authSuccess = localStorage.getItem('auth_success');
    if (authSuccess) {
      // We can use error state to show success message for now, or add a success state
      // But since it's login, auth_success is usually for signup.
      localStorage.removeItem('auth_success');
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'Scanner') {
        navigate('/scan');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Convert username to lowercase before sending to DB
      await login(username.toLowerCase(), password, rememberMe);

      const storedUser = localStorage.getItem('eventpulse_user') || sessionStorage.getItem('eventpulse_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.role === 'Scanner') {
          navigate('/scan');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading && !isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center">
          <Loader2 className="animate-spin h-8 w-8 text-indigo-600 mb-4" />
          <p className="text-slate-600 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left panel — branding */}
      <AuthBrandPanel />

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-7 h-7 bg-white border border-[rgb(var(--ink)/0.08)] rounded-full flex items-center justify-center overflow-hidden">
              <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain rounded-full" />
            </div>
            <span className="text-slate-900 text-sm font-medium font-mono">REAMS</span>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Sign in</h2>
          <p className="text-sm text-slate-600 mb-8">
            Enter your credentials to access the portal
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 h-10 text-sm rounded-md bg-card border border-[rgb(var(--ink)/0.10)] focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-900 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-10 h-10 text-sm rounded-md bg-card border border-[rgb(var(--ink)/0.10)] focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 accent-indigo-600 border-[rgb(var(--ink)/0.10)] rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-xs text-slate-700">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 h-10 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[rgb(var(--ink)/0.08)]"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-slate-50 text-slate-600">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loginWithGoogle()}
              disabled={isLoading}
              className="w-full h-10 bg-card border border-[rgb(var(--ink)/0.10)] text-slate-900 text-sm font-medium rounded-md hover:bg-card/60 hover:border-[rgb(var(--ink)/0.20)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>

            <p className="text-center text-xs text-slate-600 mt-6">
              Don't have an account?{' '}
              <Link to="/signup" className="text-indigo-600 hover:underline font-medium">
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
