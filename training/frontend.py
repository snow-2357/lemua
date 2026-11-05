from functools import lru_cache

# Stands in for Kokoro's start/end padding token, which has its own (silence) duration.
BOUNDARY_TOKEN = 1


@lru_cache(maxsize=1)
def _g2p_pipeline():
    from kokoro import KPipeline

    return KPipeline(lang_code="a", model=False)


def phoneme_chunks(text: str) -> list[str]:
    """Phonemizes text with Kokoro's own G2P (misaki), split the same way Kokoro splits it."""
    chunks = [result.phonemes for result in _g2p_pipeline()(text.strip()) if result.phonemes]
    if not chunks:
        raise ValueError("The G2P did not produce phonemes for the supplied text.")
    return chunks


def chunk_token_ids(chunks: list[str], vocab_size: int = 10000) -> list[int]:
    token_ids = []
    for chunk in chunks:
        chunk_ids = [ord(character) for character in chunk]
        if any(token_id <= BOUNDARY_TOKEN or token_id >= vocab_size for token_id in chunk_ids):
            raise ValueError(
                f"Phoneme output contains a character outside the vocabulary [2, {vocab_size})."
            )
        token_ids.extend([BOUNDARY_TOKEN, *chunk_ids, BOUNDARY_TOKEN])
    return token_ids
