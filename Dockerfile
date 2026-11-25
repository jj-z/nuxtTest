# ============================================================
#  Dockerfile —— 把 Nuxt4 项目打包成 Docker 镜像
#  采用「多阶段构建」：第一阶段负责编译，第二阶段只放运行所需的文件
#  好处：最终镜像体积小、不包含源代码和编译工具、更安全
# ============================================================


# ====================== 第一阶段：构建阶段 (builder) ======================
# 作用：安装依赖 → 编译原生模块 → 生成 Prisma 客户端 → 构建 Nuxt 产物
# node:22-alpine = Node.js 22 + Alpine 极简 Linux（体积小）
# 注意：Nuxt 4.5.2 要求 Node.js >= 22.19.0，所以必须用 Node 22，不能用 20
FROM node:22-alpine AS builder

# 容器内的工作目录（后续所有 COPY/RUN 都在这个目录下操作）
WORKDIR /app

# —— 安装编译原生模块所需的系统工具 ——
# 项目依赖了两个「原生模块」（需要编译 C++ 代码）：
#   1. bcrypt  —— 密码加密，需要 make + g++
#   2. sharp   —— 图片处理，需要 vips 图形库
# apk add 是 Alpine 的包管理命令（类似 Ubuntu 的 apt）
# --no-cache 表示不保留缓存，让镜像更小
RUN apk add --no-cache python3 make g++ vips-dev

# —— 利用 Docker 缓存优化：先只复制依赖清单 ——
# 为什么先复制 package.json 而不是全部代码？
# 因为 Docker 会缓存每一步的结果。只要 package.json 没变，
# 下面的 npm install 就会直接用缓存，不用每次都重新安装。
COPY package*.json ./

# —— 设置国内 npm 镜像源（让国内服务器安装依赖更快）——
# 如果你的服务器在国外，可以删掉这一行
RUN npm config set registry https://registry.npmmirror.com

# —— 设置 Prisma 引擎国内镜像源 ——
# Prisma 的 schema-engine / query-engine 二进制默认从 binaries.prisma.sh 下载，
# 国内服务器访问不了，必须用淘宝镜像。prisma generate 和 migrate 都需要这个。
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# 安装依赖（包含 devDependencies，因为构建时需要 prisma、sass 等）
# npm ci 会严格按照 package-lock.json 安装，保证版本一致
# --ignore-scripts 先跳过安装脚本（避免原生模块在依赖没装完时编译失败）
RUN npm ci --ignore-scripts

# 重新编译原生模块（bcrypt / sharp）
# 因为上面用了 --ignore-scripts，这里手动触发编译
RUN npm rebuild bcrypt sharp

# —— 复制项目全部源码 ——
# .dockerignore 会排除 node_modules、.output 等不需要的文件
COPY . .

# —— 生成 Prisma 客户端代码 ——
# Prisma 会根据 prisma/schema.prisma + prisma/models/*.prisma
# 生成 TypeScript 数据库操作代码，输出到 generated/prisma 目录
# 注意：prisma.config.ts 里用了 env('DATABASE_URL')，
# 但 prisma generate 只读取 schema，不真正连数据库，
# 所以这里给一个占位 URL 即可，真正的数据库地址在运行时注入
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npx prisma generate

# —— 构建 Nuxt 应用 ——
# 这一步会把 Vue 页面、服务端 API、静态资源全部编译到 .output 目录
# .output 就是生产环境可直接运行的「成品」
RUN npm run build


# ====================== 第二阶段：运行阶段 (runner) ======================
# 作用：只包含运行时必需的文件，镜像更小更干净
# 用 Node 22 保持和构建阶段一致
FROM node:22-alpine AS runner

WORKDIR /app

# —— 安装运行时系统库 ——
# vips：sharp 运行时需要（处理图片上传/压缩）
# tini：轻量级 init 进程，负责正确转发信号（让容器能优雅退出）
RUN apk add --no-cache vips tini

# —— 设置环境变量 ——
# NODE_ENV=production：Node.js 生产模式，会关闭调试日志、优化性能
# HOST=0.0.0.0：让 Nuxt 监听所有网卡，否则容器外部访问不到
# PORT=3000：Nuxt 服务端口（容器内部端口，映射到宿主机的端口在 docker-compose.yml 里配）
# PRISMA_ENGINES_MIRROR：Prisma 引擎国内镜像源，迁移时下载 schema-engine 用
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# 复制 package 文件（用于安装生产依赖）
COPY package*.json ./

# —— 设置国内 npm 镜像源（让国内服务器安装依赖更快）——
RUN npm config set registry https://registry.npmmirror.com

# 只安装生产依赖（不含 devDependencies）
# --omit=dev 表示跳过开发依赖
RUN npm ci --omit=dev --ignore-scripts

# 再次编译原生模块（因为 node_modules 是新的）
RUN npm rebuild bcrypt sharp

# —— 安装 Prisma CLI（运行数据库迁移用） ——
# prisma 在 package.json 里是 devDependency，生产依赖里没有，
# 但容器启动时需要执行 prisma migrate deploy，所以单独装一份
# --no-save 表示不写入 package.json
RUN npm install prisma@7.10.0 --no-save --ignore-scripts

# —— 从构建阶段复制「成品」——
# 只复制 .output（Nuxt 编译产物），不复制源代码
COPY --from=builder /app/.output ./.output

# 复制 Prisma 相关文件（容器内执行迁移需要）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/generated ./generated

# 复制入口脚本（启动容器时执行：等DB就绪 → 跑迁移 → 启动应用）
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# 给脚本执行权限
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 声明容器监听 3000 端口（仅文档作用，实际端口映射在 docker-compose.yml）
EXPOSE 3000

# 用 tini 作为 PID 1 进程，保证信号能正确传递给 Nuxt
# （比如 docker stop 时，让 Nuxt 有机会优雅关闭）
ENTRYPOINT ["/sbin/tini", "--"]

# 容器启动时执行的命令
CMD ["docker-entrypoint.sh"]
