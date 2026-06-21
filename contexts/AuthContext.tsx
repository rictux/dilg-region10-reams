
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types/database';
import { Permission, ROLE_PERMISSIONS } from '../config/permissions';
import bcrypt from 'bcryptjs';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, passwordPlain: string, remember?: boolean) => Promise<void>;
  signup: (userData: { username: string; passwordPlain: string; full_name: string; email?: string | null; position: string; office_id?: number | null }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (newPw: string) => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  loginWithGoogle: () => Promise<void>;
  signupWithGoogle: () => Promise<void>;
}

type LoginActivityInput = {
  userRecord?: User | null;
  username?: string | null;
  authUserId?: string | null;
  loginMethod: 'Password' | 'Google';
  loginStatus: 'Success' | 'Failed';
  failureReason?: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const loggedGoogleSessionRef = React.useRef<string | null>(null);

  const recordLoginActivity = async ({
    userRecord,
    username,
    authUserId,
    loginMethod,
    loginStatus,
    failureReason
  }: LoginActivityInput) => {
    try {
      const { error } = await supabase
        .from('user_login_activity')
        .insert([{
          user_id: userRecord?.user_id ?? null,
          auth_user_id: authUserId ?? userRecord?.auth_user_id ?? null,
          username: username ?? userRecord?.username ?? null,
          login_method: loginMethod,
          login_status: loginStatus,
          failure_reason: loginStatus === 'Failed' ? (failureReason || null) : null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
        }]);

      if (error) {
        console.error('Error recording login activity:', error);
      }
    } catch (err) {
      console.error('Error recording login activity:', err);
    }
  };

  // Load user from local storage or session storage on mount
  useEffect(() => {
    const checkSupabaseAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const email = session.user.email;
          const full_name = session.user.user_metadata?.full_name || email?.split('@')[0] || 'Google User';
          
          const { data: userRecord } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
            
          const authIntent = localStorage.getItem('auth_intent');
          
          if (userRecord) {
            if (userRecord.status === 'Active') {
              const sessionKey = session.access_token || session.user.id;
              if (loggedGoogleSessionRef.current !== sessionKey) {
                loggedGoogleSessionRef.current = sessionKey;
                await recordLoginActivity({
                  userRecord: userRecord as User,
                  username: userRecord.username || email,
                  authUserId: session.user.id,
                  loginMethod: 'Google',
                  loginStatus: 'Success'
                });
              }
              setUser(userRecord as User);
              localStorage.setItem('eventpulse_user', JSON.stringify(userRecord));
            } else {
              await recordLoginActivity({
                userRecord: userRecord as User,
                username: userRecord.username || email,
                authUserId: session.user.id,
                loginMethod: 'Google',
                loginStatus: 'Failed',
                failureReason: 'Inactive account'
              });
              await supabase.auth.signOut();
              localStorage.setItem('auth_error', 'Your account is currently Inactive. Please contact the administrator.');
            }
          } else {
            if (authIntent === 'signup') {
              const salt = await bcrypt.genSalt(10);
              const hash = await bcrypt.hash(Math.random().toString(36), salt);
              
              const { data: newUser, error: insertError } = await supabase.from('users').insert([{
                username: email,
                password_hash: hash,
                full_name: full_name,
                email: email,
                auth_user_id: session.user.id,
                position: 'Google User',
                role: 'EventManager',
                status: 'Inactive'
              }]).select().single();
              
              if (!insertError && newUser) {
                await supabase.auth.signOut();
                localStorage.setItem('auth_success', 'Account Created! Your account is currently Inactive. Please contact the administrator to activate your account before logging in.');
              } else {
                await supabase.auth.signOut();
                localStorage.setItem('auth_error', 'Failed to create account with Google.');
              }
            } else {
              await recordLoginActivity({
                username: email,
                authUserId: session.user.id,
                loginMethod: 'Google',
                loginStatus: 'Failed',
                failureReason: 'Account not found'
              });
              await supabase.auth.signOut();
              localStorage.setItem('auth_error', 'Account not found. Please sign up first.');
            }
          }
          localStorage.removeItem('auth_intent');
        }
      } catch (e) {
        console.error("Error checking Supabase Auth", e);
      }
    };

    const storedUser = localStorage.getItem('eventpulse_user') || sessionStorage.getItem('eventpulse_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        refreshUserProfile(parsedUser.user_id);
      } catch (e) {
        localStorage.removeItem('eventpulse_user');
        sessionStorage.removeItem('eventpulse_user');
        setLoading(false);
      }
    } else {
      checkSupabaseAuth().finally(() => setLoading(false));
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        checkSupabaseAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshUserProfile = async (userId: number) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'Active')
        .single();

      if (error || !data) {
        // User might have been deleted or deactivated
        signOut();
      } else {
        setUser(data as User);
        // Update storage if it exists there to keep data fresh
        if (localStorage.getItem('eventpulse_user')) {
            localStorage.setItem('eventpulse_user', JSON.stringify(data));
        } else if (sessionStorage.getItem('eventpulse_user')) {
            sessionStorage.setItem('eventpulse_user', JSON.stringify(data));
        }
      }
    } catch (err) {
      console.error('Error refreshing profile', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, passwordPlain: string, remember: boolean = false) => {
    setLoading(true);
    try {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        // Ignore error
      }
      
      // 1. Fetch user by username
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !data) {
        await recordLoginActivity({
          username,
          loginMethod: 'Password',
          loginStatus: 'Failed',
          failureReason: 'Invalid username or inactive account'
        });
        throw new Error('Invalid username or password');
      }

      const userRecord = data as User;

      if (userRecord.status === 'Inactive') {
        await recordLoginActivity({
          userRecord,
          username: userRecord.username,
          loginMethod: 'Password',
          loginStatus: 'Failed',
          failureReason: 'Inactive account'
        });
        throw new Error('Your account has not been activated yet. Please contact RICTU personnel to activate your account.');
      }

      // 2. Verify password with bcrypt
      const isMatch = await bcrypt.compare(passwordPlain, userRecord.password_hash);
      
      if (!isMatch) {
        await recordLoginActivity({
          userRecord,
          username: userRecord.username,
          loginMethod: 'Password',
          loginStatus: 'Failed',
          failureReason: 'Invalid password'
        });
        throw new Error('Invalid username or password');
      }

      await recordLoginActivity({
        userRecord,
        username: userRecord.username,
        loginMethod: 'Password',
        loginStatus: 'Success'
      });

      // 3. Set Session
      setUser(userRecord);
      
      if (remember) {
        localStorage.setItem('eventpulse_user', JSON.stringify(userRecord));
      } else {
        sessionStorage.setItem('eventpulse_user', JSON.stringify(userRecord));
      }
    } catch (error: any) {
      setLoading(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (userData: { username: string; passwordPlain: string; full_name: string; email?: string | null; position: string; office_id?: number | null }) => {
    setLoading(true);
    try {
      // 1. Check if username exists
      const { data: existing } = await supabase
        .from('users')
        .select('user_id')
        .eq('username', userData.username)
        .single();

      if (existing) {
        throw new Error('Username already taken');
      }

      // 2. Hash password
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(userData.passwordPlain, salt);

      // 3. Insert user
      // Default role is EventManager as per requirement
      const { error } = await supabase.from('users').insert([{
        username: userData.username,
        password_hash: hash,
        full_name: userData.full_name,
        email: userData.email,
        position: userData.position,
        office_id: userData.office_id,
        role: 'EventManager',
        status: 'Inactive'
      }]);

      if (error) throw error;

    } catch (error: any) {
      setLoading(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    localStorage.setItem('auth_intent', 'login');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/'
      }
    });
  };

  const signupWithGoogle = async () => {
    localStorage.setItem('auth_intent', 'signup');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/signup'
      }
    });
  };

  const changePassword = async (newPw: string) => {
    if (!user) throw new Error("No user logged in");
    
    // Hash new password before saving
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPw, salt);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: hash })
      .eq('user_id', user.user_id);

    if (updateError) throw new Error("Failed to update password. Please try again.");
  };

  const refreshProfile = async () => {
    if (user) {
      await refreshUserProfile(user.user_id);
    }
  };

  const signOut = async () => {
    localStorage.removeItem('eventpulse_user');
    sessionStorage.removeItem('eventpulse_user');
    setUser(null);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Error signing out of Supabase', e);
    }
  };

  // Granular Permission Check
  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    
    // Retrieve permissions for the user's role
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    
    // Check if the user has the specific permission
    return permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, signOut, refreshProfile, changePassword, hasPermission, loginWithGoogle, signupWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
