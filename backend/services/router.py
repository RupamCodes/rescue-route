from __future__ import annotations

from typing import Any

from backend.services.matcher import haversine_distance_km

AVG_SPEED_KMH = 25.0
DWELL_MINUTES = 5.0
DEFAULT_CAPACITY_KG = 50.0

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
    ORTOOLS_AVAILABLE = True
except Exception:
    ORTOOLS_AVAILABLE = False


def _build_distance_matrix(coords: list[tuple[float, float]]) -> list[list[int]]:
    n = len(coords)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = int(haversine_distance_km(
                    coords[i][0], coords[i][1], coords[j][0], coords[j][1]) * 1000)
    return matrix


def _ortools_solve(matrix: list[list[int]], start: int, end: int) -> list[int] | None:
    mgr = pywrapcp.RoutingIndexManager(len(matrix), 1, [start], [end])
    routing = pywrapcp.RoutingModel(mgr)

    def dist_cb(i: int, j: int) -> int:
        return matrix[mgr.IndexToNode(i)][mgr.IndexToNode(j)]

    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitCallback(dist_cb))

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = 5

    sol = routing.SolveWithParameters(params)
    if not sol:
        return None
    route, idx = [], routing.Start(0)
    while not routing.IsEnd(idx):
        route.append(mgr.IndexToNode(idx))
        idx = sol.Value(routing.NextVar(idx))
    route.append(mgr.IndexToNode(idx))
    return route


def _greedy(coords: list[tuple[float, float]], start: int, end: int) -> list[int]:
    unvisited = set(range(len(coords))) - {start, end}
    route, cur = [start], start
    while unvisited:
        nxt = min(unvisited, key=lambda x: haversine_distance_km(
            coords[cur][0], coords[cur][1], coords[x][0], coords[x][1]))
        route.append(nxt)
        unvisited.remove(nxt)
        cur = nxt
    route.append(end)
    return route


def optimize_mission_route(
    volunteer_loc: tuple[float, float],
    listings: list[dict[str, Any]],
    shelter_loc: tuple[float, float],
    vehicle_capacity_kg: float = DEFAULT_CAPACITY_KG,
) -> dict[str, Any]:
    if not listings:
        raise ValueError("At least one listing required for routing")
    if sum(l["quantity_kg"] for l in listings) > vehicle_capacity_kg:
        raise ValueError("Total load exceeds vehicle capacity")

    coords = [volunteer_loc] + [(l["lat"], l["lng"]) for l in listings] + [shelter_loc]
    start, end = 0, len(coords) - 1

    matrix = _build_distance_matrix(coords)
    route = None
    if ORTOOLS_AVAILABLE:
        try:
            route = _ortools_solve(matrix, start, end)
        except Exception:
            pass
    if route is None:
        route = _greedy(coords, start, end)

    waypoints, total_km = [], 0.0
    for i, idx in enumerate(route):
        if i == 0:
            wtype, label, lid = "START", "Volunteer Start", None
        elif i == len(route) - 1:
            wtype, label, lid = "DROPOFF", "Shelter Dropoff", None
        else:
            wtype, label, lid = "PICKUP", f"Pickup: {listings[idx - 1]['title']}", listings[idx - 1]["id"]
        waypoints.append({
            "order": i, "type": wtype, "lat": coords[idx][0], "lng": coords[idx][1],
            "label": label, "listing_id": lid,
        })
        if i > 0:
            total_km += haversine_distance_km(
                coords[route[i - 1]][0], coords[route[i - 1]][1], coords[idx][0], coords[idx][1])

    pickups = sum(1 for w in waypoints if w["type"] == "PICKUP")
    duration = round((total_km / AVG_SPEED_KMH + pickups * DWELL_MINUTES / 60) * 60, 1)
    return {
        "waypoints": waypoints,
        "total_distance_km": round(total_km, 2),
        "estimated_duration_minutes": duration,
    }