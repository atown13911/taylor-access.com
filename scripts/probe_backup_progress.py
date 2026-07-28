"""Show latest Drive/Gmail backup runs and bucket totals.

Run: railway run python scripts/probe_backup_progress.py
"""
import os

import psycopg2

url = os.environ.get("DATABASE_PUBLIC_URL") or os.environ["DATABASE_URL"]
conn = psycopg2.connect(url)
cur = conn.cursor()

print("--- Drive runs (latest 3) ---")
cur.execute('SELECT "Id","StartedAt","Status","Trigger","UsersProcessed","FilesBackedUp","FilesSkipped","FilesFailed","BytesUploaded" '
            'FROM "GoogleDriveBackupRuns" ORDER BY "StartedAt" DESC LIMIT 3')
for r in cur.fetchall():
    print(f"  run {r[0]} {r[1]:%H:%M} {r[2]}/{r[3]} users={r[4]} backed={r[5]} skipped={r[6]} failed={r[7]} bytes={r[8]:,}")

cur.execute('SELECT COUNT(*), COALESCE(SUM("SizeBytes"),0) FROM "GoogleDriveBackupFiles" WHERE "Status" = \'backedUp\'')
n, b = cur.fetchone()
print(f"  files in bucket: {n:,} ({float(b)/1e9:.2f} GB)")

print("--- Gmail runs (latest 3) ---")
cur.execute('SELECT "Id","StartedAt","Status","Trigger","UsersProcessed","MessagesBackedUp","MessagesSkipped","MessagesFailed","BytesUploaded" '
            'FROM "GoogleGmailBackupRuns" ORDER BY "StartedAt" DESC LIMIT 3')
for r in cur.fetchall():
    print(f"  run {r[0]} {r[1]:%H:%M} {r[2]}/{r[3]} users={r[4]} backed={r[5]} skipped={r[6]} failed={r[7]} bytes={r[8]:,}")

cur.execute('SELECT COUNT(*), COALESCE(SUM("SizeBytes"),0) FROM "GoogleGmailBackupMessages" WHERE "Status" = \'backedUp\'')
n, b = cur.fetchone()
print(f"  messages in bucket: {n:,} ({float(b)/1e9:.2f} GB)")

cur.close()
conn.close()
