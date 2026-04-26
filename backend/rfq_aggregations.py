"""MongoDB aggregation helpers for list/metrics to avoid N+1 queries."""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection


async def aggregate_list_rfqs(
    rfqs: AsyncIOMotorCollection,
    match: dict,
    page: int,
    page_size: int,
) -> tuple[int, list[dict[str, Any]]]:
    """Single aggregation: paged RFQs with bid count + L1 without per-RFQ round trips."""
    skip = (page - 1) * page_size
    pipeline: list[dict[str, Any]] = [
        {"$match": match},
        {"$sort": {"created_at": -1}},
        {
            "$facet": {
                "count": [{"$count": "c"}],
                "rows": [
                    {"$skip": skip},
                    {"$limit": page_size},
                    {"$addFields": {"_rfq_id_str": {"$toString": "$_id"}}},
                    {
                        "$lookup": {
                            "from": "bids",
                            "let": {"rid": "$_rfq_id_str"},
                            "pipeline": [
                                {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                                {"$sort": {"total_price": 1, "created_at": 1}},
                                {
                                    "$group": {
                                        "_id": None,
                                        "n": {"$sum": 1},
                                        "l1": {"$first": "$$ROOT"},
                                    }
                                },
                            ],
                            "as": "_bid_st",
                        }
                    },
                ],
            }
        },
    ]
    out = await rfqs.aggregate(pipeline).to_list(length=1)
    row0 = (out[0] if out else {}) or {}
    total = 0
    if row0.get("count"):
        c = row0["count"][0].get("c", 0) if row0["count"] else 0
        total = int(c) if c is not None else 0
    rows = row0.get("rows") or []
    return total, rows


def bid_stats_from_aggregated_rfq(doc: dict) -> tuple[int, float | None, dict | None]:
    """Read lookup output from aggregate_list_rfqs or get_rfq lookup."""
    st = doc.get("_bid_st") or []
    if not st or not st[0].get("n"):
        return 0, None, None
    g = st[0]
    n = int(g.get("n") or 0)
    l1 = g.get("l1")
    if not l1:
        return n, None, None
    low = l1.get("total_price")
    return n, float(low) if low is not None else None, l1


async def aggregate_rfq_by_id(
    rfqs: AsyncIOMotorCollection,
    rfq_oid: ObjectId,
) -> dict | None:
    """Load one RFQ with the same bid stats as list, without N+1."""
    pipeline: list[dict[str, Any]] = [
        {"$match": {"_id": rfq_oid}},
        {"$addFields": {"_rfq_id_str": {"$toString": "$_id"}}},
        {
            "$lookup": {
                "from": "bids",
                "let": {"rid": "$_rfq_id_str"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                    {"$sort": {"total_price": 1, "created_at": 1}},
                    {
                        "$group": {
                            "_id": None,
                            "n": {"$sum": 1},
                            "l1": {"$first": "$$ROOT"},
                        }
                    },
                ],
                "as": "_bid_st",
            }
        },
    ]
    res = await rfqs.aggregate(pipeline).to_list(length=1)
    return res[0] if res else None


def strip_internal_fields(doc: dict) -> dict:
    d = {k: v for k, v in doc.items() if not k.startswith("_") or k == "_id"}
    if "_rfq_id_str" in d:
        del d["_rfq_id_str"]
    if "_bid_st" in d:
        del d["_bid_st"]
    return d
