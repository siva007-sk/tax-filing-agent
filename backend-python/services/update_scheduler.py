"""
update_scheduler.py
Wraps APScheduler to run run_update() on startup (when stale) and then
every TAX_UPDATE_INTERVAL_HOURS thereafter.
"""

import asyncio
from datetime import UTC

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.tax_updater import UPDATE_INTERVAL_HOURS, needs_refresh, run_update

_scheduler = AsyncIOScheduler(timezone="UTC")
_update_lock = asyncio.Lock()


async def _scheduled_job() -> None:
    from datetime import datetime
    if _update_lock.locked():
        print("[Scheduler] Update already in progress, skipping this tick.")
        return
    print(f"[Scheduler] Firing scheduled tax update at {datetime.now(UTC).isoformat()}")
    async with _update_lock:
        await run_update()


async def _initial_update() -> None:
    """Delayed first-run so the app finishes booting before the first search."""
    await asyncio.sleep(4)
    if _update_lock.locked():
        return
    if needs_refresh():
        print("[Scheduler] Cache is stale — running initial update.")
        async with _update_lock:
            await run_update()
    else:
        print("[Scheduler] Cache is fresh — skipping initial update.")


def start_scheduler() -> None:
    _scheduler.add_job(
        _scheduled_job,
        trigger="interval",
        hours=UPDATE_INTERVAL_HOURS,
        id="tax_law_update",
        replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.start()
    print(f"[Scheduler] Started. Auto-update every {UPDATE_INTERVAL_HOURS}h.")


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[Scheduler] Stopped.")
