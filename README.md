# Weibo_Sim_Lab

微博移动端仿真实验应用（话题抓取 -> 页面生成 -> 行为日志采集）。

## 项目复盘文档

- 详见 [PROJECT_RECAP.md](./PROJECT_RECAP.md)

## 核心能力

- 微博移动端综合页 / 智搜页 / 正文页仿真
- 话题素材自动组装：`lab_bundle.json`
- 交互行为记录：
  - 页面轨迹：`/api/events` -> `backend/logs/events.jsonl`
  - 关键动作：`/api/actions` -> `backend/logs/actions.jsonl`
  - 评论提交：`/api/comments` -> `backend/logs/comments.jsonl`
  - Supabase 交互：`interaction_logs`（`view/click/stay`）

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

2. 配置 Supabase（可选，但推荐）

```bash
cd frontend
cp .env.example .env
```

填写：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

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
3. 自动执行：
   - build: 构建前端 + 安装后端依赖
   - start: 启动 backend（同时托管 frontend/dist）
4. 部署完成后访问服务域名

健康检查：

- `/api/health`
