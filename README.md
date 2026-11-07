# Weibo_Sim_Lab

微博移动端仿真实验应用（话题抓取 -> 页面生成 -> 行为日志采集）。

## 当前实验素材：盐城寄宿学校事件

首页现使用 2026-11-07 固定采集的“13岁男孩被打后多次求助宿管遭拒”素材。参与者填写基本信息后，系统按参与者编号随机分配至普通微博组或智搜组，并在本机保持分组稳定。普通组展示大河报、中国新闻周刊、新浪新闻三条完整原帖及头像、图片或视频；智搜组展示当次采集的完整回答、引用缩略图和来源列表。智搜引用的三条实验原帖可在站内打开详情，其余引用链接跳转至微博原文或相应外部来源。实验界面没有跨组切换入口。

本地开发时可用 `?preview=ordinary` 或 `?preview=smart` 查看两组；生产构建不接受预览参数。固定素材位于 `frontend/public/data/saltcity_case.json` 和 `frontend/public/case-saltcity/`。如需从原始采集目录重新生成：

```bash
python3 scripts/build_saltcity_case.py --archive '/Users/liujinzhuo/Documents/ChatGPT/微博实验/原始采集/盐城寄宿学校事件'
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
