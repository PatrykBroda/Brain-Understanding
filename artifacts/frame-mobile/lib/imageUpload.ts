import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { filenameForImageMime, supportedImageMime } from "./imageUploadLogic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2560;

export type ImageUploadSource = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  base64?: string | null;
};

export type PreparedImageUpload = {
  uri: string;
  mimeType: string;
  filename: string;
  dataBase64: string;
};

export class ImagePreparationError extends Error {
  constructor() {
    super("Couldn't convert that photo to a supported format. Try another image.");
    this.name = "ImagePreparationError";
  }
}

/**
 * Preserve formats the API already accepts. Convert HEIC/HEIF and any other
 * unsupported or unreadable image representation to a JPEG before upload.
 */
export async function prepareImageUpload(
  asset: ImageUploadSource,
): Promise<PreparedImageUpload> {
  const mimeType = supportedImageMime(asset.mimeType, asset.fileName);
  if (
    mimeType &&
    asset.base64 &&
    asset.base64.length * 0.75 <= MAX_IMAGE_BYTES
  ) {
    return {
      uri: asset.uri,
      mimeType,
      filename: filenameForImageMime(asset.fileName, mimeType),
      dataBase64: asset.base64,
    };
  }

  try {
    let rendered = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const longestEdge = Math.max(rendered.width, rendered.height);
    if (longestEdge > MAX_IMAGE_EDGE) {
      const scale = MAX_IMAGE_EDGE / longestEdge;
      rendered = await ImageManipulator.manipulate(asset.uri)
        .resize({
          width: Math.round(rendered.width * scale),
          height: Math.round(rendered.height * scale),
        })
        .renderAsync();
    }
    const converted = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.82,
      base64: true,
    });
    if (!converted.base64) throw new Error("JPEG conversion returned no image data");
    return {
      uri: converted.uri,
      mimeType: "image/jpeg",
      filename: filenameForImageMime(asset.fileName, "image/jpeg"),
      dataBase64: converted.base64,
    };
  } catch {
    throw new ImagePreparationError();
  }
}
