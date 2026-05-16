-- Helper RPC called by indoor-mapping-submit to update mapper aggregate counts.
CREATE OR REPLACE FUNCTION public.indoor_mapper_increment(
  p_mapper_id   uuid,
  p_nodes_added integer,
  p_edges_added integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.venue_mappers
  SET
    nodes_submitted = nodes_submitted + p_nodes_added,
    edges_submitted = edges_submitted + p_edges_added,
    floors_submitted = floors_submitted + 1,
    updated_at = now()
  WHERE id = p_mapper_id;
$$;
