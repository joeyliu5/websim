# Weibo_Sim_Lab

微博移动端仿真实验应用（话题抓取 -> 页面生成 -> 行为日志采集）。

## 当前实验：三则新闻 × 两种呈现

参与者填写基本信息后，系统随机分配至六个条件之一：盐城寄宿学校事件、星巴克消费入座、无薪跟岗教师三则新闻各有普通微博组和智搜组。每人只看到一则新闻的一种呈现，按参与者编号在本机保持分组稳定。普通组展示三条原帖及头像、图片或视频；智搜组仅保留指向相同三条原帖的文内引用，点击后在站内打开原帖。两组均可转发、评论、点赞并记录行为，实验界面没有跨组切换入口。

盐城智搜使用采集回答并筛选三条对应来源。星巴克及跟岗教师智搜使用研究者依据原始回答和三条对应原帖编写的实验改编稿；原始采集保存在项目外的 `原始采集/`，不会被改写。

本地开发可用 `?case=saltcity|starbucks|teachers&preview=ordinary|smart` 查看六组；生产构建不接受预览参数。固定素材位于 `frontend/public/data/*_case.json` 和 `frontend/public/case-*/`。重新生成：

```bash
python3 scripts/build_saltcity_case.py --archive '/Users/liujinzhuo/Documents/ChatGPT/微博实验/原始采集/盐城寄宿学校事件'
python3 scripts/build_new_cases.py
```

## 项目复盘文档

- 详见 [PROJECT_RECAP.md](./PROJECT_RECAP.md)

## 核心能力

- 微博移动端综合页 / 智搜页 / 正文页仿真
- 话题素材自动组装：`lab_bundle.json`
- 交互行为记录：
  - 页面轨迹：`/api/events` -> `event_logs`
  - 关键动作：`/api/actions` -> `action_logs`
  - 评论提交：`/api/comments` -> `comment_logs`
  - 轻量交互：`/api/interactions` -> `interaction_logs`（`view/click/stay`）

## 一键生成话题素材

```bash
cd /Users/liujinzhuo/Documents/New\ project
bash scripts/switch_topic.sh '晚5秒要付1700高速费当事人发声'
```

等价命令（可调抓取页数）：

```bash
python3 scripts/build_weibo_lab_bundle.py \
  --topic '你的话题' \
  --cookie-file '/Users/liujinzhuo/Documents/New project/cookie.rtf' \
  --refresh \
  --pages 5
```

输出：

- `frontend/public/data/lab_bundle.json`：前端使用的数据
- `frontend/public/data/lab_bundle_media_manifest.json`：每条博文的头像/图片/封面映射清单（便于核对“一一对应”）

## 本地运行

1. 安装依赖

```bash
cd frontend && npm install
cd ../backend && npm install
```

2. 配置 Supabase（推荐）

```bash
打开 backend/supabase/weibo_sim_lab_schema.sql
```

在 Supabase SQL Editor 执行建表脚本，然后准备：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

3. 启动后端

```bash
cd /Users/liujinzhuo/Documents/New\ project/backend
npm run dev
```

4. 启动前端

```bash
cd /Users/liujinzhuo/Documents/New\ project/frontend
npm run dev
```

## 清空行为日志（测试前）

```bash
bash scripts/clear_logs.sh
```

## GitHub 上传（隐私安全）

本仓库已通过 `.gitignore` 排除敏感文件：

- `cookie.rtf`
- `.secrets/`
- `.env*`
- `output/`
- `backend/logs/*.jsonl`

上传步骤：

```bash
git add .
git commit -m "chore: prepare Weibo_Sim_Lab for cloud deploy"
git remote add origin <你的仓库地址>
git push -u origin main
```

## Render 云部署

仓库已带 `render.yaml`，可直接 Blueprint 部署：

1. 在 Render 新建 Blueprint，连接 GitHub 仓库
2. 选择仓库根目录，Render 会读取 `render.yaml`
3. 在 Render 环境变量里填写：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. 自动执行：
   - build: 构建前端 + 安装后端依赖
   - start: 启动 backend（同时托管 frontend/dist）
5. 部署完成后访问服务域名

健康检查：

- `/api/health`
