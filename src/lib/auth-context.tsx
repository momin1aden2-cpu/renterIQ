'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  socialLogin: (provider: 'google' | 'facebook' | 'apple' | 'microsoft') => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getFirebaseErrorCode = (err: unknown): string => {
    if (err && typeof err === 'object' && 'code' in err) {
      return String((err as { code: string }).code);
    }
    return '';
  };

  const getErrorMessage = (code: string): string => {
    const messages: Record<string, string> = {
      'auth/user-not-found': 'No account found with this email. Please sign up.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/email-already-in-use': 'An account already exists with this email.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
      'auth/cancelled-popup-request': 'Multiple popup requests. Please try again.',
      'auth/account-exists-with-different-credential': 'An account already exists with this email.',
      'auth/invalid-credential': 'Invalid login credentials. Please try again.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled.',
      'auth/requires-recent-login': 'Please sign out and sign in again.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
    };
    return messages[code] || 'An error occurred. Please try again.';
  };

  const login = async (email: string, password: string, remember = false) => {
    try {
      setError(null);
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      setError(getErrorMessage(getFirebaseErrorCode(err)));
      throw err;
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      await updateProfile(result.user, { displayName: name });
      await sendEmailVerification(result.user);
      
      await setDoc(doc(db, 'users', result.user.uid), {
        name,
        email,
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(getErrorMessage(getFirebaseErrorCode(err)));
      throw err;
    }
  };

  const socialLogin = async (providerName: 'google' | 'facebook' | 'apple' | 'microsoft') => {
    try {
      setError(null);
      let provider: GoogleAuthProvider | FacebookAuthProvider | OAuthProvider;

      switch (providerName) {
        case 'google':
          provider = new GoogleAuthProvider();
          break;
        case 'facebook':
          provider = new FacebookAuthProvider();
          break;
        case 'apple':
          provider = new OAuthProvider('apple.com');
          break;
        case 'microsoft':
          provider = new OAuthProvider('microsoft.com');
          break;
        default:
          throw new Error('Unknown provider');
      }

      const result = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(result);

      if (additionalInfo?.isNewUser) {
        await setDoc(doc(db, 'users', result.user.uid), {
          name: result.user.displayName || result.user.email?.split('@')[0],
          email: result.user.email,
          provider: providerName,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(getFirebaseErrorCode(err)));
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err: unknown) {
      setError(getErrorMessage(getFirebaseErrorCode(err)));
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      setError(getErrorMessage(getFirebaseErrorCode(err)));
      throw err;
    }
  };

  const resendVerification = async () => {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await sendEmailVerification(currentUser);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(getFirebaseErrorCode(err)));
      throw err;
    }
  };

  const clearError = () => setError(null);

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    signup,
    logout,
    socialLogin,
    resetPassword,
    resendVerification,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
