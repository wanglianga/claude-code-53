#!/bin/sh
set -e
echo "[entrypoint] 同步数据库结构..."
npx prisma db push --skip-generate
echo "[entrypoint] 初始化种子数据（幂等）..."
node prisma/seed.js
echo "[entrypoint] 启动 API..."
exec node dist/main.js
