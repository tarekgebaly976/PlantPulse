#!/usr/bin/env bash
# Puts the LOCAL demo database back to its freshly seeded state before filming, so every take starts the same.
# Local container only: it uses the local PostgreSQL server (sudo -u postgres). Never run it on a real system.
#   first time (after seed-demo + demo-operations + demo-rca + demo-kpi-targets):  scripts/reset-demo.sh --save
#   before each capture:                                                           scripts/reset-demo.sh
set -euo pipefail
DB=${VIDEO_DB:-cmms}
BASE=${DB}_video_base
psql_su() { sudo -u postgres psql -v ON_ERROR_STOP=1 -q "$@"; }
kick() { psql_su -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$1' and pid<>pg_backend_pid();" >/dev/null; }
if [[ "${1:-}" == "--save" ]]; then
  kick "$DB"; psql_su -c "DROP DATABASE IF EXISTS $BASE;" -c "CREATE DATABASE $BASE TEMPLATE $DB OWNER cmms_owner;"
  echo "Saved $DB as $BASE"
else
  kick "$DB"; kick "$BASE"
  psql_su -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB TEMPLATE $BASE OWNER cmms_owner;"
  echo "Reset $DB from $BASE"
fi
