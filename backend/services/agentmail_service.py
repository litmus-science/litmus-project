"""AgentMail integration — per-experiment email inboxes for capturing sponsor↔CRO comms."""
from __future__ import annotations

import os

from agentmail import AsyncAgentMail

# ── Singleton client ──────────────────────────────────────────────────────────

_client: AsyncAgentMail | None = None


def get_client() -> AsyncAgentMail:
    global _client
    if _client is None:
        api_key = os.environ.get("AGENTMAIL_API_KEY", "")
        if not api_key:
            raise RuntimeError("AGENTMAIL_API_KEY environment variable is not set")
        _client = AsyncAgentMail(api_key=api_key)
    return _client


# ── Inbox provisioning ────────────────────────────────────────────────────────

async def provision_inbox(experiment_id: str) -> tuple[str, str]:
    """Create (or idempotently retrieve) an AgentMail inbox for this experiment.

    Returns (inbox_id, email_address).
    The ``client_id`` param makes creation idempotent — re-calling with the same
    client_id returns the existing inbox rather than creating a duplicate.
    """
    client = get_client()
    inbox = await client.inboxes.create(
        username=f"exp-{experiment_id[:8].lower()}",
        client_id=f"litmus-exp-{experiment_id}",
        display_name=f"Litmus · {experiment_id[:8].upper()}",
    )
    return inbox.inbox_id, inbox.email


# ── Message classification ─────────────────────────────────────────────────────

def classify_kind(subject: str | None, body: str | None) -> str:
    """Heuristic note-kind classification based on subject + body keywords."""
    text = f"{subject or ''} {body or ''}".lower()
    if any(w in text for w in ["agreement", "contract", "sow", "statement of work",
                                "terms", "invoice", "signed", "purchase order", "po "]):
        return "agreement"
    if any(w in text for w in ["call", "meeting", "zoom", "loom", "teams", "meet",
                                "recording", "transcript", "minutes"]):
        return "call"
    return "email"


# ── Inbox sync ────────────────────────────────────────────────────────────────

async def fetch_new_messages(inbox_id: str, known_external_ids: set[str]) -> list[dict[str, object]]:
    """Fetch all messages from an inbox and return those not already in known_external_ids.

    Each returned dict has keys:
      external_id, from_, subject, body, timestamp, kind
    """
    client = get_client()
    response = await client.inboxes.messages.list(inbox_id, ascending=True)

    new_messages: list[dict[str, object]] = []
    for item in response.messages:
        if item.message_id in known_external_ids:
            continue
        # Fetch full message for body text (MessageItem only has preview)
        full = await client.inboxes.messages.get(inbox_id, item.message_id)
        body: str = full.extracted_text or full.text or full.preview or ""
        new_messages.append({
            "external_id": item.message_id,
            "from_": item.from_,
            "subject": item.subject or "(no subject)",
            "body": body,
            "timestamp": item.timestamp,
            "kind": classify_kind(item.subject, body),
        })

    return new_messages
