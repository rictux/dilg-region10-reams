
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types/database';
import { Permission, ROLE_PERMISSIONS } from '../config/permissions';
import bcrypt from 'bcryptjs';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, passwordPlain: string, remember?: boolean) => Promise<void>;
  signup: (userData: { username: string; passwordPlain: string; full_name: string; email: string; position: string; office_id?: number | null }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (newPw: string) => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user from local storage or session storage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('eventpulse_user') || sessionStorage.getItem('eventpulse_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Verify user still exists in DB (optional security step)
        refreshUserProfile(parsedUser.user_id);
      } catch (e) {
        localStorage.removeItem('eventpulse_user');
        sessionStorage.removeItem('eventpulse_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
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
      // 1. Fetch user by username
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('status', 'Active')
        .single();

      if (error || !data) {
        throw new Error('Invalid username or password');
      }

      const userRecord = data as User;

      // 2. Verify password with bcrypt
      const isMatch = await bcrypt.compare(passwordPlain, userRecord.password_hash);
      
      if (!isMatch) {
        throw new Error('Invalid username or password');
      }

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

  const signup = async (userData: { username: string; passwordPlain: string; full_name: string; email: string; position: string; office_id?: number | null }) => {
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
    <AuthContext.Provider value={{ user, loading, login, signup, signOut, refreshProfile, changePassword, hasPermission }}>
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
