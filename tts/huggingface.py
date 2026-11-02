from huggingface_hub import HfApi

api = HfApi()

repo_id = "snow2357/koroko_int8"

# Upload your local folder containing the ONNX model files
print(f"Uploading files to '{repo_id}'...")
api.upload_folder(
    folder_path=r"D:\ReadMe\tts",  # Change this if your ONNX files are in a specific subfolder
    repo_id=repo_id,
    repo_type="model",
)

print("Model files uploaded successfully!")