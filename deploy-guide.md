# Nuxt4 项目 Docker 化部署 —— 零基础学习指南

> 本指南面向 Docker 零基础学习者，每一步都有详细解释。
> 你可以反复阅读，理解每个配置的含义后再操作。

---

## 目录

1. [项目概览](#1-项目概览)
2. [服务器现状与端口规划](#2-服务器现状与端口规划)
3. [核心概念速懂](#3-核心概念速懂)
4. [文件清单与作用说明](#4-文件清单与作用说明)
5. [部署步骤详解](#5-部署步骤详解)
6. [交互模式使用说明](#6-交互模式使用说明)
7. [常见问题排查](#7-常见问题排查)
8. [常用命令速查表](#8-常用命令速查表)

---

## 1. 项目概览

本项目（nuxt_test）是一个 **Nuxt 4 全栈应用**，技术栈：

| 技术 | 作用 |
|------|------|
| **Nuxt 4** | 前端页面 + 后端 API（一体化框架） |
| **Prisma 7** | 数据库 ORM（用 TypeScript 操作数据库） |
| **PostgreSQL + pgvector** | 数据库，pgvector 用于 AI 笔记向量检索 |
| **nuxt-auth-utils** | 用户登录认证 |
| **GLM API** | 智谱 AI 大模型，实现 RAG 问答 |
| **bcrypt** | 密码加密（原生模块，需要编译） |
| **sharp** | 图片处理（原生模块，需要编译） |

**关键点**：因为用了 `bcrypt` 和 `sharp` 这两个原生模块，Dockerfile 里需要安装编译工具。

---

## 2. 服务器现状与端口规划

你的服务器上已经跑了 `chishafan` 项目：

```
chishafan-app-1  →  0.0.0.0:3000 → 3000  （应用）
chishafan-db-1   →  0.0.0.0:5434 → 5432  （数据库）
```

为了不冲突，本项目（nuxt_test）的端口规划：

```
nuxt-test-app   →  0.0.0.0:3001 → 3000  （应用，访问地址：http://服务器IP:3001）
nuxt-test-db    →  0.0.0.0:5435 → 5432  （数据库）
```

### ⚠️ 关于备案

你的服务器**还没有备案**。在中国大陆，云服务器的 **80 和 443 端口**未备案不能对外提供 HTTP/HTTPS 服务。

**解决方案**：使用非标准端口（如 3001）对外提供服务，访问地址为 `http://你的服务器IP:3001`。

> 以后备案完成后，可以加一层 Nginx 反向代理，把 80/443 端口转发到 3001，就能用域名直接访问了。

---

## 3. 核心概念速懂

### 3.1 什么是 Docker？

Docker 就像一个「集装箱」：
- 把你的应用 + 它依赖的所有东西（Node.js、系统库、配置）打包成一个**镜像（Image）**
- 镜像运行起来就是一个**容器（Container）**
- 容器之间互相隔离，互不影响
- 好处：在你电脑上能跑，放到服务器上也一定能跑（「一次构建，到处运行」）

### 3.2 什么是 Dockerfile？

Dockerfile 是**构建镜像的说明书**，一行一条指令。Docker 按照它一步步执行，最终产出镜像。

```
Dockerfile  ──构建──▶  镜像(Image)  ──运行──▶  容器(Container)
```

### 3.3 什么是 docker-compose？

当你的应用需要多个容器配合（比如本项目需要「应用容器 + 数据库容器」），一个个手动启动太麻烦。docker-compose 就是**一键编排多个容器**的工具。

你在 `docker-compose.yml` 里写好每个容器的配置，然后 `docker compose up` 一下，全部启动。

### 3.4 什么是数据卷（Volume）？

容器是「临时」的——删除容器，里面的数据就没了。数据库的数据、用户上传的文件不能丢。

**数据卷**就是把容器内的某个目录「映射」到宿主机上，这样容器删了，数据还在。

本项目用了两个数据卷：
- `nuxt-test-db-data`：存数据库数据
- `nuxt-test-uploads`：存用户上传的文件

---

## 4. 文件清单与作用说明

本项目新增了以下 Docker 相关文件：

| 文件 | 作用 |
|------|------|
| `Dockerfile` | 构建应用镜像的说明书 |
| `.dockerignore` | 构建时忽略哪些文件（类似 .gitignore） |
| `docker-compose.yml` | 编排「应用 + 数据库」两个容器 |
| `docker-entrypoint.sh` | 容器启动脚本：等DB就绪 → 跑迁移 → 启动应用 |
| `.env.example` | 环境变量参考模板 |
| `deploy-guide.md` | 本学习文档 |

下面逐个讲解。

---

### 4.1 Dockerfile 详解

本项目采用**多阶段构建**（Multi-stage Build）：

```
┌─────────────────────┐      ┌─────────────────────┐
│   第一阶段 builder   │      │   第二阶段 runner    │
│                     │      │                     │
│  安装全部依赖        │      │  只装生产依赖        │
│  编译原生模块        │ ───▶ │  复制构建产物        │
│  prisma generate    │      │  复制迁移文件        │
│  nuxt build         │      │                     │
│                     │      │  → 体积小、更干净    │
└─────────────────────┘      └─────────────────────┘
```

**为什么要分两阶段？**

第一阶段需要安装大量编译工具（python、g++、vips-dev），这些工具在运行时不需要。如果只建一个阶段，镜像会很大（可能 1GB+）。分两阶段后，第二阶段只复制最终产物，镜像可以小到 300MB 左右。

**关键步骤解析**：

| 步骤 | 指令 | 说明 |
|------|------|------|
| 1 | `FROM node:22-alpine` | 基于 Node.js 22 + Alpine Linux（Nuxt 4 要求 Node >= 22.19） |
| 2 | `apk add python3 make g++ vips-dev` | 安装编译工具 |
| 3 | `COPY package*.json ./` | 先复制依赖清单（利用缓存） |
| 4 | `npm ci` | 安装依赖 |
| 5 | `npm rebuild bcrypt sharp` | 编译原生模块 |
| 6 | `COPY . .` | 复制源码 |
| 7 | `npx prisma generate` | 生成 Prisma 数据库客户端 |
| 8 | `npm run build` | 构建 Nuxt 应用 → 产出 .output 目录 |
| 9 | 第二阶段 `npm ci --omit=dev` | 只装生产依赖 |
| 10 | `COPY --from=builder` | 从第一阶段复制 .output 等成品 |

> 💡 具体每一行的注释都写在 Dockerfile 文件里了，可以直接打开看。

---

### 4.2 docker-compose.yml 详解

核心结构：

```yaml
services:           # 定义所有服务（容器）
  db:               # 数据库服务
    image: ...      # 用什么镜像
    environment: ... # 环境变量
    ports: ...      # 端口映射
    volumes: ...    # 数据卷
    healthcheck: ...# 健康检查

  app:              # 应用服务
    build: ...      # 从 Dockerfile 构建
    ports: ...      # 端口映射
    depends_on: ... # 依赖 db 服务
    ...

volumes:            # 定义数据卷
  nuxt-test-db-data:
  nuxt-test-uploads:
```

**端口映射详解**：

```yaml
ports:
  - "3001:3000"   # 宿主机3001端口 → 容器3000端口
```

左边 `3001` 是宿主机（服务器）的端口，外部用户访问用这个。
右边 `3000` 是容器内部的端口，Nuxt 在容器里监听 3000。

**数据库连接字符串解析**：

```
postgresql://nuxtuser:你的密码@db:5432/nuxt_test?schema=public
            └──用户──┘ └────密码────┘ └┬┘ └┬┘ └─数据库─┘
                                       │    │
                                    服务名  容器端口
```

这里的主机填 `db`（docker-compose 里的服务名），Docker 内部网络会自动解析。端口填 `5432`（容器内部端口），不是宿主机的 `5435`。

---

### 4.3 docker-entrypoint.sh 详解

容器启动时执行的脚本，做三件事：

1. **等待数据库就绪**：数据库容器可能启动慢，轮询检测端口是否开放
2. **执行数据库迁移**：`prisma migrate deploy` 把表结构建好
3. **启动 Nuxt**：`node .output/server/index.mjs`

---

## 5. 部署步骤详解

### 第 1 步：本地准备代码

确保你本地的项目包含以下新增文件：

```
nuxt_test/
├── Dockerfile              ✓ 新建
├── .dockerignore           ✓ 新建
├── docker-compose.yml      ✓ 新建
├── docker-entrypoint.sh    ✓ 新建
├── .env.example            ✓ 新建
└── ...其他原有文件
```

### 第 2 步：上传代码到服务器

有两种方式，选一种即可：

#### 方式 A：用 Git（推荐）

```bash
# 本地提交代码
git add .
git commit -m "add Docker deployment config"
git push

# 服务器上拉取
cd /opt
git clone 你的仓库地址 nuxt_test
cd nuxt_test
```

#### 方式 B：用 scp 直接传

```bash
# 在本地电脑执行（把代码打包传到服务器）
# 注意排除 node_modules、.output 等大目录
scp -r nuxt_test root@你的服务器IP:/opt/
```

> 💡 上传后，服务器上的目录应该是 `/opt/nuxt_test/`，里面有 `docker-compose.yml`。

### 第 3 步：修改敏感配置

在服务器上编辑 `docker-compose.yml`，修改以下值：

```yaml
# 数据库密码（改成你自己的强密码）
POSTGRES_PASSWORD: 你的强密码

# 数据库连接字符串里的密码也要对应改
DATABASE_URL: "postgresql://nuxtuser:你的强密码@db:5432/nuxt_test?schema=public"

# 会话密钥（至少 32 位随机字符串）
# 生成方法：node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
NUXT_SESSION_PASSWORD: "你的随机密钥"

# GLM API 密钥（不填也行，只是 AI 功能用不了）
NUXT_GLM_API_KEY: "你的GLM密钥"
```

> ⚠️ `POSTGRES_PASSWORD` 和 `DATABASE_URL` 里的密码必须一致！

### 第 4 步：构建并启动

```bash
cd /opt/nuxt_test

# 构建镜像并后台启动所有容器
docker compose up -d --build
```

参数说明：
- `up`：启动服务
- `-d`：detached 后台运行（不占用终端）
- `--build`：先构建镜像再启动

**首次构建需要 5-10 分钟**（要下载基础镜像、安装依赖、编译原生模块），请耐心等待。

### 第 5 步：查看启动日志

```bash
# 查看应用日志
docker compose logs app -f

# 查看数据库日志
docker compose logs db -f
```

看到类似这样的输出说明启动成功：

```
>>> 等待数据库就绪...
    ✓ 数据库已就绪！
>>> 执行数据库迁移...
    ✓ 数据库迁移完成
>>> 启动 Nuxt 应用...
    监听地址: http://0.0.0.0:3000
```

按 `Ctrl+C` 退出日志查看（不会停止容器）。

### 第 6 步：验证服务

```bash
# 查看容器状态
docker compose ps
```

应该看到：

```
NAME            IMAGE                STATUS                    PORTS
nuxt-test-app   nuxt-test-app        Up (healthy)              0.0.0.0:3001->3000/tcp
nuxt-test-db    pgvector/pgvector    Up (healthy)              0.0.0.0:5435->5432/tcp
```

### 第 7 步：访问应用

打开浏览器访问：

```
http://你的服务器IP:3001
```

如果服务器有安全组/防火墙，需要放行 **3001 端口**（TCP）。

---

## 6. 交互模式使用说明

「交互模式」就是让你能实时看到容器的运行状态、进入容器内部操作。下面是常用交互操作：

### 6.1 前台启动（实时看日志）

```bash
# 不加 -d，容器在前台运行，日志直接显示在终端
# 按 Ctrl+C 会停止容器
docker compose up
```

### 6.2 后台启动 + 跟踪日志

```bash
# 后台启动
docker compose up -d

# 实时跟踪日志（最常用）
docker compose logs -f

# 只看应用日志
docker compose logs -f app

# 只看最近 100 行
docker compose logs --tail=100 app
```

### 6.3 进入容器内部

```bash
# 进入应用容器（可以在里面执行命令）
docker compose exec app sh

# 进入数据库容器
docker compose exec db sh

# 退出容器：输入 exit 或按 Ctrl+D
```

### 6.4 直接执行容器内命令

```bash
# 在应用容器里执行 prisma 命令
docker compose exec app npx prisma --version

# 在数据库容器里连接数据库
docker compose exec db psql -U nuxtuser -d nuxt_test

# 查看数据库里的表
docker compose exec db psql -U nuxtuser -d nuxt_test -c "\dt"
```

### 6.5 停止 / 重启 / 删除

```bash
# 停止容器（数据保留）
docker compose stop

# 启动已停止的容器
docker compose start

# 重启容器
docker compose restart

# 停止并删除容器（数据卷保留，数据不丢）
docker compose down

# 停止并删除容器 + 数据卷（⚠️ 数据会全部丢失！）
docker compose down -v
```

### 6.6 重新部署（更新代码后）

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker compose up -d --build

# 3. 清理旧镜像（可选，释放磁盘空间）
docker image prune -f
```

---

## 7. 常见问题排查

### Q1：构建时 npm install 很慢 / 失败

**原因**：Docker 默认从国外源下载 npm 包，国内服务器可能很慢。

**解决**：Dockerfile 里已经配置了淘宝镜像源 `https://registry.npmmirror.com`。

另外，Prisma 的引擎二进制文件（schema-engine / query-engine）默认从 `binaries.prisma.sh` 下载，国内访问不了。Dockerfile 里也已经设置了 `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` 来解决这个问题。

如果你的服务器在国外，可以删除这两行配置。

### Q2：容器启动后应用一直连不上数据库

**排查**：

```bash
# 1. 看应用日志
docker compose logs app

# 2. 检查数据库是否正常
docker compose ps
docker compose logs db

# 3. 手动测试数据库连接
docker compose exec app sh -c "nc -z db 5432 && echo 'DB可达' || echo 'DB不可达'"
```

**常见原因**：`DATABASE_URL` 里的密码和 `POSTGRES_PASSWORD` 不一致。

### Q3：访问 http://IP:3001 打不开

**排查清单**：

1. 容器是否在运行？`docker compose ps`
2. 应用日志是否报错？`docker compose logs app`
3. 服务器安全组是否放行 3001 端口？
4. 服务器防火墙是否放行？`ufw status` 或 `firewall-cmd --list-ports`

### Q4：bcrypt / sharp 编译失败

**原因**：Alpine 缺少编译工具。

**解决**：Dockerfile 第一阶段已经安装了 `python3 make g++ vips-dev`，如果还失败，检查网络是否能下载这些包。

### Q5：数据库迁移失败

```bash
# 手动执行迁移看具体错误
docker compose exec app npx prisma migrate deploy
```

常见原因：数据库里已有旧数据和迁移脚本冲突。

### Q6：怎么看应用用了多少内存 / CPU？

```bash
# 实时查看容器资源占用
docker stats
```

### Q7：数据卷存在哪里？怎么备份？

```bash
# 查看数据卷
docker volume ls

# 查看数据卷详情（含宿主机路径）
docker volume inspect nuxt_test_nuxt-test-db-data

# 备份数据库
docker compose exec db pg_dump -U nuxtuser nuxt_test > backup.sql

# 恢复数据库
cat backup.sql | docker compose exec -T db psql -U nuxtuser nuxt_test
```

---

## 8. 常用命令速查表

### docker compose 命令

| 命令 | 作用 |
|------|------|
| `docker compose up -d --build` | 构建并后台启动 |
| `docker compose up` | 前台启动（看日志） |
| `docker compose down` | 停止并删除容器 |
| `docker compose down -v` | 停止删除容器+数据卷（数据丢失） |
| `docker compose ps` | 查看容器状态 |
| `docker compose logs -f` | 跟踪所有日志 |
| `docker compose logs -f app` | 跟踪应用日志 |
| `docker compose restart app` | 重启应用 |
| `docker compose exec app sh` | 进入应用容器 |
| `docker compose exec db sh` | 进入数据库容器 |

### docker 命令

| 命令 | 作用 |
|------|------|
| `docker ps` | 查看运行中的容器 |
| `docker ps -a` | 查看所有容器（含已停止） |
| `docker images` | 查看所有镜像 |
| `docker stats` | 查看容器资源占用 |
| `docker volume ls` | 查看数据卷 |
| `docker build -t myapp .` | 构建镜像 |
| `docker rmi 镜像名` | 删除镜像 |
| `docker image prune -f` | 清理无用镜像 |

### 数据库操作

| 命令 | 作用 |
|------|------|
| `docker compose exec db psql -U nuxtuser -d nuxt_test` | 进入数据库 |
| `docker compose exec app npx prisma migrate deploy` | 执行迁移 |
| `docker compose exec app npx prisma db seed` | 运行种子数据 |

---

## 附录：和 chishafan 共存的注意事项

1. **端口不能冲突**：本项目用 3001（应用）和 5435（数据库）
2. **数据卷名字不同**：`nuxt-test-db-data` vs chishafan 的卷
3. **容器名不同**：`nuxt-test-app` / `nuxt-test-db`
4. **镜像可以复用**：两个项目都用 `pgvector/pgvector:pg16`，服务器只存一份

查看服务器上所有容器：
```bash
docker ps -a
```

查看服务器上所有数据卷：
```bash
docker volume ls
```

---

> 学习建议：先通读一遍 Dockerfile 和 docker-compose.yml 的注释，再按部署步骤操作。遇到问题先看日志（`docker compose logs`），日志是最好的老师。
