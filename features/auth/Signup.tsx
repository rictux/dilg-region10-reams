
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Office } from '../../types/database';
import { Lock, User, Eye, EyeOff, Mail, Briefcase, UserPlus, Building2, ChevronDown, Loader2 } from 'lucide-react';

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    position: '',
    username: '',
    password: '',
    confirmPassword: '',
    office_id: ''
  });

  const [offices, setOffices] = useState<Office[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();
  const { signup, signupWithGoogle } = useAuth();

  useEffect(() => {
    const handleAuthReturn = async () => {
      const authError = localStorage.getItem('auth_error');
      if (authError) {
        setError(authError);
        localStorage.removeItem('auth_error');
        return;
      }

      const authSuccess = localStorage.getItem('auth_success');
      if (authSuccess) {
        setSuccess(true);
        localStorage.removeItem('auth_success');
        setTimeout(() => {
          navigate('/');
        }, 4000);
        return;
      }

      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);

      const cameFromOAuth =
        hash.includes('access_token=') ||
        hash.includes('refresh_token=') ||
        searchParams.get('code') ||
        searchParams.get('error');

      if (cameFromOAuth) {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setError(error.message || 'Authentication failed.');
          return;
        }

        if (data.session?.user) {
          setSuccess(true);

          window.history.replaceState({}, document.title, '/signup');

          setTimeout(() => {
            navigate('/');
          }, 4000);
        }
      }
    };

    handleAuthReturn();
  }, [navigate]);

  useEffect(() => {
    const fetchOffices = async () => {
      const { data, error } = await supabase
        .from('offices')
        .select('*')
        .order('name');

      if (!error && data) {
        setOffices(data);
      }
    };

    fetchOffices();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullName = formData.fullName.trim();

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { data: existingUsers, error: existingUserError } = await supabase
        .from('users')
        .select('status')
        .ilike('full_name', fullName)
        .in('status', ['Active', 'Inactive'])
        .limit(1);

      if (existingUserError) {
        throw existingUserError;
      }

      const existingUser = existingUsers?.[0];

      if (existingUser?.status === 'Inactive') {
        setError('You have already signed up for an account. Please contact RICTU personnel to activate your account before logging in.');
        setIsLoading(false);
        return;
      }

      if (existingUser?.status === 'Active') {
        setError('You already have an active account. Please log in using your account. If you cannot log in, contact RICTU personnel to reset your password.');
        setIsLoading(false);
        return;
      }

      await signup({
        full_name: fullName,
        email: formData.email.trim() || null,
        position: formData.position,
        username: formData.username.toLowerCase(),
        passwordPlain: formData.password,
        office_id: formData.office_id ? parseInt(formData.office_id) : null
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await signupWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with Google.');
      setIsLoading(false);
    }
  };

  const inputCls = "w-full pl-9 pr-3 h-10 text-sm rounded-md bg-white border border-black/10 focus:ring-2 focus:ring-[#4B3FE4]/15 focus:border-[#4B3FE4] outline-none transition-colors";

  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F3EE] flex items-center justify-center p-4">
        <div className="bg-white border border-black/[0.08] rounded-lg w-full max-w-sm p-10 text-center animate-in zoom-in-95 duration-200">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus size={20} />
          </div>
          <h2 className="text-lg font-semibold text-[#111110] mb-2">Account Created!</h2>
          <p className="text-sm text-[#6B6860] mb-6">
            Your account has been successfully created. Please contact RICTU personnel to activate your account before logging in.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full h-9 bg-[#4B3FE4] text-white text-sm font-medium rounded-md hover:bg-[#3B30C4] transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F3EE] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-7 h-7 bg-white border border-black/[0.08] rounded flex items-center justify-center overflow-hidden">
            <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-[#111110] text-sm font-medium font-mono">REAMS</span>
        </div>

        <h2 className="text-2xl font-semibold text-[#111110] mb-1">Create account</h2>
        <p className="text-sm text-[#6B6860] mb-8">
          Join the Regional Event &amp; Attendance Management System
        </p>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#111110] mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
                className={inputCls}
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#111110] mb-1.5">
              Email Address <span className="text-[#9A9890] font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputCls}
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#111110] mb-1.5">Office / Division</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
              <select
                value={formData.office_id}
                onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
                required
                className="w-full pl-9 pr-8 h-10 text-sm rounded-md bg-white border border-black/10 focus:ring-2 focus:ring-[#4B3FE4]/15 focus:border-[#4B3FE4] outline-none transition-colors appearance-none text-[#111110] cursor-pointer"
              >
                <option value="">Select Office/Division</option>
                {offices.map((office) => (
                  <option key={office.office_id} value={office.office_id}>
                    {office.name} ({office.code})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9890] pointer-events-none" size={14} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#111110] mb-1.5">Position / Title</label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
              <input
                type="text"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                required
                className={inputCls}
                placeholder="Event Organizer"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#111110] mb-1.5">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                className={inputCls}
                placeholder="Choose a username"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#111110] mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full pl-9 pr-8 h-10 text-sm rounded-md bg-white border border-black/10 focus:ring-2 focus:ring-[#4B3FE4]/15 focus:border-[#4B3FE4] outline-none transition-colors"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A9890] hover:text-[#6B6860] focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#111110] mb-1.5">Confirm</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  className="w-full pl-9 pr-8 h-10 text-sm rounded-md bg-white border border-black/10 focus:ring-2 focus:ring-[#4B3FE4]/15 focus:border-[#4B3FE4] outline-none transition-colors"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A9890] hover:text-[#6B6860] focus:outline-none transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-10 bg-[#4B3FE4] text-white text-sm font-medium rounded-md hover:bg-[#3B30C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-black/[0.08]"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-[#F5F3EE] text-[#6B6860]">Or sign up with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isLoading}
            className="w-full h-10 bg-white border border-black/10 text-[#111110] text-sm font-medium rounded-md hover:bg-white/60 hover:border-black/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
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
            Sign up with Google
          </button>

          <p className="text-center text-xs text-[#6B6860] mt-4">
            Already have an account?{' '}
            <Link to="/" className="text-[#4B3FE4] hover:underline font-medium">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Signup;
