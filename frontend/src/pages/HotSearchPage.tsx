import { useExperimentLogger } from '../hooks/useExperimentLogger';
import type { UserProfile } from '../types/experiment';

interface HotSearchPageProps {
  participantId: string;
  userProfile: UserProfile;
  onOpenKeyword: (keyword: string) => void;
}

const topItems = [
  { rank: 1, title: '#晚5秒要付1700高速费当事人发声#', heat: '1175477', tag: '热' },
  { rank: 2, title: '日本网民称日本确实存在撞人族', heat: '862831', tag: '' },
  { rank: 3, title: '银发经济市场规模有望达30万亿元', heat: '691004', tag: '' },
  { rank: 4, title: '中国邮政回应已叫停相关线下活动', heat: '421398', tag: '新' },
  { rank: 5, title: '一点点资助男孩被曝戴千元手表', heat: '323064', tag: '' },
  { rank: 6, title: '欠款1000万亿当事人这次真要逾期了', heat: '281355', tag: '' },
  { rank: 7, title: '中国男篮vs日本男篮', heat: '279777', tag: '新' },
  { rank: 8, title: '薛之谦开票', heat: '276564', tag: '' },
  { rank: 9, title: '镖人 一代大镖', heat: '266772', tag: '新' },
  { rank: 10, title: '160万江景房被父母堆成废品站', heat: '252271', tag: '' },
];

export function HotSearchPage({ participantId, userProfile, onOpenKeyword }: HotSearchPageProps) {
  useExperimentLogger({
    pageId: 'hot_search',
    condition: 'hot_list',
    participantId,
    userProfile,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[#f6f6f6] text-[#222]">
      <header className="relative overflow-hidden bg-[#f7b814]">
        <img
          src="https://images.unsplash.com/photo-1611078489935-0cb964de46d6?auto=format&fit=crop&w=1200&q=80"
          alt="hot"
          className="h-[150px] w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 px-4 pt-5 text-white">
          <div className="flex items-center justify-between text-[12px]">
            <span>19:05</span>
            <span>44%</span>
          </div>
          <div className="mt-5 text-center text-5xl font-black tracking-tight">微博热搜</div>
        </div>
      </header>

      <section className="bg-white">
        <div className="flex items-center gap-7 border-b border-gray-100 px-4 py-3 text-[17px]">
          <span className="text-gray-400">我的</span>
          <span className="relative font-semibold">热搜<span className="absolute -bottom-2 left-0 h-1 w-7 rounded bg-[#ff8a00]" /></span>
          <span className="text-gray-400">文娱</span>
          <span className="text-gray-400">同城</span>
          <span className="text-gray-400">社会</span>
        </div>

        <div className="bg-[#f4f4f5] px-4 py-2 text-sm text-gray-500">实时热点，每分钟更新一次</div>

        <button
          type="button"
          className="flex w-full items-center border-b border-gray-100 px-4 py-4 text-left"
          data-track="click_hot_top_fixed"
          onClick={() => onOpenKeyword('#晚5秒要付1700高速费当事人发声#')}
        >
          <span className="mr-4 text-[#eb6f58]">⬆</span>
          <span className="flex-1 text-[17px]">推动实现十五五良好开局</span>
          <span className="rounded bg-[#ff9d1a] px-1 py-0.5 text-xs text-white">热</span>
        </button>

        {topItems.map((item) => (
          <button
            type="button"
            key={item.rank}
            className="flex w-full items-center border-b border-gray-100 px-4 py-4 text-left"
            onClick={() => onOpenKeyword(item.title)}
            data-track="click_hot_search"
            data-track-id={`rank_${item.rank}`}
          >
            <span className={`w-8 text-4xl italic ${item.rank <= 3 ? 'text-[#eb6f58]' : 'text-[#f08f2a]'}`}>{item.rank}</span>
            <span className="ml-2 flex-1 truncate text-[16px]">{item.title}</span>
            <span className="text-[15px] text-gray-400">{item.heat}</span>
            {item.tag ? <span className="ml-2 rounded bg-[#ff7c8e] px-1 text-xs text-white">{item.tag}</span> : null}
          </button>
        ))}
      </section>
    </main>
  );
}
