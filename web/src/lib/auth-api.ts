const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3000';

export interface AuthUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
  organization_id: string | null;
  is_org_admin: boolean;
  is_super_admin: boolean;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
}

export interface AuthMeResponse {
  user: AuthUserProfile;
  organization: AuthOrganization | null;
}

export interface OrganizationBySlug {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.message || body.error || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

export async function fetchAuthMe(idToken: string): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json()) as {
    user: AuthUserProfile & { is_org_admin?: boolean; is_super_admin?: boolean };
    organization: AuthOrganization | null;
  };

  return {
    user: {
      ...data.user,
      is_org_admin: data.user.is_org_admin ?? false,
      is_super_admin: data.user.is_super_admin ?? false,
    },
    organization: data.organization,
  };
}

export async function fetchOrganizationBySlug(
  slug: string,
): Promise<OrganizationBySlug> {
  const normalized = slug.trim().toLowerCase();
  const res = await fetch(
    `${API_BASE}/auth/organizations/by-slug/${encodeURIComponent(normalized)}`,
    { headers: { Accept: 'application/json' } },
  );

  if (!res.ok) {
    throw new Error('Invalid credentials. Please check and try again.');
  }

  return res.json() as Promise<OrganizationBySlug>;
}
