import { useMemo, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { SearchResultPage } from './pages/SearchResultPage';
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

function ExperimentApp() {
  const [participantId] = useState(() => getParticipantId());
  const keyword = useMemo(() => {
    const k = new URLSearchParams(window.location.search).get('keyword');
    return k || '#晚5秒要付1700高速费当事人发声#';
  }, []);

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

  return (
    <SearchResultPage
      participantId={participantId}
      userProfile={profile}
      forcedKeyword={keyword}
    />
  );
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPage />;
  }

  return <ExperimentApp />;
}
