"""
SQLite + FTS5 Storage Backend for Loki Mode Memory System

Drop-in replacement for the JSON-based MemoryStorage backend.
Uses SQLite (stdlib) with FTS5 full-text search for fast retrieval.
Implements the same public interface as storage.py's MemoryStorage.

Migration from JSON files happens automatically on first initialization
when existing .loki/memory/ JSON data is detected.
"""

import json
import math
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any, Union

try:
    from .schemas import EpisodeTrace, SemanticPattern, ProceduralSkill
except ImportError:
    EpisodeTrace = Any
    SemanticPattern = Any
    ProceduralSkill = Any

DEFAULT_NAMESPACE = "default"

# Schema version for migration tracking
SCHEMA_VERSION = 1

_SCHEMA_SQL = """
-- Core tables
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    date_str TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    agent TEXT DEFAULT '',
    phase TEXT DEFAULT 'ACT',
    goal TEXT DEFAULT '',
    outcome TEXT DEFAULT '',
    importance REAL DEFAULT 0.5,
    last_accessed TEXT,
    access_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    git_commit TEXT,
    data JSON NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodes_date ON episodes(date_str);
CREATE INDEX IF NOT EXISTS idx_episodes_task ON episodes(task_id);
CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome);
CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp DESC);

CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT DEFAULT '',
    confidence REAL DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0,
    importance REAL DEFAULT 0.5,
    last_accessed TEXT,
    last_used TEXT,
    access_count INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    data JSON NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence);

CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    importance REAL DEFAULT 0.5,
    last_accessed TEXT,
    access_count INTEGER DEFAULT 0,
    created_at TEXT,
    data JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    action_type TEXT DEFAULT '',
    description TEXT DEFAULT '',
    is_key_decision INTEGER DEFAULT 0,
    data JSON NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_ts ON timeline_actions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_decision ON timeline_actions(is_key_decision);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- FTS5 virtual tables for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
    id,
    goal,
    outcome,
    phase,
    agent,
    content='episodes',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
    id,
    pattern,
    category,
    correct_approach,
    incorrect_approach,
    content='patterns',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
    id,
    name,
    description,
    steps_text,
    content='skills',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, id, goal, outcome, phase, agent)
    VALUES (new.rowid, new.id, new.goal, new.outcome, new.phase, new.agent);
END;

CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, id, goal, outcome, phase, agent)
    VALUES ('delete', old.rowid, old.id, old.goal, old.outcome, old.phase, old.agent);
END;

CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, id, goal, outcome, phase, agent)
    VALUES ('delete', old.rowid, old.id, old.goal, old.outcome, old.phase, old.agent);
    INSERT INTO episodes_fts(rowid, id, goal, outcome, phase, agent)
    VALUES (new.rowid, new.id, new.goal, new.outcome, new.phase, new.agent);
END;

CREATE TRIGGER IF NOT EXISTS patterns_ai AFTER INSERT ON patterns BEGIN
    INSERT INTO patterns_fts(rowid, id, pattern, category,
        correct_approach, incorrect_approach)
    VALUES (new.rowid, new.id, new.pattern, new.category,
        json_extract(new.data, '$.correct_approach'),
        json_extract(new.data, '$.incorrect_approach'));
END;

CREATE TRIGGER IF NOT EXISTS patterns_ad AFTER DELETE ON patterns BEGIN
    INSERT INTO patterns_fts(patterns_fts, rowid, id, pattern, category,
        correct_approach, incorrect_approach)
    VALUES ('delete', old.rowid, old.id, old.pattern, old.category,
        json_extract(old.data, '$.correct_approach'),
        json_extract(old.data, '$.incorrect_approach'));
END;

CREATE TRIGGER IF NOT EXISTS patterns_au AFTER UPDATE ON patterns BEGIN
    INSERT INTO patterns_fts(patterns_fts, rowid, id, pattern, category,
        correct_approach, incorrect_approach)
    VALUES ('delete', old.rowid, old.id, old.pattern, old.category,
        json_extract(old.data, '$.correct_approach'),
        json_extract(old.data, '$.incorrect_approach'));
    INSERT INTO patterns_fts(rowid, id, pattern, category,
        correct_approach, incorrect_approach)
    VALUES (new.rowid, new.id, new.pattern, new.category,
        json_extract(new.data, '$.correct_approach'),
        json_extract(new.data, '$.incorrect_approach'));
END;

CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
    INSERT INTO skills_fts(rowid, id, name, description, steps_text)
    VALUES (new.rowid, new.id, new.name, new.description,
        json_extract(new.data, '$.steps_text'));
END;

CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
    INSERT INTO skills_fts(skills_fts, rowid, id, name, description, steps_text)
    VALUES ('delete', old.rowid, old.id, old.name, old.description,
        json_extract(old.data, '$.steps_text'));
END;

CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
    INSERT INTO skills_fts(skills_fts, rowid, id, name, description, steps_text)
    VALUES ('delete', old.rowid, old.id, old.name, old.description,
        json_extract(old.data, '$.steps_text'));
    INSERT INTO skills_fts(rowid, id, name, description, steps_text)
    VALUES (new.rowid, new.id, new.name, new.description,
        json_extract(new.data, '$.steps_text'));
END;
"""


class SQLiteMemoryStorage:
    """
    SQLite + FTS5 storage backend for Loki Mode's memory system.

    Drop-in replacement for MemoryStorage (storage.py). Same public interface,
    backed by SQLite instead of JSON files. FTS5 provides full-text search
    across all memory types.

    Thread-safe via connection-per-thread and WAL mode.
    """

    VERSION = "2.0.0"

    def __init__(
        self,
        base_path: str = ".loki/memory",
        namespace: Optional[str] = None,
    ):
        self._root_path = Path(base_path)
        self._namespace = namespace

        if namespace and namespace != DEFAULT_NAMESPACE:
            self.base_path = self._root_path / namespace
        else:
            self.base_path = self._root_path

        self.base_path.mkdir(parents=True, exist_ok=True)

        self._db_path = self.base_path / "memory.db"
        self._local = threading.local()
        self._init_db()

    @property
    def namespace(self) -> Optional[str]:
        return self._namespace

    @property
    def root_path(self) -> Path:
        return self._root_path

    def with_namespace(self, namespace: str) -> "SQLiteMemoryStorage":
        return SQLiteMemoryStorage(
            base_path=str(self._root_path),
            namespace=namespace,
        )

    # -------------------------------------------------------------------------
    # Database Connection Management
    # -------------------------------------------------------------------------

    def _get_conn(self) -> sqlite3.Connection:
        """Get a thread-local database connection."""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            conn = sqlite3.connect(
                str(self._db_path),
                timeout=10.0,
                check_same_thread=False,
            )
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.row_factory = sqlite3.Row
            self._local.conn = conn
        return self._local.conn

    def _init_db(self) -> None:
        """Initialize database schema."""
        conn = self._get_conn()
        conn.executescript(_SCHEMA_SQL)

        # Store schema version
        conn.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
            ("schema_version", str(SCHEMA_VERSION)),
        )
        conn.commit()

        # Auto-migrate from JSON if this is a fresh database
        self._maybe_migrate_from_json()

    def close(self) -> None:
        """Close the thread-local connection."""
        if hasattr(self._local, 'conn') and self._local.conn is not None:
            self._local.conn.close()
            self._local.conn = None

    # -------------------------------------------------------------------------
    # ID Generation
    # -------------------------------------------------------------------------

    def _generate_id(self, prefix: str) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        random_suffix = uuid.uuid4().hex[:8]
        return f"{prefix}-{timestamp}-{random_suffix}"

    # -------------------------------------------------------------------------
    # Episode Storage
    # -------------------------------------------------------------------------

    def save_episode(self, episode) -> str:
        """Save an episode trace. Accepts EpisodeTrace object or dict."""
        if hasattr(episode, "to_dict"):
            data = episode.to_dict()
        elif hasattr(episode, "__dict__"):
            data = episode.__dict__.copy()
        else:
            data = dict(episode)

        episode_id = data.get("id") or self._generate_id("episode")
        data["id"] = episode_id

        timestamp = data.get("timestamp", datetime.now(timezone.utc).isoformat())
        if isinstance(timestamp, datetime):
            timestamp = timestamp.isoformat()
        if isinstance(timestamp, str):
            date_str = timestamp[:10]
        else:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        conn = self._get_conn()
        conn.execute(
            """INSERT OR REPLACE INTO episodes
               (id, task_id, timestamp, date_str, duration_seconds, agent,
                phase, goal, outcome, importance, last_accessed, access_count,
                tokens_used, git_commit, data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                episode_id,
                data.get("task_id", ""),
                timestamp,
                date_str,
                data.get("duration_seconds", 0),
                data.get("agent", ""),
                data.get("phase", "ACT"),
                data.get("goal", ""),
                data.get("outcome", ""),
                data.get("importance", 0.5),
                data.get("last_accessed"),
                data.get("access_count", 0),
                data.get("tokens_used", 0),
                data.get("git_commit"),
                json.dumps(data, default=str),
            ),
        )
        conn.commit()
        return episode_id

    def load_episode(self, episode_id: str) -> Optional[dict]:
        """Load episode by ID. Returns raw dict."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT data FROM episodes WHERE id = ?", (episode_id,)
        ).fetchone()
        if row:
            return json.loads(row[0])
        return None

    def list_episodes(
        self,
        since: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[str]:
        """List episode IDs, newest first."""
        conn = self._get_conn()
        if since:
            since_str = since.strftime("%Y-%m-%d")
            rows = conn.execute(
                "SELECT id FROM episodes WHERE date_str >= ? ORDER BY timestamp DESC LIMIT ?",
                (since_str, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id FROM episodes ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [row[0] for row in rows]

    def delete_episode(self, episode_id: str) -> bool:
        """Delete episode by ID."""
        conn = self._get_conn()
        cursor = conn.execute("DELETE FROM episodes WHERE id = ?", (episode_id,))
        conn.commit()
        return cursor.rowcount > 0

    # -------------------------------------------------------------------------
    # Pattern Storage
    # -------------------------------------------------------------------------

    def save_pattern(self, pattern) -> str:
        """Save a semantic pattern. Accepts SemanticPattern object or dict."""
        if hasattr(pattern, "to_dict"):
            data = pattern.to_dict()
        elif hasattr(pattern, "__dict__"):
            data = pattern.__dict__.copy()
        else:
            data = dict(pattern)

        pattern_id = data.get("id") or self._generate_id("pattern")
        data["id"] = pattern_id
        data.setdefault("created_at", datetime.now(timezone.utc).isoformat())

        conn = self._get_conn()
        conn.execute(
            """INSERT OR REPLACE INTO patterns
               (id, pattern, category, confidence, usage_count, importance,
                last_accessed, last_used, access_count, created_at, updated_at, data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                pattern_id,
                data.get("pattern", ""),
                data.get("category", ""),
                data.get("confidence", 0.5),
                data.get("usage_count", 0),
                data.get("importance", 0.5),
                data.get("last_accessed"),
                data.get("last_used"),
                data.get("access_count", 0),
                data.get("created_at"),
                data.get("updated_at"),
                json.dumps(data, default=str),
            ),
        )
        conn.commit()
        return pattern_id

    def load_pattern(self, pattern_id: str) -> Optional[dict]:
        """Load pattern by ID. Returns raw dict."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT data FROM patterns WHERE id = ?", (pattern_id,)
        ).fetchone()
        if row:
            return json.loads(row[0])
        return None

    def list_patterns(self, category: str = None) -> List[str]:
        """List pattern IDs, optionally filtered by category."""
        conn = self._get_conn()
        if category:
            rows = conn.execute(
                "SELECT id FROM patterns WHERE category = ?", (category,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT id FROM patterns").fetchall()
        return [row[0] for row in rows]

    def update_pattern(self, pattern) -> bool:
        """Update an existing pattern."""
        if hasattr(pattern, "to_dict"):
            data = pattern.to_dict()
        elif hasattr(pattern, "__dict__"):
            data = pattern.__dict__.copy()
        else:
            data = dict(pattern)

        pattern_id = data.get("id")
        if not pattern_id:
            return False

        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        conn = self._get_conn()
        cursor = conn.execute(
            """UPDATE patterns SET
               pattern = ?, category = ?, confidence = ?, usage_count = ?,
               importance = ?, last_accessed = ?, last_used = ?,
               access_count = ?, updated_at = ?, data = ?
               WHERE id = ?""",
            (
                data.get("pattern", ""),
                data.get("category", ""),
                data.get("confidence", 0.5),
                data.get("usage_count", 0),
                data.get("importance", 0.5),
                data.get("last_accessed"),
                data.get("last_used"),
                data.get("access_count", 0),
                data.get("updated_at"),
                json.dumps(data, default=str),
                pattern_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0

    # -------------------------------------------------------------------------
    # Skill Storage
    # -------------------------------------------------------------------------

    def save_skill(self, skill) -> str:
        """Save a procedural skill. Accepts ProceduralSkill object or dict."""
        if hasattr(skill, "to_dict"):
            data = skill.to_dict()
        elif hasattr(skill, "__dict__"):
            data = skill.__dict__.copy()
        else:
            data = dict(skill)

        skill_id = data.get("id") or self._generate_id("skill")
        data["id"] = skill_id
        data.setdefault("created_at", datetime.now(timezone.utc).isoformat())

        # Flatten steps list into searchable text for FTS
        steps = data.get("steps", [])
        if isinstance(steps, list):
            data["steps_text"] = " ".join(str(s) for s in steps)

        conn = self._get_conn()
        conn.execute(
            """INSERT OR REPLACE INTO skills
               (id, name, description, importance, last_accessed,
                access_count, created_at, data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                skill_id,
                data.get("name", ""),
                data.get("description", ""),
                data.get("importance", 0.5),
                data.get("last_accessed"),
                data.get("access_count", 0),
                data.get("created_at"),
                json.dumps(data, default=str),
            ),
        )
        conn.commit()
        return skill_id

    def load_skill(self, skill_id: str) -> Optional[dict]:
        """Load skill by ID. Returns raw dict."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT data FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
        if row:
            return json.loads(row[0])
        return None

    def list_skills(self) -> List[str]:
        """List all skill IDs."""
        conn = self._get_conn()
        rows = conn.execute("SELECT id FROM skills").fetchall()
        return [row[0] for row in rows]

    # -------------------------------------------------------------------------
    # Index Management
    # -------------------------------------------------------------------------

    def update_index(self) -> None:
        """Rebuild index (no-op for SQLite -- indexes are always current)."""
        # SQLite indexes are maintained automatically via triggers.
        # Update the metadata timestamp for compatibility.
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
            ("last_index_update", datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()

    def get_index(self) -> dict:
        """Get index data in the same format as JSON storage."""
        conn = self._get_conn()

        topics = []

        # Episodes
        rows = conn.execute(
            "SELECT id, goal, importance FROM episodes ORDER BY timestamp DESC LIMIT 1000"
        ).fetchall()
        for row in rows:
            topics.append({
                "id": row[0],
                "type": "episode",
                "summary": row[1] or "",
                "relevance_score": row[2] or 0.5,
            })

        # Patterns
        rows = conn.execute("SELECT id, pattern, confidence FROM patterns").fetchall()
        for row in rows:
            topics.append({
                "id": row[0],
                "type": "pattern",
                "summary": row[1] or "",
                "relevance_score": row[2] or 0.5,
            })

        # Skills
        rows = conn.execute("SELECT id, description, importance FROM skills").fetchall()
        for row in rows:
            topics.append({
                "id": row[0],
                "type": "skill",
                "summary": row[1] or "",
                "relevance_score": row[2] or 0.5,
            })

        last_updated = conn.execute(
            "SELECT value FROM metadata WHERE key = 'last_index_update'"
        ).fetchone()

        return {
            "version": self.VERSION,
            "last_updated": last_updated[0] if last_updated else None,
            "topics": topics,
        }

    # -------------------------------------------------------------------------
    # Timeline Management
    # -------------------------------------------------------------------------

    def update_timeline(self, action: dict) -> None:
        """Add an action to the timeline."""
        if "timestamp" not in action:
            action["timestamp"] = datetime.now(timezone.utc).isoformat()

        conn = self._get_conn()
        conn.execute(
            """INSERT INTO timeline_actions
               (timestamp, action_type, description, is_key_decision, data)
               VALUES (?, ?, ?, ?, ?)""",
            (
                action.get("timestamp", ""),
                action.get("type", action.get("action_type", "")),
                action.get("description", ""),
                1 if action.get("is_key_decision") else 0,
                json.dumps(action, default=str),
            ),
        )

        # Prune old timeline entries (keep last 100 regular + 50 decisions)
        conn.execute(
            """DELETE FROM timeline_actions WHERE id NOT IN (
                SELECT id FROM timeline_actions ORDER BY timestamp DESC LIMIT 150
            )"""
        )
        conn.commit()

    def get_timeline(self) -> dict:
        """Get timeline in the same format as JSON storage."""
        conn = self._get_conn()

        actions = conn.execute(
            "SELECT data FROM timeline_actions ORDER BY timestamp DESC LIMIT 100"
        ).fetchall()

        decisions = conn.execute(
            """SELECT data FROM timeline_actions
               WHERE is_key_decision = 1 ORDER BY timestamp DESC LIMIT 50"""
        ).fetchall()

        return {
            "version": self.VERSION,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "recent_actions": [json.loads(r[0]) for r in actions],
            "key_decisions": [json.loads(r[0]) for r in decisions],
            "active_context": self.get_active_context(),
        }

    # -------------------------------------------------------------------------
    # Context Management
    # -------------------------------------------------------------------------

    def set_active_context(self, context: dict) -> None:
        """Set the active context."""
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
            ("active_context", json.dumps(context, default=str)),
        )
        conn.commit()

    def get_active_context(self) -> dict:
        """Get the current active context."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT value FROM metadata WHERE key = 'active_context'"
        ).fetchone()
        if row:
            try:
                return json.loads(row[0])
            except (json.JSONDecodeError, TypeError):
                pass
        return {}

    # -------------------------------------------------------------------------
    # Public Wrapper Methods (used by engine.py)
    # -------------------------------------------------------------------------

    def ensure_directory(self, subpath: str) -> None:
        """Create directory if needed. For SQLite, most dirs are not needed."""
        path = self.base_path / subpath
        path.mkdir(parents=True, exist_ok=True)

    def read_json(self, filepath: str) -> Optional[dict]:
        """Read JSON file -- delegates to file for non-DB data."""
        full_path = self._resolve_path(filepath)
        if not os.path.exists(full_path):
            return None
        try:
            with open(full_path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def write_json(self, filepath: str, data: dict) -> None:
        """Write JSON file atomically."""
        full_path = self._resolve_path(filepath)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        # Atomic write via temp file
        import tempfile
        import shutil
        fd, temp_path = tempfile.mkstemp(
            dir=os.path.dirname(full_path),
            prefix=".tmp_",
            suffix=".json",
        )
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f, indent=2, default=str)
            shutil.move(temp_path, full_path)
        except Exception:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise

    def list_files(self, subpath: str, pattern: str = "*.json") -> List[Path]:
        """List files matching pattern."""
        path = self.base_path / subpath
        if not path.exists():
            return []
        return list(path.glob(pattern))

    def delete_file(self, filepath: str) -> bool:
        """Delete a file."""
        full_path = self._resolve_path(filepath)
        try:
            os.remove(full_path)
            return True
        except (OSError, FileNotFoundError):
            return False

    def _resolve_path(self, filepath: str) -> str:
        """Resolve filepath within base_path, preventing path traversal."""
        if os.path.isabs(filepath):
            raise ValueError(f"Absolute paths not allowed: {filepath}")
        if ".." in filepath.split(os.sep):
            raise ValueError(f"Path traversal not allowed: {filepath}")
        full_path = os.path.join(self.base_path, filepath)
        real_base = os.path.realpath(self.base_path)
        real_full = os.path.realpath(full_path)
        if not real_full.startswith(real_base + os.sep) and real_full != real_base:
            raise ValueError(f"Path escapes base directory: {filepath}")
        return full_path

    # -------------------------------------------------------------------------
    # Importance Scoring (same algorithm as JSON storage)
    # -------------------------------------------------------------------------

    def calculate_importance(
        self,
        memory: Dict[str, Any],
        task_type: Optional[str] = None,
    ) -> float:
        """Calculate importance score for a memory."""
        base = memory.get("importance", 0.5)

        outcome = memory.get("outcome", "")
        if outcome == "success":
            base = min(1.0, base + 0.1)
        elif outcome == "failure":
            base = max(0.0, base - 0.1)

        errors = memory.get("errors_encountered", [])
        if errors and outcome == "success":
            base = min(1.0, base + 0.05 * min(len(errors), 3))

        access_count = memory.get("access_count", 0)
        if access_count > 0:
            base = min(1.0, base + 0.05 * math.log1p(access_count))

        confidence = memory.get("confidence")
        if confidence is not None:
            base = (base + confidence) / 2.0

        return round(min(1.0, max(0.0, base)), 4)

    def boost_on_retrieval(
        self,
        memory: Dict[str, Any],
        boost: float = 0.1,
    ) -> Dict[str, Any]:
        """Boost importance when a memory is retrieved."""
        memory = dict(memory)
        memory["access_count"] = memory.get("access_count", 0) + 1
        memory["last_accessed"] = datetime.now(timezone.utc).isoformat()
        current = memory.get("importance", 0.5)
        memory["importance"] = min(1.0, current + boost)
        return memory

    # -------------------------------------------------------------------------
    # FTS5 Full-Text Search (new capability)
    # -------------------------------------------------------------------------

    def search_fts(
        self,
        query: str,
        collection: str = "all",
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Full-text search across memory using FTS5.

        Args:
            query: Search query (supports FTS5 syntax: AND, OR, NOT, prefix*)
            collection: Which collection to search (episodes, patterns, skills, all)
            limit: Max results per collection

        Returns:
            List of matching memory dicts with _score and _type fields
        """
        # Sanitize query for FTS5 -- escape special chars, wrap tokens in quotes
        safe_query = self._sanitize_fts_query(query)
        if not safe_query:
            return []

        conn = self._get_conn()
        results = []

        if collection in ("episodes", "all"):
            try:
                rows = conn.execute(
                    """SELECT e.data, rank
                       FROM episodes_fts fts
                       JOIN episodes e ON e.rowid = fts.rowid
                       WHERE episodes_fts MATCH ?
                       ORDER BY rank
                       LIMIT ?""",
                    (safe_query, limit),
                ).fetchall()
                for row in rows:
                    item = json.loads(row[0])
                    item["_score"] = -row[1]  # FTS5 rank is negative
                    item["_type"] = "episode"
                    results.append(item)
            except sqlite3.OperationalError:
                pass  # Invalid FTS query

        if collection in ("patterns", "all"):
            try:
                rows = conn.execute(
                    """SELECT p.data, rank
                       FROM patterns_fts fts
                       JOIN patterns p ON p.rowid = fts.rowid
                       WHERE patterns_fts MATCH ?
                       ORDER BY rank
                       LIMIT ?""",
                    (safe_query, limit),
                ).fetchall()
                for row in rows:
                    item = json.loads(row[0])
                    item["_score"] = -row[1]
                    item["_type"] = "pattern"
                    results.append(item)
            except sqlite3.OperationalError:
                pass

        if collection in ("skills", "all"):
            try:
                rows = conn.execute(
                    """SELECT s.data, rank
                       FROM skills_fts fts
                       JOIN skills s ON s.rowid = fts.rowid
                       WHERE skills_fts MATCH ?
                       ORDER BY rank
                       LIMIT ?""",
                    (safe_query, limit),
                ).fetchall()
                for row in rows:
                    item = json.loads(row[0])
                    item["_score"] = -row[1]
                    item["_type"] = "skill"
                    results.append(item)
            except sqlite3.OperationalError:
                pass

        # Sort by score descending
        results.sort(key=lambda x: x.get("_score", 0), reverse=True)
        return results[:limit]

    def search_episodes_by_date_range(
        self,
        start_date: str,
        end_date: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Get episodes within a date range."""
        conn = self._get_conn()
        rows = conn.execute(
            """SELECT data FROM episodes
               WHERE date_str >= ? AND date_str <= ?
               ORDER BY timestamp DESC LIMIT ?""",
            (start_date, end_date, limit),
        ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        conn = self._get_conn()
        ep_count = conn.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
        pat_count = conn.execute("SELECT COUNT(*) FROM patterns").fetchone()[0]
        skill_count = conn.execute("SELECT COUNT(*) FROM skills").fetchone()[0]
        timeline_count = conn.execute("SELECT COUNT(*) FROM timeline_actions").fetchone()[0]

        db_size = 0
        try:
            db_size = os.path.getsize(self._db_path)
        except OSError:
            pass

        return {
            "backend": "sqlite",
            "db_path": str(self._db_path),
            "db_size_bytes": db_size,
            "episode_count": ep_count,
            "pattern_count": pat_count,
            "skill_count": skill_count,
            "timeline_action_count": timeline_count,
            "schema_version": SCHEMA_VERSION,
        }

    # -------------------------------------------------------------------------
    # FTS Query Sanitization
    # -------------------------------------------------------------------------

    @staticmethod
    def _sanitize_fts_query(query: str) -> str:
        """
        Sanitize user input for safe FTS5 queries.

        Wraps each word in quotes to prevent FTS5 syntax errors from
        special characters. Preserves explicit AND/OR/NOT operators.
        """
        if not query or not query.strip():
            return ""

        tokens = query.strip().split()
        safe_tokens = []
        operators = {"AND", "OR", "NOT"}

        for token in tokens:
            if token.upper() in operators:
                safe_tokens.append(token.upper())
            else:
                # Strip FTS5 special chars, wrap in quotes
                clean = token.replace('"', '').replace("'", "")
                if clean:
                    safe_tokens.append(f'"{clean}"')

        return " ".join(safe_tokens)

    # -------------------------------------------------------------------------
    # JSON Migration
    # -------------------------------------------------------------------------

    def _maybe_migrate_from_json(self) -> None:
        """Auto-migrate from JSON files if SQLite DB is empty and JSON data exists."""
        conn = self._get_conn()

        # Check if DB already has data
        ep_count = conn.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
        if ep_count > 0:
            return  # Already has data, skip migration

        # Check for JSON episode files
        episodic_dir = self.base_path / "episodic"
        if not episodic_dir.exists():
            return

        migrated = self._migrate_json_to_sqlite()
        if migrated > 0:
            conn.execute(
                "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
                ("migrated_from_json", datetime.now(timezone.utc).isoformat()),
            )
            conn.execute(
                "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
                ("migration_count", str(migrated)),
            )
            conn.commit()

    def _migrate_json_to_sqlite(self) -> int:
        """
        Migrate existing JSON files into SQLite.

        Returns number of records migrated.
        """
        count = 0

        # Migrate episodes
        episodic_dir = self.base_path / "episodic"
        if episodic_dir.exists():
            for date_dir in episodic_dir.iterdir():
                if not date_dir.is_dir():
                    continue
                for json_file in date_dir.glob("task-*.json"):
                    try:
                        with open(json_file, "r") as f:
                            data = json.load(f)
                        if data and data.get("id"):
                            self.save_episode(data)
                            count += 1
                    except (json.JSONDecodeError, OSError):
                        continue

        # Migrate patterns
        patterns_file = self.base_path / "semantic" / "patterns.json"
        if patterns_file.exists():
            try:
                with open(patterns_file, "r") as f:
                    patterns_data = json.load(f)
                for pattern in patterns_data.get("patterns", []):
                    if pattern.get("id"):
                        self.save_pattern(pattern)
                        count += 1
            except (json.JSONDecodeError, OSError):
                pass

        # Migrate skills
        skills_dir = self.base_path / "skills"
        if skills_dir.exists():
            for json_file in skills_dir.glob("*.json"):
                try:
                    with open(json_file, "r") as f:
                        data = json.load(f)
                    if data and data.get("id"):
                        self.save_skill(data)
                        count += 1
                except (json.JSONDecodeError, OSError):
                    continue

        # Migrate timeline
        timeline_file = self.base_path / "timeline.json"
        if timeline_file.exists():
            try:
                with open(timeline_file, "r") as f:
                    timeline = json.load(f)
                for action in timeline.get("recent_actions", []):
                    self.update_timeline(action)
                    count += 1
                # Migrate active context
                ctx = timeline.get("active_context", {})
                if ctx:
                    self.set_active_context(ctx)
            except (json.JSONDecodeError, OSError):
                pass

        return count
