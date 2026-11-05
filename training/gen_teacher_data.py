import os
import shutil
from collections import Counter

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

from frontend import text_to_phonemes

# 1. Configuration
TRAINING_DIR = os.path.dirname(os.path.abspath(__file__))
TEXT_FILE = os.path.join(TRAINING_DIR, "sentences.txt")
OUTPUT_DIR = os.path.join(TRAINING_DIR, "dataset_cache")
VOICE = "af_heart"
KOKORO_SAMPLE_RATE = 24000
MAX_PHONEMES = 500  # Kokoro's context limit is 510 phoneme tokens

# Single-character swaps that make eSpeak output friendlier to Kokoro's
# vocabulary. They are 1:1, so the student's tokens stay aligned.
KOKORO_CHAR_FIXES = str.maketrans({"ʲ": "j", "r": "ɹ", "x": "k", "ɬ": "l"})

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
    print(f"Cleaned existing '{OUTPUT_DIR}' directory.")
os.makedirs(OUTPUT_DIR, exist_ok=True)

if not os.path.exists(TEXT_FILE):
    raise FileNotFoundError(
        f"Could not find {TEXT_FILE}. Create it with one sentence per line."
    )

print("Initializing Kokoro pipeline...")
pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
kokoro_model = pipeline.model
vocab = kokoro_model.vocab
voice_pack = pipeline.load_voice(VOICE)

with open(TEXT_FILE, "r", encoding="utf-8") as f:
    sentences = [line.strip() for line in f if line.strip()]

print(f"Loaded {len(sentences)} sentences. Starting extraction...")

dropped_chars = Counter()
saved = 0

# 2. Processing Loop
for idx, text in enumerate(sentences):
    file_id = f"sentence_{idx:04d}"
    print(f"[{idx+1}/{len(sentences)}] Processing: {text}")

    sentence_dir = os.path.join(OUTPUT_DIR, file_id)
    os.makedirs(sentence_dir, exist_ok=True)

    try:
        # The student sees this exact string, and Kokoro speaks this exact
        # string, so every Kokoro duration belongs to one student token.
        phonemes = text_to_phonemes(text)
        if len(phonemes) > MAX_PHONEMES:
            raise ValueError(
                f"{len(phonemes)} phonemes is over the {MAX_PHONEMES} limit; "
                "split this sentence."
            )
        kokoro_input = phonemes.translate(KOKORO_CHAR_FIXES)
        kept = [i for i, ch in enumerate(kokoro_input) if ch in vocab]
        if not kept:
            raise ValueError("No phoneme is in Kokoro's vocabulary.")

        ref_s = voice_pack[len(kokoro_input) - 1]
        with torch.no_grad():
            output = kokoro_model(kokoro_input, ref_s, 1.0, return_output=True)

        audio = output.audio
        pred_dur = output.pred_dur
        if audio is None or pred_dur is None:
            raise RuntimeError("Kokoro returned no audio or durations.")
        audio = audio.detach().cpu().numpy().astype(np.float32).reshape(-1)
        pred_dur = pred_dur.detach().cpu().numpy().reshape(-1)
        if len(pred_dur) != len(kept) + 2:
            raise RuntimeError(
                f"Expected {len(kept) + 2} durations, got {len(pred_dur)}."
            )

        # Layout: [BOS] + one slot per phoneme character + [EOS].
        # Characters Kokoro cannot read get duration 0.
        durations = np.zeros(len(phonemes) + 2, dtype=np.int64)
        durations[0] = pred_dur[0]
        durations[-1] = pred_dur[-1]
        for slot, char_index in enumerate(kept, start=1):
            durations[char_index + 1] = pred_dur[slot]
        for ch in kokoro_input:
            if ch not in vocab:
                dropped_chars[ch] += 1

        with open(os.path.join(sentence_dir, "text.txt"), "w", encoding="utf-8") as tf:
            tf.write(text)
        with open(
            os.path.join(sentence_dir, "phonemes.txt"), "w", encoding="utf-8"
        ) as pf:
            pf.write(phonemes)
        np.save(os.path.join(sentence_dir, "durations.npy"), durations)
        sf.write(os.path.join(sentence_dir, "audio.wav"), audio, KOKORO_SAMPLE_RATE)
        saved += 1
        print(f"  -> Phonemes: {phonemes}")
        print(
            f"  -> Saved {len(audio) / KOKORO_SAMPLE_RATE:.2f}s of audio "
            f"and {len(durations)} durations for {file_id}"
        )
    except Exception as e:
        print(f"Error occurred while processing sentence {idx+1}: {e}")
        shutil.rmtree(sentence_dir, ignore_errors=True)
        continue


print(f"\nExtraction complete! Saved {saved}/{len(sentences)} sentences.")
if dropped_chars:
    print("Phoneme characters Kokoro could not read (given duration 0):")
    for ch, count in dropped_chars.most_common():
        print(f"  {ch!r} (U+{ord(ch):04X}): {count}")
