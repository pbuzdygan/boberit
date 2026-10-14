import { useEffect, useState } from 'react';
import { api, setAccessToken } from '../api';

type HouseholdMembership = { id: string; name: string; role: string };

const sessionKey = 'boberit-session';

/**
 * Session token (kept per tab in sessionStorage), the signed-in account, and household
 * memberships. Call this hook before any hook that loads data: its effect hands the token
 * to the API client, and effects run in declaration order.
 */
export function useSession() {
  const [accessToken, setToken] = useState<string | null>(() => sessionStorage.getItem(sessionKey));
  const [households, setHouseholds] = useState<HouseholdMembership[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [account, setAccount] = useState<{ login: string; email: string } | null>(null);
  const isOwner = households.find((household) => household.id === activeHouseholdId)?.role === 'owner';

  useEffect(() => {
    const loadHouseholds = () =>
      void api
        .households()
        .then((r) => {
          setHouseholds(r.data.households);
          setActiveHouseholdId(r.data.activeHouseholdId);
        })
        .catch(() => undefined);
    setAccessToken(accessToken);
    if (accessToken) {
      loadHouseholds();
      void api
        .me()
        .then((r) => setAccount(r.data))
        .catch(() => setAccount(null));
      window.addEventListener('boberit-households-changed', loadHouseholds);
    }
    return () => window.removeEventListener('boberit-households-changed', loadHouseholds);
  }, [accessToken]);

  function signIn(token: string) {
    sessionStorage.setItem(sessionKey, token);
    setToken(token);
  }

  function signOut() {
    sessionStorage.removeItem(sessionKey);
    setAccessToken(null);
    setAccount(null);
    setToken(null);
  }

  return { accessToken, account, households, activeHouseholdId, setActiveHouseholdId, isOwner, signIn, signOut };
}
