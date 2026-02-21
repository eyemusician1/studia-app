import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  signIn as supabaseSignIn,
  signUp as supabaseSignUp,
  signOut as supabaseSignOut,
} from '../lib/auth';

type Profile = {
  first_name: string;
  last_name: string;
  student_id: string;
};

type AuthContextType = {
  user: any | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    studentId: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const isSigningUp = useRef(false);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, student_id')
      .eq('id', userId)
      .single();
    if (!error && data) setProfile(data);
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (isMounted && data.session?.user) {
        setUser(data.session.user);
        fetchProfile(data.session.user.id);
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isSigningUp.current) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else setProfile(null);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await supabaseSignIn(email, password);
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    studentId: string
  ) => {
    isSigningUp.current = true;
    try {
      await supabaseSignUp(email, password, firstName, lastName, studentId);
    } finally {
      isSigningUp.current = false;
    }
  };

  const signOut = async () => {
    await supabaseSignOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};