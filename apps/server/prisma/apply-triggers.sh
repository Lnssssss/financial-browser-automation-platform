#!/usr/bin/env bash
# 应用 role-exclusion 触发器（ADR-002 数据库兜底闸）。
# 用 mysql 客户端灌，因为：
#  1. 触发器体含 `;`，需要 DELIMITER 指令切换分隔符——只有 mysql 客户端认；
#  2. CREATE TRIGGER 不支持 prepared 协议，Prisma $executeRaw 会报 MySQL 1295。
# 通过运行中的 docker 容器执行，避免本机装 mysql-client。
set -euo pipefail

CONTAINER="${MYSQL_CONTAINER:-agentflow-mysql}"
DB="${MYSQL_DATABASE:-agentflow}"
ROOT_PASS="${MYSQL_ROOT_PASSWORD:-root}"
SQL_FILE="$(dirname "$0")/sql/role-exclusion-trigger.sql"

# 触发器含 SELECT，开了 binlog 的 MySQL 需要 SUPER 或 log_bin_trust_function_creators。
# 用 root 建触发器，并顺手打开该变量（生产由 DBA 配，此处 demo 自动化）。
echo "→ 允许创建触发器（log_bin_trust_function_creators=1）..."
docker exec -i "$CONTAINER" mysql -uroot -p"$ROOT_PASS" \
  -e "SET GLOBAL log_bin_trust_function_creators = 1;" 2>/dev/null

echo "→ 应用触发器到 ${CONTAINER}/${DB} ..."
docker exec -i "$CONTAINER" mysql -uroot -p"$ROOT_PASS" "$DB" < "$SQL_FILE"
echo "✓ 触发器已应用"

echo "→ 已注册的触发器："
docker exec -i "$CONTAINER" mysql -uroot -p"$ROOT_PASS" "$DB" \
  -e "SELECT trigger_name, event_manipulation FROM information_schema.triggers WHERE trigger_schema='${DB}';" 2>/dev/null
