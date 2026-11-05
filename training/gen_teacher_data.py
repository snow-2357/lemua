import os
import shutil
import numpy as np
import soundfile as sf
from kokoro import KPipeline

# 1. Configuration
TRAINING_DIR = os.path.dirname(os.path.abspath(__file__))
TEXT_FILE = os.path.join(TRAINING_DIR, "sentences.txt")
OUTPUT_DIR = os.path.join(TRAINING_DIR, "dataset_cache")

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
    print(f"Cleaned existing '{OUTPUT_DIR}' directory.")
os.makedirs(OUTPUT_DIR, exist_ok=True)

if not os.path.exists(TEXT_FILE):
    raise FileNotFoundError(
        f"Could not find {TEXT_FILE}. Create it with one sentence per line."
    )

print("Initializing Kokoro pipeline...")
# Initialize pipeline for American English ('a') or British English ('b')
pipeline = KPipeline(lang_code="a")

with open(TEXT_FILE, "r", encoding="utf-8") as f:
    sentences = [line.strip() for line in f if line.strip()]

print(f"Loaded {len(sentences)} sentences. Starting extraction...")

# 2. Processing Loop
for idx, text in enumerate(sentences):
    file_id = f"sentence_{idx:04d}"
    print(f"[{idx+1}/{len(sentences)}] Processing: {text}")

    sentence_dir = os.path.join(OUTPUT_DIR, file_id)
    os.makedirs(sentence_dir, exist_ok=True)

    try:
        # Kokoro may split one line into several chunks; all of them must be kept
        # so the audio matches the full text written to text.txt.
        chunks = []
        for _, ps, audio in pipeline(text, voice="af_heart"):
            if audio is None:
                continue
            if hasattr(audio, "detach"):
                audio = audio.detach().cpu().numpy()
            chunks.append(np.asarray(audio, dtype=np.float32).reshape(-1))
            print(f"  -> Phonemes: {ps}")

        if not chunks:
            raise RuntimeError("Kokoro produced no audio.")

        with open(os.path.join(sentence_dir, "text.txt"), "w", encoding="utf-8") as tf:
            tf.write(text)
        sf.write(os.path.join(sentence_dir, "audio.wav"), np.concatenate(chunks), 24000)
        print(f"  -> Saved {len(chunks)} chunk(s) of audio for {file_id}")
    except Exception as e:
        print(f"Error occurred while processing sentence {idx+1}: {e}")
        shutil.rmtree(sentence_dir, ignore_errors=True)
        continue


print("\nExtraction complete! Check your 'dataset_cache' folder.")
