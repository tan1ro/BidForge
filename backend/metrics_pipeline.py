"""Aggregation pipelines for rfqowner metrics (no N+1)."""
from __future__ import annotations

from typing import Any

from database import activity_logs_collection, rfqs_collection
from models import AuctionStatus


def _week_bucket(field: str) -> dict:
    return {
        "$concat": [
            {"$toString": {"$isoWeekYear": field}},
            "-W",
            {
                "$cond": [
                    {"$lt": [{"$isoWeek": field}, 10]},
                    {"$concat": ["0", {"$toString": {"$isoWeek": field}}]},
                    {"$toString": {"$isoWeek": field}},
                ]
            },
        ]
    }


def _period_bucket_field(field: str, period: str) -> dict:
    if period == "week":
        return _week_bucket(field)
    if period == "month":
        return {"$dateToString": {"format": "%Y-%m", "date": field}}
    return {"$dateToString": {"format": "%Y-%m-%d", "date": field}}


async def pipeline_bids_per_rfq_metrics(
    skip: int,
    limit: int,
    name_search: str | None,
    created_by: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    q: dict = {}
    if created_by:
        q["created_by"] = created_by
    if name_search and name_search.strip():
        q["name"] = {"$regex": name_search.strip(), "$options": "i"}
    count = await rfqs_collection.count_documents(q)
    pl: list[dict] = [
        {"$match": q} if q else {"$match": {}},
        {"$sort": {"created_at": -1}},
        {"$addFields": {"_rid": {"$toString": "$_id"}}},
        {
            "$lookup": {
                "from": "bids",
                "let": {"rid": "$_rid"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                    {"$count": "c"},
                ],
                "as": "bc",
            }
        },
        {"$addFields": {"bids_count": {"$ifNull": [{"$arrayElemAt": ["$bc.c", 0]}, 0]}}},
        {"$project": {"bc": 0, "_rid": 0}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    rows = await rfqs_collection.aggregate(pl).to_list(length=limit)
    for r in rows:
        r["id"] = str(r.pop("_id"))
        r["rfq_id"] = r["id"]
    return rows, count


async def pipeline_avg_bids(period: str, created_by: str | None = None) -> list[dict[str, Any]]:
    f = _period_bucket_field("$created_at", period)
    base_match = {"created_by": created_by} if created_by else {}
    return await rfqs_collection.aggregate(
        [
            {"$match": base_match},
            {"$addFields": {"_rid": {"$toString": "$_id"}, "at": f}},
            {
                "$lookup": {
                    "from": "bids",
                    "let": {"rid": "$_rid"},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                        {"$count": "c"},
                    ],
                    "as": "bc",
                }
            },
            {
                "$addFields": {
                    "bids_count": {"$ifNull": [{"$arrayElemAt": ["$bc.c", 0]}, 0]},
                }
            },
            {
                "$group": {
                    "_id": {
                        "auction_type": {
                            "$ifNull": [
                                "$auction_type",
                                "Reverse Auction (lowest wins)",
                            ]
                        },
                        "bucket": "$at",
                    },
                    "rfq_count": {"$sum": 1},
                    "bids_count": {"$sum": "$bids_count"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "auction_type": "$_id.auction_type",
                    "period_bucket": "$_id.bucket",
                    "rfq_count": 1,
                    "bids_count": 1,
                    "avg_bids": {
                        "$round": [
                            {
                                "$cond": [
                                    {"$gt": ["$rfq_count", 0]},
                                    {"$divide": ["$bids_count", "$rfq_count"]},
                                    0,
                                ]
                            },
                            2,
                        ]
                    },
                }
            },
            {"$sort": {"period_bucket": 1, "auction_type": 1}},
        ]
    ).to_list(length=5000)


async def pipeline_winning_price_trend(period: str, created_by: str | None = None) -> list[dict[str, Any]]:
    closed = {
        "status": {"$in": [AuctionStatus.CLOSED.value, AuctionStatus.FORCE_CLOSED.value]}
    }
    if created_by:
        closed["created_by"] = created_by
    f = _period_bucket_field("$current_close_time", period)
    return await rfqs_collection.aggregate(
        [
            {"$match": closed},
            {"$addFields": {"_rid": {"$toString": "$_id"}, "pb": f}},
            {
                "$lookup": {
                    "from": "bids",
                    "let": {"rid": "$_rid"},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                        {"$sort": {"total_price": 1, "created_at": 1}},
                        {"$limit": 1},
                    ],
                    "as": "win",
                }
            },
            {"$match": {"win.0": {"$exists": True}}},
            {
                "$addFields": {
                    "winning_price": {"$arrayElemAt": ["$win.total_price", 0]},
                }
            },
            {
                "$group": {
                    "_id": "$pb",
                    "prices": {"$push": "$winning_price"},
                }
            },
            {
                "$project": {
                    "period_bucket": "$_id",
                    "closed_rfq_count": {"$size": "$prices"},
                    "avg_winning_price": {
                        "$round": [
                            {
                                "$avg": {
                                    "$map": {
                                        "input": "$prices",
                                        "as": "p",
                                        "in": {"$toDouble": "$$p"},
                                    }
                                }
                            },
                            2,
                        ]
                    },
                    "min_winning_price": {"$min": "$prices"},
                    "max_winning_price": {"$max": "$prices"},
                }
            },
            {"$sort": {"period_bucket": 1}},
        ]
    ).to_list(length=2000)


async def pipeline_extensions_per_rfq(
    skip: int,
    limit: int,
    name_search: str | None,
    created_by: str | None = None,
) -> tuple[list[dict], int]:
    # Count time_extended per rfq, join RFQ metadata
    ext = await activity_logs_collection.aggregate(
        [
            {"$match": {"event_type": "time_extended"}},
            {"$group": {"_id": "$rfq_id", "extension_count": {"$sum": 1}}},
        ]
    ).to_list(length=100_000)
    ext_by = {e["_id"]: e["extension_count"] for e in ext}
    q: dict = {}
    if created_by:
        q["created_by"] = created_by
    if name_search and name_search.strip():
        q["name"] = {"$regex": name_search.strip(), "$options": "i"}
    total = await rfqs_collection.count_documents(q)
    pl = [
        {"$match": q} if q else {"$match": {}},
        {"$sort": {"created_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    rows = await rfqs_collection.aggregate(pl).to_list(length=limit)
    out: list[dict] = []
    for doc in rows:
        rid = str(doc["_id"])
        out.append(
            {
                "rfq_id": rid,
                "reference_id": doc.get("reference_id"),
                "name": doc.get("name"),
                "status": doc.get("status"),
                "extension_count": ext_by.get(rid, 0),
            }
        )
    return out, total


async def pipeline_extension_impact(period: str, created_by: str | None = None) -> tuple[list[dict], list[dict]]:
    f = _period_bucket_field("$current_close_time", period)
    base_match: dict[str, Any] = {
        "status": {
            "$in": [AuctionStatus.CLOSED.value, AuctionStatus.FORCE_CLOSED.value]
        }
    }
    if created_by:
        base_match["created_by"] = created_by
    r_items = await rfqs_collection.aggregate(
        [
            {"$match": base_match},
            {"$addFields": {"_rid": {"$toString": "$_id"}, "pb": f}},
            {
                "$lookup": {
                    "from": "bids",
                    "let": {"rid": "$_rid"},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                        {"$sort": {"created_at": 1}},
                    ],
                    "as": "bids",
                }
            },
            {"$match": {"bids.0": {"$exists": True}}},
            {
                "$addFields": {
                    "first_price": {
                        "$toDouble": {
                            "$let": {
                                "vars": {"fb": {"$arrayElemAt": ["$bids", 0]}},
                                "in": "$$fb.total_price",
                            }
                        }
                    }
                }
            },
            {
                "$addFields": {
                    "min_price": {
                        "$min": {
                            "$map": {
                                "input": "$bids",
                                "as": "b",
                                "in": "$$b.total_price",
                            }
                        }
                    }
                }
            },
            {
                "$addFields": {
                    "improvement": {
                        "$round": [{"$subtract": ["$first_price", "$min_price"]}, 2]
                    }
                }
            },
            {
                "$lookup": {
                    "from": "activity_logs",
                    "let": {"rid": "$_rid"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$and": [
                                        {"$eq": ["$rfq_id", "$$rid"]},
                                        {"$eq": ["$event_type", "time_extended"]},
                                    ]
                                }
                            }
                        },
                        {"$limit": 1},
                    ],
                    "as": "extd",
                }
            },
            {
                "$addFields": {
                    "was_extended": {
                        "$gt": [{"$size": "$extd"}, 0]
                    }
                }
            },
        ]
    ).to_list(length=50_000)

    grouped: dict = {}
    rows_detail: list[dict] = []
    for r in r_items:
        bucket = r.get("pb")
        g = grouped.setdefault(
            bucket,
            {
                "extended_count": 0,
                "non_extended_count": 0,
                "extended_sum": 0.0,
                "non_extended_sum": 0.0,
            },
        )
        imp = float(r.get("improvement", 0) or 0)
        we = r.get("was_extended")
        if we:
            g["extended_count"] += 1
            g["extended_sum"] += imp
        else:
            g["non_extended_count"] += 1
            g["non_extended_sum"] += imp
        rows_detail.append(
            {
                "rfq_id": r.get("_rid"),
                "reference_id": r.get("reference_id"),
                "period_bucket": bucket,
                "was_extended": bool(we),
                "baseline_price": r.get("first_price"),
                "winning_price": r.get("min_price"),
                "improvement": r.get("improvement"),
            }
        )

    items: list[dict] = []
    for bucket in sorted(grouped.keys(), key=lambda x: str(x)):
        agg = grouped[bucket]
        ec, nec = agg["extended_count"], agg["non_extended_count"]
        e_avg = (
            round(agg["extended_sum"] / ec, 2) if ec else 0.0
        )
        n_avg = (
            round(agg["non_extended_sum"] / nec, 2) if nec else 0.0
        )
        d_abs = round(e_avg - n_avg, 2)
        d_pct = (
            round((d_abs / n_avg) * 100, 2) if n_avg > 0 else None
        )
        items.append(
            {
                "period_bucket": bucket,
                "extended_count": ec,
                "non_extended_count": nec,
                "avg_improvement_extended": e_avg,
                "avg_improvement_non_extended": n_avg,
                "delta_absolute": d_abs,
                "delta_percent": d_pct,
            }
        )
    return items, rows_detail
