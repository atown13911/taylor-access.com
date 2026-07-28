"""Mark zero-success and orphaned backup runs as failed so the schedulers retry.

Run: railway run python scripts/fix_backup_runs.py (after the fixed deploy is live)
"""
import os

import psycopg2

url = os.environ.get("DATABASE_PUBLIC_URL") or os.environ["DATABASE_URL"]
conn = psycopg2.connect(url)
cur = conn.cursor()

for table, backed in (("GoogleDriveBackupRuns", "FilesBackedUp"), ("GoogleGmailBackupRuns", "MessagesBackedUp")):
    cur.execute(
        f'UPDATE "{table}" SET "Status" = \'failed\', "Error" = COALESCE("Error", \'superseded: no files stored\') '
        f'WHERE "Status" = \'completed\' AND "{backed}" = 0 AND "UsersProcessed" > 0'
    )
    print(f"{table}: {cur.rowcount} zero-success completed runs -> failed")

    cur.execute(
        f'UPDATE "{table}" SET "Status" = \'failed\', "FinishedAt" = NOW(), '
        f'"Error" = \'interrupted by deploy\' WHERE "Status" = \'running\''
    )
    print(f"{table}: {cur.rowcount} orphaned running runs -> failed")

conn.commit()
cur.close()
conn.close()
print("done")
