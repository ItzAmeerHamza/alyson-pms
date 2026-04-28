
import * as React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { useToast } from "@/components/ui/use-toast";
import { validateUserId } from "@/utils/uuid-validation";

// Define the UserDetails type based on actual database columns
interface UserDetails {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
  organization_id: string | null;
  is_org_admin: boolean;
  is_super_admin: boolean;
}

// Organization details
interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface AuthContextType {
  user: User | null;
  userDetails: UserDetails | null;
  organization: OrganizationDetails | null;
  session: Session | null;
  signIn: (email: string, password: string, rememberMe?: boolean, companySlug?: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Track which user ID has already been fetched to prevent duplicate calls
  // from both loadInitialSession and onAuthStateChange firing for the same user
  const fetchedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();
    setLoading(true);
    setError(null);
    fetchedUserIdRef.current = null;

    // Helper to check if a fetch error is due to abort/unmount (should be silenced)
    function isAbortedError(err: unknown): boolean {
      if (!mounted) return true;
      if (err instanceof DOMException && err.name === 'AbortError') return true;
      if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
      return false;
    }

    async function fetchOrganizationDetailsInner(orgId: string) {
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select(`
            id,
            name,
            slug,
            logo_url
          `)
          .eq("id", orgId)
          .single();

        if (!mounted) return;

        if (error) {
          // Only log if the component is still mounted (not a cleanup race)
          console.error("Error fetching organization details:", error);
          return;
        }

        setOrganization(data);
      } catch (error) {
        if (isAbortedError(error)) return;
        console.error("Unexpected error fetching organization:", error);
      }
    }

    async function fetchUserDetailsInner(userId: string) {
      try {
        const validUserId = validateUserId(userId);
        if (!validUserId) {
          console.error('Invalid user ID provided:', userId);
          if (mounted) setError('Invalid user session');
          return;
        }

        const { data, error } = await supabase
          .from("users")
          .select(`
            id,
            email,
            full_name,
            role,
            avatar_url,
            organization_id,
            is_org_admin,
            is_super_admin
          `)
          .eq("id", validUserId)
          .single();

        if (!mounted) return;

        if (error) {
          console.error("Error fetching user details:", error);
          if (error.code !== 'PGRST116') {
            setError(`Failed to load user profile: ${error.message}`);
          }
          return;
        }

        setUserDetails({
          ...data,
          is_org_admin: data.is_org_admin ?? false,
          is_super_admin: data.is_super_admin ?? false,
        });
        setError(null);
        fetchedUserIdRef.current = userId;

        if (data.organization_id) {
          await fetchOrganizationDetailsInner(data.organization_id);
        } else {
          setOrganization(null);
        }
      } catch (error) {
        if (isAbortedError(error)) return;
        console.error("Unexpected error fetching user details:", error);
        if (mounted) setError("Failed to load user profile");
      }
    }

    // Set up auth state listener (synchronous setup for proper cleanup)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Skip if loadInitialSession already fetched this user's details
          if (fetchedUserIdRef.current === session.user.id) return;

          setTimeout(() => {
            if (mounted && fetchedUserIdRef.current !== session.user.id) {
              fetchUserDetailsInner(session.user.id);
            }
          }, 0);
        } else {
          setUserDetails(null);
          setOrganization(null);
          fetchedUserIdRef.current = null;
        }
      }
    );

    // Fetch initial session asynchronously
    async function loadInitialSession() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          console.error("Error getting session:", sessionError);
          setError(`Authentication error: ${sessionError.message}`);
          if (toast) {
            toast({
              title: "Authentication error",
              description: "There was a problem with your session. Please try logging in again.",
              variant: "destructive",
            });
          }
        } else {
          setSession(session);

          if (session?.user) {
            setUser(session.user);
            await fetchUserDetailsInner(session.user.id);
          }
        }
      } catch (err) {
        if (isAbortedError(err)) return;

        console.error("Auth initialization error:", err);
        setError("Failed to initialize authentication");
        if (toast) {
          toast({
            title: "System Error",
            description: "Failed to initialize authentication system. Please refresh the page.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadInitialSession();

    // Cleanup: abort in-flight fetches and unsubscribe
    return () => {
      mounted = false;
      abortController.abort();
      subscription.unsubscribe();
    };
  }, [toast]);

  // Standalone fetch for signIn flow (not tied to the effect's AbortController)
  async function fetchUserDetails(userId: string) {
    try {
      const validUserId = validateUserId(userId);
      if (!validUserId) {
        console.error('Invalid user ID provided:', userId);
        setError('Invalid user session');
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select(`
          id,
          email,
          full_name,
          role,
          avatar_url,
          organization_id,
          is_org_admin,
          is_super_admin
        `)
        .eq("id", validUserId)
        .single();

      if (error) {
        console.error("Error fetching user details:", error);
        if (error.code !== 'PGRST116') {
          setError(`Failed to load user profile: ${error.message}`);
        }
        return;
      }

      setUserDetails({
        ...data,
        is_org_admin: data.is_org_admin ?? false,
        is_super_admin: data.is_super_admin ?? false,
      });
      setError(null);

      if (data.organization_id) {
        await fetchOrganizationDetails(data.organization_id);
      } else {
        setOrganization(null);
      }
    } catch (error) {
      console.error("Unexpected error fetching user details:", error);
      setError("Failed to load user profile");
    }
  }

  async function fetchOrganizationDetails(orgId: string) {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select(`
          id,
          name,
          slug,
          logo_url
        `)
        .eq("id", orgId)
        .single();

      if (error) {
        console.error("Error fetching organization details:", error);
        return;
      }

      setOrganization(data);
    } catch (error) {
      console.error("Unexpected error fetching organization:", error);
    }
  }

  async function signIn(email: string, password: string, rememberMe: boolean = false, companySlug?: string) {
    try {
      setError(null);

      // First, authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      // If company slug provided, validate user belongs to that organization
      if (companySlug && data.user) {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("organization_id")
          .eq("id", data.user.id)
          .single();

        if (userError) {
          // Sign out if we can't verify the user
          await supabase.auth.signOut();
          throw new Error("Unable to verify your account. Please contact your administrator.");
        }

        if (userData.organization_id) {
          // Verify the organization matches the slug
          const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .select("slug")
            .eq("id", userData.organization_id)
            .single();

          if (orgError || orgData?.slug !== companySlug) {
            // Sign out if organization doesn't match
            await supabase.auth.signOut();
            throw new Error("You are not a member of this organization. Please check the company name.");
          }
        }
      }

      if (toast) {
        toast({
          title: "Successfully signed in",
          description: "Welcome back!",
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || "An unexpected error occurred";
      setError(errorMessage);
      if (toast) {
        toast({
          title: "Error signing in",
          description: errorMessage,
          variant: "destructive",
        });
      }
      throw error;
    }
  }

  const navigate = useNavigate();

  async function signOut() {
    try {
      setError(null);

      // Sign out from Supabase FIRST to invalidate the session
      // before clearing local state (prevents race with auto-refresh)
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });

      if (signOutError) {
        console.warn("Supabase signOut error:", signOutError.message);
      }

      // Clear local state after Supabase signOut completes
      setUser(null);
      setUserDetails(null);
      setOrganization(null);
      setSession(null);

      // Clear any persisted session data from localStorage as a fallback
      try {
        const storageKeys = Object.keys(localStorage);
        storageKeys.forEach((key) => {
          if (key.startsWith('sb-') && (key.endsWith('-auth-token') || key.endsWith('auth-token'))) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        // localStorage might not be available
      }

      if (toast) {
        toast({
          title: "Successfully signed out",
        });
      }

      // Force a hard redirect to clear all in-memory state reliably
      window.location.href = '/login';
    } catch (error: any) {
      const errorMessage = error.message || "Error signing out";
      setError(errorMessage);
      if (toast) {
        toast({
          title: "Error signing out",
          description: errorMessage,
          variant: "destructive",
        });
      }
      // Even if error occurs, force redirect with hard navigation
      window.location.href = '/login';
    }
  }

  const isSuperAdmin = userDetails?.is_super_admin ?? false;
  const isOrgAdmin = userDetails?.is_org_admin ?? false;

  const value = {
    user,
    userDetails,
    organization,
    session,
    signIn,
    signOut,
    loading,
    error,
    isSuperAdmin,
    isOrgAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
