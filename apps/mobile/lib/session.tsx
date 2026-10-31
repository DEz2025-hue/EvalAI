import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, hasSupabaseEnv } from "./supabase";
import { setActiveWorkspace } from "./workspace";
import { resetRole } from "./role";

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
    supabase.auth
      .getSession()
      .then(({ data }) => live && setState({ loading: false, session: data.session, configured: true }))
      // Never leave the whole app on a spinner if the stored session can't be read.
      .catch(() => live && setState({ loading: false, session: null, configured: true }));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Forget the workspace choice when the session ends, so the next person on this phone starts clean.
      if (event === "SIGNED_OUT") {
        resetRole();
        void setActiveWorkspace(null).catch(() => undefined);
      }
      if (live) setState({ loading: false, session, configured: true });
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
