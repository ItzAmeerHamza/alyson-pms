import { useEffect, useMemo, useState } from "react";
import { listEmployees, type Employee } from "@/integrations/supabase/live";
import { supabase } from "@/integrations/supabase/client";

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const DEFAULT_EMAIL = "m_Afatah@me.com";

export function useEmployeePicker(organizationId?: string | null, isSuperAdmin?: boolean) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listEmployees(debounced, organizationId, isSuperAdmin)
      .then((rows) => {
        if (!mounted) return;
        setResults(rows);
        // If no selection yet, try to preselect default by email from loaded list (case-insensitive)
        if (!selected && rows.length > 0) {
          const match = rows.find((u) => (u.email || "").toLowerCase() === DEFAULT_EMAIL.toLowerCase());
          if (match) setSelected(match);
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [debounced, organizationId, isSuperAdmin]);

  // Fallback: query directly once to preselect by email (case-insensitive)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (selected) return; // don't override user selection
        const { data, error } = await supabase
          .from("users")
          .select("id, full_name, email, avatar_url")
          .ilike("email", DEFAULT_EMAIL)
          .limit(1)
          .maybeSingle();
        if (!mounted || error || !data) return;
        const emp: Employee = { id: data.id, full_name: data.full_name || data.email || data.id, email: data.email, avatar_url: data.avatar_url };
        setSelected(emp);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [selected]);

  return useMemo(
    () => ({ search, setSearch, selected, setSelected, results, loading }),
    [search, selected, results, loading]
  );
}


