import { useState } from 'react';

interface AIGSCardProps {
  summary: string;
  fullText: string;
}

export function AIGSCard({ summary, fullText }: AIGSCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="bg-white px-4 py-3 border-b border-gray-100" data-track="aigs_card">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-5 items-center rounded-full bg-orange-100 px-2 text-xs font-medium text-orange-600">
            AI智搜
          </span>
          <span className="text-gray-500">回答·深度思考</span>
        </div>
        <span className="text-xs text-gray-400">刚刚</span>
      </div>

      <p className="text-[16px] leading-8 text-gray-900">
        {expanded ? fullText : summary}
        {!expanded && (
          <button
            type="button"
            className="ml-1 text-[#507daf]"
            data-track="expand_ai_summary"
            onClick={() => setExpanded(true)}
          >
            展开全文
          </button>
        )}
      </p>

      <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
        继续问智搜 · 6437人正在追问
      </div>
    </section>
  );
}
