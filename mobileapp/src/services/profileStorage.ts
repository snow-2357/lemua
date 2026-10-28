import * as FileSystem from 'expo-file-system/legacy';

const profileFileName = 'profile.json';

function getProfileFileUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('The app document directory is not available on this device.');
  }

  return `${FileSystem.documentDirectory}${profileFileName}`;
}

export async function loadProfileName(): Promise<string> {
  const uri = getProfileFileUri();
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) return '';

  let profile: unknown;
  try {
    profile = JSON.parse(await FileSystem.readAsStringAsync(uri));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new Error(`The saved profile could not be read: ${detail}`);
  }

  if (
    typeof profile !== 'object' ||
    profile === null ||
    !('name' in profile) ||
    typeof profile.name !== 'string'
  ) {
    throw new Error('The saved profile has an unsupported or invalid format.');
  }

  return profile.name;
}

export async function saveProfileName(name: string): Promise<void> {
  await FileSystem.writeAsStringAsync(
    getProfileFileUri(),
    JSON.stringify({ name }),
  );
}
