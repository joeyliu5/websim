#!/usr/bin/env python3
"""Build researcher-edited, three-source experiment stimuli from raw archives."""
import html
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVES = next((path for path in (
    ROOT.parent / '原始采集',
    ROOT.parent / 'ChatGPT' / '微博实验' / '原始采集',
) if path.is_dir()), ROOT.parent / '原始采集')
PUBLIC = ROOT / 'frontend' / 'public'

CASES = {
    'starbucks': {
        'archive': '星巴克消费入座事件',
        'topic': '星巴克正式施行消费入座',
        'posts': [
            ('5356410104974555', '1649173367', 'RnFu2kS6L'),
            ('5356512659899129', '7516679696', 'RnI9rFxdn'),
            ('5356880848226546', '1683472727', 'RnRJiyw6e'),
        ],
        'answer': [
            ('paragraph', '星巴克宣布自10月22日起在全国门店施行“消费入座”，门店摆放提示牌，店员按服务指引与顾客沟通。对孕妇、行动不便者等有特殊需求的人，门店表示会优先提供帮助。', [1, 2]),
            ('heading', '一、门店如何执行', []),
            ('bullet', '记者在上海走访发现，多家门店已摆放提示牌，店员会提醒未消费入座的顾客。客服表示，座位主要提供给消费顾客，具体处理会结合门店实际情况。', [3]),
            ('bullet', '门店工作人员称，客流高峰、座位紧张时会优先提醒；客流较少时可以相对灵活。九派新闻走访的门店也称，老人、孕妇等有需要者可酌情休息。', [2, 3]),
            ('heading', '二、政策与服务投入', []),
            ('bullet', '星巴克称，消费入座旨在维护门店的“第三空间”体验。中国公司还宣布，2027新财年将新增超过3亿元投入，用于增加高峰时段服务人力、升级设备和改造约1000家门店。', [1]),
            ('bullet', '公司计划在全国近半数门店增加高峰时段人力投入，重点覆盖交通枢纽、办公区和景区等客流较大的门店。', [1]),
            ('heading', '三、顾客体验与争议', []),
            ('bullet', '一名顾客称，在客流较少时临时参加线上会议，约一个半小时内被提醒点单五次，感觉受到催促；也有顾客认为，商业门店要求消费入座可以理解。', [3]),
            ('bullet', '受访者认为，商家可以设定座位使用规则，执行时仍需注意沟通方式。律师指出，门店作为经营场所可以合理安排营业空间，但应清楚公示规则并礼貌劝导。', [2, 3]),
        ],
    },
    'teachers': {
        'archive': '小学无薪酬跟岗教师事件',
        'topic': '人社局回应小学无薪酬招跟岗教师',
        'posts': [
            ('5361944410194942', '1642512402', 'RpZsl0OIe'),
            ('5361872939254848', '1655444627', 'RpXB3CPBK'),
            ('5361892963126505', '1720962692', 'RpY7md7lv'),
        ],
        'answer': [
            ('paragraph', '山西太原一小学发布无薪酬招募跟岗教师的信息，引发讨论。万柏林区人社局仲裁院工作人员表示，无薪招聘不合规，即使处于试用阶段，只要付出劳动就应依法获得报酬，并称会联系教育局制止。', [1]),
            ('heading', '一、招聘信息写了什么', []),
            ('bullet', '招聘面向社会人员，要求本科及以上学历、教师资格证等，并非在校生实习。岗位涉及语文、数学、英语等学科。', [1, 2]),
            ('bullet', '跟岗人员需参与备课、试教、作业批改、班级管理和课后服务等工作；公告写明“无薪酬待遇”，食宿自行解决，学校可安排校内午休。', [1, 3]),
            ('heading', '二、校方如何解释', []),
            ('bullet', '校方工作人员称，跟岗人员并非正式编制教师，学校将其作为师资储备，考核期约一个学期；将来如有岗位，可能与第三方劳务派遣公司签订合同。', [2, 3]),
            ('bullet', '据极目新闻采访，工作人员称签约后为劳务派遣用工，有五险、无公积金，每月实得工资约1900元。该报道还记录了工作人员“已有人员到岗”的说法。', [3]),
            ('heading', '三、无薪跟岗的用工争议', []),
            ('bullet', '受访律师指出，招聘要求跟岗者接受学校管理并参与持续性校内工作。若实际用工符合劳动关系的实质要件，即使未签合同，也可能成立劳动关系。', [2]),
            ('bullet', '律师认为，不能仅以“师资储备”名义规避付酬义务；未来可能签订劳务派遣合同，也不能自动排除当前用工的责任。人社局工作人员明确表示，劳动者不能白干。', [1, 2]),
        ],
    },
}


def copy_asset(source: Path, dest: Path) -> str:
    if not source.is_file():
        return ''
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    return '/' + str(dest.relative_to(PUBLIC))


def build(case_id: str, spec: dict) -> None:
    archive = ARCHIVES / spec['archive']
    asset_dir = PUBLIC / f'case-{case_id}'
    posts = []
    for mid, uid, bid in spec['posts']:
        folder = archive / '智搜' / '引用微博' / mid
        status = json.loads((folder / 'status.json').read_text())
        longtext = json.loads((folder / 'longtext.json').read_text())
        user = status.get('user') or {}
        media = folder / 'canonical_media'
        photos = [copy_asset(media / f'photo_{i:02d}.jpg', asset_dir / f'{mid}_photo_{i:02d}.jpg')
                  for i in range(1, len(status.get('pic_ids') or []) + 1)]
        posts.append({
            'id': mid, 'bid': bid, 'url': f'https://weibo.com/{uid}/{bid}',
            'author': user.get('screen_name') or '', 'authorUrl': f'https://weibo.com/u/{uid}',
            'avatar': copy_asset(media / 'avatar_display.jpg', asset_dir / f'{mid}_avatar.jpg'),
            'avatarHd': copy_asset(media / 'avatar_hd.jpg', asset_dir / f'{mid}_avatar_hd.jpg'),
            'verified': bool(user.get('verified')), 'createdAt': status.get('created_at') or '',
            'source': re.sub(r'<[^>]*>', '', status.get('source') or ''),
            'text': html.unescape((longtext.get('data') or {}).get('longTextContent') or status.get('text_raw') or ''),
            'photos': [photo for photo in photos if photo],
            'video': copy_asset(media / 'video.mp4', asset_dir / f'{mid}_video.mp4'),
            'videoPoster': f'/case-{case_id}/{mid}_video_poster.jpg'
                if (asset_dir / f'{mid}_video_poster.jpg').is_file() else '',
            'reposts': status.get('reposts_count') or 0,
            'comments': status.get('comments_count') or 0,
            'likes': status.get('attitudes_count') or 0,
        })
    blocks = []
    for kind, text, numbers in spec['answer']:
        blocks.append({'kind': kind, 'text': text, 'citations': [
            {'mid': posts[i - 1]['id'], 'index': i, 'name': posts[i - 1]['author']} for i in numbers
        ]})
    media_items = []
    for post in posts:
        media = archive / '智搜' / 'media' / f"{post['id']}.jpg"
        if media.is_file() and len(media_items) < 2:
            media_items.append({
                'mid': post['id'], 'type': 'p', 'author': post['author'],
                'image': copy_asset(media, asset_dir / f"{post['id']}_ai.jpg"),
            })
    if media_items:
        blocks.insert(1, {'kind': 'media', 'items': media_items})
    ai_response = json.loads((archive / '智搜' / 'api_loop_01.json').read_text())
    bundle = {
        'id': f'{case_id}_202611', 'topic': spec['topic'], 'sourceCaptureDate': '2026-11-08',
        'stimulus': 'researcher_edited_from_archived_sources', 'posts': posts,
        'smart': {'blocks': blocks, 'generatedAt': ai_response.get('analysis_time'),
                  'weiboReferenceCount': 3, 'sources': [
                      {'index': i, 'mid': post['id'], 'name': post['author'], 'url': post['url']}
                      for i, post in enumerate(posts, 1)
                  ]},
    }
    output = PUBLIC / 'data' / f'{case_id}_case.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2))
    print(case_id, 'posts', len(posts), 'answer chars', sum(len(x[1]) for x in spec['answer']))


if __name__ == '__main__':
    for case_id, spec in CASES.items():
        build(case_id, spec)
