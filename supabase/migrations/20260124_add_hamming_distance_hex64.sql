-- Add helper to compute Hamming distance between 64-bit perceptual hashes (hex)
-- Used for near-duplicate detection (not just exact hash matches)

CREATE OR REPLACE FUNCTION public.hamming_distance_hex64(a_hex text, b_hex text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a_bits bit(64);
  b_bits bit(64);
BEGIN
  -- Convert 16-char hex into 64-bit bit strings
  a_bits := lpad((('x' || a_hex)::bit(64))::text, 64, '0')::bit(64);
  b_bits := lpad((('x' || b_hex)::bit(64))::text, 64, '0')::bit(64);

  RETURN bit_count(a_bits # b_bits);
END;
$$;

COMMENT ON FUNCTION public.hamming_distance_hex64(text, text) IS
  'Returns Hamming distance between two 64-bit hashes represented as 16-char hex strings.';

