# Weibo_Sim_Lab 项目复盘

## 1. 项目目标

- 目标：构建微博移动端仿真界面，用于行为实验采集。
- 话题：`#晚5秒要付1700高速费当事人发声#`（可替换为任意关键词）。
- 核心能力：
  - 话题素材自动抓取与组装
  - 移动端仿真 UI（综合流 + 智搜 + 正文页）
  - 行为日志采集（点击、停留、页面行为）
  - 本地日志落盘 + Supabase 交互日志

## 2. 系统结构

- 前端：`/frontend`（React + Vite + Tailwind）
- 后端：`/backend`（Express，提供 `/api/events` `/api/actions` `/api/comments`）
- 采集脚本：`/scripts`
  - `s_weibo_page1_scraper.py`：抓话题搜索页博文基础数据
  - `weibo_zhisou_archiver.py`：抓智搜相关数据与链接素材
  - `build_weibo_lab_bundle.py`：组装实验数据为 `lab_bundle.json`

## 3. 数据流（从话题到页面）

1. 输入话题关键词（可带 `--refresh`）
2. 脚本抓取微博与智搜素材
3. 生成 `frontend/public/data/lab_bundle.json`
4. 前端读取 `lab_bundle.json` 渲染仿真页面
5. 用户交互触发埋点：
   - 页面级埋点：`/api/events` -> `events.jsonl`
   - 业务动作埋点：`/api/actions` -> `actions.jsonl`
   - 评论提交：`/api/comments` -> `comments.jsonl`
   - 交互主表（Supabase）：`interaction_logs`（`view/click/stay`）

## 4. 页面与交互逻辑

- 登录页：职业 + 年龄，进入实验后保存在 `sessionStorage`，避免误返回登录。
- 综合页：置顶新闻 + 智搜卡片 + 博文流。
- 智搜页：可展开详情、可点赞、可打开来源正文。
- 正文页：支持返回列表、点赞、转发、评论入口。

## 5. 行为日志含义（人话）

- `backend/logs/events.jsonl`
  - 全量轨迹（心跳、滚动、点击、页面进入退出、可见性变化等）
  - 用于还原“用户过程”
- `backend/logs/actions.jsonl`
  - 关键业务动作（打开正文、点赞对象、停留时长落点等）
  - 用于直接分析“做了什么”
- `backend/logs/comments.jsonl`
  - 用户提交的评论内容

## 6. 已实现的实验关键字段

- 当前页面：`page`
- 停留时长：`dwellMs` / `detail.dwell_ms`
- 点赞对象：`targetPostId` + `targetAuthor` + `targetSnippet`
- 打开正文对象：`targetPostId` + `targetAuthor` + `targetSnippet`

## 7. 部署形态

- 推荐：Render（项目已有 `render.yaml`）
- 运行方式：后端服务静态托管前端 `dist`，并提供 API 与健康检查。

