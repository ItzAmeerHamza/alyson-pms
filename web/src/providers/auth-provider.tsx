
import * as React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { useToast } from "@/components/ui/use-toast";
import { isCognitoAuthEnabled } from "@/integrations/cognito/config";
import {
  getCurrentCognitoSession,
  signInWithEmailPassword,
  signOutCognito,
} from "@/integrations/cognito/auth";
import { fetchAuthMe } from "@/lib/auth-api";

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

interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

/** Minimal session shape for components that read session.user / access_token */
export interface AppSession {
  user: { id: string; email: string };
  access_token: string;
}

interface AuthContextType {
  user: User | AppSession["user"] | null;
  userDetails: UserDetails | null;
  organization: OrganizationDetails | null;
  session: Session | AppSession | null;
  signIn: (email: string, password: string, rememberMe?: boolean, companySlug?: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  /** Cognito id token when using RDS + Cognito auth */
  idToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapProfileToState(profile: Awaited<ReturnType<typeof fetchAuthMe>>) {
  const userDetails: UserDetails = {
    id: profile.user.id,
    email: profile.user.email,
    full_name: profile.user.full_name,
    role: profile.user.role,
    avatar_url: profile.user.avatar_url,
    organization_id: profile.user.organization_id,
    is_org_admin: profile.user.is_org_admin,
    is_super_admin: profile.user.is_super_admin,
  };
  const organization: OrganizationDetails | null = profile.organization
    ? {
        id: profile.organization.id,
        name: profile.organization.name,
        slug: profile.organization.slug,
        logo_url: profile.organization.logo_url,
      }
    : null;
  return { userDetails, organization };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const useCognito = isCognitoAuthEnabled;

  const [user, setUser] = useState<User | AppSession["user"] | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [session, setSession] = useState<Session | AppSession | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const fetchedUserIdRef = useRef<string | null>(null);

  async function applyCognitoSession(idTok: string, email: string) {
    const profile = await fetchAuthMe(idTok);
    const { userDetails: details, organization: org } = mapProfileToState(profile);
    setUserDetails(details);
    setOrganization(org);
    setUser({ id: details.id, email: details.email });
    setSession({
      user: { id: details.id, email: details.email },
      access_token: idTok,
    });
    setIdToken(idTok);
    fetchedUserIdRef.current = details.id;
    setError(null);
  }

  useEffect(() => {
    if (!useCognito) return;

    let mounted = true;

    async function initCognito() {
      setLoading(true);
      try {
        const stored = await getCurrentCognitoSession();
        if (!mounted) return;
        if (stored?.idToken) {
          await applyCognitoSession(stored.idToken, stored.email);
        }
      } catch (err) {
        if (!mounted) return;
        console.error("Cognito session init failed:", err);
        setError("Failed to restore session");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initCognito();
    return () => {
      mounted = false;
    };
  }, [useCognito]);

  useEffect(() => {
    if (useCognito) return;

    let mounted = true;
    const abortController = new AbortController();
    setLoading(true);
    setError(null);
    fetchedUserIdRef.current = null;

    function isAbortedError(err: unknown): boolean {
      if (!mounted) return true;
      if (err instanceof DOMException && err.name === "AbortError") return true;
      if (err instanceof TypeError && err.message === "Failed to fetch") return true;
      return false;
    }

    async function fetchOrganizationDetailsInner(orgId: string) {
      try {
        const { data, error: orgError } = await supabase
          .from("organizations")
          .select(`id, name, slug, logo_url`)
          .eq("id", orgId)
          .single();

        if (!mounted) return;
        if (orgError) {
          console.error("Error fetching organization details:", orgError);
          return;
        }
        setOrganization(data);
      } catch (err) {
        if (isAbortedError(err)) return;
        console.error("Unexpected error fetching organization:", err);
      }
    }

    async function fetchUserDetailsInner(userId: string) {
      try {
        const { data, error: userError } = await supabase
          .from("users")
          .select(`
            id, email, full_name, role, avatar_url,
            organization_id, is_org_admin, is_super_admin
          `)
          .eq("id", userId)
          .single();

        if (!mounted) return;
        if (userError) {
          console.error("Error fetching user details:", userError);
          if (userError.code !== "PGRST116") {
            setError(`Failed to load user profile: ${userError.message}`);
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
      } catch (err) {
        if (isAbortedError(err)) return;
        console.error("Unexpected error fetching user details:", err);
        if (mounted) setError("Failed to load user profile");
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, nextSession: Session | null) => {
        if (!mounted) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
          if (fetchedUserIdRef.current === nextSession.user.id) return;
          setTimeout(() => {
            if (mounted && fetchedUserIdRef.current !== nextSession.user.id) {
              fetchUserDetailsInner(nextSession.user.id);
            }
          }, 0);
        } else {
          setUserDetails(null);
          setOrganization(null);
          fetchedUserIdRef.current = null;
        }
      },
    );

    async function loadInitialSession() {
      try {
        const { data: { session: initial }, error: sessionError } =
          await supabase.auth.getSession();

        if (!mounted) return;
        if (sessionError) {
          setError(`Authentication error: ${sessionError.message}`);
        } else {
          setSession(initial);
          if (initial?.user) {
            setUser(initial.user);
            await fetchUserDetailsInner(initial.user.id);
          }
        }
      } catch (err) {
        if (!isAbortedError(err)) {
          setError("Failed to initialize authentication");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInitialSession();

    return () => {
      mounted = false;
      abortController.abort();
      subscription.unsubscribe();
    };
  }, [useCognito]);

  async function signIn(
    email: string,
    password: string,
    _rememberMe: boolean = false,
    companySlug?: string,
  ) {
    setError(null);

    if (useCognito) {
      const stored = await signInWithEmailPassword(email, password);
      const profile = await fetchAuthMe(stored.idToken);
      const { userDetails: details, organization: org } = mapProfileToState(profile);

      if (companySlug && org?.slug !== companySlug.trim().toLowerCase()) {
        signOutCognito();
        throw new Error(
          "You are not a member of this organization. Please check the company name.",
        );
      }

      setUserDetails(details);
      setOrganization(org);
      setUser({ id: details.id, email: details.email });
      setSession({
        user: { id: details.id, email: details.email },
        access_token: stored.idToken,
      });
      setIdToken(stored.idToken);
      fetchedUserIdRef.current = details.id;

      if (toast) {
        toast({ title: "Successfully signed in", description: "Welcome back!" });
      }
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) throw signInError;

    if (companySlug && data.user) {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", data.user.id)
        .single();

      if (userError) {
        await supabase.auth.signOut();
        throw new Error(
          "Unable to verify your account. Please contact your administrator.",
        );
      }

      if (userData.organization_id) {
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("slug")
          .eq("id", userData.organization_id)
          .single();

        if (orgError || orgData?.slug !== companySlug) {
          await supabase.auth.signOut();
          throw new Error(
            "You are not a member of this organization. Please check the company name.",
          );
        }
      }
    }

    if (toast) {
      toast({ title: "Successfully signed in", description: "Welcome back!" });
    }
  }

  async function signOut() {
    setError(null);

    if (useCognito) {
      signOutCognito();
      setUser(null);
      setUserDetails(null);
      setOrganization(null);
      setSession(null);
      setIdToken(null);
      fetchedUserIdRef.current = null;
      if (toast) toast({ title: "Successfully signed out" });
      window.location.href = "/login";
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      console.warn("Supabase signOut error:", signOutError.message);
    }

    setUser(null);
    setUserDetails(null);
    setOrganization(null);
    setSession(null);

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("sb-") && key.includes("auth")) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      /* ignore */
    }

    if (toast) toast({ title: "Successfully signed out" });
    window.location.href = "/login";
  }

  const value: AuthContextType = {
    user,
    userDetails,
    organization,
    session,
    signIn,
    signOut,
    loading,
    error,
    isSuperAdmin: userDetails?.is_super_admin ?? false,
    isOrgAdmin: userDetails?.is_org_admin ?? false,
    idToken: useCognito ? idToken : null,
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
