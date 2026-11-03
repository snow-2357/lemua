import csv
import os

CSV_FILE = "metadata.csv"
OUTPUT_TEXT_FILE = "sentences.txt"

sentences = []

print(f"Reading sentences from {CSV_FILE}...")
with open(CSV_FILE, "r", encoding="utf-8") as f:
    sample = f.read(2048)
    f.seek(0)

    delimiter = "|" if "|" in sample else ","
    reader = csv.reader(f, delimiter=delimiter)

    for row in reader:
        if not row:
            continue
        if len(row) >= 3:
            text = row[2].strip() if row[2].strip() else row[1].strip()
            sentences.append(text)
        elif len(row) == 1:
            sentences.append(row[0].strip())

target_sentences = sentences[:1000]

with open(OUTPUT_TEXT_FILE, "w", encoding="utf-8") as f:
    for sent in target_sentences:
        f.write(sent + "\n")

print(f"Success! Extracted {len(target_sentences)} lines into '{OUTPUT_TEXT_FILE}'.")
