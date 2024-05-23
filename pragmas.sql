-- name: SetPragmas :exec
PRAGMA busy_timeout       = 5000;-- Wait for 5s before returing an error if the DB is locked/busy.
PRAGMA journal_mode       = WAL; -- Enable concurrent writes using WAL
PRAGMA journal_size_limit = 5000000; -- Limit is in bytes, set to 5 MB
PRAGMA synchronous        = NORMAL; -- Dont wait for the data to be flushed to disk.
PRAGMA foreign_keys       = ON; -- Enable foreign key constraints.
PRAGMA temp_store         = MEMORY; -- Use memory instead of disk for temp storage.
PRAGMA cache_size         = -16000; -- Set the cache size to 16MB. Useful for reducing disk IO.
