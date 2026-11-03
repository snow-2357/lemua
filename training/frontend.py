import os
from pathlib import Path
import sys


_ESPEAK_DLL_DIRECTORY = None


def _configure_espeak(espeakng_loader):
    global _ESPEAK_DLL_DIRECTORY

    library_path = espeakng_loader.get_library_path()
    data_path = espeakng_loader.get_data_path()
    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = library_path
    os.environ["PHONEMIZER_ESPEAK_DATA_PATH"] = data_path

    if sys.platform == "win32" and _ESPEAK_DLL_DIRECTORY is None:
        _ESPEAK_DLL_DIRECTORY = os.add_dll_directory(
            str(Path(library_path).parent)
        )


def phoneme_token_ids(text: str, vocab_size: int = 10000) -> list[int]:
    try:
        import espeakng_loader
        from phonemizer import phonemize
    except ImportError as exc:
        raise RuntimeError(
            "The text frontend needs phonemizer and espeakng-loader. "
            "Install them with `python -m pip install -r requirements.txt` "
            "from the training directory."
        ) from exc

    _configure_espeak(espeakng_loader)

    phonemes = phonemize(
        text.strip(),
        language="en-us",
        backend="espeak",
        strip=True,
        preserve_punctuation=True,
        with_stress=True,
    )
    if not isinstance(phonemes, str):
        raise TypeError("The phonemizer returned an unexpected batch result.")
    if not phonemes:
        raise ValueError("The phonemizer did not produce phonemes for the supplied text.")

    token_ids = [ord(character) for character in phonemes]
    if any(token_id == 0 or token_id >= vocab_size for token_id in token_ids):
        raise ValueError(
            f"Phoneme output contains a character outside the vocabulary [1, {vocab_size})."
        )
    return token_ids
