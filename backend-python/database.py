import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

_DB_PATH = Path(__file__).parent / "data" / "tax_agent.db"
_CORPUS_PATH = Path(__file__).parent / "config" / "taxCorpus.json"

_CHAPTER_VIA_DEFAULTS = {
    "80C": 150_000,
    "80D_self_general": 25_000,
    "80D_self_senior": 50_000,
    "80D_parents_general": 25_000,
    "80D_parents_senior": 50_000,
    "80CCD_1B": 50_000,
    "80TTA": 10_000,
    "80TTB": 50_000,
    "80EEA": 150_000,
    "80U_normal": 75_000,
    "80U_severe": 125_000,
}


def _conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tax_profiles (
                user_id      TEXT PRIMARY KEY,
                profile_json TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tax_filings (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      TEXT    NOT NULL DEFAULT 'default',
                ay           TEXT    NOT NULL,
                fy           TEXT    NOT NULL,
                itr_form     TEXT,
                regime       TEXT,
                gross_income REAL    DEFAULT 0,
                tax_paid     REAL    DEFAULT 0,
                tax_saved    REAL    DEFAULT 0,
                refund       REAL    DEFAULT 0,
                payable      REAL    DEFAULT 0,
                status       TEXT    DEFAULT 'Generated',
                filed_on     TEXT,
                ack_no       TEXT,
                itr_json     TEXT,
                created_at   TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS uploaded_documents (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       TEXT    NOT NULL DEFAULT 'default',
                document_type TEXT    NOT NULL,
                filename      TEXT,
                result_json   TEXT,
                uploaded_at   TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tax_rules (
                ay         TEXT PRIMARY KEY,
                rules_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tax_corpus (
                section_id  TEXT PRIMARY KEY,
                section     TEXT NOT NULL,
                title       TEXT NOT NULL,
                description TEXT NOT NULL,
                limit_val   REAL,
                regimes     TEXT,
                eligibility TEXT,
                citation    TEXT,
                active      INTEGER DEFAULT 1,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tax_update_status (
                id           INTEGER PRIMARY KEY CHECK (id = 1),
                status       TEXT NOT NULL DEFAULT 'never_run',
                error        TEXT,
                last_updated TEXT,
                next_update  TEXT,
                update_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS tax_updates (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                snippet    TEXT,
                url        TEXT UNIQUE,
                source     TEXT,
                relevance  INTEGER DEFAULT 0,
                fetched_at TEXT NOT NULL,
                analyzed   INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS regulation_changes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                update_id   INTEGER,
                ay          TEXT NOT NULL DEFAULT '2026-27',
                change_type TEXT NOT NULL,
                regime      TEXT,
                section     TEXT,
                description TEXT NOT NULL,
                field_path  TEXT,
                old_value   TEXT,
                new_value   TEXT,
                applied     INTEGER DEFAULT 0,
                applied_at  TEXT,
                detected_at TEXT NOT NULL
            );
        """)
        _seed_tax_rules(conn)
        _seed_tax_corpus(conn)


# ── seeding ────────────────────────────────────────────────────────────────────

def _seed_tax_rules(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM tax_rules").fetchone()[0] > 0:
        return
    if not _CORPUS_PATH.exists():
        return
    with open(_CORPUS_PATH, encoding="utf-8") as f:
        corpus = json.load(f)
    rules = {
        "assessment_year": corpus["assessment_year"],
        "financial_year":  corpus["financial_year"],
        "slabs":            corpus["slabs"],
        "standard_deduction": corpus["standard_deduction"],
        "rebates":          corpus["rebates"],
        "cess_rate":        corpus["cess_rate"],
        "chapter_via_limits": _CHAPTER_VIA_DEFAULTS,
    }
    conn.execute(
        "INSERT OR IGNORE INTO tax_rules (ay, rules_json, updated_at) VALUES (?, ?, ?)",
        ("2026-27", json.dumps(rules), datetime.now(UTC).isoformat()),
    )


def _seed_tax_corpus(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM tax_corpus").fetchone()[0] > 0:
        return
    if not _CORPUS_PATH.exists():
        return
    with open(_CORPUS_PATH, encoding="utf-8") as f:
        corpus = json.load(f)
    now = datetime.now(UTC).isoformat()
    for sec in corpus.get("sections", []):
        conn.execute(
            """INSERT OR IGNORE INTO tax_corpus
               (section_id, section, title, description, limit_val, regimes, eligibility, citation, active, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
            (
                sec["id"], sec["section"], sec["title"], sec["description"],
                sec.get("limit"), json.dumps(sec.get("regimes", [])),
                sec.get("eligibility", ""), sec.get("citation", ""), now,
            ),
        )


# ── profile ────────────────────────────────────────────────────────────────────

def load_profile(user_id: str = "default") -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT profile_json FROM tax_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
        return json.loads(row["profile_json"]) if row else None


def save_profile(profile: dict, user_id: str = "default") -> None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO tax_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)"
            " ON CONFLICT(user_id) DO UPDATE SET"
            "   profile_json = excluded.profile_json,"
            "   updated_at   = excluded.updated_at",
            (user_id, json.dumps(profile), now),
        )


def clear_profile(user_id: str = "default") -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM tax_profiles WHERE user_id = ?", (user_id,))


# ── filings ────────────────────────────────────────────────────────────────────

def get_filings(user_id: str = "default") -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM tax_filings WHERE user_id = ? ORDER BY ay DESC, created_at DESC",
            (user_id,),
        ).fetchall()
        return [_filing_row_to_dict(r) for r in rows]


def add_filing(filing: dict, user_id: str = "default") -> dict:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO tax_filings
               (user_id, ay, fy, itr_form, regime, gross_income, tax_paid, tax_saved,
                refund, payable, status, filed_on, ack_no, itr_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                filing["ay"], filing["fy"],
                filing.get("itr_form"), filing.get("regime"),
                filing.get("gross_income", 0), filing.get("tax_paid", 0),
                filing.get("tax_saved", 0), filing.get("refund", 0),
                filing.get("payable", 0), filing.get("status", "Generated"),
                filing.get("filed_on"), filing.get("ack_no", ""),
                json.dumps(filing["itr_json"]) if filing.get("itr_json") else None,
                now,
            ),
        )
        return {**filing, "id": cur.lastrowid, "created_at": now}


def delete_filing(filing_id: int, user_id: str = "default") -> bool:
    with _conn() as conn:
        result = conn.execute(
            "DELETE FROM tax_filings WHERE id = ? AND user_id = ?", (filing_id, user_id)
        )
        return result.rowcount > 0


def clear_filings(user_id: str = "default") -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM tax_filings WHERE user_id = ?", (user_id,))


# ── documents ──────────────────────────────────────────────────────────────────

def get_documents(user_id: str = "default") -> dict:
    docs: dict = {"form16": None, "form26as": None, "ais": None}
    with _conn() as conn:
        rows = conn.execute(
            "SELECT document_type, result_json FROM uploaded_documents"
            " WHERE user_id = ? ORDER BY uploaded_at DESC",
            (user_id,),
        ).fetchall()
    for row in rows:
        dt = row["document_type"]
        if dt in docs and docs[dt] is None and row["result_json"]:
            docs[dt] = json.loads(row["result_json"])
    return docs


def save_document(doc_type: str, result: dict, filename: str = "", user_id: str = "default") -> None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO uploaded_documents (user_id, document_type, filename, result_json, uploaded_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (user_id, doc_type, filename, json.dumps(result), now),
        )


def clear_documents(user_id: str = "default") -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM uploaded_documents WHERE user_id = ?", (user_id,))


# ── tax_rules ──────────────────────────────────────────────────────────────────

def get_tax_rules(ay: str = "2026-27") -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT rules_json FROM tax_rules WHERE ay = ?", (ay,)
        ).fetchone()
        return json.loads(row["rules_json"]) if row else None


def update_tax_rules(ay: str, rules: dict) -> None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO tax_rules (ay, rules_json, updated_at) VALUES (?, ?, ?)"
            " ON CONFLICT(ay) DO UPDATE SET rules_json = excluded.rules_json, updated_at = excluded.updated_at",
            (ay, json.dumps(rules), now),
        )


# ── tax_corpus ─────────────────────────────────────────────────────────────────

def get_corpus_sections() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM tax_corpus WHERE active = 1 ORDER BY section"
        ).fetchall()
        return [_corpus_row_to_dict(r) for r in rows]


def upsert_corpus_section(section: dict) -> None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            """INSERT INTO tax_corpus
               (section_id, section, title, description, limit_val, regimes, eligibility, citation, active, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
               ON CONFLICT(section_id) DO UPDATE SET
                 title=excluded.title, description=excluded.description,
                 limit_val=excluded.limit_val, regimes=excluded.regimes,
                 eligibility=excluded.eligibility, citation=excluded.citation,
                 active=1, updated_at=excluded.updated_at""",
            (
                section["id"], section["section"], section["title"], section["description"],
                section.get("limit"), json.dumps(section.get("regimes", [])),
                section.get("eligibility", ""), section.get("citation", ""), now,
            ),
        )


# ── tax_update_status ──────────────────────────────────────────────────────────

def get_update_status() -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM tax_update_status WHERE id = 1").fetchone()
        if not row:
            return {
                "status": "never_run", "error": None,
                "last_updated": None, "next_update": None, "update_count": 0,
            }
        return dict(row)


def set_update_status(
    status: str,
    error: str | None = None,
    last_updated: str | None = None,
    next_update: str | None = None,
    update_count: int = 0,
) -> None:
    with _conn() as conn:
        conn.execute(
            """INSERT INTO tax_update_status (id, status, error, last_updated, next_update, update_count)
               VALUES (1, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 status=excluded.status, error=excluded.error,
                 last_updated=excluded.last_updated, next_update=excluded.next_update,
                 update_count=excluded.update_count""",
            (status, error, last_updated, next_update, update_count),
        )


# ── tax_updates ────────────────────────────────────────────────────────────────

def get_tax_updates(limit: int = 30) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM tax_updates ORDER BY relevance DESC, fetched_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_unanalyzed_updates(limit: int = 10) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM tax_updates WHERE analyzed = 0 ORDER BY relevance DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def save_tax_update(update: dict) -> int | None:
    """Insert if URL not already seen. Returns new id or None if duplicate."""
    with _conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO tax_updates (title, snippet, url, source, relevance, fetched_at, analyzed)"
                " VALUES (?, ?, ?, ?, ?, ?, 0)",
                (
                    update["title"], update.get("snippet", ""), update.get("url", ""),
                    update.get("source", ""), update.get("relevance", 0),
                    update.get("fetched_at", datetime.now(UTC).isoformat()),
                ),
            )
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None


def mark_update_analyzed(update_id: int) -> None:
    with _conn() as conn:
        conn.execute("UPDATE tax_updates SET analyzed = 1 WHERE id = ?", (update_id,))


def clear_old_updates(keep: int = 50) -> None:
    with _conn() as conn:
        conn.execute(
            "DELETE FROM tax_updates WHERE id NOT IN ("
            "  SELECT id FROM tax_updates ORDER BY relevance DESC, fetched_at DESC LIMIT ?"
            ")",
            (keep,),
        )


# ── regulation_changes ─────────────────────────────────────────────────────────

def add_regulation_change(change: dict) -> int:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO regulation_changes
               (update_id, ay, change_type, regime, section, description,
                field_path, old_value, new_value, applied, detected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
            (
                change.get("update_id"),
                change.get("ay", "2026-27"),
                change["change_type"],
                change.get("regime"),
                change.get("section"),
                change["description"],
                change.get("field_path"),
                json.dumps(change.get("old_value")) if change.get("old_value") is not None else None,
                json.dumps(change.get("new_value")) if change.get("new_value") is not None else None,
                now,
            ),
        )
        return cur.lastrowid


def get_regulation_changes(
    ay: str | None = None,
    applied: bool | None = None,
    limit: int = 50,
) -> list[dict]:
    q = "SELECT * FROM regulation_changes WHERE 1=1"
    params: list = []
    if ay:
        q += " AND ay = ?"
        params.append(ay)
    if applied is not None:
        q += " AND applied = ?"
        params.append(1 if applied else 0)
    q += " ORDER BY detected_at DESC LIMIT ?"
    params.append(limit)
    with _conn() as conn:
        rows = conn.execute(q, params).fetchall()
        return [_change_row_to_dict(r) for r in rows]


def mark_change_applied(change_id: int) -> None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "UPDATE regulation_changes SET applied = 1, applied_at = ? WHERE id = ?",
            (now, change_id),
        )


# ── helpers ────────────────────────────────────────────────────────────────────

def _filing_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    if d.get("itr_json"):
        try:
            d["itr_json"] = json.loads(d["itr_json"])
        except Exception:
            pass
    return d


def _corpus_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["limit"] = d.pop("limit_val", None)
    if d.get("regimes"):
        try:
            d["regimes"] = json.loads(d["regimes"])
        except Exception:
            d["regimes"] = []
    return d


def _change_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for field in ("old_value", "new_value"):
        if d.get(field):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                pass
    return d
