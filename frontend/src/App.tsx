import { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { SaltCityExperimentPage, type SaltCityCondition } from './pages/SaltCityExperimentPage';
import type { UserProfile } from './types/experiment';

const PARTICIPANT_KEY = 'weibsim_participant_id';

function getParticipantId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('pid');
  if (fromQuery) return fromQuery;

  const cached = sessionStorage.getItem(PARTICIPANT_KEY);
  if (cached) return cached;

  const next = `p${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
  sessionStorage.setItem(PARTICIPANT_KEY, next);
  return next;
}

function assignedCondition(participantId: string): SaltCityCondition {
  // A preview override exists only in the local development server.
  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(window.location.search).get('preview');
    if (preview === 'ordinary' || preview === 'smart') return preview;
  }
  const key = `weibsim_saltcity_condition_${participantId}`;
  const cached = localStorage.getItem(key);
  if (cached === 'ordinary' || cached === 'smart') return cached;
  const sample = new Uint32Array(1);
  crypto.getRandomValues(sample);
  const next: SaltCityCondition = sample[0] % 2 === 0 ? 'ordinary' : 'smart';
  localStorage.setItem(key, next);
  return next;
}

function ExperimentApp() {
  const [participantId] = useState(() => getParticipantId());
  const [condition] = useState(() => assignedCondition(participantId));

  // Always require fresh login info for each new page-open/refresh.
  const [profile, setProfile] = useState<UserProfile | null>(null);

  if (!profile) {
    return (
      <LoginPage
        participantId={participantId}
        onSubmit={(payload) => {
          setProfile(payload);
        }}
      />
    );
  }

  return <SaltCityExperimentPage participantId={participantId} userProfile={profile} condition={condition} />;
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPage />;
  }

  return <ExperimentApp />;
}
