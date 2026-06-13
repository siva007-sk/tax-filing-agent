"""
tax_updater.py
Periodically searches the web for recent Indian income tax law changes, scores &
filters results, saves them to the DB, then triggers LLM-based regulation analysis.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from config.settings import TAX_UPDATE_INTERVAL_HOURS
from database import (
    clear_old_updates,
    get_tax_updates,
    get_update_status,
    save_tax_update,
    set_update_status,
)

UPDATE_INTERVAL_HOURS = TAX_UPDATE_INTERVAL_HOURS

_SEARCH_QUERIES = [
    "India income tax slab rates FY 2025-26 AY 2026-27 new regime",
    "CBDT circular notification income tax deduction 2025",
    "Union Budget 2025 income tax changes 80C 80D NPS",
    "Section 87A rebate limit 2025 new tax regime India",
    "Income Tax Act amendment standard deduction 2025 India",
    "India LTCG STCG capital gains tax rate change 2025",
    "Income tax HRA exemption rule change 2025 India",
]

_KEYWORDS = [
    "income tax", "cbdt", "section 80", "deduction", "rebate", "slab",
    "budget", "fy 2025", "fy 2026", "ay 2026", "ay 2027", "assessment year",
    "standard deduction", "new regime", "old regime", "tax rate", "nps",
    "hra", "ltcg", "stcg", "surcharge", "cess", "income tax act",
    "relief", "exemption", "allowance", "notification", "circular",
    "finance act", "finance bill", "section 87a", "section 24", "section 10",
]


def _score(text: str) -> int:
    t = text.lower()
    return sum(1 for kw in _KEYWORDS if kw in t)


def _source_name(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return "web"


# ── public read APIs ───────────────────────────────────────────────────────────

def get_status() -> dict:
    st = get_update_status()
    updates = get_tax_updates(limit=15)
    return {
        "status":         st.get("status", "never_run"),
        "error":          st.get("error"),
        "last_updated":   st.get("last_updated"),
        "next_update":    st.get("next_update"),
        "update_count":   st.get("update_count", 0),
        "recent_updates": updates,
    }


def get_live_context(query: str) -> str:
    """Return a short text block of relevant recent updates for RAG augmentation."""
    updates = get_tax_updates(limit=30)
    if not updates:
        return ""

    scored = sorted(
        [u for u in updates if _score(u.get("title", "") + " " + u.get("snippet", "")) >= 3],
        key=lambda u: u.get("relevance", 0),
        reverse=True,
    )[:4]

    if not scored:
        return ""

    lines = ["--- Live web updates on recent Indian tax law changes ---"]
    for u in scored:
        lines.append(f"• {u['title']} [{u.get('source', 'web')}]: {u.get('snippet', '')[:220]}")
    lines.append("--- end live updates ---")
    return "\n".join(lines)


def needs_refresh() -> bool:
    st = get_update_status()
    if st.get("status") in ("never_run", None) or not st.get("last_updated"):
        return True
    try:
        last = datetime.fromisoformat(st["last_updated"])
        return datetime.now(UTC) - last > timedelta(hours=UPDATE_INTERVAL_HOURS)
    except Exception:
        return True


# ── core update job ────────────────────────────────────────────────────────────

async def run_update() -> None:
    """Search the web, score results, save to DB, then trigger LLM analysis."""
    set_update_status("running", error=None)

    try:
        from duckduckgo_search import DDGS
    except ImportError:
        set_update_status("error", error="duckduckgo-search package is not installed. Run: pip install duckduckgo-search")
        print("[TaxUpdater] duckduckgo-search not installed.")
        return

    print("[TaxUpdater] Starting web search for tax law updates…")
    new_count = 0
    search_errors: list[str] = []
    seen_urls: set[str] = set()

    try:
        for query in _SEARCH_QUERIES:
            try:
                def _search(q: str = query) -> list:
                    with DDGS() as ddgs:
                        return list(ddgs.text(q, max_results=6, timelimit="y"))

                hits = await asyncio.wait_for(
                    asyncio.to_thread(_search),
                    timeout=15.0,
                )

                for r in hits:
                    url = r.get("href", "")
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    title   = r.get("title", "")
                    snippet = r.get("body", "")[:450]
                    score   = _score(title + " " + snippet)
                    if score < 2:
                        continue
                    inserted = save_tax_update({
                        "title":      title,
                        "snippet":    snippet,
                        "url":        url,
                        "source":     _source_name(url),
                        "relevance":  score,
                        "fetched_at": datetime.now(UTC).isoformat(),
                    })
                    if inserted:
                        new_count += 1
            except asyncio.TimeoutError:
                msg = f"Timeout on query: {query}"
                print(f"[TaxUpdater] {msg}")
                search_errors.append(msg)
            except Exception as exc:
                msg = str(exc)
                print(f"[TaxUpdater] Search error for '{query}': {msg}")
                search_errors.append(msg)

            await asyncio.sleep(1.5)
    except Exception as exc:
        set_update_status("error", error=str(exc))
        print(f"[TaxUpdater] Fatal error: {exc}")
        return

    if new_count == 0 and search_errors:
        set_update_status("error", error=search_errors[0])
        return

    clear_old_updates(keep=50)

    now = datetime.now(UTC)
    all_updates = get_tax_updates(limit=50)
    set_update_status(
        "ok",
        last_updated=now.isoformat(),
        next_update=(now + timedelta(hours=UPDATE_INTERVAL_HOURS)).isoformat(),
        update_count=len(all_updates),
    )
    print(f"[TaxUpdater] Done — {new_count} new articles saved, {len(all_updates)} total.")

    # Trigger LLM analysis on new unanalyzed articles
    try:
        from services.regulation_analyzer import analyze_and_apply_new_updates
        result = await analyze_and_apply_new_updates()
        if result["changes_found"]:
            print(f"[TaxUpdater] Regulation analysis: {result['changes_found']} changes found, "
                  f"{result['changes_applied']} applied.")
    except Exception as exc:
        print(f"[TaxUpdater] Regulation analysis skipped: {exc}")
