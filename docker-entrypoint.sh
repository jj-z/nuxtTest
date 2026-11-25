#!/bin/sh
# ============================================================
#  docker-entrypoint.sh —— 容器启动时执行的入口脚本
#  流程：
#    1. 等待数据库容器启动并可连接
#    2. 执行 Prisma 数据库迁移（建表 / 更新表结构）
#    3. 启动 Nuxt 应用
# ============================================================

# 遇到错误立即退出，不让脚本继续往下跑（避免错误被忽略）
set -e

# —— 打印当前数据库连接信息（方便排查问题）——
# 注意：完整的 DATABASE_URL 可能包含密码，这里只打印主机和端口
echo "=========================================="
echo "  Nuxt 应用容器启动中..."
echo "=========================================="
echo "数据库地址: ${DATABASE_URL%%@*}@${DATABASE_URL#*@}"
echo "Node 环境: ${NODE_ENV}"
echo "=========================================="


# —— 第一步：等待数据库就绪 ——
# 数据库容器可能比应用容器启动慢，需要轮询等待
echo ">>> 等待数据库就绪..."

# 从 DATABASE_URL 中提取数据库主机和端口
# DATABASE_URL 格式: postgresql://用户:密码@主机:端口/数据库名
# 这段 shell 代码的作用是把 @ 后面的 主机:端口 拆出来
DB_HOST_PORT=$(echo "$DATABASE_URL" | sed -E 's#.*@([^/]+)/.*#\1#')
DB_HOST=$(echo "$DB_HOST_PORT" | cut -d: -f1)
DB_PORT=$(echo "$DB_HOST_PORT" | cut -d: -f2)

echo "    数据库主机: $DB_HOST"
echo "    数据库端口: $DB_PORT"

# 最多等待 60 秒，每 2 秒尝试连接一次
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  # 用 nc（netcat）检测端口是否开放
  # -z 表示只检测不发送数据，-w 2 表示超时 2 秒
  if nc -z -w 2 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    echo "    ✓ 数据库已就绪！"
    break
  fi
  RETRY=$((RETRY + 1))
  echo "    数据库还没准备好，等待中... ($RETRY/$MAX_RETRIES)"
  sleep 2
done

# 如果等了 60 秒还连不上，报错退出
if [ $RETRY -eq $MAX_RETRIES ]; then
  echo "    ✗ 等待数据库超时，请检查数据库容器是否正常启动！"
  exit 1
fi


# —— 第二步：执行数据库迁移 ——
# prisma migrate deploy 会把 prisma/migrations 目录下的迁移脚本
# 按顺序应用到数据库（建表、加字段、加 pgvector 扩展等）
echo ">>> 执行数据库迁移..."
npx prisma migrate deploy
echo "    ✓ 数据库迁移完成"


# —— 第三步：启动 Nuxt 应用 ——
# node .output/server/index.mjs 是 Nuxt 生产环境的启动命令
# exec 表示用这个进程替换当前 shell 进程，让 Nuxt 成为主进程
# 这样 docker stop 的信号才能直接传给 Nuxt
echo ">>> 启动 Nuxt 应用..."
echo "    监听地址: http://0.0.0.0:${PORT}"
exec node .output/server/index.mjs
