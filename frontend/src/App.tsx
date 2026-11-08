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

type CaseId = 'saltcity' | 'starbucks' | 'teachers';
type Assignment = { caseId: CaseId; condition: SaltCityCondition };
const CASES: CaseId[] = ['saltcity', 'starbucks', 'teachers'];

function assignedCondition(participantId: string): Assignment {
  // A preview override exists only in the local development server.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('preview');
    const caseId = params.get('case') || 'saltcity';
    if ((preview === 'ordinary' || preview === 'smart') && CASES.includes(caseId as CaseId)) {
      return { caseId: caseId as CaseId, condition: preview };
    }
  }
  const key = `weibsim_case_assignment_${participantId}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    try {
      const saved = JSON.parse(cached) as Assignment;
      if (CASES.includes(saved.caseId) && (saved.condition === 'ordinary' || saved.condition === 'smart')) return saved;
    } catch { /* Resample an invalid saved assignment. */ }
  }
  const sample = new Uint32Array(1);
  crypto.getRandomValues(sample);
  const next: Assignment = { caseId: CASES[Math.floor(sample[0] / 2) % CASES.length], condition: sample[0] % 2 === 0 ? 'ordinary' : 'smart' };
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

function ExperimentApp() {
  const [participantId] = useState(() => getParticipantId());
  const [assignment] = useState(() => assignedCondition(participantId));

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

  return <SaltCityExperimentPage participantId={participantId} userProfile={profile} condition={assignment.condition} caseId={assignment.caseId} />;
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPage />;
  }

  return <ExperimentApp />;
}
