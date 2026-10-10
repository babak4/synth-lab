import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { createRuntime } from './app/runtime';
import { ServicesContext, type AppServices } from './app/context';

function Boot() {
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    createRuntime().then(setServices, (e: unknown) => setError(String(e)));
  }, []);
  if (error) return <p role="alert">Synth Lab could not start: {error}</p>;
  if (!services) return <p>Loading…</p>;
  return (
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
