import os
import sys
from pathlib import Path

PAD_ID = 0
BOS_ID = 1
EOS_ID = 2

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


def text_to_phonemes(text: str) -> str:
    """Raw eSpeak (en-us) IPA string. This is exactly what the student sees."""
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
        language_switch="remove-flags",
    )
    if not isinstance(phonemes, str):
        raise TypeError("The phonemizer returned an unexpected batch result.")
    phonemes = " ".join(phonemes.split())
    if not phonemes:
        raise ValueError("The phonemizer did not produce phonemes for the supplied text.")
    return phonemes


def phonemes_to_token_ids(phonemes: str, vocab_size: int = 10000) -> list[int]:
    """[BOS] + one id per phoneme character + [EOS].

    The BOS/EOS slots line up with the two padding tokens Kokoro wraps around
    its own input, so teacher durations map 1:1 onto these tokens.
    """
    token_ids = [ord(character) for character in phonemes]
    if any(token_id <= EOS_ID or token_id >= vocab_size for token_id in token_ids):
        raise ValueError(
            f"Phoneme output contains a character outside the vocabulary "
            f"({EOS_ID}, {vocab_size})."
        )
    return [BOS_ID] + token_ids + [EOS_ID]


def phoneme_token_ids(text: str, vocab_size: int = 10000) -> list[int]:
    return phonemes_to_token_ids(text_to_phonemes(text), vocab_size)