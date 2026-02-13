import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types/database';
import { Permission, ROLE_PERMISSIONS } from '../config/permissions';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, passwordHash: string, remember?: boolean) => Promise<void>;
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

  const login = async (username: string, passwordHash: string, remember: boolean = false) => {
    setLoading(true);
    try {
      // Direct query to check credentials
      // NOTE: In a production environment, password verification should happen 
      // via a secure backend function (RPC) to avoid exposing hashes or logic.
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password_hash', passwordHash)
        .eq('status', 'Active')
        .single();

      if (error || !data) {
        throw new Error('Invalid username or password');
      }

      const loggedInUser = data as User;
      setUser(loggedInUser);
      
      if (remember) {
        localStorage.setItem('eventpulse_user', JSON.stringify(loggedInUser));
      } else {
        sessionStorage.setItem('eventpulse_user', JSON.stringify(loggedInUser));
      }
    } catch (error: any) {
      setLoading(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (newPw: string) => {
    if (!user) throw new Error("No user logged in");
    
    // Direct update without checking old password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPw })
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
    <AuthContext.Provider value={{ user, loading, login, signOut, refreshProfile, changePassword, hasPermission }}>
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