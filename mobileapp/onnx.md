Using ONNX in React Native (Recommended Path)
1. Install ONNX Runtime for React Native
For the most reliable setup, use React Native CLI (not Expo Go).

yarn add onnxruntime-react-native
cd ios && pod install && cd ..
Expo users: ONNX Runtime requires native modules. You must use Expo prebuild and a custom dev client.

2. Add the ONNX Model to Your App
Common approaches:

Bundle the model inside the app (assets/models/model.onnx)
Download the model on first launch and cache it locally
Bundling is simpler and recommended for the first version.

3. Create an ONNX Inference Session
import * as ort from "onnxruntime-react-native";

export async function loadModel(modelPath: string) {
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"],
  });
  return session;
}
This loads the model and prepares it for inference.

4. Run Inference
export async function runInference(
  session: ort.InferenceSession,
  inputName: string,
  data: Float32Array,
  dims: number[]
) {
  const tensor = new ort.Tensor("float32", data, dims);

  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName] = tensor;

  const results = await session.run(feeds);
  return results;
}
You must ensure:

inputName matches the ONNX model input
dims matches the expected input shape