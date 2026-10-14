import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .setup()
      .then((response) => setSetup(response.data.needsSetup))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Nie udało się połączyć z Boberit.'));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response = setup
        ? await api.register({ login, email, password, householdName })
        : await api.login({ login, password });
      onAuthenticated(response.data.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zalogować.');
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-shell">
        <div className="auth-banner-wrap">
          <img className="auth-banner" src="/branding/boberit-banner.png" alt="Boberit" />
        </div>
        <section className="auth-card">
          <div className="auth-heading">
            <p className="eyebrow">{setup ? 'Pierwsze uruchomienie' : 'Witaj ponownie'}</p>
            <h1>{setup ? 'Utwórz pierwsze konto' : 'Zaloguj się'}</h1>
            <p>
              {setup
                ? 'Skonfiguruj właściciela i pierwsze gospodarstwo.'
                : 'Wejdź do swojego gospodarstwa i sprawdź, co wymaga uwagi.'}
            </p>
          </div>
          <form onSubmit={submit}>
            <label>
              Login
              <input
                autoComplete="username"
                autoFocus
                required
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Twój login"
              />
            </label>
            {setup && (
              <>
                <label>
                  E-mail
                  <input
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Adres e-mail"
                    type="email"
                  />
                </label>
                <label>
                  Nazwa gospodarstwa
                  <input
                    required
                    value={householdName}
                    onChange={(event) => setHouseholdName(event.target.value)}
                    placeholder="np. Nasz dom"
                  />
                </label>
              </>
            )}
            <label>
              Hasło
              <input
                autoComplete={setup ? 'new-password' : 'current-password'}
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 12 znaków"
                type="password"
              />
            </label>
            <button className="primary auth-submit" disabled={setup === null} type="submit">
              {setup === null ? 'Łączenie…' : setup ? 'Utwórz konto' : 'Zaloguj się'}
            </button>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <p className="auth-footnote">Twoje dane pozostają w Twojej instancji Boberit.</p>
        </section>
      </section>
    </main>
  );
}
