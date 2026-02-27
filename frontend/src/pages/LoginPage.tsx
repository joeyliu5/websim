import { useState } from 'react';
import { useExperimentLogger } from '../hooks/useExperimentLogger';

interface LoginPageProps {
  participantId: string;
  onSubmit: (payload: { age: number; occupation: string }) => void;
}

export function LoginPage({ participantId, onSubmit }: LoginPageProps) {
  const [age, setAge] = useState('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState('');

  useExperimentLogger({
    pageId: 'login',
    condition: 'prelogin',
    participantId,
  });

  const submit = () => {
    const nAge = Number(age);
    if (!occupation.trim()) {
      setError('请填写职业');
      return;
    }
    if (!Number.isInteger(nAge) || nAge < 10 || nAge > 100) {
      setError('请填写有效年龄（10-100）');
      return;
    }
    setError('');
    onSubmit({ age: nAge, occupation: occupation.trim() });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[430px] items-center bg-[#f6f6f6] px-5 text-[#222]">
      <section className="w-full rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">WeibSim 实验登录</h1>
        <p className="mt-2 text-sm text-gray-500">请先填写基本信息后进入实验。</p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-gray-600">职业</span>
            <input
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-base outline-none focus:border-orange-400"
              placeholder="例如：学生 / 教师 / 运营"
              value={occupation}
              data-track="input_occupation"
              onChange={(e) => setOccupation(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-gray-600">年龄</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-base outline-none focus:border-orange-400"
              placeholder="例如：24"
              value={age}
              data-track="input_age"
              onChange={(e) => setAge(e.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <button
            type="button"
            className="w-full rounded-xl bg-[#ff8200] py-3 text-base font-semibold text-white"
            data-track="submit_login"
            onClick={submit}
          >
            进入实验
          </button>
        </div>
      </section>
    </main>
  );
}
