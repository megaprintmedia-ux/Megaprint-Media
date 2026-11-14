import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { Department, UserProfile, UserRole } from '../types/erp';

const BOOTSTRAPPED_ADMIN_EMAIL = 'megaprintmedia@gmail.com';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  activeViewRole: UserRole;
  setActiveViewRole: (role: UserRole) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  clearAuthError: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function roleToDepartment(role: UserRole): Department {
  switch (role) {
    case 'management':
      return 'Management';
    case 'accounts':
      return 'Accounts';
    case 'production':
      return 'Production';
    case 'sales':
    default:
      return 'Sales & Marketing';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeViewRole, setActiveViewRole] = useState<UserRole>('sales');

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const isBootAdmin =
        firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
        firebaseUser.emailVerified;

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase();

          // Check if the owner/management pre-invited this email
          let matchedInvite: {
            id: string;
            displayName: string;
            role: UserRole;
            department: Department;
            commissionRatePct: number;
            ownerUid: string;
          } | null = null;

          if (!isBootAdmin && normalizedEmail) {
            try {
              const inviteSnap = await getDocs(
                query(
                  collection(db, 'userInvites'),
                  where('email', '==', normalizedEmail)
                )
              );
              const pendingInviteDoc = inviteSnap.docs.find(
                (d) => d.data().status === 'invited'
              );
              if (pendingInviteDoc) {
                const invData = pendingInviteDoc.data();
                matchedInvite = {
                  id: pendingInviteDoc.id,
                  displayName: String(invData.displayName || ''),
                  role: invData.role as UserRole,
                  department: invData.department as Department,
                  commissionRatePct: Number(invData.commissionRatePct) || 0,
                  ownerUid: String(invData.ownerUid || ''),
                };
              }
            } catch (inviteErr) {
              console.warn('Invite lookup skipped:', inviteErr);
            }
          }

          if (matchedInvite) {
            const batch = writeBatch(db);
            const adminUids = Array.from(
              new Set([firebaseUser.uid, matchedInvite.ownerUid].filter(Boolean))
            );
            batch.set(userRef, {
              uid: firebaseUser.uid,
              email: normalizedEmail.slice(0, 200),
              displayName: (
                matchedInvite.displayName ||
                firebaseUser.displayName ||
                normalizedEmail.split('@')[0] ||
                'Staff Member'
              ).slice(0, 120),
              role: matchedInvite.role,
              department: matchedInvite.department,
              status: 'active',
              commissionRatePct: matchedInvite.commissionRatePct,
              inviteId: matchedInvite.id,
              adminUids,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.update(doc(db, 'userInvites', matchedInvite.id), {
              status: 'accepted',
              acceptedUid: firebaseUser.uid,
              updatedAt: serverTimestamp(),
            });
            await batch.commit();
          } else {
            const initialRole: UserRole = isBootAdmin ? 'management' : 'sales';
            const initialStatus = isBootAdmin ? 'active' : 'pending';
            const payload = {
              uid: firebaseUser.uid,
              email: normalizedEmail.slice(0, 200),
              displayName: (
                firebaseUser.displayName ||
                firebaseUser.email?.split('@')[0] ||
                'Staff Member'
              ).slice(0, 120),
              role: initialRole,
              department: roleToDepartment(initialRole),
              status: initialStatus,
              commissionRatePct: initialRole === 'sales' ? 5 : 0,
              adminUids: [firebaseUser.uid],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, payload);

            if (isBootAdmin) {
              const settingsRef = doc(db, 'companySettings', 'default');
              const settingsSnap = await getDoc(settingsRef);
              if (!settingsSnap.exists()) {
                await setDoc(settingsRef, {
                  companyName: 'Megaprint',
                  tagline: 'Printing · Branding · Corporate Wear · Tailoring',
                  taxPin: 'BP 0200148291',
                  address: 'Workington Industrial Area, Coventry Road, Harare',
                  phone: '+263 77 200 0000',
                  email: BOOTSTRAPPED_ADMIN_EMAIL,
                  currency: 'USD',
                  defaultVatRate: 15,
                  defaultCommissionRatePct: 5,
                  defaultCommissionBasis: 'gross_profit',
                  logoDataUrl: '',
                  ownerUid: firebaseUser.uid,
                  updatedAt: serverTimestamp(),
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Profile bootstrap error:', error);
      }

      unsubProfile = onSnapshot(
        userRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as Omit<UserProfile, 'id'>;
            const resolved: UserProfile = {
              id: docSnap.id,
              ...data,
            };
            setProfile(resolved);
            setActiveViewRole(resolved.role);
          } else {
            setProfile(null);
          }
          setAuthReady(true);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Unable to sign in with Google.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const signInWithEmail = async (emailInput: string, passwordInput: string) => {
    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !passwordInput) {
      setAuthError('Please enter both your email address and password.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, passwordInput);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'Email/Password sign-in is not enabled in Firebase Console yet. Enable Email/Password under Firebase Console → Authentication → Sign-in method, or use Continue with Google below.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setAuthError(
          'Invalid email or password. If your account uses Google sign-in, click "Continue with Google" below.'
        );
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Too many failed attempts. Please wait a moment and try again.');
      } else {
        setAuthError(
          error instanceof Error ? error.message : 'Unable to sign in with email.'
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const sendPasswordReset = async (emailInput: string): Promise<boolean> => {
    const cleanEmail = emailInput.trim();
    if (!cleanEmail) {
      setAuthError('Enter your email address above first to reset your password.');
      return false;
    }
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return true;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'Email/Password sign-in is not enabled in Firebase Console yet. Enable Email/Password under Authentication → Sign-in method.'
        );
      } else {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Unable to send password reset email.'
        );
      }
      return false;
    }
  };

  const clearAuthError = () => setAuthError(null);

  const signOut = async () => {
    setAuthError(null);
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        signingIn,
        authError,
        activeViewRole,
        setActiveViewRole,
        signInWithGoogle,
        signInWithEmail,
        sendPasswordReset,
        clearAuthError,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
