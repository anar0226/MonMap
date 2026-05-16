-- Dijkstra shortest-path over the indoor node/edge graph.
-- Uses a recursive CTE with a visited-array guard to prevent cycles.
-- Sufficient for mall-scale graphs (<500 nodes); no pgRouting dependency needed.

CREATE OR REPLACE FUNCTION public.indoor_shortest_path(
  p_venue_id        uuid,
  p_from_node_id    uuid,
  p_to_node_id      uuid,
  p_accessible_only boolean DEFAULT false
)
RETURNS TABLE (
  node_id      uuid,
  floor_number integer,
  lat          numeric,
  lng          numeric,
  node_type    text,
  label_mn     text,
  step_index   integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_depth integer := 300;
BEGIN
  -- Fast-return if origin = destination
  IF p_from_node_id = p_to_node_id THEN
    RETURN QUERY
      SELECT n.id, n.floor_number, n.lat, n.lng, n.node_type, n.label_mn, 0
      FROM public.indoor_nodes n
      WHERE n.id = p_from_node_id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE path_search AS (
    -- Seed: start at origin
    SELECT
      p_from_node_id              AS node_id,
      ARRAY[p_from_node_id]       AS visited,
      0.0::real                   AS total_dist,
      0                           AS depth
    UNION ALL
    -- Expand: walk one edge from the frontier
    SELECT
      next_node                   AS node_id,
      ps.visited || next_node     AS visited,
      ps.total_dist + e.distance_m AS total_dist,
      ps.depth + 1                AS depth
    FROM path_search ps
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN e2.from_node_id = ps.node_id THEN e2.to_node_id
          ELSE e2.from_node_id
        END AS next_node,
        e2.distance_m
      FROM public.indoor_edges e2
      WHERE e2.venue_id = p_venue_id
        AND (
          e2.from_node_id = ps.node_id
          OR (e2.bidirectional AND e2.to_node_id = ps.node_id)
        )
        AND (NOT p_accessible_only OR e2.is_accessible)
    ) e
    JOIN public.indoor_nodes n2
      ON n2.id = e.next_node
      AND (NOT p_accessible_only OR n2.is_accessible)
    WHERE
      NOT (e.next_node = ANY(ps.visited))
      AND ps.depth < v_max_depth
  ),
  -- Pick the shortest complete path that reaches the destination
  best_path AS (
    SELECT visited, total_dist
    FROM path_search
    WHERE visited[array_length(visited, 1)] = p_to_node_id
    ORDER BY total_dist ASC
    LIMIT 1
  )
  SELECT
    n.id,
    n.floor_number,
    n.lat,
    n.lng,
    n.node_type,
    n.label_mn,
    (array_position(bp.visited, n.id) - 1)::integer AS step_index
  FROM best_path bp
  JOIN public.indoor_nodes n ON n.id = ANY(bp.visited)
  ORDER BY array_position(bp.visited, n.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.indoor_shortest_path TO anon, authenticated;
