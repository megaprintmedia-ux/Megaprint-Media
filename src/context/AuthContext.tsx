import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  User,
  applyActionCode,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
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
  emailVerified: boolean;
  profile: UserProfile | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  activeViewRole: UserRole;
  setActiveViewRole: (role: UserRole) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    displayName: string,
    email: string,
    password: string
  ) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  resendVerificationEmail: () => Promise<boolean>;
  refreshVerificationStatus: (options?: { silent?: boolean }) => Promise<boolean>;
  retryProfileSetup: () => Promise<void>;
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

function getAuthErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: string }).code || '');
  }
  return '';
}

function formatAuthError(error: unknown, fallback: string): string {
  const code = getAuthErrorCode(error);
  const host =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'this domain';

  switch (code) {
    case 'auth/unauthorized-domain':
      return `Domain "${host}" is not authorized in Firebase yet. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console yet. Enable Email/Password under Firebase Console → Authentication → Sign-in method, or use Continue with Google below.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Sign In or reset your password.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. If you have not created an account yet, switch to Create Account or use Continue with Google.';
    case 'auth/too-many-requests':
      return 'Too many verification requests sent recently. Please wait 1–2 minutes and check your Inbox/Spam folder, or use Continue with Google.';
    case 'auth/expired-action-code':
      return 'That verification link has expired. Click Resend Verification Email below to get a fresh link.';
    case 'auth/invalid-action-code':
      return 'This verification link was already used or is invalid. Click "I\'ve Verified My Email — Continue" below.';
    case 'auth/popup-blocked':
      return 'Sign-in pop-up was blocked by your browser. Please allow pop-ups for this site and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing sign-in.';
    default:
      return error instanceof Error ? error.message : fallback;
  }
}

async function sendVerificationEmailWithFallback(targetUser: User): Promise<void> {
  if (typeof window !== 'undefined' && window.location.origin) {
    try {
      await sendEmailVerification(targetUser, {
        url: window.location.origin,
        handleCodeInApp: false,
      });
      return;
    } catch (err) {
      const code = getAuthErrorCode(err);
      if (
        code !== 'auth/unauthorized-continue-uri' &&
        code !== 'auth/invalid-continue-uri' &&
        code !== 'auth/missing-continue-uri'
      ) {
        throw err;
      }
    }
  }
  await sendEmailVerification(targetUser);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeViewRole, setActiveViewRole] = useState<UserRole>('sales');
  const unsubProfileRef = useRef<(() => void) | undefined>(undefined);
  const bootstrappingUidRef = useRef<string | null>(null);

  const clearProfileSub = useCallback(() => {
    if (unsubProfileRef.current) {
      unsubProfileRef.current();
      unsubProfileRef.current = undefined;
    }
  }, []);

  const bootstrapAndSubscribeProfile = useCallback(
    async (firebaseUser: User) => {
      clearProfileSub();

      if (!firebaseUser.emailVerified) {
        setProfile(null);
        setEmailVerified(false);
        setAuthReady(true);
        return;
      }

      setEmailVerified(true);
      bootstrappingUidRef.current = firebaseUser.uid;

      const userRef = doc(db, 'users', firebaseUser.uid);
      const isBootAdmin =
        firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
        firebaseUser.emailVerified;

      try {
        // Ensure the latest email_verified claim is minted on the Firestore ID token
        await firebaseUser.getIdToken(true);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase();

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
              commissionRatePct:
                matchedInvite.role === 'sales' ? matchedInvite.commissionRatePct : 0,
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
                  zimraTin: '2000148291',
                  vatRegNumber: '10048291',
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
        setAuthError(
          error instanceof Error
            ? `Workspace profile setup failed: ${error.message}`
            : 'Workspace profile setup failed. Please click Retry Setup.'
        );
      } finally {
        bootstrappingUidRef.current = null;
      }

      unsubProfileRef.current = onSnapshot(
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
    },
    [clearProfileSub]
  );

  // Handle inbound ?mode=verifyEmail&oobCode=... links if redirected back into the app
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    if (mode !== 'verifyEmail' || !oobCode) return;

    let cancelled = false;
    (async () => {
      try {
        await applyActionCode(auth, oobCode);
        if (cancelled) return;
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, '', cleanUrl);
        if (auth.currentUser) {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
          setUser(auth.currentUser);
          setEmailVerified(Boolean(auth.currentUser.emailVerified));
          if (auth.currentUser.emailVerified) {
            await bootstrapAndSubscribeProfile(auth.currentUser);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(
            formatAuthError(err, 'Unable to complete email verification link.')
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapAndSubscribeProfile]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      clearProfileSub();
      setUser(firebaseUser);
      setEmailVerified(Boolean(firebaseUser?.emailVerified));

      if (!firebaseUser) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      await bootstrapAndSubscribeProfile(firebaseUser);
    });

    return () => {
      unsubAuth();
      clearProfileSub();
    };
  }, [bootstrapAndSubscribeProfile, clearProfileSub]);

  const refreshVerificationStatus = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      const current = auth.currentUser;
      if (!current) return false;
      if (!options?.silent) {
        setAuthError(null);
      }
      try {
        await current.reload();
        const reloaded = auth.currentUser;
        if (!reloaded) return false;

        if (reloaded.emailVerified) {
          await reloaded.getIdToken(true);
          setUser(reloaded);
          setEmailVerified(true);
          setAuthError(null);
          if (bootstrappingUidRef.current !== reloaded.uid) {
            await bootstrapAndSubscribeProfile(reloaded);
          }
          return true;
        }

        setUser(reloaded);
        setEmailVerified(false);
        if (!options?.silent) {
          setAuthError(
            'Email is not verified yet. Open the verification email in your inbox or Spam/Junk folder, click the link, then click Continue again.'
          );
        }
        return false;
      } catch (error) {
        if (!options?.silent) {
          setAuthError(
            formatAuthError(error, 'Unable to check verification status.')
          );
        }
        return false;
      }
    },
    [bootstrapAndSubscribeProfile]
  );

  // Auto-check email verification when returning to tab or while waiting on the Verify Email screen
  useEffect(() => {
    if (!user || emailVerified) return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshVerificationStatus({ silent: true });
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshVerificationStatus({ silent: true });
      }
    }, 3500);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.clearInterval(intervalId);
    };
  }, [user, emailVerified, refreshVerificationStatus]);

  const signInWithGoogle = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(formatAuthError(error, 'Unable to sign in with Google.'));
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
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, passwordInput);
      // Automatically send a fresh verification link if an unverified user signs back in
      if (!cred.user.emailVerified) {
        try {
          await sendVerificationEmailWithFallback(cred.user);
        } catch {
          // User can still click Resend Link on the verification screen
        }
      }
    } catch (error) {
      setAuthError(formatAuthError(error, 'Unable to sign in with email.'));
    } finally {
      setSigningIn(false);
    }
  };

  const signUpWithEmail = async (
    displayNameInput: string,
    emailInput: string,
    passwordInput: string
  ): Promise<boolean> => {
    const cleanName = displayNameInput.trim();
    const cleanEmail = emailInput.trim();
    if (!cleanName || !cleanEmail || passwordInput.length < 6) {
      setAuthError(
        'Please provide your full name, a valid email address, and a password of at least 6 characters.'
      );
      return false;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        passwordInput
      );
      await updateProfile(cred.user, { displayName: cleanName.slice(0, 120) });
      setUser(auth.currentUser || cred.user);
      setEmailVerified(Boolean(cred.user.emailVerified));

      try {
        await sendVerificationEmailWithFallback(cred.user);
      } catch (verifyErr) {
        setAuthError(
          formatAuthError(
            verifyErr,
            'Account created, but we could not send the verification email yet. Click Resend Link below.'
          )
        );
      }
      return true;
    } catch (error) {
      setAuthError(formatAuthError(error, 'Unable to create your account.'));
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const resendVerificationEmail = async (): Promise<boolean> => {
    const target = auth.currentUser;
    if (!target) return false;
    setAuthError(null);
    try {
      await target.reload();
      if (target.emailVerified) {
        await refreshVerificationStatus({ silent: true });
        return true;
      }
      await sendVerificationEmailWithFallback(target);
      return true;
    } catch (error) {
      setAuthError(
        formatAuthError(error, 'Unable to resend verification email.')
      );
      return false;
    }
  };

  const retryProfileSetup = async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    await auth.currentUser.reload();
    await bootstrapAndSubscribeProfile(auth.currentUser);
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
      setAuthError(
        formatAuthError(error, 'Unable to send password reset email.')
      );
      return false;
    }
  };

  const clearAuthError = () => setAuthError(null);

  const signOut = async () => {
    setAuthError(null);
    clearProfileSub();
    setEmailVerified(false);
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        emailVerified,
        profile,
        authReady,
        signingIn,
        authError,
        activeViewRole,
        setActiveViewRole,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        refreshVerificationStatus,
        retryProfileSetup,
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
