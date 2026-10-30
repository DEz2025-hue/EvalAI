import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, hasSupabaseEnv } from "./supabase";

type SessionState = { loading: boolean; session: Session | null; configured: boolean };
const Ctx = createContext<SessionState>({ loading: true, session: null, configured: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ loading: true, session: null, configured: hasSupabaseEnv() });

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setState({ loading: false, session: null, configured: false });
      return;
    }
    let live = true;
    supabase.auth.getSession().then(({ data }) => live && setState({ loading: false, session: data.session, configured: true }));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => live && setState({ loading: false, session, configured: true }));
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
